'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  loadToken, loadMyTokens, loadGroups, createGroup, loadFundingWallets,
  loadBalances, distribute, simulateBuy, executeBuy, retryLeg,
  floorLamports, minimumBuyLamports, reserveMath, skewedSplit, priceWalk,
  distributeTxCount, bundleCount, sol, truncateAddress, usd, pct,
  LAMPORTS_PER_SOL, BUNDLE_TIP_LAMPORTS,
  type TokenSnapshot, type BundleGroup, type GroupMember, type FundingWallet,
  type Job, type BalanceEntry,
} from '@/lib/commandCenter'

/* ------------------------------------------------------------------ style */

const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }

const ROSTER_PAGE = 10

/** Roster checkbox availability depends on what the selection is being used for. */
type Mode = 'distribute' | 'buy'

const label: React.CSSProperties = {
  ...mono, fontSize: '10px', letterSpacing: '0.12em',
  color: 'var(--cc-faint)', marginBottom: '6px', display: 'block',
}

const card: React.CSSProperties = {
  background: 'var(--cc-card)',
  border: '1px solid var(--cc-line)',
  marginBottom: '14px',
}

const cardHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '13px 16px', borderBottom: '1px solid var(--cc-line)',
}

const cardTitle: React.CSSProperties = {
  ...mono, fontSize: '13px', letterSpacing: '0.04em', color: 'var(--cc-text)',
}

const input: React.CSSProperties = {
  ...mono, fontSize: '12px', color: 'var(--cc-text)',
  background: 'var(--cc-input)', border: '1px solid var(--cc-line)',
  padding: '9px 11px', width: '100%', outline: 'none', borderRadius: '2px',
}

function btn(variant: 'solid' | 'ghost' | 'quiet' = 'ghost', disabled = false): React.CSSProperties {
  return {
    ...mono, fontSize: '11px', letterSpacing: '0.06em',
    padding: '8px 14px', borderRadius: '2px', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap',
    border: variant === 'solid' ? '1px solid var(--cc-accent)' : '1px solid var(--cc-line)',
    background: variant === 'solid' ? 'var(--cc-accent)' : variant === 'quiet' ? 'transparent' : 'var(--cc-input)',
    color: variant === 'solid' ? '#07121f' : 'var(--cc-text)',
  }
}

function stepBadge(n: number): React.JSX.Element {
  return (
    <span style={{
      ...mono, fontSize: '11px', width: '20px', height: '20px', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--cc-accent)', color: 'var(--cc-accent)', borderRadius: '2px',
    }}>{n}</span>
  )
}

function Badge({ children, tone = 'line' }: { children: React.ReactNode; tone?: 'line' | 'accent' | 'warning' | 'danger' | 'success' }) {
  const tones = {
    line:    { c: 'var(--cc-dim)',     b: 'var(--cc-line)',            bg: 'transparent' },
    accent:  { c: 'var(--cc-accent)',  b: 'var(--cc-accent-line)',     bg: 'var(--cc-accent-tint)' },
    warning: { c: 'var(--cc-warning)', b: 'var(--cc-warning-line)',    bg: 'var(--cc-warning-tint)' },
    danger:  { c: 'var(--cc-danger)',  b: 'var(--cc-danger-line)',     bg: 'var(--cc-danger-tint)' },
    success: { c: 'var(--cc-success)', b: 'var(--cc-success-line)',    bg: 'var(--cc-success-tint)' },
  }[tone]
  return (
    <span style={{
      ...mono, fontSize: '10px', letterSpacing: '0.06em', padding: '3px 7px',
      color: tones.c, border: `1px solid ${tones.b}`, background: tones.bg, borderRadius: '2px',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s', flexShrink: 0 }}>
      <path d="M3 1.5 L7 5 L3 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M12 7a5 5 0 1 1-1.6-3.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 1.2V4H9.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusIcon({ status }: { status: Job['legs'][number]['status'] }) {
  if (status === 'confirmed') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--cc-success)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4.6 7.2 L6.3 8.9 L9.4 5.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (status === 'failed') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--cc-danger)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 5 L9 9 M9 5 L5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
  if (status === 'blocked') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--cc-faint)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
    </svg>
  )
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--cc-warning)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7 4 V7 L9 8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function Checkbox({ checked, disabled, onChange, title }: {
  checked: boolean; disabled?: boolean; onChange: () => void; title?: string
}) {
  return (
    <span title={title} style={{ display: 'inline-flex', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); if (!disabled) onChange() }}
        disabled={disabled}
        aria-checked={checked}
        role="checkbox"
        style={{
          width: '13px', height: '13px', padding: 0, borderRadius: '2px',
          border: `1px solid ${checked ? 'var(--cc-accent)' : 'var(--cc-line-2)'}`,
          background: checked ? 'var(--cc-accent)' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.3 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ color: '#07121f' }}>
            <path d="M2 5.2 L4 7.2 L8 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </span>
  )
}

/** success → warning → danger ramp across the price walk. */
function rampColor(t: number): string {
  const stops: [number, number, number][] = [[63, 191, 127], [227, 165, 63], [236, 91, 80]]
  const seg = t < 0.5 ? 0 : 1
  const k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5
  const a = stops[seg], b = stops[seg + 1]
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/* -------------------------------------------------------------- component */

export default function CommandCenter({ initialMint = '' }: { initialMint?: string }) {
  /* token */
  const [mintInput, setMintInput] = useState(initialMint)
  const [token, setToken] = useState<TokenSnapshot | null>(null)
  const [loadingToken, setLoadingToken] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [myTokens, setMyTokens] = useState<TokenSnapshot[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  /* groups + balances */
  const [groups, setGroups] = useState<BundleGroup[]>([])
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [balances, setBalances] = useState<Record<string, BalanceEntry>>({})
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [syncing, setSyncing] = useState(false)
  const syncSeed = useRef(0)
  const [showAllRows, setShowAllRows] = useState(false)

  /* ephemeral selection — never persisted, never touches group membership */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('distribute')

  /* step 1 */
  const [fundingWallets, setFundingWallets] = useState<FundingWallet[]>([])
  const [fundingId, setFundingId] = useState('')
  const [totalSol, setTotalSol] = useState('2')
  const [skew, setSkew] = useState(20)
  const [distributing, setDistributing] = useState(false)

  /* step 2 */
  const [slippageBps, setSlippageBps] = useState(200)
  const [simulating, setSimulating] = useState(false)
  const [simReady, setSimReady] = useState(false)
  const [firing, setFiring] = useState(false)

  /* jobs */
  const [job, setJob] = useState<Job | null>(null)
  const [retrying, setRetrying] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')

  /* ------------------------------------------------------------- effects */

  const openGroup = groups.find(g => g.group_id === openGroupId) ?? null

  // Hydrate group members with the balances from the last batched read.
  const members: GroupMember[] = useMemo(() => {
    if (!openGroup) return []
    return openGroup.members.map(m => {
      const b = balances[m.public_key]
      return b ? { ...m, lamports: b.lamports, ata_exists: b.ata_exists } : m
    })
  }, [openGroup, balances])

  const selected = useMemo(() => members.filter(m => selectedIds.has(m.wallet_id)), [members, selectedIds])

  /** One batched call for every wallet on screen. */
  const syncBalances = useCallback(async (group: BundleGroup | null) => {
    if (!group || group.members.length === 0) { setSyncedAt(Date.now()); return }
    setSyncing(true)
    try {
      const next = await loadBalances(group.members.map(m => m.public_key), syncSeed.current)
      setBalances(prev => ({ ...prev, ...next }))
      setSyncedAt(Date.now())
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    loadGroups().then(g => {
      setGroups(g)
      if (g.length) {
        setOpenGroupId(g[0].group_id)
        syncBalances(g[0])
      }
    })
    loadFundingWallets().then(w => {
      setFundingWallets(w)
      if (w.length) setFundingId(w[0].wallet_id)
    })
  }, [syncBalances])

  useEffect(() => {
    if (initialMint) void handleLoad(initialMint)
  }, [initialMint])

  // Drives the "synced Ns ago" readout.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  async function handleLoad(mint: string) {
    const m = mint.trim()
    if (!m) { setTokenError('Enter a mint address'); return }
    setLoadingToken(true)
    setTokenError('')
    try {
      setToken(await loadToken(m))
      setPickerOpen(false)
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Could not load that token')
    } finally {
      setLoadingToken(false)
    }
  }

  async function openPicker() {
    setPickerOpen(true)
    if (!myTokens) setMyTokens(await loadMyTokens())
  }

  function openGroupChip(id: string) {
    const next = id === openGroupId ? null : id
    setOpenGroupId(next)
    setSelectedIds(new Set())       // selection is per-roster and ephemeral
    setShowAllRows(false)
    setSimReady(false)
    if (next) {
      const g = groups.find(x => x.group_id === next)
      if (g && g.members.some(m => balances[m.public_key] === undefined)) syncBalances(g)
    }
  }

  async function handleNewGroup() {
    const name = `Group ${groups.length + 1}`
    const g = await createGroup(name)
    setGroups(prev => [...prev, g])
    setOpenGroupId(g.group_id)
    setSelectedIds(new Set())
  }

  function selectable(m: GroupMember): boolean {
    // distribute funds any member; a buy needs the wallet to already clear its floor
    return mode === 'distribute' || m.lamports >= minimumBuyLamports(m)
  }

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setSimReady(false)
  }

  function selectAll() {
    setSelectedIds(new Set(members.filter(selectable).map(m => m.wallet_id)))
    setSimReady(false)
  }

  function selectNone() {
    setSelectedIds(new Set())
    setSimReady(false)
  }

  // Drop selections that the current mode no longer allows.
  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => {
        const m = members.find(x => x.wallet_id === id)
        return m ? selectable(m) : false
      }))
      return next.size === prev.size ? prev : next
    })
    setSimReady(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, members])

  /* ------------------------------------------------------------- derived */
  /* Everything below counts the SELECTED wallets, never the group size. */

  const totalLamports = Math.round((parseFloat(totalSol) || 0) * LAMPORTS_PER_SOL)
  const math = reserveMath(selected, totalLamports)
  const distTxCount = distributeTxCount(selected.length)
  const splits = skewedSplit(math.tradeableLamports, selected.length, skew)

  const fundedSelected = selected.filter(m => m.lamports >= minimumBuyLamports(m))
  const unfundedSelected = selected.length - fundedSelected.length

  const buySpends = fundedSelected.map(m => Math.max(0, m.lamports - floorLamports(m)) / LAMPORTS_PER_SOL)
  const walk = token ? priceWalk(token.price_usd, token.pool_sol_reserves, buySpends) : []
  const walkImpact = walk.length && token ? walk[walk.length - 1] / token.price_usd - 1 : 0

  const buyTxCount = fundedSelected.length
  const buyBundles = bundleCount(buyTxCount)

  const groupTotalLamports = members.reduce((s, m) => s + m.lamports, 0)
  const selectedLamports = selected.reduce((s, m) => s + m.lamports, 0)

  const visibleMembers = showAllRows ? members : members.slice(0, ROSTER_PAGE)
  const hiddenCount = members.length - visibleMembers.length
  const allSelectable = members.filter(selectable)
  const allSelected = allSelectable.length > 0 && allSelectable.every(m => selectedIds.has(m.wallet_id))

  const syncedAgo = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null

  /* ------------------------------------------------------------- actions */

  async function handleDistribute() {
    if (!selected.length || !fundingId) return
    setDistributing(true)
    setActionError('')
    try {
      const targets = selected.map((m, i) => ({ wallet_id: m.wallet_id, lamports: splits[i] ?? 0 }))
      setJob(await distribute(targets))
      // Distribute stands alone — refresh the roster so it shows the new amounts.
      syncSeed.current += 1
      await syncBalances(openGroup)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Distribute failed')
    } finally {
      setDistributing(false)
    }
  }

  async function handleSimulate() {
    if (!fundedSelected.length) return
    setSimulating(true)
    setActionError('')
    try {
      const targets = fundedSelected.map((m, i) => ({
        wallet_id: m.wallet_id,
        lamports: Math.round(buySpends[i] * LAMPORTS_PER_SOL),
      }))
      const res = await simulateBuy(targets, BUNDLE_TIP_LAMPORTS)
      if (res.ok) setSimReady(true)
      else setActionError(res.reason ?? 'Simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  async function handleFire() {
    setFiring(true)
    setActionError('')
    try {
      const targets = fundedSelected.map((m, i) => ({
        wallet_id: m.wallet_id,
        lamports: Math.round(buySpends[i] * LAMPORTS_PER_SOL),
      }))
      setJob(await executeBuy(targets))
      setSimReady(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Buy failed')
    } finally {
      setFiring(false)
    }
  }

  async function handleRetry(leg: number) {
    if (!job) return
    setRetrying(leg)
    try {
      setJob(await retryLeg(job, leg))
    } finally {
      setRetrying(null)
    }
  }

  /* ----------------------------------------------------------- rendering */

  return (
    <div className="cc">
      <style>{`
        .cc {
          --cc-bg:            #0b0b0c;
          --cc-card:          #101012;
          --cc-input:         #161619;
          --cc-line:          rgba(255,255,255,0.09);
          --cc-line-2:        rgba(255,255,255,0.20);
          --cc-text:          #ededf0;
          --cc-dim:           rgba(237,237,240,0.62);
          --cc-faint:         rgba(237,237,240,0.34);
          --cc-accent:        #4c9ffe;
          --cc-accent-line:   rgba(76,159,254,0.45);
          --cc-accent-tint:   rgba(76,159,254,0.10);
          --cc-success:       #3fbf7f;
          --cc-success-line:  rgba(63,191,127,0.40);
          --cc-success-tint:  rgba(63,191,127,0.09);
          --cc-warning:       #e3a53f;
          --cc-warning-line:  rgba(227,165,63,0.40);
          --cc-warning-tint:  rgba(227,165,63,0.09);
          --cc-danger:        #ec5b50;
          --cc-danger-line:   rgba(236,91,80,0.40);
          --cc-danger-tint:   rgba(236,91,80,0.09);

          background: var(--cc-bg);
          color: var(--cc-text);
          min-height: 100%;
          padding: 26px 30px 60px;
          font-family: 'Barlow', sans-serif;
        }
        .cc-col       { max-width: 880px; margin: 0 auto; }
        .cc-row       { display: grid; grid-template-columns: 26px 34px 1fr 110px; align-items: center; gap: 10px; padding: 7px 14px; }
        .cc-row-hover:hover { background: rgba(255,255,255,0.025); }
        .cc-two       { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .cc-head-split{ display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

        .cc input[type=range] {
          -webkit-appearance: none; appearance: none; width: 100%;
          height: 2px; background: var(--cc-line-2); outline: none; margin: 10px 0;
        }
        .cc input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 12px; height: 12px; border-radius: 2px;
          background: var(--cc-accent); cursor: pointer;
        }
        .cc input[type=range]::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 2px; border: none;
          background: var(--cc-accent); cursor: pointer;
        }
        .cc select option { background: var(--cc-input); color: var(--cc-text); }

        @media (max-width: 620px) {
          .cc      { padding: 18px 14px 48px; }
          .cc-row  { grid-template-columns: 22px 26px 1fr 84px; gap: 8px; padding: 7px 10px; }
          .cc-two  { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="cc-col">

        {/* ── title ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: '18px' }}>
          <h1 style={{ ...mono, fontSize: '19px', letterSpacing: '0.04em', margin: 0, fontWeight: 400 }}>
            Command center
          </h1>
          <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', marginTop: '5px' }}>
            Fund a bundle group, then fire a buy against one pool
          </div>
        </div>

        {/* ── A. load bar ───────────────────────────────────────── */}
        {!token ? (
          <div style={{ ...card, padding: '14px 16px' }}>
            <label style={label} htmlFor="cc-mint">Contract address</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id="cc-mint"
                value={mintInput}
                onChange={e => { setMintInput(e.target.value); setTokenError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleLoad(mintInput) }}
                placeholder="Paste a mint address"
                spellCheck={false}
                style={{ ...input, flex: '1 1 260px', width: 'auto' }}
              />
              <button style={btn('solid', loadingToken)} disabled={loadingToken} onClick={() => handleLoad(mintInput)}>
                {loadingToken ? 'Loading…' : 'Load coin'}
              </button>
              <button style={btn('ghost')} onClick={openPicker}>My tokens</button>
            </div>
            {tokenError && (
              <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-danger)', marginTop: '9px' }}>{tokenError}</div>
            )}

            {pickerOpen && (
              <div style={{ marginTop: '12px', border: '1px solid var(--cc-line)', background: 'var(--cc-input)' }}>
                {!myTokens ? (
                  <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', padding: '12px 14px' }}>Loading your tokens…</div>
                ) : myTokens.map(t => (
                  <button
                    key={t.mint_address}
                    onClick={() => { setMintInput(t.mint_address); handleLoad(t.mint_address) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--cc-line)', cursor: 'pointer', color: 'var(--cc-text)',
                    }}
                  >
                    <TokenAvatar token={t} size={26} radius={6} />
                    <span style={{ ...mono, fontSize: '12px' }}>{t.name}</span>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)' }}>{t.symbol}</span>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', marginLeft: 'auto' }}>
                      {truncateAddress(t.mint_address)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── B. token header card ────────────────────────────── */
          <div style={{ ...card, padding: '14px 16px' }}>
            <div className="cc-head-split">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <TokenAvatar token={token} size={46} radius={12} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ ...mono, fontSize: '15px' }}>{token.name}</span>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)' }}>{token.symbol}</span>
                    {token.user_owned && <Badge tone="accent">Your launch</Badge>}
                    <Badge>{token.pool_type}</Badge>
                  </div>
                  <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', marginTop: '5px' }}>
                    {truncateAddress(token.mint_address)} · {truncateAddress(token.pool_address)} · {token.pool_sol_reserves.toFixed(2)} SOL
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...mono, fontSize: '15px' }}>{usd(token.price_usd)}</div>
                <div style={{
                  ...mono, fontSize: '11px', marginTop: '4px',
                  color: token.change_24h >= 0 ? 'var(--cc-success)' : 'var(--cc-danger)',
                }}>
                  {pct(token.change_24h)} <span style={{ color: 'var(--cc-faint)' }}>24h</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setToken(null); setSimReady(false); setPickerOpen(false) }}
              style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)', background: 'none', border: 'none', padding: '9px 0 0', cursor: 'pointer', letterSpacing: '0.06em' }}
            >
              Change token
            </button>
          </div>
        )}

        {/* ── C. bundle groups ──────────────────────────────────── */}
        <div style={card}>
          <div style={{ ...cardHead, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={cardTitle}>Bundle groups</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ModeToggle mode={mode} onChange={setMode} />
              <span style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)' }}>
                {syncing ? 'syncing balances…' : syncedAgo === null ? 'balances not synced' : `balances synced ${syncedAgo}s ago`}
              </span>
              <button
                onClick={() => syncBalances(openGroup)}
                disabled={syncing}
                title="Refresh balances"
                style={{
                  background: 'transparent', border: '1px solid var(--cc-line)', borderRadius: '2px',
                  color: 'var(--cc-dim)', padding: '5px', display: 'flex', cursor: syncing ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshIcon />
              </button>
            </div>
          </div>

          {/* group chips */}
          <div style={{ display: 'flex', gap: '7px', padding: '12px 16px', flexWrap: 'wrap' }}>
            {groups.map(g => {
              const active = g.group_id === openGroupId
              return (
                <button
                  key={g.group_id}
                  onClick={() => openGroupChip(g.group_id)}
                  style={{
                    ...mono, fontSize: '11px', letterSpacing: '0.04em',
                    display: 'inline-flex', alignItems: 'center', gap: '7px',
                    padding: active ? '6px 11px' : '7px 12px',
                    borderRadius: '2px', cursor: 'pointer',
                    border: active ? '2px solid var(--cc-accent)' : '1px solid var(--cc-line)',
                    background: active ? 'var(--cc-accent-tint)' : 'transparent',
                    color: active ? 'var(--cc-text)' : 'var(--cc-dim)',
                  }}
                >
                  <Chevron open={active} />
                  {g.name}
                  <span style={{ color: 'var(--cc-faint)' }}>{g.members.length}/{g.capacity}</span>
                </button>
              )
            })}
            <button
              onClick={handleNewGroup}
              style={{
                ...mono, fontSize: '11px', letterSpacing: '0.04em', padding: '7px 12px',
                border: '1px dashed var(--cc-line-2)', background: 'transparent',
                color: 'var(--cc-faint)', borderRadius: '2px', cursor: 'pointer',
              }}
            >
              + New group
            </button>
          </div>

          {/* roster */}
          {openGroup && (
            <div style={{ borderTop: '1px solid var(--cc-line)' }}>
              {/* header row */}
              <div className="cc-row" style={{ borderBottom: '1px solid var(--cc-line)', background: 'rgba(255,255,255,0.02)' }}>
                <Checkbox
                  checked={allSelected}
                  disabled={allSelectable.length === 0}
                  onChange={() => (allSelected ? selectNone() : selectAll())}
                  title="Select all"
                />
                <span style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)' }}>#</span>
                <span style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)' }}>Wallet</span>
                <span style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)', textAlign: 'right' }}>SOL</span>
              </div>

              {members.length === 0 ? (
                <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', padding: '20px 16px' }}>
                  No wallets in this group yet.
                </div>
              ) : visibleMembers.map(m => {
                const isSelected = selectedIds.has(m.wallet_id)
                const disabled = !selectable(m)
                const minSol = sol(minimumBuyLamports(m), 4)
                return (
                  <div
                    key={m.wallet_id}
                    className="cc-row cc-row-hover"
                    onClick={() => { if (!disabled) toggle(m.wallet_id) }}
                    style={{
                      borderBottom: '1px solid var(--cc-line)',
                      opacity: isSelected ? 1 : 0.5,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggle(m.wallet_id)}
                      title={disabled ? `Needs ${minSol} SOL to cover rent, its token account and fees before it can trade` : undefined}
                    />
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)' }}>{m.index}</span>
                    <span style={{ ...mono, fontSize: '12px' }}>{truncateAddress(m.public_key, 4, 4)}</span>
                    <span style={{
                      ...mono, fontSize: '12px', textAlign: 'right',
                      color: m.lamports === 0 ? 'var(--cc-faint)' : 'var(--cc-text)',
                    }}>
                      {sol(m.lamports)}
                    </span>
                  </div>
                )
              })}

              {/* footer row */}
              {members.length > 0 && (
                <div className="cc-row" style={{ borderBottom: '1px solid var(--cc-line)' }}>
                  <span />
                  <span />
                  <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)' }}>
                    {hiddenCount > 0 ? (
                      <button
                        onClick={() => setShowAllRows(true)}
                        style={{ ...mono, fontSize: '11px', color: 'var(--cc-accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        {hiddenCount} more wallets
                      </button>
                    ) : showAllRows && members.length > ROSTER_PAGE ? (
                      <button
                        onClick={() => setShowAllRows(false)}
                        style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        Show fewer
                      </button>
                    ) : 'Group total'}
                  </span>
                  <span style={{ ...mono, fontSize: '12px', textAlign: 'right', color: 'var(--cc-dim)' }}>
                    {sol(groupTotalLamports)}
                  </span>
                </div>
              )}

              {/* selection summary */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                padding: '9px 16px', background: 'var(--cc-accent-tint)', flexWrap: 'wrap',
              }}>
                <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-text)' }}>
                  {selected.length} of {members.length} selected · holding {sol(selectedLamports)} SOL
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button style={btn('quiet', allSelectable.length === 0)} disabled={allSelectable.length === 0} onClick={selectAll}>All</button>
                  <button style={btn('quiet', selected.length === 0)} disabled={selected.length === 0} onClick={selectNone}>None</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── D. distribute funds ───────────────────────────────── */}
        <div style={card}>
          <div style={cardHead}>
            {stepBadge(1)}
            <span style={cardTitle}>Distribute funds</span>
          </div>

          <div style={{ padding: '14px 16px' }}>
            <div className="cc-two" style={{ marginBottom: '14px' }}>
              <div>
                <label style={label} htmlFor="cc-funding">Funding wallet</label>
                <select
                  id="cc-funding"
                  value={fundingId}
                  onChange={e => setFundingId(e.target.value)}
                  style={{ ...input, appearance: 'none' }}
                >
                  {fundingWallets.length === 0 && <option value="">No funding wallets</option>}
                  {fundingWallets.map(w => (
                    <option key={w.wallet_id} value={w.wallet_id}>
                      {truncateAddress(w.public_key, 6, 6)} · {sol(w.lamports, 3)} SOL
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="cc-total">Total to distribute (SOL)</label>
                <input
                  id="cc-total"
                  value={totalSol}
                  onChange={e => setTotalSol(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  style={input}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={{ ...label, marginBottom: 0 }} htmlFor="cc-skew">Skew</label>
                <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-accent)' }}>{skew}%</span>
              </div>
              <input
                id="cc-skew"
                type="range"
                min={0}
                max={60}
                step={1}
                value={skew}
                onChange={e => setSkew(Number(e.target.value))}
              />
              <div style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)' }}>
                0% sends every wallet the same amount · 60% spreads them widest
              </div>
            </div>

            {/* reserve math, over the selected wallets */}
            <div style={{
              border: '1px solid var(--cc-warning-line)', background: 'var(--cc-warning-tint)',
              padding: '11px 13px',
            }}>
              <div style={{ ...mono, fontSize: '10px', color: 'var(--cc-warning)', letterSpacing: '0.08em', marginBottom: '8px' }}>
                Reserve math · {math.wallets} selected {math.wallets === 1 ? 'wallet' : 'wallets'}
              </div>
              <Line k="Rent for empty wallets" v={`${sol(selected.filter(m => m.lamports === 0).length * 890_880)} SOL`} />
              <Line k="Token accounts to create" v={`${sol(selected.filter(m => !m.ata_exists).length * 2_039_280)} SOL`} />
              <Line k="Signatures" v={`${sol(selected.length * 10_000)} SOL`} />
              <div style={{ height: '1px', background: 'var(--cc-warning-line)', margin: '8px 0' }} />
              <Line k="Total overhead" v={`${sol(math.overheadLamports)} SOL`} strong />
              <Line k="Remaining tradeable" v={`${sol(math.tradeableLamports)} SOL`} strong />
            </div>

            {actionError && (
              <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-danger)', marginTop: '11px' }}>{actionError}</div>
            )}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '11px 16px', borderTop: '1px solid var(--cc-line)', flexWrap: 'wrap',
          }}>
            <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)' }}>
              {selected.length} {selected.length === 1 ? 'wallet' : 'wallets'} · {distTxCount} {distTxCount === 1 ? 'transaction' : 'transactions'}
            </span>
            <button
              style={btn('solid', distributing || selected.length === 0 || !fundingId || totalLamports <= 0)}
              disabled={distributing || selected.length === 0 || !fundingId || totalLamports <= 0}
              onClick={handleDistribute}
            >
              {distributing ? 'Distributing…' : 'Distribute'}
            </button>
          </div>
        </div>

        {/* ── E. execute buy ────────────────────────────────────── */}
        <div style={card}>
          <div style={{ ...cardHead, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {stepBadge(2)}
              <span style={cardTitle}>Execute buy</span>
            </div>
            {unfundedSelected > 0 && (
              <Badge tone="warning">
                {unfundedSelected} {unfundedSelected === 1 ? 'wallet' : 'wallets'} unfunded
              </Badge>
            )}
          </div>

          <div style={{ padding: '14px 16px' }}>
            {/* price walk */}
            <div style={{ ...label, marginBottom: '10px' }}>Price walk preview</div>
            {!token ? (
              <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', padding: '18px 0' }}>
                Load a token to preview the walk.
              </div>
            ) : walk.length === 0 ? (
              <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', padding: '18px 0' }}>
                Select funded wallets to preview the walk.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '74px' }}>
                  {walk.map((price, i) => {
                    const t = walk.length === 1 ? 0 : i / (walk.length - 1)
                    return (
                      <div
                        key={i}
                        title={`Wallet ${i + 1} — ${usd(price)}`}
                        style={{
                          flex: 1, minWidth: '3px',
                          height: `${18 + t * 82}%`,
                          background: rampColor(t),
                        }}
                      />
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', gap: '10px' }}>
                  <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-dim)' }}>
                    Wallet 1 — {usd(walk[0])}
                  </span>
                  <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-danger)', textAlign: 'right' }}>
                    Wallet {walk.length} — {usd(walk[walk.length - 1])} ({pct(walkImpact, 1)})
                  </span>
                </div>
              </>
            )}

            {/* slippage */}
            <div style={{ marginTop: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={{ ...label, marginBottom: 0 }} htmlFor="cc-slip">Slippage</label>
                <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-accent)' }}>
                  {slippageBps} bps
                </span>
              </div>
              <input
                id="cc-slip"
                type="range"
                min={50}
                max={500}
                step={50}
                value={slippageBps}
                onChange={e => { setSlippageBps(Number(e.target.value)); setSimReady(false) }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '11px 16px', borderTop: '1px solid var(--cc-line)', flexWrap: 'wrap',
          }}>
            <span style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)' }}>
              {fundedSelected.length} funded · {buyBundles} {buyBundles === 1 ? 'bundle' : 'bundles'} · {buyTxCount} tx · tip {sol(BUNDLE_TIP_LAMPORTS, 3)} SOL
            </span>
            {simReady ? (
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={btn('quiet')} onClick={() => setSimReady(false)}>Cancel</button>
                <button style={btn('solid', firing)} disabled={firing} onClick={handleFire}>
                  {firing ? 'Firing…' : `Confirm and fire ${fundedSelected.length}`}
                </button>
              </div>
            ) : (
              <button
                style={btn('solid', simulating || !token || fundedSelected.length === 0)}
                disabled={simulating || !token || fundedSelected.length === 0}
                onClick={handleSimulate}
              >
                {simulating ? 'Simulating…' : 'Simulate and fire'}
              </button>
            )}
          </div>
        </div>

        {/* ── F. job monitor ────────────────────────────────────── */}
        <div style={card}>
          <div style={{ ...cardHead, justifyContent: 'space-between' }}>
            <span style={cardTitle}>Job monitor</span>
            {job && <span style={{ ...mono, fontSize: '10px', color: 'var(--cc-faint)' }}>{job.job_id}</span>}
          </div>

          {!job ? (
            <div style={{ ...mono, fontSize: '11px', color: 'var(--cc-faint)', padding: '20px 16px' }}>
              No job yet. Distribute or fire a buy to see per-leg outcomes here.
            </div>
          ) : job.legs.map(leg => (
            <div
              key={leg.leg}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderBottom: '1px solid var(--cc-line)',
                opacity: leg.status === 'blocked' ? 0.5 : 1,
              }}
            >
              <StatusIcon status={leg.status} />
              <span style={{ ...mono, fontSize: '11px', whiteSpace: 'nowrap' }}>
                Leg {leg.leg} · {leg.transfers} {leg.transfers === 1 ? 'transfer' : 'transfers'}
              </span>
              <span style={{
                ...mono, fontSize: '11px', marginLeft: 'auto', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: leg.error ? 'var(--cc-danger)' : 'var(--cc-faint)',
                textAlign: 'right',
              }}>
                {leg.error
                  ? leg.error
                  : leg.status === 'blocked'
                    ? `blocked by leg ${leg.blocked_by}`
                    : truncateAddress(leg.signature ?? '', 8, 8)}
              </span>
              {leg.status === 'failed' && (
                <button
                  style={btn('ghost', retrying === leg.leg)}
                  disabled={retrying === leg.leg}
                  onClick={() => handleRetry(leg.leg)}
                >
                  {retrying === leg.leg ? 'Retrying…' : 'Retry'}
                </button>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

/* ------------------------------------------------------------ subviews */

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '2px 0' }}>
      <span style={{ ...mono, fontSize: '11px', color: strong ? 'var(--cc-text)' : 'var(--cc-dim)' }}>{k}</span>
      <span style={{ ...mono, fontSize: '11px', color: strong ? 'var(--cc-text)' : 'var(--cc-dim)' }}>{v}</span>
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--cc-line)', borderRadius: '2px', overflow: 'hidden' }}>
      {(['distribute', 'buy'] as Mode[]).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            ...mono, fontSize: '10px', letterSpacing: '0.06em', padding: '5px 9px',
            border: 'none', cursor: 'pointer',
            background: mode === m ? 'var(--cc-accent-tint)' : 'transparent',
            color: mode === m ? 'var(--cc-accent)' : 'var(--cc-faint)',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

function TokenAvatar({ token, size, radius }: { token: TokenSnapshot; size: number; radius: number }) {
  const [broken, setBroken] = useState(false)
  const show = token.image_uri && !broken
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: 'hidden',
      background: 'var(--cc-accent-tint)', border: '1px solid var(--cc-line)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {show ? (
        <img
          src={token.image_uri as string}
          alt={token.symbol}
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ ...mono, fontSize: size * 0.42, color: 'var(--cc-accent)' }}>
          {(token.symbol || token.name || '?').charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
