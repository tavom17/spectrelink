'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'

interface Token {
  token_id: string
  mint_address: string
  name: string
  symbol: string
  decimals: number
  supply: number
  pool_address: string
  position_address: string
  position_nft_mint: string | null
  funding_wallet_id: string
  metadata_uri: string
  image_uri: string
  website: string | null
  twitter: string | null
  telegram: string | null
  launch_tx_sig: string
  launched_at: string
}

const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }
const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif" }

function truncate(s: string) { return `${s.slice(0, 8)}...${s.slice(-8)}` }
function fmt(n: number) { return new Intl.NumberFormat('en-US').format(n) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fieldLabel: React.CSSProperties = {
  ...mono, fontSize: '9px', letterSpacing: '0.18em',
  color: 'rgba(1,1,1,0.4)', textTransform: 'uppercase', marginBottom: '3px',
}
const fieldValue: React.CSSProperties = {
  ...mono, fontSize: '12px', color: 'rgba(1,1,1,0.75)', wordBreak: 'break-all', letterSpacing: '0.03em',
}

export default function Liquidity() {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()

  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Token | null>(null)

  // per-token exit state
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [exitErrors, setExitErrors] = useState<Record<string, string>>({})

  const fetchTokens = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Token[]>('/api/api/liquidity/tokens')
      setTokens(data)
    } catch {
      setError('Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { fetchTokens() }, [fetchTokens])

  async function handleExit(token: Token) {
    if (!token.position_nft_mint || !token.funding_wallet_id) return
    setExitingId(token.token_id)
    setExitErrors(prev => { const n = { ...prev }; delete n[token.token_id]; return n })
    try {
      await apiFetch('/api/api/liquidity/exit', {
        method: 'POST',
        body: JSON.stringify({
          poolAddress: token.pool_address,
          positionAddress: token.position_address,
          positionNftMint: token.position_nft_mint,
          fundingWalletId: token.funding_wallet_id,
        }),
      })
      await fetchTokens()
      if (selected?.token_id === token.token_id) setSelected(null)
    } catch (err) {
      setExitErrors(prev => ({ ...prev, [token.token_id]: err instanceof Error ? err.message : 'Exit failed' }))
    } finally {
      setExitingId(null)
    }
  }

  const openPositions = tokens.filter(t => t.position_nft_mint).length

  return (
    <div className="lm-wrap">
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

        .lm-wrap         { padding: 40px 48px; overflow-y: auto; height: 100%; }
        .lm-stats        { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; }
        .lm-token-row,
        .lm-token-head   { display: grid; grid-template-columns: 48px 1fr 140px 200px 110px; align-items: center; }
        .lm-col-mint     { display: block; }
        .lm-col-date     { display: block; }
        .lm-detail-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .lm-social-grid  { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

        @media (max-width: 860px) {
          .lm-wrap        { padding: 24px 24px; }
          .lm-token-row,
          .lm-token-head  { grid-template-columns: 48px 1fr 120px 0px 0px; }
          .lm-col-mint    { display: none; }
          .lm-col-date    { display: none; }
          .lm-social-grid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 580px) {
          .lm-wrap        { padding: 16px 14px; }
          .lm-token-row,
          .lm-token-head  { grid-template-columns: 40px 1fr 90px; }
          .lm-stats       { grid-template-columns: 1fr 1fr; }
          .lm-detail-grid { grid-template-columns: 1fr; }
          .lm-social-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '12px' }}>
          Meteora pool creation and position tracking
        </div>
        <h1 style={{ ...bebas, fontSize: '48px', letterSpacing: '0.06em', color: 'var(--white)', lineHeight: 1, margin: 0 }}>
          LIQUIDITY MANAGER
        </h1>
      </div>

      {/* Stats */}
      <div className="lm-stats" style={{ gap: '1px', background: 'var(--glass-border)', border: '1px solid var(--glass-border)', marginBottom: '32px' }}>
        {[
          { label: 'TOKENS LAUNCHED', value: loading ? '—' : String(tokens.length) },
          { label: 'OPEN POSITIONS',  value: loading ? '—' : String(openPositions) },
          { label: 'FEES ACCRUED',    value: '—' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--deep)', padding: '24px 28px' }}>
            <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
            <div style={{ ...bebas, fontSize: '36px', letterSpacing: '0.05em', color: 'var(--white)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ ...mono, fontSize: '12px', color: 'rgba(200,50,50,0.8)', marginBottom: '24px', padding: '12px 16px', border: '1px solid rgba(200,50,50,0.3)' }}>
          {error}
        </div>
      )}

      {/* Token list */}
      <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)' }}>

        {/* Column headers */}
        <div className="lm-token-head" style={{ padding: '10px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.04)' }}>
          <div />
          <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>NAME</div>
          <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>SUPPLY</div>
          <div className="lm-col-mint" style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>MINT ADDRESS</div>
          <div className="lm-col-date" style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>LAUNCHED</div>
        </div>

        {loading ? (
          <div style={{ ...mono, fontSize: '12px', color: 'var(--faint)', padding: '32px 20px' }}>Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div style={{ ...mono, fontSize: '12px', color: 'var(--faint)', padding: '32px 20px' }}>No tokens launched yet.</div>
        ) : tokens.map((token, i) => (
          <div key={token.token_id}>
            <div
              onClick={() => setSelected(token)}
              className="lm-token-row"
              style={{
                padding: '14px 20px',
                borderBottom: exitErrors[token.token_id] ? 'none' : i < tokens.length - 1 ? '1px solid var(--glass-border)' : 'none',
                cursor: 'pointer',
                background: selected?.token_id === token.token_id ? 'rgba(0,0,0,0.06)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              {/* Icon */}
              <div style={{ width: '36px', height: '36px', border: '1px solid var(--glass-border)', overflow: 'hidden', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }}>
                {token.image_uri && <img src={token.image_uri} alt={token.symbol} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
              </div>

              {/* Name + symbol + exit button */}
              <div style={{ paddingLeft: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ ...bebas, fontSize: '18px', letterSpacing: '0.05em', color: 'var(--white)', lineHeight: 1 }}>{token.name}</div>
                  <div style={{ ...mono, fontSize: '10px', color: 'var(--faint)', letterSpacing: '0.1em', marginTop: '2px' }}>{token.symbol}</div>
                </div>
                {token.position_nft_mint && (
                  <button
                    onClick={e => { e.stopPropagation(); handleExit(token) }}
                    disabled={exitingId === token.token_id}
                    style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--dim)', padding: '5px 12px', cursor: exitingId === token.token_id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: exitingId === token.token_id ? 0.5 : 1 }}
                  >
                    {exitingId === token.token_id ? 'Exiting...' : 'Exit →'}
                  </button>
                )}
              </div>

              {/* Supply */}
              <div style={{ ...mono, fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.04em' }}>
                {fmt(token.supply)}
              </div>

              {/* Mint address */}
              <div className="lm-col-mint" style={{ ...mono, fontSize: '11px', color: 'var(--faint)', letterSpacing: '0.03em' }}>
                {truncate(token.mint_address)}
              </div>

              {/* Launched date */}
              <div className="lm-col-date" style={{ ...mono, fontSize: '11px', color: 'var(--faint)', letterSpacing: '0.03em' }}>
                {fmtDate(token.launched_at)}
              </div>
            </div>

            {/* Inline exit error */}
            {exitErrors[token.token_id] && (
              <div style={{ ...mono, fontSize: '11px', color: 'rgba(200,50,50,0.8)', padding: '8px 20px 10px', borderBottom: i < tokens.length - 1 ? '1px solid var(--glass-border)' : 'none', background: 'rgba(200,50,50,0.03)' }}>
                {exitErrors[token.token_id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Token Detail Modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          <div style={{ background: '#f0f0f0', border: '1px solid var(--glass-border)', width: '620px', maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.15s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
              <div style={{ width: '56px', height: '56px', border: '1px solid var(--glass-border)', overflow: 'hidden', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }}>
                {selected.image_uri && <img src={selected.image_uri} alt={selected.symbol} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...bebas, fontSize: '28px', letterSpacing: '0.06em', color: 'var(--white)', lineHeight: 1 }}>{selected.name}</div>
                <div style={{ ...mono, fontSize: '10px', color: 'var(--faint)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '3px' }}>
                  {selected.symbol} · Launched {fmtDate(selected.launched_at)}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--faint)', padding: '4px', display: 'flex', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Token info */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '16px' }}>Token Info</div>
              <div className="lm-detail-grid">
                <div><div style={fieldLabel}>Mint Address</div><div style={fieldValue}>{selected.mint_address}</div></div>
                <div><div style={fieldLabel}>Launch TX</div><div style={fieldValue}>{truncate(selected.launch_tx_sig)}</div></div>
                <div><div style={fieldLabel}>Supply</div><div style={fieldValue}>{fmt(selected.supply)}</div></div>
                <div><div style={fieldLabel}>Decimals</div><div style={fieldValue}>{selected.decimals}</div></div>
              </div>
            </div>

            {/* Pool info */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '16px' }}>Pool Info</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                <div><div style={fieldLabel}>Pool Address</div><div style={fieldValue}>{selected.pool_address}</div></div>
                <div><div style={fieldLabel}>Position Address</div><div style={fieldValue}>{selected.position_address || '—'}</div></div>
                <div><div style={fieldLabel}>Position NFT Mint</div><div style={fieldValue}>{selected.position_nft_mint || '—'}</div></div>
              </div>
            </div>

            {/* Social links */}
            {(selected.website || selected.twitter || selected.telegram) && (
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '16px' }}>Social Links</div>
                <div className="lm-social-grid">
                  {selected.website  && <div><div style={fieldLabel}>Website</div><div style={fieldValue}>{selected.website}</div></div>}
                  {selected.twitter  && <div><div style={fieldLabel}>Twitter</div><div style={fieldValue}>{selected.twitter}</div></div>}
                  {selected.telegram && <div><div style={fieldLabel}>Telegram</div><div style={fieldValue}>{selected.telegram}</div></div>}
                </div>
              </div>
            )}

            {/* Exit position */}
            {selected.position_nft_mint && (
              <div style={{ padding: '20px 24px' }}>
                <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '16px' }}>Exit Position</div>

                {exitErrors[selected.token_id] && (
                  <div style={{ ...mono, fontSize: '11px', color: 'rgba(200,50,50,0.8)', marginBottom: '14px', padding: '10px 14px', border: '1px solid rgba(200,50,50,0.3)', background: 'rgba(200,50,50,0.04)' }}>
                    {exitErrors[selected.token_id]}
                  </div>
                )}

                <button
                  onClick={() => handleExit(selected)}
                  disabled={exitingId === selected.token_id}
                  style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', border: '1px solid var(--white)', background: exitingId === selected.token_id ? 'transparent' : 'var(--white)', color: exitingId === selected.token_id ? 'var(--white)' : 'var(--deep)', padding: '11px 28px', cursor: exitingId === selected.token_id ? 'not-allowed' : 'pointer', opacity: exitingId === selected.token_id ? 0.5 : 1 }}
                >
                  {exitingId === selected.token_id ? 'Exiting...' : 'Exit Position →'}
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
