import Link from 'next/link'
import Footer from '@/components/Footer'

export default function About() {
  return (
    <>
      <div
        className="px-20 py-24 grid grid-cols-2 gap-20 items-center"
        style={{ minHeight: 'calc(100vh - 72px)' }}
      >
        {/* Left */}
        <div>
          <div className="section-label">About</div>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(60px, 8vw, 110px)',
            lineHeight: '0.9',
            letterSpacing: '0.04em',
            color: 'var(--white)',
            marginBottom: '40px',
          }}>
            BUILT FOR
            <span className="block" style={{
              WebkitTextStroke: '1px rgba(255,255,255,0.25)',
              color: 'transparent',
            }}>
              OPERATORS
            </span>
          </h1>

          {[
            'SpectreLink is a private, internal-use orchestration platform for Solana-based operations. It is not a public product. It is a precision tool, built by an engineer who needed infrastructure that didn\'t exist.',
            'The platform consolidates three distinct disciplines — cryptographic wallet management, on-chain token deployment, and DeFi liquidity operations — into a single cohesive interface, backed by a production-grade containerized architecture.',
            'Every design decision prioritizes security, isolation, and operational clarity. The data layer never touches the frontend. Private keys exist in memory only during active signing operations. The server has no exposed ports.',
          ].map((text, i) => (
            <p key={i} style={{
              fontSize: '15px',
              fontWeight: 300,
              color: 'var(--dim)',
              lineHeight: 1.8,
              marginBottom: '20px',
            }}>
              {text}
            </p>
          ))}

          <Link href="/overview" className="btn btn-ghost mt-4">
            View Architecture
            <span className="btn-arrow">→</span>
          </Link>
        </div>

        {/* Right */}
        <div style={{ border: '1px solid var(--glass-border)' }}>
          {[
            {
              num: '01',
              title: 'SECURITY FIRST',
              body: 'AES-encrypted key storage. Stateless wallet sessions. Zero plaintext private keys persisted to disk.',
            },
            {
              num: '02',
              title: 'ISOLATION BY DEFAULT',
              body: 'Three Docker bridge networks. The data layer is completely invisible to the frontend and Nginx.',
            },
            {
              num: '03',
              title: 'NO CUSTOM CONTRACTS',
              body: 'All operations use existing on-chain programs. SPL Token Program and Meteora — no audit surface.',
            },
            {
              num: '04',
              title: 'REAL-TIME NATIVE',
              body: 'Helius webhooks feed Redis pub/sub feed WebSocket. Sub-second on-chain event delivery to the UI.',
            },
          ].map((item, i) => (
            <div
              key={item.num}
              className="card-hover px-9 py-8 relative overflow-hidden"
              style={{
                borderBottom: i < 3 ? '1px solid var(--glass-border)' : 'none',
                background: 'var(--glass)',
              }}
            >
              <div style={{
                position: 'absolute',
                right: '24px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '60px',
                color: 'rgba(255,255,255,0.03)',
                letterSpacing: '0.05em',
              }}>
                {item.num}
              </div>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '22px',
                letterSpacing: '0.1em',
                color: 'var(--white)',
                marginBottom: '8px',
              }}>
                {item.title}
              </div>
              <p style={{
                fontSize: '13px',
                fontWeight: 300,
                color: 'var(--dim)',
                lineHeight: 1.6,
                maxWidth: '300px',
              }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </>
  )
}
