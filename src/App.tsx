import { useMemo, useState } from 'react'
import { useRoute } from '@/lib/router'
import { UiContext } from '@/lib/ui-context'
import { useTheme } from '@/hooks/useTheme'
import { Header, NetworkBanner } from '@/components/Header'
import { Sidebar } from '@/components/Sidebar'
import { BottomNav } from '@/components/BottomNav'
import { HowItWorks } from '@/components/HowItWorks'
import { CreateSheet } from '@/components/CreateSheet'
import { ClaimSheet } from '@/components/ClaimSheet'
import { Home } from '@/components/Home'
import { BountyPage } from '@/components/BountyPage'
import { FeedPage } from '@/components/FeedPage'
import { LeaderboardPage } from '@/components/LeaderboardPage'
import { ExplorePage } from '@/components/ExplorePage'
import { ProfilePage } from '@/components/ProfilePage'
import { AnalyticsPage } from '@/components/AnalyticsPage'
import { StudioBadge } from '@/components/shared'

export default function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  const { path } = route
  const bountyMatch = /^\/bounty\/(\d+)\/?$/.exec(path)
  const bountyId = bountyMatch ? BigInt(bountyMatch[1]) : null
  const profileMatch = /^\/profile(?:\/(0x[0-9a-fA-F]+))?\/?$/.exec(path)

  const ui = useMemo(
    () => ({
      openCreate: () => setCreateOpen(true),
      openClaim: () => setClaimOpen(true),
      openHow: () => setHowOpen(true),
      openMenu: () => setMenuOpen(true),
      theme,
      toggleTheme: toggle,
    }),
    [theme, toggle],
  )

  const narrow = path === '/feed' || path === '/leaderboard' ? 'mx-auto max-w-2xl' : path === '/analytics' || profileMatch ? 'mx-auto max-w-3xl' : ''

  let page
  if (bountyId !== null) page = <BountyPage id={bountyId} />
  else if (profileMatch) page = <ProfilePage param={profileMatch[1]} />
  else if (path === '/feed') page = <FeedPage />
  else if (path === '/leaderboard') page = <LeaderboardPage />
  else if (path === '/explore') page = <ExplorePage route={route} />
  else if (path === '/analytics') page = <AnalyticsPage />
  else page = <Home />

  return (
    <UiContext.Provider value={ui}>
      <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--canvas)' }}>
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div style={{ position: 'absolute', top: '6%', left: '-4%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, var(--blob-a) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: '12%', right: '-4%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, var(--blob-b) 0%, transparent 70%)', filter: 'blur(58px)' }} />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-md px-4 pb-36 pt-4 md:max-w-3xl md:px-6 lg:max-w-6xl lg:pb-12">
          <Header />
          <NetworkBanner />
          <main className={narrow}>{page}</main>
          <footer className="mt-10 flex justify-center">
            <StudioBadge />
          </footer>
        </div>
      </div>

      <BottomNav path={path} onBountyPage={bountyId !== null} />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} onHow={() => setHowOpen(true)} path={path} />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => undefined} />
      {bountyId !== null && <ClaimSheet open={claimOpen} onClose={() => setClaimOpen(false)} bountyId={bountyId} />}
    </UiContext.Provider>
  )
}
