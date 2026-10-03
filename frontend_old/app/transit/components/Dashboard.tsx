'use client'

/**
 * Dashboard — placeholder.
 *
 * Deliberately empty past the header: the tab exists so the shell's ordering
 * is settled, and the panel gets built out later.
 */

const mono = { fontFamily: "'Share Tech Mono', monospace" } as const
const bebas = { fontFamily: "'Bebas Neue', sans-serif" } as const

export default function Dashboard() {
  return (
    <div className="db-wrap">
      <style>{`
        .db-wrap { padding: 40px 48px; overflow-y: auto; height: 100%; }
        @media (max-width: 860px) { .db-wrap { padding: 24px 24px; } }
        @media (max-width: 580px) { .db-wrap { padding: 16px 14px; } }
      `}</style>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '12px' }}>
          Overview
        </div>
        <h1 style={{ ...bebas, fontSize: '48px', letterSpacing: '0.06em', color: 'var(--white)', lineHeight: 1, margin: 0 }}>
          DASHBOARD
        </h1>
      </div>

      <div style={{
        border: '1px dashed var(--glass-border)',
        padding: '64px 20px',
        textAlign: 'center',
      }}>
        <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase' }}>
          Nothing here yet
        </div>
      </div>
    </div>
  )
}
