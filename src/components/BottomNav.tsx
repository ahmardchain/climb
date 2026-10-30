import { Compass, Newspaper, Plus, Trophy, User } from 'lucide-react'
import { link } from '@/lib/router'
import { useUi } from '@/lib/ui-context'

interface Props {
  path: string
  onBountyPage: boolean
}

export function BottomNav({ path, onBountyPage }: Props) {
  const { openCreate, openClaim } = useUi()

  const tab = (to: string, label: string, Icon: typeof User, match: (p: string) => boolean) => (
    <a
      {...link(to)}
      aria-current={match(path) ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
        match(path) ? 'text-[var(--ink)]' : 'text-[var(--subtle)]'
      }`}
    >
      <Icon className="size-5" />
      {label}
    </a>
  )

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),8px)]">
      <div className="glass-card relative flex w-full max-w-md items-end rounded-3xl px-2">
        {tab('/profile', 'Profile', User, (p) => p.startsWith('/profile'))}
        {tab('/leaderboard', 'Leaders', Trophy, (p) => p === '/leaderboard')}
        <div className="flex flex-1 flex-col items-center pb-1.5">
          <button
            onClick={onBountyPage ? openClaim : openCreate}
            aria-label={onBountyPage ? 'Create claim' : 'Create bounty'}
            className="-mt-6 flex size-16 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
            style={{ background: 'var(--pop)', boxShadow: '0 8px 24px rgba(255,107,74,0.45)' }}
          >
            <Plus className="size-8" />
          </button>
          <span className="mt-0.5 whitespace-nowrap text-[11px] font-semibold">{onBountyPage ? 'Create claim' : 'Create bounty'}</span>
        </div>
        {tab('/feed', 'Feed', Newspaper, (p) => p === '/feed')}
        {tab('/explore', 'Explore', Compass, (p) => p === '/explore')}
      </div>
    </nav>
  )
}
