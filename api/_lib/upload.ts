import { getAddress, isAddress, verifyMessage } from 'viem'
import { CLOCK_SKEW_SECONDS, IP_LIMIT_PER_HOUR, SIGNATURE_TTL_SECONDS, WALLET_LIMIT_PER_HOUR, uploadMessage } from './auth'
import { consume, formatWait, type Env } from './ratelimit'

/**
 * Shared image-upload logic for the serverless route (api/upload.ts) and the Vite dev middleware.
 * The Pinata JWT is only ever read on the server and is never sent to the browser.
 */

export const MAX_BYTES = 10 * 1024 * 1024
/** Multipart framing adds a little on top of the file itself. */
const MAX_BODY_BYTES = MAX_BYTES + 512 * 1024

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Identifies the real format from the first bytes, so a renamed file or a spoofed Content-Type is rejected. */
function sniffMime(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

export interface UploadOptions {
  jwt: string | undefined
  /** Fallback client IP when the request carries no forwarding header (e.g. local dev). */
  ip?: string
  env?: Env
  /** Unix seconds; injectable for tests. */
  now?: number
}

/** On Vercel the platform sets x-forwarded-for, so the first entry is the real client address. */
export function clientIp(headers: Headers, fallback = 'unknown'): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || headers.get('x-real-ip')?.trim() || fallback
}

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })
}

export async function handleUpload(request: Request, opts: UploadOptions): Promise<Response> {
  const { jwt } = opts
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {})
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { allow: 'POST' })
  if (!jwt) return json(503, { error: 'Image uploads are not configured on this server.' })

  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_BODY_BYTES) return json(413, { error: 'That image is larger than 10 MB.' })
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    return json(400, { error: 'Send the image as multipart form data.' })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(400, { error: 'Could not read the upload.' })
  }

  // 1. Who is asking: a fresh signature over a message that this server rebuilds itself.
  const addressField = form.get('address')
  const signature = form.get('signature')
  const issuedAt = Number(form.get('timestamp'))
  if (typeof addressField !== 'string' || typeof signature !== 'string' || !isAddress(addressField, { strict: false }) || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return json(401, { code: 'auth', error: 'Connect your wallet and sign the message to upload.' })
  }
  if (!Number.isInteger(issuedAt) || issuedAt > now + CLOCK_SKEW_SECONDS) {
    return json(401, { code: 'signature_expired', error: "Your device clock looks off, so the signature wasn't accepted. Check your time settings and sign again." })
  }
  if (now - issuedAt > SIGNATURE_TTL_SECONDS) {
    return json(401, { code: 'signature_expired', error: 'Your signature expired. Sign again to continue.' })
  }
  const wallet = getAddress(addressField)
  let signed = false
  try {
    signed = await verifyMessage({ address: wallet, message: uploadMessage(wallet, issuedAt), signature: signature as `0x${string}` })
  } catch {
    signed = false
  }
  if (!signed) {
    return json(401, { code: 'auth', error: "We couldn't verify that signature. Sign again with the wallet you're connected with (smart-contract wallets aren't supported for uploads yet)." })
  }

  // 2. What they sent.
  const file = form.get('file')
  if (!(file instanceof File)) return json(400, { error: 'No image was attached.' })
  if (file.size === 0) return json(400, { error: 'That file is empty.' })
  if (file.size > MAX_BYTES) return json(413, { error: 'That image is larger than 10 MB.' })
  if (!(file.type in EXT)) return json(415, { error: 'Use a JPG, PNG, WebP or GIF image.' })

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const real = sniffMime(head)
  if (!real || real !== file.type) return json(415, { error: "That file isn't a valid JPG, PNG, WebP or GIF image." })

  // 3. How often: per wallet first, then per network address. Only valid, signed uploads count.
  const walletLimit = await consume(env, `wallet:${wallet.toLowerCase()}`, WALLET_LIMIT_PER_HOUR, 3600, now)
  if (!walletLimit.allowed) {
    return json(
      429,
      {
        code: 'rate_limited',
        error: `You've reached the limit of ${WALLET_LIMIT_PER_HOUR} image uploads per hour. Try again in ${formatWait(walletLimit.retryAfter)}.`,
        retryAfter: walletLimit.retryAfter,
      },
      { 'retry-after': String(walletLimit.retryAfter) },
    )
  }
  const ip = clientIp(request.headers, opts.ip)
  const ipLimit = await consume(env, `ip:${ip}`, IP_LIMIT_PER_HOUR, 3600, now)
  if (!ipLimit.allowed) {
    return json(
      429,
      {
        code: 'rate_limited',
        error: `Too many uploads from your network (${IP_LIMIT_PER_HOUR} per hour). Try again in ${formatWait(ipLimit.retryAfter)}.`,
        retryAfter: ipLimit.retryAfter,
      },
      { 'retry-after': String(ipLimit.retryAfter) },
    )
  }

  // Never forward the user's file name: a random name is enough and leaks nothing.
  const name = `claim-${crypto.randomUUID()}.${EXT[real]}`
  const upstream = new FormData()
  upstream.append('network', 'public')
  upstream.append('cid_version', 'v1')
  upstream.append('name', name)
  upstream.append('file', new Blob([await file.arrayBuffer()], { type: real }), name)

  let res: Response
  try {
    res = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: upstream,
    })
  } catch {
    return json(502, { error: 'Could not reach the IPFS service. Try again.' })
  }
  if (!res.ok) {
    console.error('Pinata upload failed with status', res.status)
    return json(502, { error: 'The IPFS service rejected the upload. Try again in a moment.' })
  }

  let cid: unknown
  try {
    const data = (await res.json()) as { data?: { cid?: unknown } }
    cid = data.data?.cid
  } catch {
    cid = undefined
  }
  if (typeof cid !== 'string' || !/^[a-zA-Z0-9]{40,128}$/.test(cid)) {
    return json(502, { error: 'The IPFS service returned an unexpected response.' })
  }
  return json(200, { cid })
}
