'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import Launchpad from './components/Launchpad'
import WalletManager from './components/WalletManager'
import Liquidity from './components/Liquidity'
import Settings from './components/Settings'

const NAV_ITEMS = [
  {
    id: 'launchpad',
    label: 'COIN LAUNCHPAD',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polygon points="8,2 14,5 14,11 8,14 2,11 2,5" stroke="currentColor" strokeWidth="1" fill="none"/>
        <circle cx="8" cy="8" r="2" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'bundler',
    label: 'WALLET MANAGER',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1" fill="none"/>
        <rect x="9" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1" fill="none"/>
        <rect x="2" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1" fill="none"/>
        <rect x="9" y="9" width="5" height="5" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: 'liquidity',
    label: 'LIQUIDITY MANAGER',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 13 L8 3 L13 13" stroke="currentColor" strokeWidth="1" fill="none"/>
        <path d="M5 9.5 L11 9.5" stroke="currentColor" strokeWidth="0.5"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'SETTINGS',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1" fill="none"/>
        <path d="M8 1.5 L8 3M8 13 L8 14.5M1.5 8 L3 8M13 8 L14.5 8M3.5 3.5 L4.5 4.5M11.5 11.5 L12.5 12.5M12.5 3.5 L11.5 4.5M4.5 11.5 L3.5 12.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
  },
]

const PANELS: Record<string, React.ReactNode> = {
  launchpad: <Launchpad />,
  bundler:   <WalletManager />,
  liquidity: <Liquidity />,
  settings:  <Settings />,
}

export default function TransitPage() {
  const router = useRouter()
  const { user, loading, accessToken } = useAuth()
  const [activeId, setActiveId] = useState('launchpad')

  useEffect(() => {
    if (!loading && !accessToken) {
      router.replace('/login')
    }
  }, [loading, accessToken, router])

  if (loading || !user) return null

  return (
    <div className="transit-shell" style={{
      display: 'flex',
      height: 'calc(100vh - 72px)',
      overflow: 'hidden',
      borderTop: '1px solid var(--glass-border)',
    }}>
      <style>{`
        .transit-shell {
          --black:        #010101;
          --deep:         #ffffff;
          --glass:        rgba(0,0,0,0.05);
          --glass-border: rgba(0,0,0,0.18);
          --white:        #010101;
          --dim:          rgba(1,1,1,0.72);
          --faint:        rgba(1,1,1,0.45);
          background: #e8e8e8;
        }
        body::before { display: none !important; }
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: '220px',
        flexShrink: 0,
        borderRight: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Branding */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--glass)',
        }}>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.2em',
            color: 'var(--faint)',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Platform
          </div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '22px',
            letterSpacing: '0.08em',
            color: 'var(--white)',
            lineHeight: 1,
          }}>
            SPECTRE<br />
            <span style={{ WebkitTextStroke: '1px rgba(1,1,1,0.3)', color: 'transparent' }}>
              TRANSIT
            </span>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 20px',
                  background: isActive ? 'rgba(0,0,0,0.07)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid var(--white)' : '2px solid transparent',
                  color: isActive ? 'var(--white)' : 'var(--dim)',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '12px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ opacity: isActive ? 1 : 0.5 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--glass-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--white)',
              animation: 'pulse 2s infinite',
            }} />
            <span style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.15em',
              color: 'var(--faint)',
              textTransform: 'uppercase',
            }}>
              Systems Online
            </span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          height: '56px',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 28px',
          gap: '16px',
          background: 'var(--glass)',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '11px',
            letterSpacing: '0.1em',
            color: 'var(--dim)',
            textTransform: 'uppercase',
          }}>
            {user.user_email}
          </span>
          <button style={{
            background: 'transparent',
            border: '1px solid var(--glass-border)',
            color: 'var(--dim)',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1" fill="none"/>
              <path d="M8 1.5 L8 3M8 13 L8 14.5M1.5 8 L3 8M13 8 L14.5 8M3.5 3.5 L4.5 4.5M11.5 11.5 L12.5 12.5M12.5 3.5 L11.5 4.5M4.5 11.5 L3.5 12.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Active panel */}
        <div style={{ flex: 1, overflow: 'auto', background: '#e8e8e8' }}>
          {PANELS[activeId]}
        </div>
      </div>
    </div>
  )
}
