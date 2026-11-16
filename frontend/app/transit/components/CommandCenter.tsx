'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch, ApiError, apiErrorMessage } from '@/lib/api'
import { useWalletBalances, solToLamports, formatSol, lamportsToSolString, type LoadOptions } from '@/lib/balances'
import {
  loadToken, loadMyTokens, loadGroups, loadGroupMembers, loadFundingWallets,
  distributeToGroup, simulateBuy, executeBuy, retryLeg,
  floorLamports, minimumBuyLamports, priceWalk,
  bundleCount, sol, truncateAddress, usd, pct, lamportsToNumber,
  LAMPORTS_PER_SOL, BUNDLE_TIP_LAMPORTS,
  type TokenSnapshot, type BundleGroup, type GroupMember, type FundingWallet,
  type Job, type SplitMode, type DistributeResult,
} from '@/lib/commandCenter'
import { Sheet, SheetHead, Seg, Range, Check, TokenTile, CopyButton, ChevronDown, RefreshIcon, PreviewTag } from '@/components/ui'

const ROSTER_PAGE = 10

const SPLIT_MODES = [
  { id: 'even', label: 'Even' },
  { id: 'random', label: 'Random' },
] as const satisfies readonly { id: SplitMode; label: string }[]

const SOLSCAN = 'https://solscan.io'

/** Exactly what the user confirmed; the request is built from this, not from live form state. */
interface DistributeRequest {
  groupId: string
  groupName: string
  walletCount: number
  fundingPublicKey: string
  lamports: string
  splitMode: SplitMode
}

/** `uncertain`: no usable response, so the transfers may or may not have landed. */
interface DistributeError { message: string; uncertain: boolean }

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
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()

  /* token */
  const [mintInput, setMintInput] = useState(initialMint)
  const [token, setToken] = useState<TokenSnapshot | null>(null)
  const [loadingToken, setLoadingToken] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [myTokens, setMyTokens] = useState<TokenSnapshot[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  /* groups + balances */
  const [groups, setGroups] = useState<BundleGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [groupsError, setGroupsError] = useState('')
  const [membersError, setMembersError] = useState<{ groupId: string; message: string } | null>(null)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const { balances, failed: balanceFailed, loading: syncing, load: loadBalances } = useWalletBalances()
  /** Time of the last successful balance read, per group. */
  const [syncedAt, setSyncedAt] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => Date.now())
  const loadedRef = useRef(false)
  const [showAllRows, setShowAllRows] = useState(false)

  /* ephemeral buy selection — never persisted, never touches group membership */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  /* step 1 — distribute (real SOL, every wallet in the group) */
  const [fundingWallets, setFundingWallets] = useState<FundingWallet[]>([])
  const [fundingId, setFundingId] = useState('')
  const [totalSol, setTotalSol] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('even')
  const [pendingDistribute, setPendingDistribute] = useState<DistributeRequest | null>(null)
  const [distributing, setDistributing] = useState(false)
  // Synchronous guard: state updates land a render late, a ref blocks a double click.
  const distributingRef = useRef(false)
  const [distributeError, setDistributeError] = useState<DistributeError | null>(null)
  const [distributeResult, setDistributeResult] = useState<{ request: DistributeRequest; result: DistributeResult } | null>(null)

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
    if (!openGroup?.members) return []
    return openGroup.members.map(m => {
      const b = balances[m.public_key]
      return b ? { ...m, lamports: lamportsToNumber(b.lamports) } : m
    })
  }, [openGroup, balances])

  const selected = useMemo(() => members.filter(m => selectedIds.has(m.wallet_id)), [members, selectedIds])

  /**
   * Reads balances for `list` in one groupBalance request. Keys already in
   * flight are skipped; `force` re-reads keys that already have a balance.
   */
  async function syncBalances(groupId: string, list: GroupMember[], opts: LoadOptions, extraKeys: string[] = []) {
    const outcome = await loadBalances([...list.map(m => m.public_key), ...extraKeys], opts)
    if (outcome?.ok) setSyncedAt(prev => ({ ...prev, [groupId]: Date.now() }))
  }

  /** Funding balance: the latest roster-cache read if there is one, else the read from page load. */
  function fundingLamports(w: FundingWallet): number | null {
    const b = balances[w.public_key]
    return b ? lamportsToNumber(b.lamports) : w.lamports
  }

  /** Rows on screen before "N more wallets" is opened. */
  function firstPage(list: GroupMember[]) {
    return list.slice(0, ROSTER_PAGE)
  }

  /** Reads a group's wallets once, then the balances of the visible rows. */
  async function loadMembers(groupId: string) {
    setMembersError(null)
    try {
      const list = await loadGroupMembers(apiFetch, groupId)
      setGroups(prev => prev.map(g => (g.group_id === groupId ? { ...g, members: list } : g)))
      await syncBalances(groupId, firstPage(list), { force: true })
    } catch (err) {
      const message = err instanceof ApiError && err.status === 404
        ? 'Bundle group not found.'
        : err instanceof Error ? err.message : 'Failed to load group wallets'
      setMembersError({ groupId, message })
    }
  }

  // Load once the token is available; later token refreshes must not reset the open group.
  useEffect(() => {
    if (!accessToken || loadedRef.current) return
    loadedRef.current = true
    loadGroups(apiFetch)
      .then(g => {
        setGroups(g)
        if (g.length) {
          setOpenGroupId(g[0].group_id)
          void loadMembers(g[0].group_id)
        }
      })
      .catch(err => setGroupsError(err instanceof Error ? err.message : 'Failed to load bundle groups'))
      .finally(() => setLoadingGroups(false))
    loadFundingWallets(apiFetch)
      .then(w => {
        setFundingWallets(w)
        if (w.length) setFundingId(w[0].wallet_id)
      })
      .catch(err => setActionError(err instanceof Error ? err.message : 'Failed to load funding wallets'))
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialMint) void handleLoad(initialMint)
  }, [initialMint])

  // Re-renders the "synced Ns ago" readout. Display only; it never fetches.
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
    cancelPendingDistribute()       // a confirmation is for one specific group
    if (next) {
      const g = groups.find(x => x.group_id === next)
      if (g && !g.members) void loadMembers(g.group_id)
      else if (g?.members) void syncBalances(g.group_id, firstPage(g.members), { force: true })
    }
  }

  /** "N more wallets": reads only the newly shown rows that have no balance yet. */
  function showMoreRows() {
    setShowAllRows(true)
    if (openGroup?.members) void syncBalances(openGroup.group_id, openGroup.members.slice(ROSTER_PAGE), {})
  }

  /** Manual refresh: every wallet in the selected group, one request. */
  function refreshBalances() {
    if (openGroup?.members?.length) void syncBalances(openGroup.group_id, openGroup.members, { force: true })
  }

  function selectable(m: GroupMember): boolean {
    // the selection is for the buy, which needs the wallet to already clear its floor
    return m.lamports >= minimumBuyLamports(m)
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

  // Drop selections whose wallet no longer clears the buy floor.
  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => {
        const m = members.find(x => x.wallet_id === id)
        return m ? selectable(m) : false
      }))
      return next.size === prev.size ? prev : next
    })
    setSimReady(false)
  }, [members])

  /* ------------------------------------------------------------- derived */
  /* The buy figures count the SELECTED wallets; distribute always targets the whole group. */

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

  const openSyncedAt = openGroupId ? syncedAt[openGroupId] : undefined
  const syncedAgo = openSyncedAt ? Math.max(0, Math.round((now - openSyncedAt) / 1000)) : null
  const balanceFailures = members.filter(m => balanceFailed[m.public_key]).length

  /** Per-group readout for the picker, from whatever balances have been read. */
  function groupStats(g: BundleGroup) {
    const known = (g.members ?? []).filter(m => balances[m.public_key] !== undefined)
    if (known.length === 0) return null
    const hydrated = known.map(m => ({ ...m, lamports: lamportsToNumber(balances[m.public_key].lamports) }))
    return {
      funded: hydrated.filter(m => m.lamports >= minimumBuyLamports(m)).length,
      lamports: hydrated.reduce((s, m) => s + m.lamports, 0),
    }
  }

  /* ------------------------------------------------------------- actions */

  /** Drops an open confirmation (inputs or group changed). Never while a request is in flight. */
  function cancelPendingDistribute() {
    if (!distributingRef.current) setPendingDistribute(null)
  }

  /** Step one of two: validate, then show the confirmation. Nothing is sent here. */
  function reviewDistribute() {
    if (distributingRef.current) return
    setDistributeError(null)
    const group = openGroup
    if (!group?.members?.length) { setDistributeError({ message: 'Pick a bundle group with wallets first.', uncertain: false }); return }
    const funding = fundingWallets.find(w => w.wallet_id === fundingId)
    if (!funding) { setDistributeError({ message: 'Pick a funding wallet.', uncertain: false }); return }
    const parsed = solToLamports(totalSol)
    if ('error' in parsed) { setDistributeError({ message: parsed.error, uncertain: false }); return }
    setPendingDistribute({
      groupId: group.group_id,
      groupName: group.name,
      walletCount: group.members.length,
      fundingPublicKey: funding.public_key,
      lamports: parsed.lamports,
      splitMode,
    })
  }

  /** Maps a failed request to what the form shows. */
  function distributeFailure(err: unknown, req: DistributeRequest): DistributeError {
    if (err instanceof ApiError) {
      // BAD_REQUEST / INSUFFICIENT_BUDGET / INSUFFICIENT_FUNDS: the server's message, inline
      if (err.status === 400) return { message: apiErrorMessage(err) ?? 'The distribution was rejected.', uncertain: false }
      if (err.status === 404) {
        setMembersError({ groupId: req.groupId, message: 'Bundle group not found.' })
        return { message: 'Bundle group not found.', uncertain: false }
      }
      // apiFetch already tried a token refresh and logged out if that failed
      if (err.status === 401) return { message: err.message, uncertain: false }
      // the proxy gave up waiting; the server may still be sending
      if (err.status === 504) return { message: 'The server took too long to answer.', uncertain: true }
      return { message: 'Distribution failed on the server. Your inputs are unchanged.', uncertain: false }
    }
    // Network error or unreadable 2xx: the request may have reached the server.
    return { message: 'No usable response from the server.', uncertain: true }
  }

  /** Step two: the only path that sends SOL. */
  async function confirmDistribute() {
    const req = pendingDistribute
    if (!req || distributingRef.current) return
    distributingRef.current = true
    setDistributing(true)
    setDistributeError(null)
    try {
      const result = await distributeToGroup(apiFetch, req.groupId, {
        fundingPublicKey: req.fundingPublicKey,
        grandTotal: req.lamports,
        splitMode: req.splitMode,
      })
      setDistributeResult({ request: req, result })
      setPendingDistribute(null)
      // Funds moved (200 or 207): re-read the whole group and the funding wallet in one request.
      // Not awaited, so the Distribute button frees up while the read runs.
      const group = groups.find(g => g.group_id === req.groupId)
      if (group?.members?.length) {
        void syncBalances(group.group_id, group.members, { fresh: true }, [req.fundingPublicKey])
      }
    } catch (err) {
      setPendingDistribute(null)
      setDistributeError(distributeFailure(err, req))
    } finally {
      distributingRef.current = false
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
                    {openGroup?.members && <span style={{ color: 'var(--ink-3)' }}>{openGroup.members.length}</span>}
                    <ChevronDown />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={refreshBalances}
                    disabled={syncing || !openGroup?.members?.length}
                    title="Refresh balances"
                    aria-label="Refresh balances"
                    style={{ color: syncing ? 'var(--accent-300)' : undefined }}
                  >
                    <RefreshIcon spinning={syncing} />
                  </button>
                </div>
              </div>
              <div className="row-flex" style={{ justifyContent: 'space-between', padding: '0 20px 12px' }}>
                <span className="meta" style={{ color: 'var(--ink-4)' }}>Select funded wallets for the buy</span>
                <span className="meta" style={{ color: 'var(--ink-4)' }}>
                  {syncing ? 'syncing balances…' : syncedAgo === null ? 'balances not synced' : `balances synced ${syncedAgo}s ago`}
                  {!syncing && balanceFailures > 0 && <span style={{ color: 'var(--danger)' }}> · {balanceFailures} failed</span>}
                </span>
              </div>

              {groupsError ? (
                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line-soft)' }}><div className="alert">{groupsError}</div></div>
              ) : !openGroup ? (
                <div className="empty" style={{ borderTop: '1px solid var(--line-soft)' }}>
                  {loadingGroups
                    ? 'Loading bundle groups…'
                    : groups.length === 0
                      ? 'No bundle groups yet. Create one in Wallets.'
                      : 'Pick a bundle group to load its wallets.'}
                </div>
              ) : membersError?.groupId === openGroup.group_id ? (
                <div className="empty" style={{ borderTop: '1px solid var(--line-soft)', color: 'var(--danger)' }}>{membersError.message}</div>
              ) : !openGroup.members ? (
                <div className="empty" style={{ borderTop: '1px solid var(--line-soft)' }}>Loading wallets…</div>
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
                        {balances[m.public_key] ? (
                          <span className="t-cell-mono t-right" style={{ color: m.lamports === 0 ? 'var(--ink-5)' : 'var(--ink-1)' }}>
                            {sol(m.lamports)}
                          </span>
                        ) : (
                          <span className="t-cell-mono t-right" style={{ color: balanceFailed[m.public_key] ? 'var(--danger)' : 'var(--ink-5)' }}>
                            {balanceFailed[m.public_key] ? 'err' : '—'}
                          </span>
                        )}
                      </div>
                    )
                  })}

                  {members.length > 0 && (
                    <div className="t-row" style={{ gridTemplateColumns: rosterCols, padding: '9px 20px' }}>
                      <span /><span />
                      <span>
                        {hiddenCount > 0 ? (
                          <button type="button" className="btn-link" onClick={showMoreRows}>{hiddenCount} more wallets</button>
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
                      <select
                        id="cc-funding"
                        className="input mono"
                        value={fundingId}
                        onChange={e => { setFundingId(e.target.value); setDistributeError(null); cancelPendingDistribute() }}
                        disabled={distributing}
                        style={{ fontSize: 12 }}
                      >
                        {fundingWallets.length === 0 && <option value="">No funding wallets</option>}
                        {fundingWallets.map(w => {
                          const lamports = fundingLamports(w)
                          return (
                            <option key={w.wallet_id} value={w.wallet_id}>
                              {truncateAddress(w.public_key, 6, 6)} · {lamports === null ? '—' : sol(lamports, 3)} SOL
                            </option>
                          )
                        })}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="cc-total">Total to distribute (SOL)</label>
                      <input
                        id="cc-total"
                        className="input mono"
                        value={totalSol}
                        onChange={e => { setTotalSol(e.target.value); setDistributeError(null); cancelPendingDistribute() }}
                        onKeyDown={e => { if (e.key === 'Enter') reviewDistribute() }}
                        disabled={distributing}
                        inputMode="decimal"
                        placeholder="0.08"
                        aria-invalid={!!distributeError && !distributeError.uncertain}
                        aria-describedby={distributeError ? 'cc-distribute-error' : undefined}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: 20 }}>
                    <span className="label">Split</span>
                    <Seg
                      small
                      options={SPLIT_MODES}
                      value={splitMode}
                      onChange={v => { if (!distributing) { setSplitMode(v); cancelPendingDistribute() } }}
                      label="Split mode"
                    />
                    <div className="hint" style={{ fontSize: 11 }}>
                      Even gives every wallet the same amount · Random varies the amounts. Each wallet keeps a reserve for rent and fees.
                    </div>
                  </div>

                  {distributeError && (
                    distributeError.uncertain ? (
                      <div id="cc-distribute-error" className="alert" role="alert" style={{ marginTop: 16 }}>
                        {distributeError.message} The outcome is unknown: the transfers may have gone through.
                        Before trying again, refresh balances and check the funding wallet on{' '}
                        <SolscanLink kind="account" id={fundingWallets.find(w => w.wallet_id === fundingId)?.public_key}>Solscan</SolscanLink>.
                      </div>
                    ) : (
                      <div id="cc-distribute-error" className="alert-inline" role="alert" style={{ marginTop: 14 }}>{distributeError.message}</div>
                    )
                  )}
                </div>

                {pendingDistribute ? (
                  <div className="callout" style={{ margin: '0 20px 18px' }} aria-live="polite">
                    <div className="kicker kicker-accent" style={{ letterSpacing: '.16em' }}>Confirm · sends real SOL</div>
                    <div className="stack" style={{ gap: 9, marginTop: 13 }}>
                      <Line k="Bundle group" v={pendingDistribute.groupName} />
                      <Line k="Wallets" v={`${pendingDistribute.walletCount} (every wallet in the group)`} />
                      <Line k="From" v={truncateAddress(pendingDistribute.fundingPublicKey, 6, 6)} />
                      <Line k="Split" v={pendingDistribute.splitMode === 'even' ? 'Even' : 'Random'} />
                      <Line k="Total" v={`${lamportsToSolString(pendingDistribute.lamports)} SOL`} strong />
                    </div>
                    {distributing && (
                      <div className="hint" style={{ fontSize: 11, marginTop: 13 }}>
                        Sending and waiting for on-chain confirmation. This can take several seconds; keep this tab open to see the result.
                      </div>
                    )}
                    <div className="row-flex" style={{ justifyContent: 'flex-end', gap: 7, marginTop: 15 }}>
                      <button type="button" className="btn" disabled={distributing} onClick={() => setPendingDistribute(null)}>Cancel</button>
                      <button type="button" className="btn btn-accent" disabled={distributing} onClick={confirmDistribute}>
                        {distributing ? 'Distributing…' : 'Confirm and send'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card-foot">
                    <span className="meta">
                      {openGroup?.members
                        ? `Sends to all ${openGroup.members.length} ${openGroup.members.length === 1 ? 'wallet' : 'wallets'} in ${openGroup.name}`
                        : 'Pick a bundle group'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={distributing || !openGroup?.members?.length || !fundingId}
                      onClick={reviewDistribute}
                    >
                      Distribute
                    </button>
                  </div>
                )}

                {distributeResult && (
                  <DistributeResultView
                    request={distributeResult.request}
                    result={distributeResult.result}
                    onDismiss={() => setDistributeResult(null)}
                  />
                )}
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
                      Select funded wallets in the roster to preview the walk.
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
            sub={`${groups.length} groups`}
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
                    {g.members
                      ? <><span className="value-lg">{g.members.length}</span><span className="hint" style={{ fontSize: 11 }}>wallets</span></>
                      : <span className="hint" style={{ fontSize: 11 }}>Created {new Date(g.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
                  </div>
                  <div className="meta" style={{ marginTop: 9 }}>
                    {stats ? `${stats.funded} funded · ${sol(stats.lamports)} SOL` : 'Balances not synced'}
                  </div>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => { setGroupPickerOpen(false); onNavigate?.('bundler') }}
              title="Bundle groups are created in Wallets"
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

function SolscanLink({ kind, id, children }: { kind: 'tx' | 'account'; id?: string; children: React.ReactNode }) {
  if (!id) return <>{children}</>
  return (
    <a href={`${SOLSCAN}/${kind}/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </a>
  )
}

/** "#1–#18" for a contiguous run, else "#2, #5, #9" (positions are 0-based, shown 1-based like the roster). */
function positionsLabel(positions: number[]): string {
  const p = [...positions].sort((a, b) => a - b)
  if (p.length === 0) return 'no wallets'
  const contiguous = p.every((v, i) => i === 0 || v === p[i - 1] + 1)
  if (contiguous) return p.length === 1 ? `#${p[0] + 1}` : `#${p[0] + 1}–#${p[p.length - 1] + 1}`
  return p.map(v => `#${v + 1}`).join(', ')
}

function DistributeResultView({ request, result, onDismiss }: {
  request: DistributeRequest
  result: DistributeResult
  onDismiss: () => void
}) {
  // Match by position, never by array index.
  const txByPosition = new Map<number, DistributeResult['transactions'][number]>()
  result.transactions.forEach(tx => tx.positions.forEach(p => txByPosition.set(p, tx)))

  const failedTxs = result.transactions.filter(tx => tx.status === 'failed')
  const partial = failedTxs.length > 0
  const allocations = [...result.allocations].sort((a, b) => a.position - b.position)
  const funded = allocations.filter(a => txByPosition.get(a.position)?.status === 'confirmed')
  const fundedLamports = funded.reduce((sum, a) => sum + BigInt(a.transferAmount), BigInt(0)).toString()
  const failedWithoutSignature = failedTxs.some(tx => !tx.signature)
  const cols = '40px 1fr auto 62px'

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }} aria-live="polite">
      <div className="card-head" style={{ borderBottom: 0, paddingBottom: 8 }}>
        <div className="row-flex" style={{ gap: 9 }}>
          <span className="section-title" style={{ fontSize: 13.5 }}>Result · {request.groupName}</span>
          <span className={partial ? 'tag tag-danger' : 'tag tag-accent'}>{partial ? 'Partial' : 'Confirmed'}</span>
        </div>
        <button type="button" className="btn btn-xs" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="meta" style={{ padding: '0 20px 12px' }}>
        Funded {funded.length} of {allocations.length} wallets · {formatSol(fundedLamports, 6)} SOL confirmed · base reserve {formatSol(result.baseReserve, 6)} SOL per wallet
      </div>

      {partial && (
        <div className="alert" role="alert" style={{ margin: '0 20px 14px' }}>
          {failedTxs.length} of {result.transactions.length} {result.transactions.length === 1 ? 'transaction' : 'transactions'} failed, so the wallets marked “failed” below were not funded.
          Re-running Distribute sends to <strong>every</strong> wallet in the group again, including the ones already funded.
          Check the failed transaction on Solscan first: a “failed” result can occasionally mean confirmation timed out but the transfer actually landed.
          {failedWithoutSignature && (
            <> The response has no signature for {failedTxs.length === 1 ? 'it' : 'some of them'}; check the funding wallet&apos;s history on{' '}
              <SolscanLink kind="account" id={request.fundingPublicKey}>Solscan</SolscanLink> instead.</>
          )}
        </div>
      )}

      {result.transactions.map((tx, i) => (
        <div key={i} style={{ padding: '10px 20px', borderBottom: '1px solid rgba(233,233,237,.05)' }}>
          <div className="row-flex" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <StatusIcon status={tx.status} />
            <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              Tx {i + 1} · {tx.positions.length} {tx.positions.length === 1 ? 'transfer' : 'transfers'} · {positionsLabel(tx.positions)}
            </span>
            <span className="mono" style={{ fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {tx.signature
                ? <SolscanLink kind="tx" id={tx.signature}>{truncateAddress(tx.signature, 8, 8)}</SolscanLink>
                : <span style={{ color: 'var(--ink-5)' }}>no signature</span>}
            </span>
          </div>
          {tx.status === 'failed' && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6, paddingLeft: 23, wordBreak: 'break-word' }}>
              {tx.error ?? 'Failed'}
            </div>
          )}
        </div>
      ))}

      <div className="t-head" style={{ gridTemplateColumns: cols, padding: '10px 20px' }}>
        <span>#</span><span>Wallet</span><span className="t-right">SOL</span><span className="t-right">Status</span>
      </div>
      {allocations.map(a => {
        const tx = txByPosition.get(a.position)
        const ok = tx?.status === 'confirmed'
        return (
          <div key={a.position} className="t-row" style={{ gridTemplateColumns: cols, padding: '9px 20px' }} title={tx?.status === 'failed' ? tx.error : undefined}>
            <span className="t-cell-mono" style={{ color: 'var(--ink-4)' }}>{a.position + 1}</span>
            <span className="t-cell-mono" style={{ color: 'var(--ink-2)' }}>{truncateAddress(a.publicKey, 5, 4)}</span>
            <span className="t-cell-mono t-right" style={{ color: ok ? 'var(--ink-1)' : 'var(--ink-4)' }}>{formatSol(a.transferAmount, 6)}</span>
            <span className="t-cell-mono t-right" style={{ color: ok ? 'var(--accent-400)' : 'var(--danger)' }}>
              {ok ? 'funded' : tx ? 'failed' : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
      <span style={{ color: strong ? 'var(--accent-400)' : 'rgba(233,233,237,.55)' }}>{k}</span>
      <span style={{ color: strong ? 'var(--accent-300)' : 'rgba(233,233,237,.78)' }}>{v}</span>
    </div>
  )
}
