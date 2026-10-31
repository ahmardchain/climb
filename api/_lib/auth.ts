/** Shared by the browser (to build what the wallet signs) and the server (to rebuild and verify it). */

/** A signature is accepted for this long after it was issued. */
export const SIGNATURE_TTL_SECONDS = 5 * 60
/** Small allowance for a browser clock that runs slightly ahead of the server. */
export const CLOCK_SKEW_SECONDS = 60

export const WALLET_LIMIT_PER_HOUR = 10
export const IP_LIMIT_PER_HOUR = 20

export function uploadMessage(address: string, issuedAt: number): string {
  return [
    'Sign in to climb to upload an image.',
    '',
    `Wallet: ${address.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
    `Valid for ${SIGNATURE_TTL_SECONDS / 60} minutes. Signing is free and does not give access to your funds.`,
  ].join('\n')
}
