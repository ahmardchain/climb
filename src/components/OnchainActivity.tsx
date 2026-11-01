import { useMemo, useState } from 'react'
import {
  Ban,
  Coins,
  Crown,
  ExternalLink,
  Flag,
  Gavel,
  HandCoins,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Undo2,
  Vote,
  type LucideIcon,
} from 'lucide-react'
import { CHAIN_ID } from '@/lib/climb'
import type { ChainEvent } from '@/lib/eventStore'
import { useEvents } from '@/hooks/useClimbData'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { PersonLink, timeAgo } from '@/components/shared'
import { exactUsdc, useNow } from '@/components/ui'

interface Row {
  key: string
  icon: LucideIcon
  tone: string
  text: React.ReactNode
  txHash: string
  ts: number
  order: bigint
}

const addr = (v: unknown) => (typeof v === 'string' ? v : '')
const big = (v: unknown) => (typeof v === 'bigint' ? v : 0n)
const usdc = (v: unknown) => <span className="font-semibold tabular-nums">{exactUsdc(big(v))} USDC</span>

function describe(e: ChainEvent): Pick<Row, 'icon' | 'tone' | 'text'> | null {
  const a = e.args
  switch (e.name) {
    case 'BountyCreated':
      return { icon: Sparkles, tone: 'tag-sky', text: <><PersonLink address={addr(a.creator)} /> posted {usdc(a.amount)}</> }
    case 'Contributed':
      return { icon: Coins, tone: 'tag-mint', text: <><PersonLink address={addr(a.contributor)} /> added {usdc(a.amount)}</> }
    case 'ContributionWithdrawn':
      return { icon: Undo2, tone: 'tag-pop', text: <><PersonLink address={addr(a.contributor)} /> withdrew {usdc(a.amount)}</> }
    case 'ClaimSubmitted':
      return { icon: Flag, tone: 'tag-sky', text: <><PersonLink address={addr(a.claimant)} /> submitted claim #{big(a.claimId).toString()}</> }
    case 'ClaimNominated':
      return { icon: Gavel, tone: 'tag-sun', text: <><PersonLink address={addr(a.creator)} /> started a vote on claim #{big(a.claimId).toString()}</> }
    case 'Voted':
      return {
        icon: Vote,
        tone: 'tag-sun',
        text: <><PersonLink address={addr(a.voter)} /> voted {a.support === true ? 'yes' : 'no'} with {usdc(a.weight)}</>,
      }
    case 'VoteResolved':
      return {
        icon: Gavel,
        tone: a.passed === true ? 'tag-mint' : 'tag-danger',
        text: (
          <>
            Vote {a.passed === true ? 'passed' : 'failed'} (yes {usdc(a.yesWeight)} · no {usdc(a.noWeight)})
          </>
        ),
      }
    case 'BountyPaid':
      return {
        icon: Crown,
        tone: 'tag-mint',
        text: <><PersonLink address={addr(a.claimant)} /> received {usdc(a.payout)} · fee {usdc(a.fee)}</>,
      }
    case 'PayoutDeferred':
      return { icon: HandCoins, tone: 'tag-sun', text: <>Payout of {usdc(a.amount)} to <PersonLink address={addr(a.to)} /> is held for withdrawal</> }
    case 'BountyCancelled':
      return { icon: Ban, tone: 'tag-danger', text: <><PersonLink address={addr(a.creator)} /> cancelled the bounty</> }
    case 'RefundClaimed':
      return { icon: RotateCcw, tone: 'tag-pop', text: <><PersonLink address={addr(a.contributor)} /> claimed a refund of {usdc(a.amount)}</> }
    case 'CommentAdded':
      return { icon: MessageSquare, tone: 'tag-sky', text: <><PersonLink address={addr(a.author)} /> commented</> }
    default:
      return null
  }
}

const PAGE = 8

/** Every transaction that touched this bounty, newest first, each linking to its block explorer page. */
export function OnchainActivity({ bountyId }: { bountyId: bigint }) {
  const { data, isLoading } = useEvents()
  const now = useNow(30_000)
  const [shown, setShown] = useState(PAGE)

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const e of data?.events ?? []) {
      if (e.args.bountyId !== bountyId) continue
      const d = describe(e)
      if (!d) continue
      out.push({ ...d, key: `${e.txHash}-${e.logIndex}`, txHash: e.txHash, ts: e.ts, order: e.block * 100000n + BigInt(e.logIndex) })
    }
    return out.sort((x, y) => (y.order > x.order ? 1 : y.order < x.order ? -1 : 0))
  }, [data, bountyId])

  return (
    <section aria-labelledby="onchain-activity">
      <h2 id="onchain-activity" className="display mb-3 text-lg font-semibold">
        Onchain activity <span className="text-[var(--subtle)]">({rows.length})</span>
      </h2>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-3xl bg-surface/50" />
      ) : rows.length === 0 ? (
        <div className="glass-inner rounded-3xl p-6 text-center text-sm text-[var(--muted)]">No onchain activity found for this bounty yet.</div>
      ) : (
        <>
          <ul className="glass-card divide-y divide-[var(--inner-border)] rounded-3xl">
            {rows.slice(0, shown).map((r) => (
              <li key={r.key} className="flex items-start gap-3 px-4 py-3">
                <span className={`tag mt-0.5 flex size-7 shrink-0 items-center justify-center !p-0 ${r.tone}`}>
                  <r.icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="text-pretty">{r.text}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{timeAgo(r.ts, now)}</span>
                    <a
                      href={buildTxExplorerUrl(CHAIN_ID, r.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono font-semibold text-[var(--accent-hover)] hover:underline"
                      aria-label={`View transaction ${r.txHash} on the explorer`}
                    >
                      {r.txHash.slice(0, 8)}…{r.txHash.slice(-6)} <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {rows.length > shown && (
            <button
              onClick={() => setShown((n) => n + PAGE)}
              className="glass-inner mt-3 min-h-11 w-full rounded-2xl text-sm font-semibold"
            >
              Show more ({rows.length - shown} older)
            </button>
          )}
        </>
      )}
    </section>
  )
}
