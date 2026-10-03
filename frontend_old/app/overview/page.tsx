import Footer from '@/components/Footer'

export default function Overview() {
  return (
    <>
      {/* Hero */}
      <div className="px-20 py-24" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="section-label">System Architecture</div>
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(48px, 7vw, 96px)',
          letterSpacing: '0.05em',
          color: 'var(--white)',
          lineHeight: 1,
          marginBottom: '16px',
        }}>
          SPECTRELINK<br />OVERVIEW
        </h1>
        <p style={{
          fontSize: '15px',
          fontWeight: 300,
          color: 'var(--dim)',
          maxWidth: '600px',
          lineHeight: 1.8,
          marginTop: '16px',
        }}>
          A containerized, bare-metal Solana orchestration platform. Eight isolated services across three Docker bridge networks. Zero custom smart contracts.
        </p>
      </div>

      {/* Two column grid */}
      <div className="grid grid-cols-2">
        <div className="px-20 py-16" style={{ borderRight: '1px solid var(--glass-border)' }}>
          <div className="section-label">Platform</div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '36px',
            letterSpacing: '0.08em',
            color: 'var(--white)',
            marginBottom: '24px',
          }}>ARCHITECTURE</h2>

          {[
            'SpectreLink runs on a Geekom A8 bare-metal server running Ubuntu Server, exposed to the internet via Cloudflare Tunnel — no port forwarding required, real IP never exposed.',
            'Three isolated Docker bridge networks enforce strict service boundaries. The data layer (Postgres + Redis) has zero network path to the frontend. Only the API Gateway bridges application and data tiers.',
            'All Solana interactions route through a private Helius RPC endpoint, providing enhanced transaction parsing, DAS API access, and webhook-driven real-time event delivery.',
          ].map((text, i) => (
            <p key={i} style={{ fontSize: '15px', fontWeight: 300, color: 'var(--dim)', lineHeight: 1.8, marginBottom: '20px' }}>
              {text}
            </p>
          ))}

          <ul className="list-none mt-10">
            {[
              ['Server', 'Geekom A8 · Ubuntu · Bare Metal'],
              ['Ingress', 'Cloudflare Tunnel · Nginx'],
              ['Runtime', 'Node 20 · TypeScript'],
              ['Frontend', 'Next.js · Tailwind · shadcn/ui'],
              ['API Layer', 'Fastify · JWT Auth'],
              ['Persistence', 'Postgres 16 · Redis 7'],
              ['Chain', 'Solana · SPL · Meteora'],
              ['RPC', 'Helius Private Endpoint'],
            ].map(([key, val]) => (
              <li key={key} className="flex justify-between items-center py-4" style={{
                borderBottom: '1px solid var(--glass-border)',
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '12px',
              }}>
                <span style={{ color: 'var(--faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{key}</span>
                <span style={{ color: 'var(--white)' }}>{val}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-20 py-16">
          <div className="section-label">Traffic Flow</div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '36px',
            letterSpacing: '0.08em',
            color: 'var(--white)',
            marginBottom: '24px',
          }}>8 LAYERS</h2>

          <ul className="list-none">
            {[
              ['L1', 'Internet · spectrelink.org · HTTPS:443'],
              ['L2', 'Cloudflare Edge · DDoS · SSL · DNS'],
              ['L3', 'Cloudflare Tunnel · Encrypted Outbound'],
              ['L4', 'Nginx · Reverse Proxy · Routing'],
              ['L5', 'Frontend · Next.js SSR'],
              ['L6', 'API Gateway · Auth · JWT'],
              ['L7', 'App Containers · Wallet / Launcher / Liquidity'],
              ['L8', 'Data Layer · Postgres + Redis'],
            ].map(([key, val]) => (
              <li key={key} className="flex justify-between items-center py-4" style={{
                borderBottom: '1px solid var(--glass-border)',
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '12px',
              }}>
                <span style={{ color: 'var(--faint)', letterSpacing: '0.1em' }}>{key}</span>
                <span style={{ color: 'var(--white)' }}>{val}</span>
              </li>
            ))}
          </ul>

          <div className="terminal mt-8">
            <div style={{ color: 'var(--faint)' }}>// NETWORK ISOLATION</div>
            <div style={{ color: 'var(--white)' }}>&gt; docker network ls</div>
            <div style={{ color: 'var(--dim)' }}>spectre_public   bridge   cf-tunnel, nginx</div>
            <div style={{ color: 'var(--dim)' }}>spectre_app      bridge   nginx, frontend, api-gw, apps</div>
            <div style={{ color: 'var(--dim)' }}>spectre_data     bridge   api-gw, postgres, redis</div>
            <div style={{ color: 'var(--white)' }}>&gt; _<span className="terminal-cursor" /></div>
          </div>
        </div>
      </div>

      {/* Real-time flow */}
      <div className="px-20 py-20" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <div className="section-label">Real-Time Event Flow</div>
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '36px',
          letterSpacing: '0.08em',
          color: 'var(--white)',
          marginBottom: '48px',
        }}>HELIUS → WEBSOCKET</h2>

        <div className="flex relative">
          <div className="absolute top-7 left-0 right-0 h-px" style={{
            background: 'linear-gradient(to right, transparent, var(--glass-border), transparent)',
          }} />
          {[
            { id: 'SOL', label: 'Transaction\nOn-Chain' },
            { id: 'WHK', label: 'Helius\nWebhook' },
            { id: 'API', label: 'Gateway\nProcesses' },
            { id: 'DB', label: 'Postgres\nWrite' },
            { id: 'PUB', label: 'Redis\nPub/Sub' },
            { id: 'WS', label: 'WebSocket\nPush' },
            { id: 'UI', label: 'Frontend\nUpdates' },
          ].map(step => (
            <div key={step.id} className="flex-1 flex flex-col items-center text-center px-4">
              <div
                className="flex items-center justify-center mb-5 relative z-10 transition-all duration-300"
                style={{
                  width: '56px',
                  height: '56px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--deep)',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '11px',
                  color: 'var(--dim)',
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                }}
              >
                {step.id}
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '10px',
                color: 'var(--faint)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}>
                {step.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </>
  )
}
