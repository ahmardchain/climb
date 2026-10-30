import { useMemo, useState } from 'react'
import { Flame, Link2, Search } from 'lucide-react'
import { link, navigate, type Route } from '@/lib/router'
import { classifyProof } from '@/lib/climb'
import { buildPeople, lower, trending } from '@/lib/derive'
import { useAllClaims, useBountyList, useEvents } from '@/hooks/useClimbData'
import { fmtUsdc, useNow } from '@/components/ui'
import { BountyCard } from '@/components/BountyCard'
import { Empty, PageTitle, Skeletons, Tabs } from '@/components/shared'
import { shortAddress } from '@/lib/climb'

type Tab = 'bounties' | 'claims' | 'users'

function setParams(route: Route, patch: Record<string, string | null>) {
  const next = new URLSearchParams(route.search)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) next.delete(k)
    else next.set(k, v)
  }
  const qs = next.toString()
  navigate(`/explore${qs ? `?${qs}` : ''}`)
}

export function ExplorePage({ route }: { route: Route }) {
  const cat = route.search.get('cat')
  const isTrending = route.search.get('trending') === '1'
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('bounties')
  const now = useNow(60_000)

  const { data: list, isLoading } = useBountyList()
  const { data: claims } = useAllClaims(list)
  const { data: store } = useEvents()

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of list ?? []) {
      const c = i.bounty.category.trim()
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [list])

  const needle = q.trim().toLowerCase()

  const bounties = useMemo(() => {
    let items = (list ?? []).filter((i) => !cat || i.bounty.category === cat)
    if (needle) items = items.filter((i) => `${i.bounty.title} ${i.bounty.description}`.toLowerCase().includes(needle))
    if (isTrending) {
      const t = trending(store?.events ?? [], now)
      const rank = new Map(t.map((x, idx) => [x.bountyId.toString(), { idx, funded: x.funded }]))
      return items
        .filter((i) => rank.has(i.bounty.id.toString()))
        .sort((a, b) => (rank.get(a.bounty.id.toString())?.idx ?? 0) - (rank.get(b.bounty.id.toString())?.idx ?? 0))
        .map((i) => ({ item: i, note: `+${fmtUsdc(rank.get(i.bounty.id.toString())?.funded ?? 0n)} this week` }))
    }
    return items.map((item) => ({ item, note: undefined as string | undefined }))
  }, [list, cat, needle, isTrending, store, now])

  const claimRows = useMemo(
    () =>
      (claims ?? []).filter(
        (c) =>
          (!cat || c.bounty.category === cat) &&
          (!needle || `${c.bounty.title} ${c.claim.note} ${c.claim.proofURI}`.toLowerCase().includes(needle)),
      ),
    [claims, cat, needle],
  )

  const users = useMemo(() => {
    const people = [...buildPeople(store?.events ?? []).values()]
    const filtered = needle ? people.filter((p) => lower(p.address).includes(needle)) : people
    return filtered.sort((a, b) => (b.earned + b.funded > a.earned + a.funded ? 1 : -1))
  }, [store, needle])

  return (
    <div>
      <PageTitle title="Explore" />
      <label className="glass-inner mb-3 flex min-h-12 items-center gap-2 rounded-2xl px-4">
        <Search className="size-4 shrink-0 text-[var(--subtle)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles and descriptions"
          aria-label="Search"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--subtle)]"
        />
      </label>

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        <button
          onClick={() => setParams(route, { trending: isTrending ? null : '1' })}
          aria-pressed={isTrending}
          className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold ${isTrending ? 'bg-[var(--pop)] text-white' : 'glass-inner'}`}
        >
          <Flame className="size-3.5" /> Trending
        </button>
        <button
          onClick={() => setParams(route, { cat: null })}
          aria-pressed={!cat}
          className={`min-h-10 shrink-0 rounded-full px-3.5 text-xs font-semibold ${!cat ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'glass-inner'}`}
        >
          All
        </button>
        {categories.map(([name, count]) => (
          <button
            key={name}
            onClick={() => setParams(route, { cat: cat === name ? null : name })}
            aria-pressed={cat === name}
            className={`min-h-10 shrink-0 rounded-full px-3.5 text-xs font-semibold ${cat === name ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'glass-inner'}`}
          >
            {name} <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: 'bounties', label: 'Bounties' },
          { id: 'claims', label: 'Claims' },
          { id: 'users', label: 'Users' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isLoading && <Skeletons />}

      {tab === 'bounties' && (
        <div className="space-y-3">
          {!isLoading && bounties.length === 0 && <Empty>{isTrending ? 'Nothing has been funded in the last 7 days.' : 'No bounties match.'}</Empty>}
          {bounties.map(({ item, note }) => (
            <BountyCard key={item.bounty.id.toString()} item={item} note={note} />
          ))}
        </div>
      )}

      {tab === 'claims' &&
        (claimRows.length === 0 ? (
          <Empty>No claims match.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {claimRows.map(({ claim, bounty }) => {
              const p = classifyProof(claim.proofURI)
              return (
                <a
                  key={`${bounty.id}-${claim.id}`}
                  {...link(`/bounty/${bounty.id}`)}
                  className="glass-card group relative block aspect-square overflow-hidden rounded-2xl"
                >
                  {p.kind === 'image' && p.url ? (
                    <img src={p.url.href} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-[var(--muted)]">
                      <Link2 className="size-5" />
                      {p.url?.hostname ?? 'Proof link'}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] font-semibold text-white">
                    <span className="line-clamp-1">{bounty.title}</span>
                  </span>
                </a>
              )
            })}
          </div>
        ))}

      {tab === 'users' &&
        (users.length === 0 ? (
          <Empty>No users match.</Empty>
        ) : (
          <ul className="space-y-2.5">
            {users.slice(0, 50).map((p) => (
              <li key={p.address}>
                <a {...link(`/profile/${p.address}`)} className="glass-card flex min-h-16 items-center justify-between gap-3 rounded-2xl p-3.5">
                  <span className="font-mono text-sm font-semibold tabular-nums">{shortAddress(p.address)}</span>
                  <span className="text-right text-xs text-[var(--muted)]">
                    <span className="block">Earned {fmtUsdc(p.earned)} USDC</span>
                    <span className="block">
                      {p.created} posted · {p.claims} claims
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
