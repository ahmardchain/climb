import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Coins, Flag, Gavel, MessageCircle, Plus, Trophy, type LucideIcon } from 'lucide-react'
import { link } from '@/lib/router'
import { buildFeed, lower, type FeedKind } from '@/lib/derive'
import { useEvents } from '@/hooks/useClimbData'
import { fmtUsdc, useNow } from '@/components/ui'
import { Empty, PageTitle, PersonLink, Skeletons, Tabs, timeAgo } from '@/components/shared'

const KIND: Record<FeedKind, { icon: LucideIcon; verb: string; tag: string }> = {
  created: { icon: Plus, verb: 'posted a bounty', tag: 'tag-sky' },
  funded: { icon: Coins, verb: 'added funds to', tag: 'tag-mint' },
  claim: { icon: Flag, verb: 'submitted a claim on', tag: 'tag-pop' },
  comment: { icon: MessageCircle, verb: 'commented on', tag: 'tag-sky' },
  voteStarted: { icon: Gavel, verb: 'started a vote on', tag: 'tag-sun' },
  payout: { icon: Trophy, verb: 'was paid for', tag: 'tag-mint' },
}

export function FeedPage() {
  const { address } = useAccount()
  const { data, isLoading, isError } = useEvents()
  const now = useNow(30_000)
  const [tab, setTab] = useState<'all' | 'you'>('all')

  const items = useMemo(() => buildFeed(data?.events ?? []), [data])
  const shown = useMemo(() => {
    if (tab === 'all') return items
    if (!address) return []
    const me = lower(address)
    return items.filter((i) => i.involved.includes(me))
  }, [items, tab, address])

  return (
    <div>
      <PageTitle title="Feed" sub="Everything happening onchain, newest first." />
      <Tabs
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'you', label: 'You' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {isLoading && <Skeletons />}
      {isError && <p className="text-center text-sm text-[var(--danger)]">Couldn't read activity. Refresh to try again.</p>}
      {!isLoading && !isError && tab === 'you' && !address && <Empty>Connect your wallet to see activity on your bounties and claims.</Empty>}
      {!isLoading && !isError && (tab === 'all' || address) && shown.length === 0 && <Empty>No activity yet.</Empty>}
      <ul className="space-y-2.5">
        {shown.slice(0, 100).map((i) => {
          const k = KIND[i.kind]
          return (
            <li key={i.key} className="glass-card rounded-2xl p-3.5">
              <div className="flex items-start gap-3">
                <span className={`tag flex size-9 shrink-0 items-center justify-center !p-0 ${k.tag}`}>
                  <k.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-pretty">
                    <PersonLink address={i.actor} me={address} /> {k.verb}{' '}
                    <a {...link(`/bounty/${i.bountyId}`)} className="font-semibold hover:underline">
                      {i.title}
                    </a>
                    {i.amount !== undefined && i.kind !== 'claim' && (
                      <span className="font-semibold tabular-nums"> · {fmtUsdc(i.amount)} USDC</span>
                    )}
                  </p>
                  {i.text && <p className="mt-1 line-clamp-3 text-pretty text-[var(--muted)]">"{i.text}"</p>}
                  <p className="mt-1 text-xs text-[var(--subtle)]">{timeAgo(i.ts, now)}</p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
