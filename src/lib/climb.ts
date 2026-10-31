import { isAddress, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'
import { gatewayUrl, parseIpfs } from '@/lib/ipfs'

export const CHAIN = arcTestnet
export const CHAIN_ID = arcTestnet.id

const rawEscrow = import.meta.env.VITE_CLIMB_ESCROW_ADDRESS as string | undefined
export const ESCROW_ADDRESS: Address | undefined =
  rawEscrow && isAddress(rawEscrow) ? (rawEscrow) : undefined

const rawDeployBlock = import.meta.env.VITE_CLIMB_DEPLOY_BLOCK as string | undefined
export const DEPLOY_BLOCK: bigint | undefined = rawDeployBlock && /^\d+$/.test(rawDeployBlock) ? BigInt(rawDeployBlock) : undefined

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is missing from the onchain facts for Arc Testnet')
export const USDC_ADDRESS = usdcFact.address as Address

export const CATEGORIES = ['Fitness', 'Creative', 'Gaming', 'Learning', 'Community', 'Tech', 'Food', 'Other'] as const

export const MIN_CREATE = 1_000_000n
export const MIN_CONTRIBUTE = 100_000n

export enum Status {
  Active = 0,
  Voting = 1,
  Paid = 2,
  Cancelled = 3,
}

export interface Bounty {
  id: bigint
  creator: Address
  title: string
  description: string
  totalFunds: bigint
  isOpen: boolean
  status: Status
  createdAt: bigint
  nominatedClaimId: bigint
  voteEndsAt: bigint
  yesWeight: bigint
  noWeight: bigint
  voteRound: number
  category: string
}

export interface Claim {
  id: bigint
  bountyId: bigint
  claimant: Address
  proofURI: string
  note: string
  createdAt: bigint
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** Revert names from ClimbEscrow mapped to plain language. */
const FRIENDLY_ERRORS: Record<string, string> = {
  ContributorCannotClaim: "You funded this bounty, so you can't claim it.",
  CreatorCannotClaim: "You created this bounty, so you can't claim it.",
  ClaimantCannotContribute: "You submitted a claim on this bounty, so you can't fund it.",
  CategoryTooLong: 'Categories must be 32 characters or fewer.',
  CommentEmpty: 'Write something before posting.',
  CommentTooLong: 'Comments are limited to 500 characters.',
  CreatorCannotWithdraw: "Creators can't withdraw. Cancel the bounty to get your funds back.",
  NothingToWithdraw: "You don't have any funds in this bounty to withdraw.",
  NothingToRefund: 'You have no refund waiting on this bounty.',
  NothingPending: 'You have no pending payout to withdraw.',
  AlreadyVoted: "You've already voted in this round.",
  VotingEnded: 'Voting has ended for this round. Anyone can resolve it now.',
  VotingNotEnded: "Voting hasn't ended yet. Come back when the countdown hits zero.",
  NoContribution: 'Only people who funded this bounty can vote.',
  NominationCooldown: 'The last vote failed. The creator has to wait 24 hours before nominating again.',
  NotBountyCreator: 'Only the bounty creator can do that.',
  InvalidBountyStatus: "That isn't possible in this bounty's current state. Refresh and try again.",
  OpenBountyRequired: 'This only works on open (crowdfunded) bounties.',
  SoloBountyRequired: 'Open bounties are decided by a funder vote, not accepted directly.',
  AmountTooSmall: 'That amount is below the minimum.',
  InvalidTitleLength: 'Titles must be 1 to 120 characters.',
  DescriptionTooLong: 'The description is too long (2000 characters max).',
  InvalidProofURILength: 'Add a proof link (512 characters max).',
  NoteTooLong: 'The note is too long (500 characters max).',
  ClaimNotFound: "That claim doesn't exist.",
  BountyNotFound: "That bounty doesn't exist.",
}

interface ErrorLike {
  name?: string
  shortMessage?: string
  message?: string
  code?: number
  cause?: unknown
  data?: { errorName?: string }
}

function findErrorName(err: unknown): string | undefined {
  let cur: unknown = err
  for (let i = 0; i < 6 && cur; i++) {
    const e = cur as ErrorLike
    if (e.data?.errorName) return e.data.errorName
    cur = e.cause
  }
  return undefined
}

export function isUserRejection(err: unknown): boolean {
  let cur: unknown = err
  for (let i = 0; i < 6 && cur; i++) {
    const e = cur as ErrorLike
    if (e.code === 4001 || e.name === 'UserRejectedRequestError') return true
    if (typeof e.message === 'string' && /user rejected|user denied/i.test(e.message)) return true
    cur = e.cause
  }
  return false
}

export function friendlyError(err: unknown): string {
  const name = findErrorName(err)
  if (name && FRIENDLY_ERRORS[name]) return FRIENDLY_ERRORS[name]
  const msg = ((err as ErrorLike)?.shortMessage ?? (err as ErrorLike)?.message ?? '').toLowerCase()
  if (msg.includes('insufficient funds for gas') || msg.includes('exceeds the balance of the account'))
    return "You don't have enough USDC to cover gas. Use Get test USDC in the Arc Studio sidebar."
  if (msg.includes('transfer amount exceeds balance') || msg.includes('insufficient balance') || msg.includes('erc20insufficientbalance'))
    return "You don't have enough USDC for that amount."
  if (msg.includes('allowance')) return 'USDC approval is missing. Approve the amount first.'
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch'))
    return 'Network issue. Check your connection and try again.'
  if (msg.includes('reverted')) return 'The transaction would fail. Refresh the page and try again.'
  return 'Something went wrong. Please try again.'
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i
const VIDEO_EXT = /\.(mp4|webm|mov)(\?.*)?$/i

export type ProofKind = 'image' | 'video' | 'link' | 'invalid'

export interface ProofInfo {
  kind: ProofKind
  /** The https URL for http(s) proofs, or the first gateway URL for ipfs:// proofs. */
  url?: URL
  /** IPFS path ("<cid>[/path]") when the proof is an ipfs:// link. */
  ipfs?: string
}

export function classifyProof(uri: string): ProofInfo {
  const ipfs = parseIpfs(uri)
  if (ipfs) return { kind: 'image', ipfs, url: new URL(gatewayUrl(ipfs, 0)) }
  try {
    const url = new URL(uri.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid' }
    if (IMAGE_EXT.test(url.pathname + url.search)) return { kind: 'image', url }
    if (VIDEO_EXT.test(url.pathname + url.search)) return { kind: 'video', url }
    return { kind: 'link', url }
  } catch {
    return { kind: 'invalid' }
  }
}

export function timeLeft(seconds: number): string {
  if (seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}
