export default function Footer() {
  return (
    <footer
      className="flex justify-between items-center flex-wrap px-20 py-10"
      style={{ borderTop: '1px solid var(--glass-border)', gap: '16px' }}
    >
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '22px',
        letterSpacing: '0.12em',
        color: '#f0f0f0',
        paddingLeft: '24px',
      }}>
        Spectre Link LLC
      </span>

      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '14px',
        color: '#f0f0f0',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        textAlign: 'center',
      }}>
        BETA &mdash; Solana Network Only
      </span>

      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '14px',
        color: '#f0f0f0',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        Powered by Helius
      </span>
    </footer>
  )
}
