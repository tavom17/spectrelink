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
import { Sheet, SheetHead, Seg, Range, Check, TokenTile, CopyButton, ChevronDown, RefreshIcon, PreviewTag } from '@/components/ui'

const ROSTER_PAGE = 10

/** Roster checkbox availability depends on what the selection is being used for. */
type Mode = 'distribute' | 'buy'

const MODES = [
  { id: 'distribute', label: 'Distribute' },
  { id: 'buy', label: 'Buy' },
] as const satisfies readonly { id: Mode; label: string }[]

function StatusIcon({ status }: { status: Job['legs'][number]['status'] }) {
  if (status === 'confirmed') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--accent-400)', flexShrink: 0 }} aria-label="Confirmed">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4.6 7.2 L6.3 8.9 L9.4 5.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (status === 'failed') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--danger)', flexShrink: 0 }} aria-label="Failed">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 5 L9 9 M9 5 L5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
  if (status === 'blocked') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--ink-5)', flexShrink: 0 }} aria-label="Blocked">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
    </svg>
  )
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-label="Pending">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7 4 V7 L9 8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/* -------------------------------------------------------------- component */

export default function CommandCenter({ initialMint = '', onNavigate }: {
  initialMint?: string
  onNavigate?: (tab: string) => void
}) {
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

  /* layout only */
  const [bundleOpen, setBundleOpen] = useState(true)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)

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

  /** Per-group readout for the picker, from whatever balances have been read. */
  function groupStats(g: BundleGroup) {
    const known = g.members.filter(m => balances[m.public_key] !== undefined)
    if (known.length === 0) return null
    const hydrated = known.map(m => ({ ...m, ...balances[m.public_key] }))
    return {
      funded: hydrated.filter(m => m.lamports >= minimumBuyLamports(m)).length,
      lamports: hydrated.reduce((s, m) => s + m.lamports, 0),
    }
  }

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

  const rosterCols = '28px 34px 1fr auto'

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Fund a bundle group, then fire a buy against one pool</div>
        <PreviewTag />
      </div>

      {/* ── contract address ───────────────────────────────────────── */}
      <div className="glass glow" style={{ padding: '18px 22px', '--glow-size': '360px' } as React.CSSProperties}>
        <label className="kicker" htmlFor="cc-mint">Contract address</label>
        <div className="row-flex" style={{ gap: 11, marginTop: 12 }}>
          <input
            id="cc-mint"
            className="input mono"
            value={mintInput}
            onChange={e => { setMintInput(e.target.value); setTokenError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleLoad(mintInput) }}
            placeholder="Paste a mint address"
            spellCheck={false}
            style={{ flex: '1 1 260px', width: 'auto' }}
          />
          <button type="button" className="btn btn-accent" disabled={loadingToken} onClick={() => handleLoad(mintInput)}>
            {loadingToken ? 'Loading…' : 'Load coin'}
          </button>
          <button type="button" className="btn" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())} aria-expanded={pickerOpen}>
            My tokens
          </button>
        </div>
        {tokenError && <div className="alert-inline" style={{ marginTop: 10 }}>{tokenError}</div>}

        {pickerOpen && (
          <div className="enter" style={{ marginTop: 14, borderRadius: 11, border: '1px solid rgba(233,233,237,.10)', background: 'rgba(16,18,32,.62)', overflow: 'hidden' }}>
            <div className="row-flex" style={{ justifyContent: 'space-between', padding: '10px 15px', borderBottom: '1px solid rgba(233,233,237,.07)' }}>
              <span className="kicker">Select a coin</span>
              <button type="button" className="btn-link dim" onClick={() => setPickerOpen(false)}>Close</button>
            </div>
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {!myTokens ? (
                <div className="empty" style={{ padding: '12px 15px' }}>Loading your tokens…</div>
              ) : myTokens.map(t => (
                <button
                  key={t.mint_address}
                  type="button"
                  onClick={() => { setMintInput(t.mint_address); handleLoad(t.mint_address) }}
                  className="t-row clickable"
                  style={{ gridTemplateColumns: '26px 1fr auto', width: '100%', padding: '10px 15px', background: 'transparent', border: 0, borderBottom: '1px solid var(--line-faint)', textAlign: 'left', color: 'inherit' }}
                >
                  <TokenTile src={t.image_uri} symbol={t.symbol} size={26} />
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, color: token?.mint_address === t.mint_address ? 'var(--accent-300)' : 'var(--ink-1)' }}>{t.name}</span>
                    <span className="meta" style={{ fontSize: 10 }}>{t.symbol} · {truncateAddress(t.mint_address)}</span>
                  </span>
                  <span className="t-cell-mono">{usd(t.price_usd)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {token && (
          <div className="enter" style={{ marginTop: 14, padding: '15px 17px', borderRadius: 12, border: '1px solid rgba(145,132,217,.30)', background: 'rgba(66,58,106,.20)' }}>
            <div className="row-flex" style={{ gap: 13 }}>
              <TokenTile src={token.image_uri} symbol={token.symbol} size={40} radius={11} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 200px', minWidth: 0 }}>
                <div className="row-flex" style={{ gap: 9 }}>
                  <span style={{ fontSize: 15 }}>{token.name}</span>
                  <span className="tag tag-accent">{token.symbol}</span>
                  {token.user_owned && <span className="tag tag-accent">Your launch</span>}
                  <span className="tag">{token.pool_type}</span>
                </div>
                <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span className="meta" style={{ wordBreak: 'break-all' }}>{token.mint_address}</span>
                  <CopyButton text={token.mint_address} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 16 }}>{usd(token.price_usd)}</div>
                <div className="mono" style={{ fontSize: 11, marginTop: 4, color: token.change_24h >= 0 ? 'var(--accent-400)' : 'var(--danger)' }}>
                  {pct(token.change_24h)} <span style={{ color: 'var(--ink-4)' }}>24h</span>
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => { setToken(null); setSimReady(false); setPickerOpen(false) }}>
                Clear
              </button>
            </div>
            <div className="grid-auto" style={{ '--min': '120px', gap: 12, marginTop: 15, paddingTop: 14, borderTop: '1px solid rgba(233,233,237,.07)' } as React.CSSProperties}>
              {[
                { k: 'Pool SOL', v: `${token.pool_sol_reserves.toFixed(2)} SOL` },
                { k: 'Pool tokens', v: new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(token.pool_token_reserves) },
                { k: 'Decimals', v: String(token.decimals) },
                { k: 'Pool', v: truncateAddress(token.pool_address) },
              ].map(f => (
                <div key={f.k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="kicker" style={{ fontSize: 9, letterSpacing: '.16em' }}>{f.k}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-1)' }}>{f.v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── bundle ─────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 14, borderRadius: 16, border: '1px solid rgba(233,233,237,.10)',
        background: 'linear-gradient(158deg, rgba(72,77,106,.18), rgba(22,24,38,.16))',
        boxShadow: '0 18px 44px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(233,233,237,.06)',
      }}>
        <button
          type="button"
          onClick={() => setBundleOpen(o => !o)}
          aria-expanded={bundleOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '15px 18px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
        >
          <ChevronDown size={11} style={{ color: 'var(--ink-3)', transition: 'transform .35s var(--ease)', transform: bundleOpen ? 'none' : 'rotate(-90deg)' }} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: 'var(--accent-300)' }}>Bundle</span>
          <span className="meta" style={{ color: 'var(--ink-4)' }}>
            {bundleOpen ? 'Wallets · distribute · execute · monitor' : `Collapsed · ${selected.length} selected`}
          </span>
        </button>

        {bundleOpen && (
          <div className="split-layout-even enter" style={{ padding: '0 14px 16px' }}>

            {/* roster */}
            <div className="glass glow" style={{ '--glow-size': '360px' } as React.CSSProperties}>
              <div className="card-head" style={{ borderBottom: 0, paddingBottom: 12 }}>
                <span className="step-title">Wallets</span>
                <div className="row-flex" style={{ gap: 9 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setGroupPickerOpen(true)}
                    style={{ borderColor: 'rgba(145,132,217,.34)', background: 'rgba(145,132,217,.08)', letterSpacing: '.04em', textTransform: 'none', fontSize: 11 }}
                  >
                    <span style={{ color: 'var(--accent-300)' }}>{openGroup ? openGroup.name : 'Pick a group'}</span>
                    {openGroup && <span style={{ color: 'var(--ink-3)' }}>{openGroup.members.length}/{openGroup.capacity}</span>}
                    <ChevronDown />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => syncBalances(openGroup)}
                    disabled={syncing}
                    title="Refresh balances"
                    aria-label="Refresh balances"
                    style={{ color: syncing ? 'var(--accent-300)' : undefined }}
                  >
                    <RefreshIcon spinning={syncing} />
                  </button>
                </div>
              </div>
              <div className="row-flex" style={{ justifyContent: 'space-between', padding: '0 20px 12px' }}>
                <Seg small options={MODES} value={mode} onChange={setMode} label="Selection mode" />
                <span className="meta" style={{ color: 'var(--ink-4)' }}>
                  {syncing ? 'syncing balances…' : syncedAgo === null ? 'balances not synced' : `balances synced ${syncedAgo}s ago`}
                </span>
              </div>

              {!openGroup ? (
                <div className="empty" style={{ borderTop: '1px solid var(--line-soft)' }}>Pick a bundle group to load its wallets.</div>
              ) : (
                <>
                  <div className="t-head" style={{ gridTemplateColumns: rosterCols, padding: '10px 20px', borderTop: '1px solid var(--line-soft)' }}>
                    <Check
                      checked={allSelected}
                      disabled={allSelectable.length === 0}
                      onChange={() => (allSelected ? selectNone() : selectAll())}
                      title="Select all"
                    />
                    <span>#</span><span>Wallet</span><span className="t-right">SOL</span>
                  </div>

                  {members.length === 0 ? (
                    <div className="empty">No wallets in this group yet.</div>
                  ) : visibleMembers.map(m => {
                    const isSelected = selectedIds.has(m.wallet_id)
                    const disabled = !selectable(m)
                    const minSol = sol(minimumBuyLamports(m), 4)
                    return (
                      <div
                        key={m.wallet_id}
                        className="t-row hover glow glow-sm"
                        onClick={() => { if (!disabled) toggle(m.wallet_id) }}
                        title={disabled ? `Needs ${minSol} SOL to cover rent, its token account and fees before it can trade` : undefined}
                        style={{
                          gridTemplateColumns: rosterCols, padding: '9px 20px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.45 : 1,
                          background: isSelected ? 'rgba(145,132,217,.06)' : undefined,
                        }}
                      >
                        <Check checked={isSelected} disabled={disabled} onChange={() => toggle(m.wallet_id)} />
                        <span className="t-cell-mono" style={{ color: 'var(--ink-4)' }}>{m.index}</span>
                        <span className="t-cell-mono" style={{ color: isSelected ? 'var(--text)' : 'var(--ink-2)' }}>{truncateAddress(m.public_key, 5, 4)}</span>
                        <span className="t-cell-mono t-right" style={{ color: m.lamports === 0 ? 'var(--ink-5)' : 'var(--ink-1)' }}>
                          {sol(m.lamports)}
                        </span>
                      </div>
                    )
                  })}

                  {members.length > 0 && (
                    <div className="t-row" style={{ gridTemplateColumns: rosterCols, padding: '9px 20px' }}>
                      <span /><span />
                      <span>
                        {hiddenCount > 0 ? (
                          <button type="button" className="btn-link" onClick={() => setShowAllRows(true)}>{hiddenCount} more wallets</button>
                        ) : showAllRows && members.length > ROSTER_PAGE ? (
                          <button type="button" className="btn-link dim" onClick={() => setShowAllRows(false)}>Show fewer</button>
                        ) : <span className="meta">Group total</span>}
                      </span>
                      <span className="t-cell-mono t-right" style={{ color: 'var(--ink-3)' }}>{sol(groupTotalLamports)}</span>
                    </div>
                  )}

                  <div className="row-flex" style={{ justifyContent: 'space-between', padding: '11px 20px', background: 'rgba(145,132,217,.08)', borderTop: '1px solid var(--line-soft)' }}>
                    <span className="meta" style={{ color: 'var(--ink-1)' }}>
                      {selected.length} of {members.length} selected · holding {sol(selectedLamports)} SOL
                    </span>
                    <div className="row-flex" style={{ gap: 6 }}>
                      <button type="button" className="btn btn-xs" disabled={allSelectable.length === 0} onClick={selectAll}>All</button>
                      <button type="button" className="btn btn-xs" disabled={selected.length === 0} onClick={selectNone}>None</button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="stack">
              {actionError && <div className="alert" role="alert">{actionError}</div>}

              {/* 1 distribute */}
              <div className="glass glow">
                <div className="card-head" style={{ justifyContent: 'flex-start' }}>
                  <span className="step">1</span>
                  <span className="section-title">Distribute funds</span>
                </div>
                <div className="card-body">
                  <div className="grid-auto" style={{ '--min': '190px' } as React.CSSProperties}>
                    <div className="field">
                      <label className="label" htmlFor="cc-funding">Funding wallet</label>
                      <select id="cc-funding" className="input mono" value={fundingId} onChange={e => setFundingId(e.target.value)} style={{ fontSize: 12 }}>
                        {fundingWallets.length === 0 && <option value="">No funding wallets</option>}
                        {fundingWallets.map(w => (
                          <option key={w.wallet_id} value={w.wallet_id}>
                            {truncateAddress(w.public_key, 6, 6)} · {sol(w.lamports, 3)} SOL
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="cc-total">Total to distribute (SOL)</label>
                      <input
                        id="cc-total"
                        className="input mono"
                        value={totalSol}
                        onChange={e => setTotalSol(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: 20 }}>
                    <label className="label" htmlFor="cc-skew">
                      Skew <span className="label-value mono">{skew}%</span>
                    </label>
                    <Range id="cc-skew" min={0} max={60} value={skew} onChange={setSkew} />
                    <div className="hint" style={{ fontSize: 11 }}>0% sends every wallet the same amount · 60% spreads them widest</div>
                  </div>

                  <div className="callout" style={{ marginTop: 18 }}>
                    <div className="kicker kicker-accent" style={{ letterSpacing: '.16em' }}>
                      Reserve math · {math.wallets} selected {math.wallets === 1 ? 'wallet' : 'wallets'}
                    </div>
                    <div className="stack" style={{ gap: 9, marginTop: 13 }}>
                      <Line k="Rent for empty wallets" v={`${sol(selected.filter(m => m.lamports === 0).length * 890_880)} SOL`} />
                      <Line k="Token accounts to create" v={`${sol(selected.filter(m => !m.ata_exists).length * 2_039_280)} SOL`} />
                      <Line k="Signatures" v={`${sol(selected.length * 10_000)} SOL`} />
                      <Line k="Total overhead" v={`${sol(math.overheadLamports)} SOL`} strong />
                      <Line k="Remaining tradeable" v={`${sol(math.tradeableLamports)} SOL`} strong />
                    </div>
                  </div>
                </div>
                <div className="card-foot">
                  <span className="meta">
                    {selected.length} {selected.length === 1 ? 'wallet' : 'wallets'} · {distTxCount} {distTxCount === 1 ? 'transaction' : 'transactions'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-accent"
                    disabled={distributing || selected.length === 0 || !fundingId || totalLamports <= 0}
                    onClick={handleDistribute}
                  >
                    {distributing ? 'Distributing…' : 'Distribute'}
                  </button>
                </div>
              </div>

              {/* 2 execute buy */}
              <div className="glass glow">
                <div className="card-head">
                  <div className="row-flex">
                    <span className="step">2</span>
                    <span className="section-title">Execute buy</span>
                  </div>
                  {unfundedSelected > 0 && (
                    <span className="tag tag-danger">
                      {unfundedSelected} {unfundedSelected === 1 ? 'wallet' : 'wallets'} unfunded
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div className="label">Price walk preview</div>
                  {!token ? (
                    <div className="hint" style={{ padding: '22px 0' }}>Load a token to preview the walk.</div>
                  ) : walk.length === 0 ? (
                    <div className="hint" style={{ padding: '22px 0' }}>
                      Select funded wallets to preview the walk{mode === 'distribute' ? ' — switch the roster to Buy to see only funded wallets.' : '.'}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 88, marginTop: 12, borderBottom: '1px solid rgba(233,233,237,.10)' }}>
                        {walk.map((price, i) => {
                          const t = walk.length === 1 ? 0 : i / (walk.length - 1)
                          return (
                            <div
                              key={i}
                              title={`Wallet ${i + 1} — ${usd(price)}`}
                              style={{
                                flex: 1, minWidth: 3, maxWidth: 24,
                                height: `${18 + t * 82}%`,
                                borderRadius: '4px 4px 0 0',
                                background: `rgba(145,132,217,${(0.18 + t * 0.52).toFixed(2)})`,
                              }}
                            />
                          )
                        })}
                      </div>
                      <div className="row-flex" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                        <span className="meta">Wallet 1 — {usd(walk[0])}</span>
                        <span className="meta" style={{ color: 'var(--accent-300)' }}>
                          Wallet {walk.length} — {usd(walk[walk.length - 1])} ({pct(walkImpact, 1)})
                        </span>
                      </div>
                    </>
                  )}

                  <div className="field" style={{ marginTop: 20 }}>
                    <label className="label" htmlFor="cc-slip">
                      Slippage <span className="label-value mono">{slippageBps} bps</span>
                    </label>
                    <Range id="cc-slip" min={50} max={500} step={50} value={slippageBps} onChange={v => { setSlippageBps(v); setSimReady(false) }} />
                  </div>
                </div>
                <div className="card-foot">
                  <span className="meta">
                    {fundedSelected.length} funded · {buyBundles} {buyBundles === 1 ? 'bundle' : 'bundles'} · {buyTxCount} tx · tip {sol(BUNDLE_TIP_LAMPORTS, 3)} SOL
                  </span>
                  {simReady ? (
                    <div className="row-flex" style={{ gap: 7 }}>
                      <button type="button" className="btn" onClick={() => setSimReady(false)}>Cancel</button>
                      <button type="button" className="btn btn-accent" disabled={firing} onClick={handleFire}>
                        {firing ? 'Firing…' : `Confirm and fire ${fundedSelected.length}`}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={simulating || !token || fundedSelected.length === 0}
                      onClick={handleSimulate}
                    >
                      {simulating ? 'Simulating…' : 'Simulate and fire'}
                    </button>
                  )}
                </div>
              </div>

              {/* job monitor */}
              <div className="glass-quiet">
                <div className="card-head">
                  <span className="section-title" style={{ fontSize: 13.5 }}>Job monitor</span>
                  {job && <span className="meta" style={{ color: 'var(--ink-4)' }}>{job.job_id}</span>}
                </div>
                {!job ? (
                  <div className="empty">No job yet. Distribute or fire a buy to see per-leg outcomes here.</div>
                ) : job.legs.map(leg => (
                  <div
                    key={leg.leg}
                    className="row-flex"
                    style={{ gap: 10, flexWrap: 'nowrap', padding: '10px 20px', borderBottom: '1px solid rgba(233,233,237,.05)', opacity: leg.status === 'blocked' ? 0.55 : 1 }}
                  >
                    <StatusIcon status={leg.status} />
                    <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      Leg {leg.leg} · {leg.transfers} {leg.transfers === 1 ? 'transfer' : 'transfers'}
                    </span>
                    <span className="mono" style={{
                      fontSize: 11, marginLeft: 'auto', minWidth: 0, textAlign: 'right',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: leg.error ? 'var(--danger)' : 'var(--ink-3)',
                    }}>
                      {leg.error
                        ? leg.error
                        : leg.status === 'blocked'
                          ? `blocked by leg ${leg.blocked_by}`
                          : truncateAddress(leg.signature ?? '', 8, 8)}
                    </span>
                    {leg.status === 'failed' && (
                      <button type="button" className="btn btn-xs" disabled={retrying === leg.leg} onClick={() => handleRetry(leg.leg)}>
                        {retrying === leg.leg ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── group picker ───────────────────────────────────────────── */}
      {groupPickerOpen && (
        <Sheet onClose={() => setGroupPickerOpen(false)} width={860} labelledBy="cc-groups-title">
          <SheetHead
            id="cc-groups-title"
            title="Select a bundle group"
            sub={`${groups.length} groups · ${groups.reduce((a, g) => a + g.members.length, 0)} wallets assigned`}
            onClose={() => setGroupPickerOpen(false)}
          />
          <div className="grid-fill" style={{ '--min': '190px', gap: 12, padding: '20px 26px' } as React.CSSProperties}>
            {groups.map(g => {
              const active = g.group_id === openGroupId
              const stats = groupStats(g)
              return (
                <button
                  key={g.group_id}
                  type="button"
                  className="glass glow glow-bright lift"
                  onClick={() => { if (!active) openGroupChip(g.group_id); setGroupPickerOpen(false) }}
                  style={{ padding: '15px 16px', borderRadius: 13, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', borderColor: active ? 'rgba(145,132,217,.45)' : undefined, '--glow-size': '200px' } as React.CSSProperties}
                >
                  <div className="row-flex" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13.5, color: active ? 'var(--accent-300)' : 'var(--ink-1)' }}>{g.name}</span>
                    {active && <span className="dot" style={{ background: 'var(--accent-400)' }} />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 13 }}>
                    <span className="value-lg">{g.members.length}</span>
                    <span className="hint" style={{ fontSize: 11 }}>/ {g.capacity} wallets</span>
                  </div>
                  <div className="meta" style={{ marginTop: 9 }}>
                    {stats ? `${stats.funded} funded · ${sol(stats.lamports)} SOL` : 'Balances not synced'}
                  </div>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => { void handleNewGroup(); setGroupPickerOpen(false) }}
              style={{ padding: '15px 16px', borderRadius: 13, border: '1px dashed rgba(145,132,217,.34)', background: 'rgba(66,58,106,.16)', color: 'var(--accent-400)', cursor: 'pointer', font: 'inherit', fontSize: 13, minHeight: 104 }}
            >
              + New group
            </button>
          </div>
          <div className="row-flex" style={{ justifyContent: 'space-between', padding: '16px 26px 24px', borderTop: '1px solid rgba(233,233,237,.07)' }}>
            <span className="hint">Groups hold up to 25 wallets — one Jito bundle roster.</span>
            <button type="button" className="btn btn-sm" onClick={() => { setGroupPickerOpen(false); onNavigate?.('bundler') }}>
              Manage wallets →
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ subviews */

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
      <span style={{ color: strong ? 'var(--accent-400)' : 'rgba(233,233,237,.55)' }}>{k}</span>
      <span style={{ color: strong ? 'var(--accent-300)' : 'rgba(233,233,237,.78)' }}>{v}</span>
    </div>
  )
}
