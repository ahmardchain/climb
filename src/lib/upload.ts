export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',')

/** Returns a plain-language reason the file can't be used, or null when it is fine. */
export function validateImage(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use a JPG, PNG, WebP or GIF image.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_IMAGE_BYTES) return 'That image is larger than 10 MB.'
  return null
}

export class UploadError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'UploadError'
    this.code = code
  }
}

export interface UploadAuth {
  address: string
  /** Unix seconds when the message was signed. */
  timestamp: number
  signature: string
}

/** Sends the image to our own /api/upload route, which checks the wallet signature, pins to IPFS and returns the CID. */
export async function uploadImage(file: File, auth: UploadAuth, signal: AbortSignal): Promise<string> {
  const body = new FormData()
  body.append('address', auth.address)
  body.append('timestamp', String(auth.timestamp))
  body.append('signature', auth.signature)
  body.append('file', file)
  let res: Response
  try {
    res = await fetch('/api/upload', { method: 'POST', body, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new UploadError('Network issue. Check your connection and try again.')
  }
  let data: { cid?: unknown; error?: unknown; code?: unknown } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    // Non-JSON body: handled below.
  }
  if (!res.ok || typeof data.cid !== 'string') {
    throw new UploadError(
      typeof data.error === 'string' ? data.error : 'The upload failed. Try again.',
      typeof data.code === 'string' ? data.code : undefined,
    )
  }
  return data.cid
}
