'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/overview', label: 'SpectreLink' },
  { href: '/about', label: 'About' },
  { href: '/transit', label: 'SpectreTransit' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-12 h-[72px]"
      style={{
        background: 'rgba(1,1,1,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      {/* Nav Links */}
      <ul className="flex gap-1 list-none">
        {links.map(link => {
          const active = pathname === link.href
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="relative block px-4 py-2 transition-all duration-200"
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: active ? 'var(--white)' : 'var(--dim)',
                  border: active ? '1px solid var(--glass-border)' : '1px solid transparent',
                  textDecoration: 'none',
                }}
              >
                {link.label}
                <span
                  className="absolute bottom-0 left-0 right-0 h-px transition-all duration-300"
                  style={{
                    background: 'var(--white)',
                    transform: active ? 'scaleX(1)' : 'scaleX(0)',
                    transformOrigin: 'left',
                  }}
                />
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9">
          <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="18,2 34,10 34,26 18,34 2,26 2,10" stroke="rgba(255,255,255,0.6)" strokeWidth="1" fill="none"/>
            <polygon points="18,8 28,13 28,23 18,28 8,23 8,13" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" fill="none"/>
            <circle cx="18" cy="18" r="4" fill="white" opacity="0.9"/>
            <line x1="18" y1="2" x2="18" y2="8" stroke="white" strokeWidth="0.5" opacity="0.5"/>
            <line x1="18" y1="28" x2="18" y2="34" stroke="white" strokeWidth="0.5" opacity="0.5"/>
            <line x1="2" y1="10" x2="8" y2="13" stroke="white" strokeWidth="0.5" opacity="0.5"/>
            <line x1="28" y1="23" x2="34" y2="26" stroke="white" strokeWidth="0.5" opacity="0.5"/>
            <line x1="2" y1="26" x2="8" y2="23" stroke="white" strokeWidth="0.5" opacity="0.5"/>
            <line x1="28" y1="13" x2="34" y2="10" stroke="white" strokeWidth="0.5" opacity="0.5"/>
          </svg>
        </div>
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '22px',
          letterSpacing: '0.12em',
          color: 'var(--white)',
        }}>
          SPECTRELINK
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2" style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '10px',
        color: 'var(--faint)',
        letterSpacing: '0.1em',
      }}>
        <span className="status-dot" />
        SYSTEM ONLINE
      </div>
    </nav>
  )
}
