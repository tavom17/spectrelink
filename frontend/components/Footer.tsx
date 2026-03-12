export default function Footer() {
  return (
    <footer
      className="flex justify-between items-center px-20 py-10"
      style={{ borderTop: '1px solid var(--glass-border)' }}
    >
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '18px',
        letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.2)',
      }}>
        SPECTRELINK
      </span>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '10px',
        color: 'rgba(255,255,255,0.15)',
        letterSpacing: '0.1em',
      }}>
        © 2025 SPECTRELINK — INTERNAL PLATFORM — ALL RIGHTS RESERVED
      </span>
    </footer>
  )
}
