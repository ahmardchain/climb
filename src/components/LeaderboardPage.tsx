import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { link } from '@/lib/router'
import { sameAddress, shortAddress } from '@/lib/climb'
import { buildPeople } from '@/lib/derive'
import { useEvents } from '@/hooks/useClimbData'
import { fmtUsdc } from '@/components/ui'
import { Empty, PageTitle, Skeletons, Tabs } from '@/components/shared'

export function LeaderboardPage() {
  const { address } = useAccount()
  const { data, isLoading } = useEvents()
  const [tab, setTab] = useState<'earners' | 'funders'>('earners')

  const rows = useMemo(() => {
    const people = [...buildPeople(data?.events ?? []).values()]
    const key = tab === 'earners' ? (p: (typeof people)[number]) => p.earned : (p: (typeof people)[number]) => p.funded
    return people
      .filter((p) => key(p) > 0n)
      .sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0))
      .map((p) => ({ p, value: key(p) }))
  }, [data, tab])

  return (
    <div>
      <PageTitle title="Leaderboard" sub={tab === 'earners' ? 'Wallets ranked by USDC earned from won bounties.' : 'Wallets ranked by USDC funded into bounties, net of withdrawals and refunds.'} />
      <Tabs
        tabs={[
          { id: 'earners', label: 'Top earners' },
          { id: 'funders', label: 'Top funders' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {isLoading && <Skeletons n={5} h="h-16" />}
      {!isLoading && rows.length === 0 && <Empty>{tab === 'earners' ? 'Nobody has been paid yet.' : 'No funding yet.'}</Empty>}
      <ol className="space-y-2.5">
        {rows.slice(0, 50).map(({ p, value }, idx) => (
          <li key={p.address}>
            <a {...link(`/profile/${p.address}`)} className={`glass-card flex min-h-16 items-center gap-3 rounded-2xl p-3.5 ${sameAddress(p.address, address) ? 'ring-2 ring-[var(--pop)]' : ''}`}>
              <span className={`display flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${idx < 3 ? 'tag-sun' : 'glass-inner'}`}>
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-sm font-semibold tabular-nums">
                  {sameAddress(p.address, address) ? 'You' : shortAddress(p.address)}
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  {tab === 'earners' ? `${p.wins} ${p.wins === 1 ? 'win' : 'wins'}` : `${p.created} ${p.created === 1 ? 'bounty' : 'bounties'} posted`}
                </span>
              </span>
              <span className="text-right">
                <span className="display block text-lg font-bold tabular-nums">{fmtUsdc(value)}</span>
                <span className="text-[11px] text-[var(--subtle)]">USDC</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
