'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import ArcanaMark from '@/components/ArcanaMark'
import Footer from '@/components/Footer'
import Launchpad from './components/Launchpad'
import WalletManager from './components/WalletManager'
import Liquidity from './components/Liquidity'
import Settings from './components/Settings'
import CommandCenter from './components/CommandCenter'
import Dashboard from './components/Dashboard'

/* Tab ids are part of the ?tab= deep-link contract — labels can change, ids can't. */
const NAV_ITEMS = [
  { id: 'dashboard',      label: 'Dashboard' },
  { id: 'launchpad',      label: 'Launchpad' },
  { id: 'liquidity',      label: 'Tokens' },
  { id: 'bundler',        label: 'Wallets' },
  { id: 'command-center', label: 'Command center' },
  { id: 'settings',       label: 'Settings' },
]

/** The command centre is the only panel that takes a param, from ?mint=. */
function renderPanel(
  id: string,
  mint: string,
  openCommandCenter: (m: string) => void,
  selectTab: (id: string) => void,
): React.ReactNode {
  switch (id) {
    case 'dashboard':      return <Dashboard onNavigate={selectTab} />
    case 'launchpad':      return <Launchpad />
    case 'command-center': return <CommandCenter initialMint={mint} onNavigate={selectTab} />
    case 'bundler':        return <WalletManager />
    case 'liquidity':      return <Liquidity onOpenCommandCenter={openCommandCenter} />
    case 'settings':       return <Settings />
    default:               return null
  }
}

function TransitShell() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading, accessToken } = useAuth()
  const tabParam = params.get('tab') ?? ''
  const mintParam = params.get('mint') ?? ''

  // Deep links (?tab=command-center&mint=…) pick the panel until a tab is clicked.
  const [chosenId, setChosenId] = useState<string | null>(null)
  const urlId = NAV_ITEMS.some(i => i.id === tabParam) ? tabParam : null
  const activeId = chosenId ?? urlId ?? 'dashboard'

  useEffect(() => {
    if (!loading && !accessToken) {
      router.replace('/login')
    }
  }, [loading, accessToken, router])

  function selectTab(id: string) {
    setChosenId(id)
    router.replace(`/transit?tab=${id}`)
  }

  /** "Open in command center" on a token. */
  function openCommandCenter(mint: string) {
    setChosenId('command-center')
    router.replace(`/transit?tab=command-center&mint=${encodeURIComponent(mint)}`)
  }

  if (loading || !user) return null

  return (
    <div className="app">
      <div className="app-main">
        <header className="app-header">
          <ArcanaMark />

          <nav className="nav-pill" aria-label="Sections">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                type="button"
                className="nav-item glow"
                aria-current={item.id === activeId ? 'page' : undefined}
                onClick={() => selectTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="header-right">
            <div className="net-status">
              <span className="dot dot-pulse" />
              <span>MAINNET</span>
            </div>
            <div className="who" title={user.user_email}>{user.user_email}</div>
          </div>
        </header>

        {/* keyed so each panel replays its entrance */}
        <div key={activeId} className="enter">
          {renderPanel(activeId, mintParam, openCommandCenter, selectTab)}
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default function TransitPage() {
  return (
    <Suspense fallback={null}>
      <TransitShell />
    </Suspense>
  )
}
