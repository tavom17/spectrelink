import Link from 'next/link'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex flex-col justify-center items-start px-20 overflow-hidden" style={{ height: 'calc(100vh - 72px)' }}>

        {/* Perspective grid */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
            transform: 'perspective(800px) rotateX(20deg) translateY(10%) scale(1.4)',
            transformOrigin: 'bottom',
          }} />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 20%, rgba(1,1,1,0.9) 80%)',
          }} />
        </div>

        {/* Scan lines */}
        {[25, 50, 75].map((left, i) => (
          <div key={left} className="absolute top-0 bottom-0 w-px" style={{
            left: `${left}%`,
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)',
            animation: `lineScan 4s ease-in-out ${i * 1.5}s infinite`,
            opacity: i === 1 ? 0.5 : 1,
          }} />
        ))}

        {/* Hero content */}
        <div className="relative z-10 max-w-3xl">
          <div className="section-label fade-up fade-up-1">Solana Off-Chain Orchestration Platform</div>

          <h1 className="fade-up fade-up-2" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(72px, 10vw, 140px)',
            lineHeight: '0.9',
            letterSpacing: '0.04em',
            color: 'var(--white)',
            marginBottom: '32px',
          }}>
            SPECTRE
            <span className="block" style={{
              WebkitTextStroke: '1px rgba(255,255,255,0.3)',
              color: 'transparent',
            }}>
              LINK
            </span>
          </h1>

          <p className="fade-up fade-up-3" style={{
            fontSize: '16px',
            fontWeight: 300,
            color: 'var(--dim)',
            lineHeight: '1.7',
            maxWidth: '480px',
            marginBottom: '48px',
            letterSpacing: '0.02em',
          }}>
            A unified infrastructure layer for wallet operations, token deployment, and liquidity management on Solana. Built for precision. Engineered for control.
          </p>

          <div className="flex gap-4 flex-wrap fade-up fade-up-4">
            <Link href="/transit" className="btn btn-primary">
              Launch App
              <span className="btn-arrow">→</span>
            </Link>
            <Link href="/overview" className="btn btn-ghost">
              Architecture
              <span className="btn-arrow">→</span>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="absolute bottom-16 right-20 flex gap-12 z-10">
          {[
            { num: '3', label: 'Core Modules' },
            { num: '8', label: 'Containers' },
            { num: '0', label: 'Custom Contracts' },
          ].map(stat => (
            <div key={stat.label} className="text-right">
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '36px',
                color: 'var(--white)',
                letterSpacing: '0.05em',
                lineHeight: 1,
              }}>
                {stat.num}
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '10px',
                color: 'var(--faint)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginTop: '4px',
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-20 flex items-center gap-3 z-10" style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '10px',
          color: 'var(--faint)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}>
          <div className="w-px h-10" style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)',
            animation: 'scrollBob 2s ease-in-out infinite',
          }} />
          Scroll
        </div>
      </section>

      {/* Divider */}
      <div className="mx-20" style={{ height: '1px', background: 'var(--glass-border)' }} />

      {/* Modules section */}
      <section className="px-20 py-28">
        <div className="section-label">Platform Modules</div>
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(40px, 5vw, 72px)',
          letterSpacing: '0.05em',
          color: 'var(--white)',
          lineHeight: 1,
          marginBottom: '64px',
        }}>
          THREE SYSTEMS.<br />ONE INTERFACE.
        </h2>

        <div className="grid grid-cols-3 gap-0" style={{ border: '1px solid var(--glass-border)' }}>
          {[
            {
              num: '01',
              title: 'WALLET GENERATOR',
              body: 'HD wallet creation, BIP-39 key derivation, encrypted storage with AES. Stateless architecture — reconstructed from encrypted DB on demand. Private keys live in memory only during active operations.',
              icon: (
                <svg className="w-10 h-10 mb-7 opacity-70" viewBox="0 0 40 40" fill="none">
                  <rect x="4" y="4" width="32" height="32" rx="2" stroke="white" strokeWidth="1" fill="none"/>
                  <circle cx="20" cy="20" r="6" stroke="white" strokeWidth="1" fill="none"/>
                  <line x1="20" y1="4" x2="20" y2="14" stroke="white" strokeWidth="0.5"/>
                  <line x1="20" y1="26" x2="20" y2="36" stroke="white" strokeWidth="0.5"/>
                  <line x1="4" y1="20" x2="14" y2="20" stroke="white" strokeWidth="0.5"/>
                  <line x1="26" y1="20" x2="36" y2="20" stroke="white" strokeWidth="0.5"/>
                </svg>
              ),
            },
            {
              num: '02',
              title: 'COIN LAUNCHER',
              body: 'SPL Token Program integration via Helius private RPC. Mint creation, metadata management, and deployment orchestration. Real-time transaction monitoring via Helius webhooks pushed to WebSocket.',
              icon: (
                <svg className="w-10 h-10 mb-7 opacity-70" viewBox="0 0 40 40" fill="none">
                  <polygon points="20,4 36,12 36,28 20,36 4,28 4,12" stroke="white" strokeWidth="1" fill="none"/>
                  <polygon points="20,12 28,16 28,24 20,28 12,24 12,16" stroke="white" strokeWidth="0.5" fill="none" opacity="0.5"/>
                  <circle cx="20" cy="20" r="3" fill="white"/>
                </svg>
              ),
            },
            {
              num: '03',
              title: 'LIQUIDITY MANAGER',
              body: 'Meteora DEX pool management and position tracking. Off-chain orchestration of on-chain Meteora programs. Monitor pool performance, manage concentrated positions, track PnL in real time.',
              icon: (
                <svg className="w-10 h-10 mb-7 opacity-70" viewBox="0 0 40 40" fill="none">
                  <path d="M8 32 L20 8 L32 32" stroke="white" strokeWidth="1" fill="none"/>
                  <path d="M12 24 L28 24" stroke="white" strokeWidth="0.5"/>
                  <circle cx="20" cy="8" r="3" fill="none" stroke="white" strokeWidth="1"/>
                  <circle cx="8" cy="32" r="3" fill="none" stroke="white" strokeWidth="1"/>
                  <circle cx="32" cy="32" r="3" fill="none" stroke="white" strokeWidth="1"/>
                </svg>
              ),
            },
          ].map((card, i) => (
            <div
              key={card.num}
              className="card-hover p-12"
              style={{
                background: 'var(--glass)',
                borderRight: i < 2 ? '1px solid var(--glass-border)' : 'none',
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute',
                top: '20px',
                right: '24px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '80px',
                color: 'rgba(255,255,255,0.04)',
                lineHeight: 1,
                letterSpacing: '0.05em',
              }}>
                {card.num}
              </div>
              {card.icon}
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '28px',
                letterSpacing: '0.08em',
                color: 'var(--white)',
                marginBottom: '16px',
              }}>
                {card.title}
              </div>
              <p style={{
                fontSize: '14px',
                fontWeight: 300,
                color: 'var(--dim)',
                lineHeight: 1.7,
              }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  )
}
