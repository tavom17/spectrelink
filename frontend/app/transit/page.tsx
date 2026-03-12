import Link from 'next/link'
import Footer from '@/components/Footer'

export default function Transit() {
  return (
    <>
      {/* Hero */}
      <div
        className="relative flex flex-col justify-center px-20 overflow-hidden"
        style={{ minHeight: 'calc(100vh - 72px)' }}
      >
        {/* Orbital rings */}
        <div className="absolute" style={{
          right: '-200px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '800px',
          height: '800px',
        }}>
          {[
            { size: 200, duration: '8s', border: 'rgba(255,255,255,0.08)' },
            { size: 350, duration: '15s', reverse: true, border: 'rgba(255,255,255,0.04)' },
            { size: 500, duration: '25s', border: 'rgba(255,255,255,0.04)' },
            { size: 700, duration: '40s', reverse: true, border: 'rgba(255,255,255,0.02)' },
          ].map((ring, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: ring.size,
                height: ring.size,
                border: `1px solid ${ring.border}`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: `ringRotate ${ring.duration} linear infinite ${ring.reverse ? 'reverse' : ''}`,
              }}
            >
              {i < 3 && (
                <div style={{
                  position: 'absolute',
                  width: '4px',
                  height: '4px',
                  background: 'var(--white)',
                  borderRadius: '50%',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%) translateY(-50%)',
                  boxShadow: '0 0 8px var(--white)',
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 mb-10 px-4 py-2" style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: 'var(--dim)',
            textTransform: 'uppercase',
            border: '1px solid var(--glass-border)',
            background: 'var(--glass)',
          }}>
            <span className="status-dot" />
            SPECTRELINK PLATFORM
          </div>

          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(64px, 9vw, 120px)',
            lineHeight: '0.9',
            letterSpacing: '0.04em',
            color: 'var(--white)',
            marginBottom: '32px',
          }}>
            SPECTRE
            <span className="block" style={{
              WebkitTextStroke: '1px rgba(255,255,255,0.2)',
              color: 'transparent',
            }}>
              TRANSIT
            </span>
          </h1>

          <p style={{
            fontSize: '15px',
            fontWeight: 300,
            color: 'var(--dim)',
            lineHeight: 1.8,
            marginBottom: '48px',
          }}>
            The unified control interface for all SpectreLink operations. Wallet management, token deployment, and liquidity positions — accessed through a single authenticated session.
          </p>

          <div className="flex gap-4 flex-wrap">
            <Link href="#" className="btn btn-primary">
              Enter Platform
              <span className="btn-arrow">→</span>
            </Link>
            <Link href="#" className="btn btn-ghost">
              System Status
            </Link>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div
        className="grid grid-cols-3"
        style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-border)', gap: '1px' }}
      >
        {[
          {
            status: 'active',
            title: 'WALLET',
            body: 'Generate HD wallets from BIP-39 mnemonics. Derive child keys across any path. Import and export encrypted JSON. Reconstructed from Postgres on demand — zero persistent memory state.',
            link: 'Access Module',
            active: true,
          },
          {
            status: 'active',
            title: 'LAUNCHER',
            body: 'Deploy SPL tokens via Helius RPC. Configure mint authority, decimals, supply, and metadata. Monitor deployment status and transaction confirmation in real time via WebSocket.',
            link: 'Access Module',
            active: true,
          },
          {
            status: 'offline',
            title: 'LIQUIDITY',
            body: 'Meteora pool creation and position management. Track concentrated liquidity ranges, accumulated fees, and pool performance metrics. Full position lifecycle from open to close.',
            link: 'Pending Build',
            active: false,
          },
        ].map((mod, i) => (
          <div
            key={mod.title}
            className="card-hover p-12"
            style={{ background: 'var(--deep)' }}
          >
            <div className="flex items-center gap-2 mb-5" style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: 'var(--faint)',
              textTransform: 'uppercase',
            }}>
              <div style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: mod.active ? 'var(--white)' : 'rgba(255,255,255,0.2)',
                animation: mod.active ? 'pulse 2s infinite' : 'none',
                boxShadow: mod.active ? '0 0 6px var(--white)' : 'none',
              }} />
              {mod.active ? 'Module Active' : 'Coming Soon'}
            </div>

            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '32px',
              letterSpacing: '0.08em',
              color: 'var(--white)',
              marginBottom: '16px',
            }}>
              {mod.title}
            </div>

            <p style={{
              fontSize: '13px',
              fontWeight: 300,
              color: 'var(--dim)',
              lineHeight: 1.7,
              marginBottom: '32px',
            }}>
              {mod.body}
            </p>

            <span style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--white)',
              opacity: mod.active ? 0.4 : 0.15,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              pointerEvents: mod.active ? 'auto' : 'none',
            }}>
              {mod.link} {mod.active ? '→' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Build phases */}
      <section className="px-20 py-24" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <div className="section-label">Build Status</div>
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '48px',
          letterSpacing: '0.08em',
          color: 'var(--white)',
          marginBottom: '48px',
        }}>PHASE PROGRESS</h2>

        <div style={{ border: '1px solid var(--glass-border)' }}>
          {[
            { phase: 'Phase 1', label: 'Infrastructure · Docker · Cloudflare · Nginx', status: 'COMPLETE', opacity: 1 },
            { phase: 'Phase 2', label: 'Data Layer · Postgres · Redis · Network Isolation', status: 'COMPLETE', opacity: 1 },
            { phase: 'Phase 3', label: 'Application Layer · API Gateway · Wallet · Launcher · Liquidity', status: 'IN PROGRESS', opacity: 1 },
            { phase: 'Phase 4', label: 'Frontend · Next.js · Wallet UI · Launcher UI · Liquidity UI', status: 'IN PROGRESS', opacity: 0.7 },
          ].map((p, i) => (
            <div
              key={p.phase}
              className="flex items-center gap-6 px-8 py-5"
              style={{
                background: 'var(--glass)',
                borderBottom: i < 3 ? '1px solid var(--glass-border)' : 'none',
                opacity: p.opacity,
              }}
            >
              <span style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '10px',
                letterSpacing: '0.2em',
                color: 'var(--white)',
                textTransform: 'uppercase',
                minWidth: '100px',
              }}>
                {p.phase}
              </span>
              <span style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '11px',
                color: 'var(--dim)',
              }}>
                {p.label}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '10px',
                color: p.status === 'COMPLETE' ? 'var(--white)' : 'var(--faint)',
                letterSpacing: '0.1em',
              }}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  )
}
