import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ArrowLeft, Ban, Check, Coins, Crown, ExternalLink, Info, RotateCcw, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { TokenUSDC } from '@web3icons/react'
import { navigate } from '@/lib/router'
import { ESCROW_ADDRESS, Status, sameAddress, shortAddress, timeLeft, type Claim } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { CHAIN_ID } from '@/lib/climb'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { useBountyDetail, useEvents, useWalletInfo, type BountyDetail } from '@/hooks/useClimbData'
import { buildShareLink } from '@/lib/share'
import { useClimbTx } from '@/hooks/useClimbTx'
import { Btn, Sheet, TxStatus, TypeBadge, fmtUsdc, useNow } from '@/components/ui'
import { CommentThread } from '@/components/CommentThread'
import { ClaimNote } from '@/components/ClaimNote'
import { ProofPreview } from '@/components/ProofImage'
import { ClaimForm, ContributeForm, type Runner } from '@/components/BountyForms'
import { VoteCard } from '@/components/VoteCard'

const STATUS_LABEL: Record<Status, { text: string; tag: string }> = {
  [Status.Active]: { text: 'Open for claims', tag: 'tag-sky' },
  [Status.Voting]: { text: 'Voting', tag: 'tag-sun' },
  [Status.Paid]: { text: 'Paid out', tag: 'tag-mint' },
  [Status.Cancelled]: { text: 'Cancelled', tag: 'tag-danger' },
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-inner flex items-start gap-2 rounded-2xl p-3 text-sm text-[var(--muted)]">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={buildAddressExplorerUrl(CHAIN_ID, address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-[var(--accent-hover)] hover:underline"
    >
      {shortAddress(address)} <ExternalLink className="size-3" />
    </a>
  )
}

interface ClaimCardProps {
  claim: Claim
  detail: BountyDetail
  me?: string
  isCreator: boolean
  run: Runner
  busy: boolean
  cooldownLeft: number
}

function ClaimCard({ claim, detail, me, isCreator, run, busy, cooldownLeft }: ClaimCardProps) {
  const { bounty } = detail
  const nominated = (bounty.status === Status.Voting || bounty.status === Status.Paid) && bounty.isOpen && bounty.nominatedClaimId === claim.id
  const isWinner = bounty.status === Status.Paid && (detail.winner ? detail.winner.claimId === claim.id : bounty.isOpen && nominated)
  const act = (fn: 'acceptClaim' | 'nominateClaim', title: string) =>
    ESCROW_ADDRESS && run(title, [{ label: title, address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: fn, args: [bounty.id, claim.id] }])

  return (
    <li className={`glass-card space-y-3 rounded-3xl p-4 ${isWinner ? 'ring-2 ring-[var(--mint)]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)]">Claim #{claim.id.toString()}</span>
          <AddressLink address={claim.claimant} />
          {sameAddress(me, claim.claimant) && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase">You</span>}
        </div>
        <div className="flex gap-1.5">
          {isWinner && (
            <span className="tag tag-mint flex items-center gap-1">
              <Crown className="size-3" /> Winner
            </span>
          )}
          {nominated && bounty.status === Status.Voting && (
            <span className="tag tag-sun">
              Up for vote
            </span>
          )}
        </div>
      </div>
      <ProofPreview uri={claim.proofURI} />
      <ClaimNote note={claim.note} />
      {isCreator && bounty.status === Status.Active && !bounty.isOpen && (
        <Btn full tone="mint" busy={busy} onClick={() => act('acceptClaim', 'Accept and pay')}>
          Accept and pay {fmtUsdc(bounty.totalFunds)} USDC
        </Btn>
      )}
      {isCreator && bounty.status === Status.Active && bounty.isOpen && (
        <>
          <Btn full tone="primary" busy={busy} disabled={cooldownLeft > 0} onClick={() => act('nominateClaim', 'Nominate for a vote')}>
            Nominate for a vote
          </Btn>
          {cooldownLeft > 0 && (
            <p className="text-center text-xs text-[var(--muted)]">The last vote failed. You can nominate again in {timeLeft(cooldownLeft)}.</p>
          )}
        </>
      )}
    </li>
  )
}

export function BountyPage({ id }: { id: bigint }) {
  const { address, isConnected } = useAccount()
  const { data: detail, isLoading } = useBountyDetail(id)
  const { data: wallet } = useWalletInfo()
  const { state, run, reset, busy } = useClimbTx()
  const now = useNow()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [fundOpen, setFundOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string>()
  const [copied, setCopied] = useState(false)
  const { data: store } = useEvents()

  useEffect(() => {
    let live = true
    void buildShareLink(`/bounty/${id}`).then((u) => {
      if (live) setShareUrl(u)
    })
    return () => {
      live = false
    }
  }, [id])

  const txCount = useMemo(() => {
    const hashes = new Set<string>()
    for (const e of store?.events ?? []) if (e.args.bountyId === id) hashes.add(e.txHash)
    return hashes.size
  }, [store, id])

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar instead.")
    }
  }

  const back = (
    <button onClick={() => navigate('/')} className="mb-4 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--muted)]">
      <ArrowLeft className="size-4" /> All bounties
    </button>
  )

  if (isLoading) return <div>{back}<div className="h-64 animate-pulse rounded-3xl bg-surface/50" /></div>
  if (!detail) {
    return (
      <div>
        {back}
        <div className="glass-inner rounded-3xl p-8 text-center text-sm text-[var(--muted)]">We couldn't find that bounty.</div>
      </div>
    )
  }

  const { bounty, claims, contributors, myContribution, iClaimed, iVoted } = detail
  const isCreator = sameAddress(address, bounty.creator)
  const status = STATUS_LABEL[bounty.status]
  const cooldownLeft = Math.max(0, Number(detail.nominationAvailableAt) - now)
  const active = bounty.status === Status.Active
  const voting = bounty.status === Status.Voting
  const canClaim = (active || voting) && !isCreator && myContribution === 0n

  const call = (fn: 'withdrawContribution' | 'cancelBounty' | 'claimRefund', title: string) =>
    ESCROW_ADDRESS && run(title, [{ label: title, address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: fn, args: [bounty.id] }])

  return (
    <div className="space-y-4">
      {back}

      <section className="glass-card rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <TypeBadge isOpen={bounty.isOpen} />
          <span className={`tag ${status.tag}`}>{status.text}</span>
          {bounty.category && <span className="tag glass-inner">{bounty.category}</span>}
        </div>
        <h1 className="display text-balance text-2xl font-bold leading-tight">{bounty.title}</h1>
        {bounty.description && <p className="mt-2 whitespace-pre-line text-pretty text-sm text-[var(--muted)]">{bounty.description}</p>}
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold text-[var(--muted)]">
              {bounty.status === Status.Paid ? 'Paid out' : bounty.status === Status.Cancelled ? 'Held for refunds' : 'Total reward'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <TokenUSDC variant="branded" size={24} className="self-center" />
              <span className="display text-4xl font-bold tabular-nums">
                {fmtUsdc(bounty.status === Status.Paid && detail.winner ? detail.winner.payout + detail.winner.fee : bounty.totalFunds)}
              </span>
              <span className="text-sm font-medium text-[var(--subtle)]">USDC</span>
            </div>
          </div>
          <div className="text-right text-xs text-[var(--muted)]">
            <div>Posted by</div>
            <AddressLink address={bounty.creator} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="glass-inner rounded-xl py-2">
            <div className="display text-lg font-bold tabular-nums">{bounty.isOpen ? contributors.length : 1}</div>
            <div className="text-[11px] text-[var(--muted)]">{(bounty.isOpen ? contributors.length : 1) === 1 ? 'funder' : 'funders'}</div>
          </div>
          <div className="glass-inner rounded-xl py-2">
            <div className="display text-lg font-bold tabular-nums">{claims.length}</div>
            <div className="text-[11px] text-[var(--muted)]">{claims.length === 1 ? 'claim' : 'claims'}</div>
          </div>
          <div className="glass-inner rounded-xl py-2">
            <div className="display text-lg font-bold tabular-nums">{txCount}</div>
            <div className="text-[11px] text-[var(--muted)]">{txCount === 1 ? 'transaction' : 'transactions'}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {bounty.isOpen && (
            <Btn full tone="mint" disabled={!(active && !iClaimed)} onClick={() => setFundOpen(true)}>
              <Coins className="size-4" /> Add funds
            </Btn>
          )}
          <Btn full tone="ghost" disabled={!shareUrl} onClick={copyLink}>
            {copied ? <Check className="size-4" /> : <Share2 className="size-4" />} {copied ? 'Copied' : 'Share'}
          </Btn>
        </div>
        {detail.winner && (
          <p className="mt-3 text-xs text-[var(--muted)]">
            {fmtUsdc(detail.winner.payout)} USDC went to <AddressLink address={detail.winner.claimant} />. Platform fee: {fmtUsdc(detail.winner.fee)} USDC.
          </p>
        )}
      </section>

      <TxStatus state={state} onDismiss={reset} />

      {voting && <VoteCard bounty={bounty} myContribution={myContribution} iVoted={iVoted} connected={isConnected} run={run} busy={busy} />}

      {(active || bounty.status === Status.Cancelled) && (
        <section className="glass-card space-y-3 rounded-3xl p-5">
          <h2 className="display text-lg font-semibold">Your move</h2>

          {active && bounty.isOpen && !iClaimed && (
            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--muted)]">Chip in</div>
              <ContributeForm bountyId={bounty.id} run={run} busy={busy} wallet={wallet} />
            </div>
          )}
          {active && bounty.isOpen && iClaimed && <Note>You submitted a claim here, so you can't fund this bounty.</Note>}

          {active && bounty.isOpen && !isCreator && myContribution > 0n && (
            <Btn full tone="ghost" busy={busy} onClick={() => call('withdrawContribution', 'Withdraw funds')}>
              <RotateCcw className="size-4" /> Withdraw my {fmtUsdc(myContribution)} USDC
            </Btn>
          )}

          {active && isCreator && (
            <>
              <Note>{bounty.isOpen ? 'Nominate a claim below to start a 48-hour vote among funders.' : 'Accept a claim below to pay the reward.'}</Note>
              {!confirmCancel ? (
                <Btn full tone="ghost" onClick={() => setConfirmCancel(true)}>
                  <Ban className="size-4" /> Cancel bounty
                </Btn>
              ) : (
                <div className="glass-inner space-y-2 rounded-2xl p-3">
                  <p className="text-sm">Cancel this bounty? Everyone who funded it can then pull their money back. No fee.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn tone="ghost" onClick={() => setConfirmCancel(false)}>
                      Keep it
                    </Btn>
                    <Btn
                      tone="danger"
                      busy={busy}
                      onClick={async () => {
                        await call('cancelBounty', 'Cancel bounty')
                        setConfirmCancel(false)
                      }}
                    >
                      Cancel it
                    </Btn>
                  </div>
                </div>
              )}
            </>
          )}

          {bounty.status === Status.Cancelled &&
            (myContribution > 0n ? (
              <Btn full tone="mint" busy={busy} onClick={() => call('claimRefund', 'Claim refund')}>
                Claim my {fmtUsdc(myContribution)} USDC refund
              </Btn>
            ) : (
              <Note>This bounty was cancelled. Funders can pull their USDC back, with no fee.</Note>
            ))}

          {active && !isCreator && myContribution > 0n && <Note>You funded this bounty, so you can't claim it.</Note>}
          {canClaim && active && (
            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--muted)]">Did it? Show the proof</div>
              <ClaimForm bountyId={bounty.id} run={run} busy={busy} />
            </div>
          )}
        </section>
      )}

      {voting && (canClaim || (!isCreator && myContribution > 0n)) && (
        <section className="glass-card space-y-3 rounded-3xl p-5">
          {canClaim ? (
            <>
              <div className="text-xs font-semibold text-[var(--muted)]">Submit a competing claim</div>
              <ClaimForm bountyId={bounty.id} run={run} busy={busy} />
            </>
          ) : (
            <Note>You funded this bounty, so you can't claim it. Funding is locked while voting is open.</Note>
          )}
        </section>
      )}

      {bounty.isOpen && contributors.length > 0 && (
        <section className="glass-card rounded-3xl p-5">
          <h2 className="display mb-3 text-lg font-semibold">Funders</h2>
          <ul className="space-y-2">
            {contributors.map((c) => (
              <li key={c.address} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <AddressLink address={c.address} />
                  {sameAddress(c.address, bounty.creator) && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase">Creator</span>}
                  {sameAddress(c.address, address) && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase">You</span>}
                </span>
                <span className="font-semibold tabular-nums">{fmtUsdc(c.amount)} USDC</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="display mb-3 text-lg font-semibold">
          Claims <span className="text-[var(--subtle)]">({claims.length})</span>
        </h2>
        {claims.length === 0 ? (
          <div className="glass-inner rounded-3xl p-6 text-center text-sm text-[var(--muted)]">No claims yet. Be the first to show proof.</div>
        ) : (
          <ul className="space-y-3">
            {claims.map((c) => (
              <ClaimCard key={c.id.toString()} claim={c} detail={detail} me={address} isCreator={isCreator} run={run} busy={busy} cooldownLeft={cooldownLeft} />
            ))}
          </ul>
        )}
      </section>

      <CommentThread bountyId={bounty.id} events={store?.events ?? []} run={run} busy={busy} />

      <Sheet open={fundOpen} onClose={() => !busy && setFundOpen(false)} label="Add funds">
        <h2 className="display mb-1 text-2xl font-bold">Add funds</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">Your USDC joins the reward. You get a vote on the winner, and you can withdraw until a vote starts.</p>
        <div className="space-y-3">
          <ContributeForm bountyId={bounty.id} run={run} busy={busy} wallet={wallet} />
          <TxStatus state={state} onDismiss={reset} />
        </div>
      </Sheet>
    </div>
  )
}
