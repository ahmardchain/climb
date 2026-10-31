import { useEffect, useMemo, useState } from 'react'
import { Flag, Plus, Timer, Trophy } from 'lucide-react'
import { link } from '@/lib/router'
import { ESCROW_ADDRESS, Status, classifyProof } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { bountyMeta } from '@/lib/derive'
import { useUi } from '@/lib/ui-context'
import { useAllClaims, useBountyList, useEvents, useWalletInfo } from '@/hooks/useClimbData'
import { useClimbTx } from '@/hooks/useClimbTx'
import { Btn, TxStatus, fmtUsdc, useNow } from '@/components/ui'
import { BountyCard } from '@/components/BountyCard'
import { ProofImage } from '@/components/ProofImage'
import { PersonLink, timeAgo } from '@/components/shared'

const TABS = [
  { id: 'open', label: 'Open', status: Status.Active, icon: Flag, empty: 'No open bounties yet. Post the first one.' },
  { id: 'voting', label: 'Voting now', status: Status.Voting, icon: Timer, empty: 'No votes running right now.' },
  { id: 'paid', label: 'Paid out', status: Status.Paid, icon: Trophy, empty: 'Nothing paid out yet.' },
] as const

const WORDS = ['fun', 'builders', 'creators', 'the culture']

function RotatingHeadline() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <h1 className="display text-balance text-4xl font-bold leading-[1.05]">
      bounties for
      <br />
      <span key={WORDS[i]} className="word-in inline-block" style={{ color: 'var(--pop)' }} aria-live="polite">
        {WORDS[i]}
      </span>
    </h1>
  )
}

function PendingBanner() {
  const { data } = useWalletInfo()
  const { state, run, reset, busy } = useClimbTx()
  const escrow = ESCROW_ADDRESS
  if (!escrow || !data || (data.pending === 0n && state.phase === 'idle')) return null
  return (
    <div className="mb-4 space-y-2">
      {data.pending > 0n && (
        <div className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="text-sm">
            <div className="font-semibold">{fmtUsdc(data.pending)} USDC waiting for you</div>
            <div className="text-xs text-[var(--muted)]">A payout couldn't be sent directly. Withdraw it here.</div>
          </div>
          <Btn
            small
            tone="mint"
            busy={busy}
            onClick={() => run('Withdraw payout', [{ label: 'Withdraw', address: escrow, abi: climbEscrowAbi, functionName: 'withdrawPending' }])}
          >
            Withdraw
          </Btn>
        </div>
      )}
      <TxStatus state={state} onDismiss={reset} />
    </div>
  )
}

function LatestClaims({ list }: { list: ReturnType<typeof useBountyList>['data'] }) {
  const { data: claims } = useAllClaims(list)
  const withImages = useMemo(
    () => (claims ?? []).filter((c) => classifyProof(c.claim.proofURI).kind === 'image').slice(0, 12),
    [claims],
  )
  if (withImages.length === 0) return null
  return (
    <section className="mb-5">
      <h2 className="display mb-2 text-lg font-semibold">Latest claims</h2>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {withImages.map(({ claim, bounty }) => {
          return (
            <a
              key={`${bounty.id}-${claim.id}`}
              {...link(`/bounty/${bounty.id}`)}
              className="glass-card relative block aspect-[4/5] w-40 shrink-0 snap-start overflow-hidden rounded-2xl"
            >
              <ProofImage uri={claim.proofURI} className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2.5 text-xs font-semibold text-white">
                <span className="line-clamp-2">{bounty.title}</span>
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function RecentPayouts() {
  const { data } = useEvents()
  const now = useNow(30_000)
  const rows = useMemo(() => {
    const events = data?.events ?? []
    const meta = bountyMeta(events)
    return events
      .filter((e) => e.name === 'BountyPaid')
      .slice(-5)
      .reverse()
      .map((e) => {
        const id = (e.args.bountyId as bigint).toString()
        return {
          key: `${e.txHash}-${e.logIndex}`,
          id,
          title: meta.get(id)?.title ?? `Bounty #${id}`,
          claimant: e.args.claimant as string,
          payout: e.args.payout as bigint,
          ts: e.ts,
        }
      })
  }, [data])
  if (rows.length === 0) return null
  return (
    <section className="mb-5">
      <h2 className="display mb-2 text-lg font-semibold">Recent payouts</h2>
      <ul className="glass-card divide-y divide-[var(--inner-border)] rounded-3xl">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <a {...link(`/bounty/${r.id}`)} className="line-clamp-1 font-semibold hover:underline">
                {r.title}
              </a>
              <div className="text-xs text-[var(--muted)]">
                <PersonLink address={r.claimant} /> · {timeAgo(r.ts, now)}
              </div>
            </div>
            <span className="display shrink-0 text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}>
              +{fmtUsdc(r.payout)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Home() {
  const { openCreate } = useUi()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('open')
  const { data, isLoading, isError } = useBountyList()

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  const items = useMemo(() => (data ?? []).filter((i) => i.bounty.status === active.status), [data, active.status])
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, (data ?? []).filter((i) => i.bounty.status === t.status).length])),
    [data],
  )

  return (
    <div>
      <PendingBanner />
      <section className="glass-card mb-5 rounded-3xl p-5 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:p-8">
        <div className="lg:max-w-xl">
        <RotatingHeadline />
        <p className="mt-3 text-pretty text-sm text-[var(--muted)]">
          Post a task with a USDC reward held in escrow. Others send proof. The reward is paid out onchain when the proof is accepted.
        </p>
        </div>
        <Btn full className="mt-4 lg:mt-0 lg:w-auto lg:shrink-0 lg:px-8" onClick={openCreate} disabled={!ESCROW_ADDRESS}>
          <Plus className="size-4" /> Post a bounty
        </Btn>
      </section>

      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <LatestClaims list={data} />
        <RecentPayouts />
      </div>

      <div className="glass-inner mb-4 grid grid-cols-3 gap-1 rounded-2xl p-1 md:max-w-md" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-1 text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-surface shadow-sm' : 'text-[var(--muted)]'
            }`}
          >
            <span>{t.label}</span>
            <span className="text-[10px] font-medium tabular-nums text-[var(--subtle)]">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && ESCROW_ADDRESS && [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-surface/50" />)}
        {isError && <p className="col-span-full text-center text-sm text-[var(--danger)]">Couldn't load bounties. Check your connection and refresh.</p>}
        {!isLoading && !isError && items.length === 0 && ESCROW_ADDRESS && (
          <div className="glass-inner col-span-full rounded-3xl p-8 text-center text-sm text-[var(--muted)]">
            <active.icon className="mx-auto mb-2 size-6 text-[var(--subtle)]" />
            {active.empty}
          </div>
        )}
        {items.map((item) => (
          <BountyCard key={item.bounty.id.toString()} item={item} />
        ))}
      </div>
    </div>
  )
}
