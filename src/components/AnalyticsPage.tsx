import { useMemo, useState } from 'react'
import { buildAnalytics, CHART_FILTERS, type ChartFilter, type RangeKey } from '@/lib/derive'
import { useEvents } from '@/hooks/useClimbData'
import { fmtUsdc, useNow } from '@/components/ui'
import { PageTitle, Skeletons, Tabs } from '@/components/shared'

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card rounded-2xl p-3.5">
      <div className="text-xs font-semibold text-[var(--muted)]">{label}</div>
      <div className="display mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[var(--subtle)]">{sub}</div>}
    </div>
  )
}

export function AnalyticsPage() {
  const { data, isLoading } = useEvents()
  const now = useNow(60_000)
  const [range, setRange] = useState<RangeKey>('7d')
  const [filter, setFilter] = useState<ChartFilter>('all')
  const [metric, setMetric] = useState<'txs' | 'volume'>('txs')
  const [picked, setPicked] = useState<string | null>(null)

  const a = useMemo(() => buildAnalytics(data?.events ?? [], range, now), [data, range, now])

  const bars = a.days.map((d) => ({
    day: d.day,
    value: metric === 'txs' ? d.txs[filter] : Number(d.volume[filter]) / 1e6,
  }))
  const max = Math.max(1, ...bars.map((b) => b.value))
  const active = bars.find((b) => b.day === picked) ?? bars[bars.length - 1]

  return (
    <div>
      <PageTitle title="Analytics" sub="Computed from onchain events. Days are UTC." />
      <Tabs
        tabs={[
          { id: '7d', label: '7 days' },
          { id: '30d', label: '30 days' },
          { id: 'all', label: 'All time' },
        ]}
        value={range}
        onChange={(r) => {
          setRange(r)
          setPicked(null)
        }}
      />

      {isLoading ? (
        <Skeletons n={2} h="h-24" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Transactions" value={String(a.totalTx)} />
            <Stat label="USDC volume" value={fmtUsdc(a.volume)} />
            <Stat label="Daily average" value={fmtUsdc(a.dailyAvg)} sub="USDC per day" />
            <Stat label="Peak day" value={a.peak ? fmtDay(a.peak.day) : 'None yet'} sub={a.peak ? `${a.peak.txs} transactions` : undefined} />
          </div>

          <section className="glass-card rounded-3xl p-4">
            <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
              {CHART_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`min-h-10 shrink-0 rounded-full px-3.5 text-xs font-semibold ${filter === f.id ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'glass-inner'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">{active ? fmtDay(active.day) : ''}</span>{' '}
                <span className="tabular-nums text-[var(--muted)]">
                  {active ? (metric === 'txs' ? `${active.value} transactions` : `${active.value.toFixed(2)} USDC`) : ''}
                </span>
              </div>
              <div className="glass-inner flex rounded-full p-0.5 text-[11px] font-semibold">
                {(['txs', 'volume'] as const).map((m) => (
                  <button key={m} onClick={() => setMetric(m)} className={`min-h-8 rounded-full px-3 ${metric === m ? 'bg-surface' : 'text-[var(--muted)]'}`}>
                    {m === 'txs' ? 'Txs' : 'USDC'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Daily activity bar chart">
              {bars.map((b) => (
                <button
                  key={b.day}
                  onClick={() => setPicked(b.day)}
                  aria-label={`${fmtDay(b.day)}: ${b.value}`}
                  className="group flex h-full min-w-0 flex-1 items-end"
                >
                  <span
                    className="w-full rounded-t-md transition-opacity group-hover:opacity-80"
                    style={{
                      height: `${Math.max(b.value > 0 ? 4 : 1, (b.value / max) * 100)}%`,
                      background: b.day === active?.day ? 'var(--pop)' : b.value > 0 ? 'var(--accent-hover)' : 'var(--inner-border)',
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-[var(--subtle)]">
              <span>{bars[0] ? fmtDay(bars[0].day) : ''}</span>
              <span>{bars.length ? fmtDay(bars[bars.length - 1].day) : ''}</span>
            </div>
          </section>

          {data && (
            <p className="text-center text-xs text-[var(--subtle)]">
              Read from block {data.startBlock.toString()} to {data.headBlock.toString()}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
