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
      className="fixed top-0 left-0 right-0 w-full z-[9100] flex items-center px-8 h-[72px]"
      style={{
        background: 'rgba(1,1,1,0.97)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      <style>{`
        .nav-link {
          position: relative;
          display: block;
          padding: 8px 28px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 14px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          text-decoration: none;
          color: rgba(240,240,240,0.5);
          border: 1px solid transparent;
          transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }
        .nav-link:hover {
          color: #010101 !important;
          background: #f0f0f0;
          border-color: transparent;
        }
        .nav-link.nav-active {
          color: #f0f0f0;
          border-color: rgba(255,255,255,0.08);
        }
        .nav-link.nav-active:hover {
          color: #010101;
          background: #f0f0f0;
        }
        .nav-underline {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: #f0f0f0;
          transition: transform 0.3s ease;
          transform-origin: left;
        }
        .nav-link:hover .nav-underline {
          transform: scaleX(0) !important;
        }
      `}</style>

      {/* Logo icon — no text */}
      <div className="flex-shrink-0" style={{ width: '32px', height: '32px', marginRight: '12px' }}>
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

      {/* Nav links — span from left to right */}
      <ul className="flex flex-1 justify-between list-none" style={{ padding: '0 12px' }}>
        {links.map(link => {
          const active = pathname === link.href
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`nav-link${active ? ' nav-active' : ''}`}
              >
                {link.label}
                <span
                  className="nav-underline"
                  style={{ transform: active ? 'scaleX(1)' : 'scaleX(0)' }}
                />
              </Link>
            </li>
          )
        })}
      </ul>

    </nav>
  )
}
