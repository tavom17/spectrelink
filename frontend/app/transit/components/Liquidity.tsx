export default function Liquidity() {
  return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ marginBottom: '40px' }}>
        <div style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '10px',
          letterSpacing: '0.15em',
          color: 'var(--faint)',
          textTransform: 'uppercase',
          marginBottom: '12px',
        }}>
          Meteora pool creation and position tracking
        </div>
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '48px',
          letterSpacing: '0.06em',
          color: 'var(--white)',
          lineHeight: 1,
          margin: 0,
        }}>
          LIQUIDITY MANAGER
        </h1>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1px',
        background: 'var(--glass-border)',
        border: '1px solid var(--glass-border)',
        marginBottom: '32px',
      }}>
        {[
          { label: 'OPEN POSITIONS', value: '—' },
          { label: 'TOTAL VALUE',    value: '—' },
          { label: 'FEES ACCRUED',   value: '—' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--deep)', padding: '24px 28px' }}>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.15em',
              color: 'var(--faint)',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}>
              {stat.label}
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '36px',
              letterSpacing: '0.05em',
              color: 'var(--white)',
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        border: '1px solid var(--glass-border)',
        background: 'var(--deep)',
        padding: '28px',
        marginBottom: '32px',
      }}>
        <p style={{
          fontSize: '15px',
          fontWeight: 400,
          color: 'var(--dim)',
          lineHeight: 1.8,
          margin: 0,
        }}>
          Create and manage concentrated liquidity positions on Meteora DEX.
          Monitor real-time PnL, fee accumulation, and pool performance.
          Full position lifecycle management from open to close.
        </p>
      </div>

      <div className="terminal" style={{ padding: '20px 24px' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>$ </span>
        spectre-cli liquidity --status
        <br />
        <span style={{ color: 'rgba(240,240,240,0.3)' }}>Module not yet connected. Awaiting API integration.</span>
        <span className="terminal-cursor" />
      </div>
    </div>
  )
}
