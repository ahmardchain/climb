import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { Menu, Moon, Mountain, Plus, Sun, Wallet } from 'lucide-react'
import { link, useRoute } from '@/lib/router'
import { useUi } from '@/lib/ui-context'
import { CHAIN, CHAIN_ID, ESCROW_ADDRESS, shortAddress } from '@/lib/climb'
import { Btn } from '@/components/ui'

const DESKTOP_LINKS = [
  { to: '/', label: 'Home', match: (p: string) => p === '/' },
  { to: '/feed', label: 'Feed', match: (p: string) => p === '/feed' },
  { to: '/leaderboard', label: 'Leaderboard', match: (p: string) => p === '/leaderboard' },
  { to: '/explore', label: 'Explore', match: (p: string) => p === '/explore' },
  { to: '/analytics', label: 'Analytics', match: (p: string) => p === '/analytics' },
  { to: '/profile', label: 'Profile', match: (p: string) => p.startsWith('/profile') },
]

export function Header() {
  const { openMenu, openCreate, openClaim, theme, toggleTheme } = useUi()
  const { path } = useRoute()
  const onBounty = /^\/bounty\/\d+/.test(path)
  return (
    <header className="mb-5 flex items-center justify-between gap-2 lg:mb-8">
      <div className="flex items-center gap-1.5">
        <button
          onClick={openMenu}
          aria-label="Open menu"
          className="glass-inner flex size-11 items-center justify-center rounded-full transition-all active:scale-95"
        >
          <Menu className="size-5" />
        </button>
        <a {...link('/')} className="display flex items-center gap-2 text-xl font-bold">
          <span className="flex size-9 items-center justify-center rounded-xl text-white" style={{ background: 'var(--pop)' }}>
            <Mountain className="size-5" />
          </span>
          <span className="hidden min-[360px]:inline">climb</span>
        </a>
      </div>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {DESKTOP_LINKS.map((l) => (
          <a
            key={l.to}
            {...link(l.to)}
            aria-current={l.match(path) ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              l.match(path) ? 'bg-surface text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:bg-surface/50'
            }`}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onBounty ? openClaim : openCreate}
          className="hidden min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white transition-all active:scale-[0.98] lg:flex"
          style={{ background: 'var(--pop)' }}
        >
          <Plus className="size-4" /> {onBounty ? 'Claim' : 'Create bounty'}
        </button>
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="glass-inner flex size-11 items-center justify-center rounded-full transition-all active:scale-95"
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <ConnectKitButton.Custom>
          {({ isConnected, show, address }) => (
            <button
              onClick={show}
              className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold tabular-nums transition-all active:scale-[0.98] ${
                isConnected ? 'glass-inner' : 'bg-[var(--accent)] text-[var(--on-accent)]'
              }`}
            >
              <Wallet className="size-4" />
              {isConnected && address ? shortAddress(address) : 'Connect'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  )
}

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!ESCROW_ADDRESS) {
    return (
      <div className="glass-inner mb-4 rounded-2xl p-4 text-sm">
        <div className="font-semibold">Contract not connected yet</div>
        <p className="mt-1 text-xs text-[var(--muted)]">Deploy ClimbEscrow and set VITE_CLIMB_ESCROW_ADDRESS in .env, then restart the dev server.</p>
      </div>
    )
  }
  if (isConnected && chainId !== CHAIN_ID) {
    return (
      <div className="tag-sun mb-4 flex items-center justify-between gap-3 rounded-2xl p-4">
        <div className="text-sm">
          <div className="font-semibold">Wrong network</div>
          <div className="text-xs opacity-80">climb runs on {CHAIN.name}.</div>
        </div>
        <Btn small tone="primary" busy={isPending} onClick={() => switchChain({ chainId: CHAIN_ID })}>
          Switch network
        </Btn>
      </div>
    )
  }
  return null
}
