'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'
import { Sheet, SheetHead, Seg, TokenTile, CopyButton } from '@/components/ui'

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

type View = 'grid' | 'rail'

function truncate(s: string) { return `${s.slice(0, 8)}...${s.slice(-8)}` }
function fmt(n: number) { return new Intl.NumberFormat('en-US').format(n) }
function fmtCompact(n: number) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Field({ k, v, copy }: { k: string; v: string; copy?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="kicker" style={{ fontSize: 9, letterSpacing: '.18em' }}>{k}</div>
      <div className="row-flex" style={{ marginTop: 7, gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className="addr" style={{ flex: 1 }}>{v}</span>
        {copy && v !== '—' && <CopyButton text={v} />}
      </div>
    </div>
  )
}

export default function Liquidity({ onOpenCommandCenter }: { onOpenCommandCenter?: (mint: string) => void }) {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()

  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Token | null>(null)
  const [view, setView] = useState<View>('grid')

  // per-token exit state
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [exitErrors, setExitErrors] = useState<Record<string, string>>({})

  const fetchTokens = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Token[]>('/api/liquidity/tokens')
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
      await apiFetch('/api/liquidity/exit', {
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

  function rowActions(token: Token) {
    return (
      <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <button
          type="button"
          className="btn btn-xs"
          onClick={e => { e.stopPropagation(); onOpenCommandCenter?.(token.mint_address) }}
          title="Open in command center"
        >
          Command center →
        </button>
        {token.position_nft_mint && (
          <button
            type="button"
            className="btn btn-xs"
            onClick={e => { e.stopPropagation(); handleExit(token) }}
            disabled={exitingId === token.token_id}
          >
            {exitingId === token.token_id ? 'Exiting…' : 'Exit'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">
          {loading ? 'Loading tokens…' : `${tokens.length} launched · ${openPositions} open ${openPositions === 1 ? 'position' : 'positions'}`}
        </div>
        <Seg options={[{ id: 'grid', label: 'Grid' }, { id: 'rail', label: 'Rail' }] as const} value={view} onChange={setView} label="Token view" />
      </div>

      {error && <div className="alert" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div className="glass empty">Loading tokens…</div>
      ) : tokens.length === 0 ? (
        <div className="glass empty">No tokens launched yet. Launch one from the Launchpad.</div>
      ) : view === 'grid' ? (
        <div className="grid-fill" style={{ '--min': '210px' } as React.CSSProperties}>
          {tokens.map(token => (
            <button
              key={token.token_id}
              type="button"
              onClick={() => setSelected(token)}
              className="glass glow glow-bright lift"
              style={{ padding: 16, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', '--glow-size': '240px' } as React.CSSProperties}
            >
              <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 11, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0 }}>
                  <TokenTile src={token.image_uri} symbol={token.symbol} size="fill" radius={11} />
                </div>
                <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: '.16em', background: 'rgba(12,13,22,.72)', padding: '3px 7px', borderRadius: 5 }}>{token.symbol}</span>
                  {token.position_nft_mint && <span className="tag tag-accent" style={{ background: 'rgba(12,13,22,.72)', fontSize: 8.5 }}>Open</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
                <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{token.name}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent-400)', flex: 'none' }} title={`Supply ${fmt(token.supply)}`}>{fmtCompact(token.supply)}</span>
              </div>
              <div className="meta" style={{ marginTop: 4 }}>{fmtDate(token.launched_at)}</div>
              {exitErrors[token.token_id] && <div className="alert-inline" style={{ marginTop: 8 }}>{exitErrors[token.token_id]}</div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="glass" style={{ background: 'rgba(233,233,237,.06)' }}>
          <div className="t-scroll">
            <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {tokens.map(token => (
                <div key={token.token_id}>
                  <div
                    onClick={() => setSelected(token)}
                    className="glow glow-bright rail-row"
                  >
                    <TokenTile src={token.image_uri} symbol={token.symbol} size={44} radius={10} />
                    <span style={{ fontSize: 14, minWidth: 140 }}>{token.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.14em', minWidth: 60 }}>{token.symbol}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{truncate(token.mint_address)}</span>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(233,233,237,.16), transparent)', minWidth: 24 }} />
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--accent-400)' }}>{fmt(token.supply)}</span>
                    {rowActions(token)}
                  </div>
                  {exitErrors[token.token_id] && (
                    <div className="alert-inline" style={{ padding: '8px 20px 10px', background: 'var(--danger-tint)' }}>{exitErrors[token.token_id]}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Token detail ────────────────────────────────────────── */}
      {selected && (
        <Sheet onClose={() => setSelected(null)} width={760} labelledBy="tok-title">
          <SheetHead
            id="tok-title"
            lead={<TokenTile src={selected.image_uri} symbol={selected.symbol} size={62} radius={13} />}
            title={<span style={{ fontSize: 24 }}>{selected.name}</span>}
            sub={`${selected.symbol} · launched ${fmtDate(selected.launched_at)}`}
            onClose={() => setSelected(null)}
          />

          <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderRadius: 0, border: 0 }}>
            {[
              { k: 'Supply', v: fmt(selected.supply) },
              { k: 'Decimals', v: String(selected.decimals) },
              { k: 'Position', v: selected.position_nft_mint ? 'Open' : 'Closed', accent: !!selected.position_nft_mint },
              { k: 'Launched', v: fmtDate(selected.launched_at) },
            ].map(s => (
              <div key={s.k} style={{ padding: '16px 18px' }}>
                <div className="kicker" style={{ fontSize: 9, letterSpacing: '.18em' }}>{s.k}</div>
                <div className="mono" style={{ marginTop: 9, fontSize: 14, color: s.accent ? 'var(--accent-300)' : 'var(--ink-1)' }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="sheet-section">
            <div className="kicker">Token info</div>
            <div className="grid-auto" style={{ '--min': '230px', gap: '18px 26px', marginTop: 16 } as React.CSSProperties}>
              <Field k="Mint address" v={selected.mint_address} copy />
              <Field k="Launch TX" v={truncate(selected.launch_tx_sig)} />
            </div>
          </div>

          <div className="sheet-section">
            <div className="kicker">Pool info</div>
            <div className="stack" style={{ gap: 16, marginTop: 16 }}>
              <Field k="Pool address" v={selected.pool_address} copy />
              <Field k="Position address" v={selected.position_address || '—'} copy />
              <Field k="Position NFT mint" v={selected.position_nft_mint || '—'} copy />
            </div>
          </div>

          {(selected.website || selected.twitter || selected.telegram) && (
            <div className="sheet-section">
              <div className="kicker">Social links</div>
              <div className="grid-auto" style={{ '--min': '180px', gap: 16, marginTop: 16 } as React.CSSProperties}>
                {selected.website  && <Field k="Website" v={selected.website} />}
                {selected.twitter  && <Field k="X" v={selected.twitter} />}
                {selected.telegram && <Field k="Telegram" v={selected.telegram} />}
              </div>
            </div>
          )}

          <div className="sheet-section">
            {exitErrors[selected.token_id] && (
              <div className="alert" style={{ marginBottom: 14 }}>{exitErrors[selected.token_id]}</div>
            )}
            <div className="row-flex">
              <button type="button" className="btn btn-accent" onClick={() => onOpenCommandCenter?.(selected.mint_address)}>
                Open in command center →
              </button>
              {selected.position_nft_mint && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleExit(selected)}
                  disabled={exitingId === selected.token_id}
                >
                  {exitingId === selected.token_id ? 'Exiting…' : 'Exit position'}
                </button>
              )}
              <button type="button" className="btn" disabled title="Not wired to the API yet">Claim fees</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}
