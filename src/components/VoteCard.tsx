import { Gavel, Timer } from 'lucide-react'
import { ESCROW_ADDRESS, timeLeft, type Bounty } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { Btn, fmtUsdc, useNow } from '@/components/ui'
import type { Runner } from '@/components/BountyForms'

interface Props {
  bounty: Bounty
  myContribution: bigint
  iVoted: boolean
  connected: boolean
  run: Runner
  busy: boolean
}

export function VoteBar({ yes, no }: { yes: bigint; no: bigint }) {
  const total = yes + no
  const yesPct = total === 0n ? 0 : Number((yes * 10000n) / total) / 100
  const noPct = total === 0n ? 0 : 100 - yesPct
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/5" role="img" aria-label={`Yes ${yesPct.toFixed(0)} percent, no ${noPct.toFixed(0)} percent`}>
        <div className="h-full transition-[flex-basis] duration-500" style={{ flexBasis: `${yesPct}%`, background: 'var(--mint)' }} />
        <div className="h-full transition-[flex-basis] duration-500" style={{ flexBasis: `${noPct}%`, background: 'var(--danger)' }} />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums">
        <span className="font-semibold" style={{ color: 'var(--success)' }}>
          Yes {fmtUsdc(yes)} ({yesPct.toFixed(0)}%)
        </span>
        <span className="font-semibold" style={{ color: 'var(--danger)' }}>
          No {fmtUsdc(no)} ({noPct.toFixed(0)}%)
        </span>
      </div>
    </div>
  )
}

export function VoteCard({ bounty, myContribution, iVoted, connected, run, busy }: Props) {
  const now = useNow()
  const endsAt = Number(bounty.voteEndsAt)
  const remaining = endsAt - now
  const ended = remaining <= 0

  const vote = (support: boolean) =>
    ESCROW_ADDRESS &&
    run(support ? 'Vote yes' : 'Vote no', [
      { label: support ? 'Vote yes' : 'Vote no', address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: 'vote', args: [bounty.id, support] },
    ])

  const resolve = () =>
    ESCROW_ADDRESS &&
    run('Resolve vote', [{ label: 'Resolve', address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: 'resolveVote', args: [bounty.id] }])

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Gavel className="size-4" /> Claim #{bounty.nominatedClaimId.toString()} is up for a vote
        </div>
        <span className="flex items-center gap-1 rounded-full bg-surface/70 px-2.5 py-1 text-xs font-semibold tabular-nums">
          <Timer className="size-3.5" /> {ended ? 'Ended' : timeLeft(remaining)}
        </span>
      </div>
      <VoteBar yes={bounty.yesWeight} no={bounty.noWeight} />
      <p className="mt-2 text-xs text-[var(--muted)]">Votes are weighted by how much each funder put in. More yes than no pays the claimant.</p>

      <div className="mt-4 space-y-2">
        {!ended && connected && myContribution > 0n && !iVoted && (
          <div className="grid grid-cols-2 gap-2">
            <Btn tone="mint" busy={busy} onClick={() => vote(true)}>
              Vote yes
            </Btn>
            <Btn tone="danger" busy={busy} onClick={() => vote(false)}>
              Vote no
            </Btn>
          </div>
        )}
        {!ended && connected && iVoted && <p className="text-center text-sm font-medium text-[var(--muted)]">Your vote is in.</p>}
        {!ended && connected && myContribution === 0n && <p className="text-center text-sm text-[var(--muted)]">Only people who funded this bounty can vote.</p>}
        {!ended && !connected && <p className="text-center text-sm text-[var(--muted)]">Connect your wallet to vote if you funded this bounty.</p>}
        {ended && (
          <Btn full busy={busy} onClick={resolve}>
            Resolve vote
          </Btn>
        )}
      </div>
    </section>
  )
}
