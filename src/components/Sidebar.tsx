import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BarChart3, ChevronDown, Compass, Flame, HelpCircle, Home, Newspaper, Trophy, X } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { link } from '@/lib/router'
import { buildAnalytics } from '@/lib/derive'
import { useBountyList, useEvents } from '@/hooks/useClimbData'
import { fmtUsdc, useNow } from '@/components/ui'
import { StudioBadge } from '@/components/shared'

interface Props {
  open: boolean
  onClose: () => void
  onHow: () => void
  path: string
}

export function Sidebar({ open, onClose, onHow, path }: Props) {
  const [exploreOpen, setExploreOpen] = useState(false)
  const { data: list } = useBountyList()
  const { data: store } = useEvents()
  const now = useNow(60_000)

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of list ?? []) {
      const c = i.bounty.category.trim()
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [list])

  const month = useMemo(() => buildAnalytics(store?.events ?? [], '30d', now), [store, now])

  const item = (to: string, label: string, Icon: typeof Home) => (
    <a
      {...link(to)}
      onClick={(e) => {
        link(to).onClick(e)
        onClose()
      }}
      className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
        path === to ? 'bg-surface/80' : 'hover:bg-surface/50'
      }`}
    >
      <Icon className="size-5" /> {label}
    </a>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col overflow-y-auto p-4"
            style={{ background: 'var(--sheet-bg)', backdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="display text-lg font-bold">Menu</span>
              <button onClick={onClose} aria-label="Close menu" className="flex size-11 items-center justify-center rounded-full hover:bg-surface/60">
                <X className="size-5" />
              </button>
            </div>

            <nav className="space-y-1">
              {item('/', 'Home', Home)}
              {item('/feed', 'Feed', Newspaper)}
              {item('/leaderboard', 'Leaderboard', Trophy)}
              <div>
                <button
                  onClick={() => setExploreOpen((v) => !v)}
                  aria-expanded={exploreOpen}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold hover:bg-surface/50"
                >
                  <Compass className="size-5" /> Explore
                  <ChevronDown className={`ml-auto size-4 transition-transform ${exploreOpen ? 'rotate-180' : ''}`} />
                </button>
                {exploreOpen && (
                  <div className="ml-5 space-y-0.5 border-l border-surface/60 pl-3">
                    <a
                      {...link('/explore?trending=1')}
                      onClick={(e) => {
                        link('/explore?trending=1').onClick(e)
                        onClose()
                      }}
                      className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm hover:bg-surface/50"
                    >
                      <Flame className="size-4 text-[var(--pop)]" /> Trending
                    </a>
                    {categories.length === 0 && <p className="px-2 py-2 text-xs text-[var(--subtle)]">Categories appear as bounties are posted.</p>}
                    {categories.map(([name, count]) => {
                      const to = `/explore?cat=${encodeURIComponent(name)}`
                      return (
                        <a
                          key={name}
                          {...link(to)}
                          onClick={(e) => {
                            link(to).onClick(e)
                            onClose()
                          }}
                          className="flex min-h-11 items-center justify-between rounded-xl px-2 text-sm hover:bg-surface/50"
                        >
                          <span>{name}</span>
                          <span className="text-xs tabular-nums text-[var(--subtle)]">{count}</span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  onClose()
                  onHow()
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold hover:bg-surface/50"
              >
                <HelpCircle className="size-5" /> How it works
              </button>
              {item('/analytics', 'Analytics', BarChart3)}
            </nav>

            <div className="glass-inner mt-auto rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <Activity className="size-3.5" /> Last 30 days
              </div>
              <div className="flex items-baseline gap-1.5">
                <TokenUSDC variant="branded" size={18} className="self-center" />
                <span className="display text-2xl font-bold tabular-nums">{fmtUsdc(month.volume)}</span>
                <span className="text-xs text-[var(--subtle)]">USDC volume</span>
              </div>
              <div className="mt-1 text-sm tabular-nums text-[var(--muted)]">{month.totalTx} transactions</div>
            </div>
            <div className="mt-4 flex justify-center">
              <StudioBadge />
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
