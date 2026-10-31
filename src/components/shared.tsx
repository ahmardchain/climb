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
      <svg width="12" height="13" viewBox="0 0 20 22" fill="none" aria-hidden="true">
        <path
          d="M0 21.5001C0.167192 16.2366 1.02308 11.3243 2.45378 7.50459C4.26573 2.66517 6.88869 0 9.83904 0C12.7894 0 15.412 2.66517 17.2243 7.50459C18.1669 10.0216 18.8605 13.0121 19.2713 16.2655C19.3081 16.556 19.3393 16.8513 19.3714 17.146C19.3819 17.1642 19.3881 17.1811 19.386 17.1949C19.386 17.1949 19.6275 18.7674 19.6788 21.5001H19.6515C19.2934 21.1937 15.0694 17.7329 8.06739 18.735C8.17304 17.4996 8.31833 16.2974 8.50603 15.1452C8.51562 15.0863 8.52671 15.0294 8.53649 14.9709C11.2828 14.8846 13.6866 15.2171 15.5299 15.6529C15.5231 15.6073 15.5173 15.5603 15.5103 15.5149C15.1314 13.0547 14.5724 10.8024 13.8517 8.87761C12.6732 5.73037 11.1354 3.77496 9.83904 3.77496C8.54269 3.77496 7.00493 5.73037 5.82649 8.87761C5.54123 9.63889 5.28154 10.4508 5.04866 11.3071C4.72126 12.507 4.44621 13.7934 4.22654 15.1451C3.90141 17.1412 3.69827 19.2821 3.62345 21.5001H0Z"
          fill="currentColor"
        />
      </svg>
      Built with Arc Studio
    </a>
  )
}
