import type { ReactNode } from 'react'
import { link } from '@/lib/router'
import { sameAddress, shortAddress } from '@/lib/climb'

export function timeAgo(ts: number, now: number): string {
  if (!ts) return ''
  const s = Math.max(0, now - ts)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function PersonLink({ address, me }: { address: string; me?: string }) {
  const to = `/profile/${address}`
  return (
    <a {...link(to)} className="font-mono text-xs font-semibold tabular-nums text-[var(--accent-hover)] hover:underline">
      {sameAddress(address, me) ? 'You' : shortAddress(address)}
    </a>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="glass-inner mb-4 flex gap-1 rounded-2xl p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`min-h-11 flex-1 rounded-xl px-2 text-xs font-semibold transition-all ${value === t.id ? 'bg-surface shadow-sm' : 'text-[var(--muted)]'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="display text-3xl font-bold">{title}</h1>
      {sub && <p className="mt-1 text-sm text-[var(--muted)]">{sub}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="glass-inner rounded-3xl p-8 text-center text-sm text-[var(--muted)]">{children}</div>
}

export function Skeletons({ n = 3, h = 'h-20' }: { n?: number; h?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`${h} animate-pulse rounded-3xl bg-surface/50`} />
      ))}
    </div>
  )
}

export function StudioBadge({ className = '' }: { className?: string }) {
  return (
    <a
      href="https://studio.arc.io/"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--subtle)] hover:text-[var(--muted)] ${className}`}
    >
      Built with Arc Studio
    </a>
  )
}
