/** Public gateways, tried in order. The first that loads the image wins. */
export const GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
] as const

const IPFS_PATH = /^[a-zA-Z0-9]{40,128}(\/[\w.\-~%/]*)?$/

/** "ipfs://<cid>[/path]" -> "<cid>[/path]", or null when it is not a well-formed IPFS link. */
export function parseIpfs(uri: string): string | null {
  const trimmed = uri.trim()
  if (!/^ipfs:\/\//i.test(trimmed)) return null
  const rest = trimmed.slice('ipfs://'.length).replace(/^ipfs\//i, '')
  return IPFS_PATH.test(rest) ? rest : null
}

export function gatewayUrl(path: string, index = 0): string {
  return `${GATEWAYS[Math.min(index, GATEWAYS.length - 1)]}${path}`
}
