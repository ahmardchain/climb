import { useMemo } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { useModal } from 'connectkit'
import { isAddress, type Address } from 'viem'
import { ExternalLink, Wallet } from 'lucide-react'
import { link } from '@/lib/router'
import { CHAIN_ID, ESCROW_ADDRESS, classifyProof, sameAddress, shortAddress } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { buildPeople, emptyPerson } from '@/lib/derive'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { useAllClaims, useBountyList, useEvents } from '@/hooks/useClimbData'
import { useClimbTx } from '@/hooks/useClimbTx'
import { Btn, TxStatus, fmtUsdc } from '@/components/ui'
import { BountyCard } from '@/components/BountyCard'
import { ProofImage } from '@/components/ProofImage'
import { parseNote } from '@/components/ClaimNote'
import { Empty, Skeletons } from '@/components/shared'

function usePending(address?: Address) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['climb', 'pending', address],
    enabled: !!client && !!ESCROW_ADDRESS && !!address,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!client || !ESCROW_ADDRESS || !address) return 0n
      return client.readContract({ address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: 'pendingPayouts', args: [address] })
    },
  })
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="glass-inner rounded-2xl p-3.5">
      <div className="text-xs font-semibold text-[var(--muted)]">{label}</div>
      <div className="display mt-0.5 text-2xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-[var(--subtle)]">{unit}</span>}
      </div>
    </div>
  )
}

export function ProfilePage({ param }: { param?: string }) {
  const { address: me } = useAccount()
  const { setOpen } = useModal()
  const target = param ?? me
  const valid = !!target && isAddress(target)
  const address = valid ? (target) : undefined
  const isMe = sameAddress(address, me)

  const { data: store, isLoading } = useEvents()
  const { data: list } = useBountyList()
  const { data: claims } = useAllClaims(list)
  const { data: pending } = usePending(address)
  const { state, run, reset, busy } = useClimbTx()
  const escrow = ESCROW_ADDRESS

  const stats = useMemo(() => {
    if (!address) return emptyPerson('')
    return buildPeople(store?.events ?? []).get(address.toLowerCase()) ?? emptyPerson(address)
  }, [store, address])
  const created = useMemo(() => (list ?? []).filter((i) => sameAddress(i.bounty.creator, address)), [list, address])
  const myClaims = useMemo(() => (claims ?? []).filter((c) => sameAddress(c.claim.claimant, address)), [claims, address])

  if (!target) {
    return (
      <div className="glass-card rounded-3xl p-6 text-center">
        <Wallet className="mx-auto mb-2 size-7 text-[var(--subtle)]" />
        <h1 className="display text-2xl font-bold">Your profile</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Connect your wallet to see your bounties, claims and earnings.</p>
        <Btn className="mt-4" onClick={() => setOpen(true)}>
          Connect wallet
        </Btn>
      </div>
    )
  }
  if (!address) return <Empty>That doesn't look like a wallet address.</Empty>

  return (
    <div className="space-y-4">
      <section className="glass-card rounded-3xl p-5">
        <div className="text-xs font-semibold text-[var(--muted)]">{isMe ? 'You' : 'Profile'}</div>
        <a
          href={buildAddressExplorerUrl(CHAIN_ID, address)}
          target="_blank"
          rel="noopener noreferrer"
          className="display mt-0.5 inline-flex items-center gap-1.5 text-2xl font-bold tabular-nums hover:underline"
        >
          {shortAddress(address)} <ExternalLink className="size-4" />
        </a>
      </section>

      {pending !== undefined && pending > 0n && (
        <section className="glass-card rounded-3xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold">{fmtUsdc(pending)} USDC parked</div>
              <div className="text-xs text-[var(--muted)]">A payout that couldn't be sent directly, waiting to be withdrawn.</div>
            </div>
            {isMe && escrow && (
              <Btn
                small
                tone="mint"
                busy={busy}
                onClick={() => run('Withdraw payout', [{ label: 'Withdraw', address: escrow, abi: climbEscrowAbi, functionName: 'withdrawPending' }])}
              >
                Withdraw
              </Btn>
            )}
          </div>
        </section>
      )}
      <TxStatus state={state} onDismiss={reset} />

      {isLoading ? (
        <Skeletons n={2} h="h-20" />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          <Stat label="Total earned" value={fmtUsdc(stats.earned)} unit="USDC" />
          <Stat label="Total funded" value={fmtUsdc(stats.funded > 0n ? stats.funded : 0n)} unit="USDC" />
          <Stat label="Wins" value={String(stats.wins)} />
          <Stat label="Claims submitted" value={String(stats.claims)} />
          <Stat label="Bounties created" value={String(stats.created)} />
        </div>
      )}

      <section>
        <h2 className="display mb-2 text-lg font-semibold">Bounties created</h2>
        {created.length === 0 ? <Empty>No bounties yet.</Empty> : <div className="grid gap-3 md:grid-cols-2">{created.map((i) => <BountyCard key={i.bounty.id.toString()} item={i} />)}</div>}
      </section>

      <section>
        <h2 className="display mb-2 text-lg font-semibold">Claims submitted</h2>
        {myClaims.length === 0 ? (
          <Empty>No claims yet.</Empty>
        ) : (
          <ul className="space-y-2.5">
            {myClaims.map(({ claim, bounty }) => {
              const p = classifyProof(claim.proofURI)
              return (
                <li key={`${bounty.id}-${claim.id}`}>
                  <a {...link(`/bounty/${bounty.id}`)} className="glass-card flex items-center gap-3 rounded-2xl p-3">
                    <span className="glass-inner flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[10px] text-[var(--muted)]">
                      {p.kind === 'image' ? <ProofImage uri={claim.proofURI} className="size-full object-cover" fallback="image" /> : 'link'}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="line-clamp-1 font-semibold">{bounty.title}</span>
                      <span className="line-clamp-1 text-xs text-[var(--muted)]">{parseNote(claim.note).title || parseNote(claim.note).description || p.url?.hostname || 'Proof link'}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
