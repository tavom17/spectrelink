export default function Footer() {
  return (
    <div className="app-footer-wrap">
      <footer className="app-footer">
        <div className="row-flex">
          <div className="footer-mark" aria-hidden />
          <span className="kicker" style={{ letterSpacing: '.16em' }}>Powered by Spectre Link</span>
        </div>
        <span className="meta" style={{ letterSpacing: '.08em' }}>Beta · Solana network only</span>
        <span className="meta" style={{ color: 'var(--ink-5)' }}>© 2026 Arcana · Trading digital assets carries risk</span>
      </footer>
    </div>
  )
}
