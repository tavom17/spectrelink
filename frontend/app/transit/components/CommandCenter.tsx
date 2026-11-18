'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch, ApiError, apiErrorMessage } from '@/lib/api'
import { useWalletBalances, solToLamports, formatSol, lamportsToSolString, type LoadOptions } from '@/lib/balances'
import {
  loadMyTokens, loadGroups, loadGroupMembers, loadFundingWallets,
  distributeToGroup, buyFromWallets, percentToBps, bpsLabel,
  loadBaseReserve, availableLamports, sol, truncateAddress, lamportsToNumber,
  MAX_BUY_WALLETS_PER_REQUEST,
  type LaunchedToken, type BundleGroup, type GroupMember, type FundingWallet,
  type SplitMode, type DistributeResult, type BuyAmountMode, type BuyResult, type BuyRequestBody,
} from '@/lib/commandCenter'
import { Sheet, SheetHead, Seg, Range, Check, TokenTile, CopyButton, ChevronDown, RefreshIcon, SolscanLink, StatusIcon, Line } from '@/components/ui'
import WithdrawPanel from './WithdrawPanel'

const ROSTER_PAGE = 10

const SPLIT_MODES = [
  { id: 'even', label: 'Even' },
  { id: 'random', label: 'Random' },
] as const satisfies readonly { id: SplitMode; label: string }[]

/** What the roster checkboxes select wallets for. */
type RosterPurpose = 'buy' | 'withdraw'

const ROSTER_PURPOSES = [
  { id: 'buy', label: 'Buy' },
  { id: 'withdraw', label: 'Withdraw' },
] as const satisfies readonly { id: RosterPurpose; label: string }[]

const AMOUNT_MODES = [
  { id: 'percent', label: '% of available' },
  { id: 'perWallet', label: 'Per wallet' },
] as const satisfies readonly { id: BuyAmountMode; label: string }[]

/** Base58, 32–44 chars: the shape of a Solana address. */
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Exactly what the user confirmed; the request is built from this, not from live form state. */
interface DistributeRequest {
  groupId: string
  groupName: string
  walletCount: number
  fundingPublicKey: string
  lamports: string
  splitMode: SplitMode
}

/** Exactly what the user confirmed for a buy; sent as-is. */
interface BuyRequest {
  groupId: string
  groupName: string
  body: BuyRequestBody
  /** Roster position (1-based) per wallet, for the result table. */
  indexByKey: Record<string, number>
  /** perWallet only: the sum of every wallet's amount, in lamports. */
  totalLamports: string | null
}

/** `uncertain`: no usable response, so the transactions may or may not have landed. */
interface ActionError { message: string; uncertain: boolean }

/* -------------------------------------------------------------- component */

export default function CommandCenter({ initialMint = '', onNavigate }: {
  initialMint?: string
  onNavigate?: (tab: string) => void
}) {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()

  /* pool */
  const [poolInput, setPoolInput] = useState('')
  const [myTokens, setMyTokens] = useState<LaunchedToken[] | null>(null)
  const [tokensError, setTokensError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  /** Set when ?mint= names a token that is not one of the user's launches. */
  const [mintNotice, setMintNotice] = useState('')

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

  /* ephemeral selection (for the buy, or for a withdraw) — never persisted, never touches group membership */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [rosterPurpose, setRosterPurpose] = useState<RosterPurpose>('buy')

  /** GET /api/liquidity/reserve: lamports every wallet keeps back for fees and rent. null until read. */
  const [baseReserve, setBaseReserve] = useState<string | null>(null)
  const [reserveError, setReserveError] = useState('')

  /* step 1 — distribute (real SOL, every wallet in the group) */
  const [fundingWallets, setFundingWallets] = useState<FundingWallet[]>([])
  const [fundingId, setFundingId] = useState('')
  const [totalSol, setTotalSol] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('even')
  const [pendingDistribute, setPendingDistribute] = useState<DistributeRequest | null>(null)
  const [distributing, setDistributing] = useState(false)
  // Synchronous guard: state updates land a render late, a ref blocks a double click.
  const distributingRef = useRef(false)
  const [distributeError, setDistributeError] = useState<ActionError | null>(null)
  const [distributeResult, setDistributeResult] = useState<{ request: DistributeRequest; result: DistributeResult } | null>(null)
  const [fundingError, setFundingError] = useState('')

  /* step 2 — buy (real SOL, the selected wallets, one after another) */
  const [amountMode, setAmountMode] = useState<BuyAmountMode>('percent')
  const [percentInput, setPercentInput] = useState('')
  /** SOL typed per wallet, keyed by public key. Kept when a wallet is deselected. */
  const [perWalletSol, setPerWalletSol] = useState<Record<string, string>>({})
  const [pendingBuy, setPendingBuy] = useState<BuyRequest | null>(null)
  const [buying, setBuying] = useState(false)
  // Same synchronous guard as distribute: one buy request at a time.
  const buyingRef = useRef(false)
  const [buyError, setBuyError] = useState<ActionError | null>(null)
  const [buyResult, setBuyResult] = useState<{ request: BuyRequest; result: BuyResult } | null>(null)

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

  async function fetchMyTokens() {
    setTokensError('')
    try {
      setMyTokens(await loadMyTokens(apiFetch))
    } catch (err) {
      setTokensError(err instanceof ApiError ? apiErrorMessage(err) ?? 'Failed to load your tokens' : 'Failed to load your tokens')
    }
  }

  async function fetchReserve() {
    setReserveError('')
    try {
      setBaseReserve(await loadBaseReserve(apiFetch))
    } catch (err) {
      setReserveError(err instanceof ApiError ? apiErrorMessage(err) ?? 'Failed to load the wallet reserve' : 'Failed to load the wallet reserve')
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
      .catch(err => setFundingError(err instanceof Error ? err.message : 'Failed to load funding wallets'))
    void fetchMyTokens()
    void fetchReserve()
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Open in command center" passes ?mint=; use that token's pool once the launches are known.
  useEffect(() => {
    if (!initialMint || !myTokens || buyingRef.current) return
    const t = myTokens.find(x => x.mint_address === initialMint)
    if (t) { setPoolInput(t.pool_address); setMintNotice('') }
    else setMintNotice('The linked token is not one of your launches. Paste its pool address instead.')
  }, [initialMint, myTokens])

  // Re-renders the "synced Ns ago" readout. Display only; it never fetches.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  function openGroupChip(id: string) {
    const next = id === openGroupId ? null : id
    setOpenGroupId(next)
    setSelectedIds(new Set())       // selection is per-roster and ephemeral
    setShowAllRows(false)
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

  /** Buy-spendable lamports (balance − baseReserve), or null while the balance or the reserve is unknown. */
  function available(m: GroupMember): bigint | null {
    const b = balances[m.public_key]
    return b && baseReserve !== null ? availableLamports(b.lamports, baseReserve) : null
  }

  function selectable(m: GroupMember): boolean {
    // a withdraw can take any wallet; the server skips the empty ones and says so
    if (rosterPurpose === 'withdraw') return true
    // a buy needs something left once the reserve is kept back
    const a = available(m)
    return a !== null && a > BigInt(0)
  }

  function changeRosterPurpose(next: RosterPurpose) {
    if (next === rosterPurpose) return
    setRosterPurpose(next)
    setSelectedIds(new Set())       // a selection is for one action
    setBuyError(null)
  }

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(members.filter(selectable).map(m => m.wallet_id)))
  }

  function selectNone() {
    setSelectedIds(new Set())
  }

  // Drop selections whose wallet can no longer be selected (e.g. nothing left to buy with).
  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => {
        const m = members.find(x => x.wallet_id === id)
        return m ? selectable(m) : false
      }))
      return next.size === prev.size ? prev : next
    })
  }, [members, baseReserve, rosterPurpose]) // eslint-disable-line react-hooks/exhaustive-deps

  // A buy confirmation is for one exact set of wallets.
  useEffect(() => { cancelPendingBuy() }, [selectedIds])

  /* ------------------------------------------------------------- derived */
  /* Buy figures count the SELECTED wallets; distribute always targets the whole group. */

  const groupTotalLamports = members.reduce((s, m) => s + m.lamports, 0)
  const selectedLamports = selected.reduce((s, m) => s + m.lamports, 0)

  const visibleMembers = showAllRows ? members : members.slice(0, ROSTER_PAGE)
  const hiddenCount = members.length - visibleMembers.length
  const allSelectable = members.filter(selectable)
  const allSelected = allSelectable.length > 0 && allSelectable.every(m => selectedIds.has(m.wallet_id))

  const openSyncedAt = openGroupId ? syncedAt[openGroupId] : undefined
  const syncedAgo = openSyncedAt ? Math.max(0, Math.round((now - openSyncedAt) / 1000)) : null
  const balanceFailures = members.filter(m => balanceFailed[m.public_key]).length

  /* buy form — only a Buy-purpose selection counts */
  const buySelected = rosterPurpose === 'buy' ? selected : []
  const withdrawSelected = rosterPurpose === 'withdraw' ? selected : []
  const poolAddress = poolInput.trim()
  const poolValid = SOLANA_ADDRESS.test(poolAddress)
  const poolToken = myTokens?.find(t => t.pool_address === poolAddress) ?? null
  const overLimit = buySelected.length > MAX_BUY_WALLETS_PER_REQUEST
  const percent = percentToBps(percentInput)
  const perWallet = buySelected.map(m => {
    const raw = perWalletSol[m.public_key] ?? ''
    return { m, raw, parsed: solToLamports(raw) }
  })
  const perWalletLamports = perWallet.flatMap(p => ('lamports' in p.parsed ? [p.parsed.lamports] : []))
  const perWalletReady = buySelected.length > 0 && perWalletLamports.length === buySelected.length
  const perWalletTotal = perWalletLamports.reduce((s, l) => s + BigInt(l), BigInt(0)).toString()
  const firstPerWalletError = perWallet.find(p => p.raw.trim() && 'error' in p.parsed)

  /** Why Buy is disabled, or null when it can be reviewed. */
  const buyBlocker: string | null =
    !poolAddress ? 'Set a pool above'
    : !poolValid ? 'Pool address is not a valid Solana address'
    : !openGroup?.members ? 'Pick a bundle group'
    : rosterPurpose !== 'buy' ? 'Switch the roster to Buy to select wallets'
    : baseReserve === null ? (reserveError ? 'The wallet reserve could not be loaded' : 'Loading the wallet reserve…')
    : buySelected.length === 0 ? 'Select wallets in the roster'
    : overLimit ? `Select at most ${MAX_BUY_WALLETS_PER_REQUEST} wallets`
    : amountMode === 'percent'
      ? ('error' in percent ? (percentInput.trim() ? percent.error : 'Enter a percentage') : null)
      : (!perWalletReady ? 'Enter a positive SOL amount for every selected wallet' : null)

  /** Per-group readout for the picker, from whatever balances have been read. */
  function groupStats(g: BundleGroup) {
    const known = (g.members ?? []).filter(m => balances[m.public_key] !== undefined)
    if (known.length === 0) return null
    return {
      funded: baseReserve === null
        ? null
        : known.filter(m => availableLamports(balances[m.public_key].lamports, baseReserve) > BigInt(0)).length,
      lamports: known.reduce((s, m) => s + lamportsToNumber(balances[m.public_key].lamports), 0),
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
  function distributeFailure(err: unknown, req: DistributeRequest): ActionError {
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

  /* buy */

  /** Drops an open buy confirmation (inputs changed). Never while a buy is in flight. */
  function cancelPendingBuy() {
    if (!buyingRef.current) setPendingBuy(null)
  }

  function setPerWalletAmount(publicKey: string, value: string) {
    setPerWalletSol(prev => ({ ...prev, [publicKey]: value }))
    setBuyError(null)
    cancelPendingBuy()
  }

  /** Step one of two: snapshot the request and show the confirmation. Nothing is sent here. */
  function reviewBuy() {
    if (buyingRef.current) return
    setBuyError(null)
    const group = openGroup
    if (buyBlocker || !group) { setBuyError({ message: buyBlocker ?? 'Pick a bundle group.', uncertain: false }); return }

    const walletPublicKeys = buySelected.map(m => m.public_key)
    const indexByKey = Object.fromEntries(buySelected.map(m => [m.public_key, m.index]))
    // Only one execution mode exists today; Bundle is shown but cannot be chosen.
    const base = { poolAddress, walletPublicKeys, executionMode: 'sequential' as const }

    let body: BuyRequestBody
    let totalLamports: string | null = null
    if (amountMode === 'percent') {
      if (!('bps' in percent)) return
      body = { ...base, amountMode: 'percent', percentBps: percent.bps }
    } else {
      const amounts: Record<string, string> = {}
      for (const p of perWallet) {
        if (!('lamports' in p.parsed)) return
        amounts[p.m.public_key] = p.parsed.lamports
      }
      body = { ...base, amountMode: 'perWallet', amounts }
      totalLamports = perWalletTotal
    }
    setPendingBuy({ groupId: group.group_id, groupName: group.name, body, indexByKey, totalLamports })
  }

  /** Maps a failed buy request to what the form shows. Form state is always kept. */
  function buyFailure(err: unknown): ActionError {
    if (err instanceof ApiError) {
      // rejected before anything was sent: the server's message, inline
      if (err.status === 400) return { message: apiErrorMessage(err) ?? 'The buy was rejected.', uncertain: false }
      // Bundle is disabled in the UI, so this should not happen; show what the server says
      if (err.status === 501) return { message: apiErrorMessage(err) ?? 'Bundle buys are not available yet. Use sequential.', uncertain: false }
      // apiFetch already tried a token refresh and logged out if that failed
      if (err.status === 401) return { message: err.message, uncertain: false }
      // 502/504: the proxy lost the run part-way; buys before that point may have landed
      if (err.status === 502 || err.status === 504) return { message: 'The buy failed on the server.', uncertain: true }
      return { message: 'The buy failed on the server. Your inputs are unchanged.', uncertain: false }
    }
    // Network error or unreadable 2xx: the request may have reached the server.
    return { message: 'The buy failed: no usable response from the server.', uncertain: true }
  }

  /** Step two: the only path that buys. */
  async function confirmBuy() {
    const req = pendingBuy
    if (!req || buyingRef.current) return
    buyingRef.current = true
    setBuying(true)
    setBuyError(null)
    setBuyResult(null)
    let refetch = false
    try {
      const result = await buyFromWallets(apiFetch, req.body)
      setBuyResult({ request: req, result })
      refetch = true
    } catch (err) {
      const failure = buyFailure(err)
      setBuyError(failure)
      refetch = failure.uncertain
    } finally {
      buyingRef.current = false
      setPendingBuy(null)
      setBuying(false)
    }
    // SOL moved (200 or 207), or may have: re-read the whole group. Not awaited.
    const group = groups.find(g => g.group_id === req.groupId)
    if (refetch && group?.members?.length) void syncBalances(group.group_id, group.members, { fresh: true })
  }

  /* withdraw */

  /**
   * Funds moved (or may have): re-read the source wallets, and the destination
   * if it is one of the user's wallets (a loaded group member or a funding
   * wallet), in one request. Not awaited.
   */
  function afterWithdraw(sourceKeys: string[], destination: string) {
    const own = fundingWallets.some(w => w.public_key === destination)
      || groups.some(g => g.members?.some(m => m.public_key === destination))
    void loadBalances([...sourceKeys, ...(own ? [destination] : [])], { fresh: true })
  }

  /* ----------------------------------------------------------- rendering */

  const rosterCols = '28px 34px 1fr auto'
  const amountCols = '28px 1fr auto 112px'
  const buyLocked = buying || !!pendingBuy

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Fund a bundle group, then buy from its wallets against one pool</div>
      </div>

      {/* ── pool ───────────────────────────────────────────────────── */}
      <div className="glass glow" style={{ padding: '18px 22px', '--glow-size': '360px' } as React.CSSProperties}>
        <label className="kicker" htmlFor="cc-pool">Pool address</label>
        <div className="row-flex" style={{ gap: 11, marginTop: 12 }}>
          <input
            id="cc-pool"
            className="input mono"
            value={poolInput}
            onChange={e => { setPoolInput(e.target.value); setMintNotice(''); setBuyError(null); cancelPendingBuy() }}
            disabled={buying}
            placeholder="Paste a DAMM v2 pool address, or pick one of your tokens"
            spellCheck={false}
            aria-invalid={!!poolAddress && !poolValid}
            style={{ flex: '1 1 260px', width: 'auto' }}
          />
          <button type="button" className="btn" disabled={buying} onClick={() => setPickerOpen(o => !o)} aria-expanded={pickerOpen}>
            My tokens
          </button>
          {poolInput && (
            <button type="button" className="btn btn-sm" disabled={buying} onClick={() => { setPoolInput(''); cancelPendingBuy() }}>
              Clear
            </button>
          )}
        </div>
        {poolAddress && !poolValid && <div className="alert-inline" style={{ marginTop: 10 }}>Not a valid Solana address.</div>}
        {mintNotice && <div className="hint" style={{ marginTop: 10 }}>{mintNotice}</div>}

        {pickerOpen && (
          <div className="enter" style={{ marginTop: 14, borderRadius: 11, border: '1px solid rgba(233,233,237,.10)', background: 'rgba(16,18,32,.62)', overflow: 'hidden' }}>
            <div className="row-flex" style={{ justifyContent: 'space-between', padding: '10px 15px', borderBottom: '1px solid rgba(233,233,237,.07)' }}>
              <span className="kicker">Your launched tokens</span>
              <button type="button" className="btn-link dim" onClick={() => setPickerOpen(false)}>Close</button>
            </div>
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {tokensError ? (
                <div className="row-flex" style={{ justifyContent: 'space-between', padding: '12px 15px' }}>
                  <span className="alert-inline">{tokensError}</span>
                  <button type="button" className="btn btn-xs" onClick={() => void fetchMyTokens()}>Retry</button>
                </div>
              ) : !myTokens ? (
                <div className="empty" style={{ padding: '12px 15px' }}>Loading your tokens…</div>
              ) : myTokens.length === 0 ? (
                <div className="empty" style={{ padding: '12px 15px' }}>No launched tokens with a pool yet. Paste a pool address instead.</div>
              ) : myTokens.map(t => (
                <button
                  key={t.token_id ?? t.mint_address}
                  type="button"
                  onClick={() => { setPoolInput(t.pool_address); setMintNotice(''); setBuyError(null); cancelPendingBuy(); setPickerOpen(false) }}
                  className="t-row clickable"
                  style={{ gridTemplateColumns: '26px 1fr auto', width: '100%', padding: '10px 15px', background: 'transparent', border: 0, borderBottom: '1px solid var(--line-faint)', textAlign: 'left', color: 'inherit' }}
                >
                  <TokenTile src={t.image_uri} symbol={t.symbol} size={26} />
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, color: t.pool_address === poolAddress ? 'var(--accent-300)' : 'var(--ink-1)' }}>{t.name}</span>
                    <span className="meta" style={{ fontSize: 10 }}>{t.symbol} · mint {truncateAddress(t.mint_address)}</span>
                  </span>
                  <span className="t-cell-mono" title={t.pool_address}>pool {truncateAddress(t.pool_address)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {poolToken ? (
          <div className="enter" style={{ marginTop: 14, padding: '13px 15px', borderRadius: 12, border: '1px solid rgba(145,132,217,.30)', background: 'rgba(66,58,106,.20)' }}>
            <div className="row-flex" style={{ gap: 13 }}>
              <TokenTile src={poolToken.image_uri} symbol={poolToken.symbol} size={36} radius={10} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 200px', minWidth: 0 }}>
                <div className="row-flex" style={{ gap: 9 }}>
                  <span style={{ fontSize: 14 }}>{poolToken.name}</span>
                  <span className="tag tag-accent">{poolToken.symbol}</span>
                  <span className="tag tag-accent">Your launch</span>
                </div>
                <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span className="meta" style={{ wordBreak: 'break-all' }}>Pool {poolToken.pool_address}</span>
                  <CopyButton text={poolToken.pool_address} />
                </div>
              </div>
            </div>
          </div>
        ) : poolValid ? (
          <div className="hint" style={{ marginTop: 10 }}>
            Pasted pool, not one of your launches. Check it on <SolscanLink kind="account" id={poolAddress}>Solscan</SolscanLink> before buying.
          </div>
        ) : null}
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
            {bundleOpen ? 'Wallets · distribute · buy' : `Collapsed · ${selected.length} selected`}
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
                <div className="row-flex" style={{ gap: 8 }}>
                  <span className="meta" style={{ color: 'var(--ink-4)' }}>Select for</span>
                  <Seg small options={ROSTER_PURPOSES} value={rosterPurpose} onChange={changeRosterPurpose} label="Select wallets for" />
                </div>
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
                    const disabledReason = !disabled ? undefined
                      : baseReserve === null ? 'Loading the wallet reserve…'
                      : !balances[m.public_key] ? 'Balance not read yet'
                      : `Nothing available to buy with: needs more than ${formatSol(baseReserve, 6)} SOL, the reserve kept for fees and rent`
                    return (
                      <div
                        key={m.wallet_id}
                        className="t-row hover glow glow-sm"
                        onClick={() => { if (!disabled) toggle(m.wallet_id) }}
                        title={disabledReason}
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
              {fundingError && <div className="alert" role="alert">{fundingError}</div>}

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
                      Even gives every wallet the same amount · Random varies the amounts. Each wallet keeps a reserve for rent and fees{baseReserve !== null ? ` (${formatSol(baseReserve, 6)} SOL)` : ''}.
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

              {/* 2 buy */}
              <div className="glass glow">
                <div className="card-head">
                  <div className="row-flex">
                    <span className="step">2</span>
                    <span className="section-title">Buy</span>
                  </div>
                  {buySelected.length > 0 && (
                    <span className={overLimit ? 'tag tag-danger' : 'tag tag-accent'}>
                      {buySelected.length} {buySelected.length === 1 ? 'wallet' : 'wallets'}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div className="stack" style={{ gap: 9 }}>
                    <Line k="Pool" v={poolValid ? `${poolToken ? `${poolToken.symbol} · ` : ''}${truncateAddress(poolAddress, 6, 6)}` : 'Set a pool above'} />
                    <Line k="Wallets" v={buySelected.length === 0 ? 'Select wallets in the roster' : buySelected.length === 1 ? '1 (individual buy)' : `${buySelected.length}`} />
                  </div>

                  {overLimit && (
                    <div className="alert" role="alert" style={{ marginTop: 14 }}>
                      {buySelected.length} wallets selected. Buy from at most {MAX_BUY_WALLETS_PER_REQUEST} per request for now: each wallet takes
                      several seconds, and a longer run can outlast the server&apos;s timeout. Deselect {buySelected.length - MAX_BUY_WALLETS_PER_REQUEST} to continue.
                    </div>
                  )}

                  {buySelected.length >= 2 && (
                    <div className="field" style={{ marginTop: 20 }}>
                      <span className="label">Execution</span>
                      <div className="seg seg-sm" role="tablist" aria-label="Execution mode">
                        <button type="button" role="tab" aria-selected className="seg-opt">Sequential</button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={false}
                          aria-disabled
                          disabled
                          className="seg-opt"
                          title="Coming soon"
                          style={{ opacity: 0.45, cursor: 'not-allowed' }}
                        >
                          Bundle · coming soon
                        </button>
                      </div>
                      <div className="hint" style={{ fontSize: 11 }}>
                        Sequential buys from one wallet after another; each succeeds or fails on its own.
                      </div>
                    </div>
                  )}

                  <div className="field" style={{ marginTop: 20 }}>
                    <span className="label">Amount</span>
                    <Seg
                      small
                      options={AMOUNT_MODES}
                      value={amountMode}
                      onChange={v => { if (!buyLocked) { setAmountMode(v); setBuyError(null) } }}
                      label="Amount mode"
                    />
                  </div>

                  {amountMode === 'percent' ? (
                    <div className="field" style={{ marginTop: 14 }}>
                      <label className="label" htmlFor="cc-percent">
                        Of each wallet&apos;s available SOL
                        {'bps' in percent && <span className="label-value mono">{bpsLabel(percent.bps)}</span>}
                      </label>
                      <div className="row-flex" style={{ gap: 12, flexWrap: 'nowrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Range
                            min={1}
                            max={100}
                            step={1}
                            value={'bps' in percent ? Math.min(100, Math.max(1, Math.round(percent.bps / 100))) : 1}
                            onChange={v => { if (!buyLocked) { setPercentInput(String(v)); setBuyError(null) } }}
                          />
                        </div>
                        <input
                          id="cc-percent"
                          className="input mono"
                          value={percentInput}
                          onChange={e => { setPercentInput(e.target.value); setBuyError(null) }}
                          onKeyDown={e => { if (e.key === 'Enter') reviewBuy() }}
                          disabled={buyLocked}
                          inputMode="decimal"
                          placeholder="50"
                          aria-label="Percent of available"
                          aria-invalid={!!percentInput.trim() && 'error' in percent}
                          style={{ width: 86, fontSize: 12, textAlign: 'right' }}
                        />
                        <span className="meta">%</span>
                      </div>
                      {percentInput.trim() && 'error' in percent && <div className="alert-inline" style={{ marginTop: 8 }}>{percent.error}</div>}
                    </div>
                  ) : (
                    <div style={{ marginTop: 14 }}>
                      {buySelected.length === 0 ? (
                        <div className="hint">Select wallets in the roster to set an amount for each.</div>
                      ) : (
                        <div style={{ borderRadius: 10, border: '1px solid var(--line-soft)', overflow: 'hidden' }}>
                          <div className="t-head" style={{ gridTemplateColumns: amountCols, padding: '8px 12px' }}>
                            <span>#</span><span>Wallet</span><span className="t-right">Balance</span><span className="t-right">Buy (SOL)</span>
                          </div>
                          {perWallet.map(({ m, raw, parsed }) => {
                            const invalid = !!raw.trim() && 'error' in parsed
                            const balance = balances[m.public_key]?.lamports
                            const overBalance = 'lamports' in parsed && balance !== undefined && BigInt(parsed.lamports) >= BigInt(balance)
                            return (
                              <div key={m.wallet_id} className="t-row" style={{ gridTemplateColumns: amountCols, padding: '7px 12px', alignItems: 'center' }}>
                                <span className="t-cell-mono" style={{ color: 'var(--ink-4)' }}>{m.index}</span>
                                <span className="t-cell-mono" style={{ color: 'var(--ink-2)' }}>{truncateAddress(m.public_key, 5, 4)}</span>
                                <span className="t-cell-mono t-right" style={{ color: 'var(--ink-3)' }}>{balance !== undefined ? formatSol(balance, 4) : '—'}</span>
                                <input
                                  className="input mono"
                                  value={raw}
                                  onChange={e => setPerWalletAmount(m.public_key, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') reviewBuy() }}
                                  disabled={buyLocked}
                                  inputMode="decimal"
                                  placeholder="0.05"
                                  aria-label={`SOL to spend from wallet ${m.index}`}
                                  aria-invalid={invalid || overBalance}
                                  title={invalid ? (parsed as { error: string }).error : overBalance ? 'More than this wallet holds' : undefined}
                                  style={{ fontSize: 12, textAlign: 'right', padding: '6px 9px', borderColor: invalid || overBalance ? 'var(--danger-line)' : undefined }}
                                />
                              </div>
                            )
                          })}
                          <div className="t-row" style={{ gridTemplateColumns: amountCols, padding: '8px 12px' }}>
                            <span /><span className="meta">Total</span><span />
                            <span className="t-cell-mono t-right" style={{ color: 'var(--ink-1)' }}>
                              {perWalletLamports.length ? formatSol(perWalletTotal, 6) : '—'}
                            </span>
                          </div>
                        </div>
                      )}
                      {firstPerWalletError && 'error' in firstPerWalletError.parsed && (
                        <div className="alert-inline" style={{ marginTop: 8 }}>
                          Wallet #{firstPerWalletError.m.index}: {firstPerWalletError.parsed.error}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="hint" style={{ fontSize: 11, marginTop: 12 }}>
                    {baseReserve !== null ? (
                      <>&ldquo;Available&rdquo; is a wallet&apos;s balance minus a {formatSol(baseReserve, 6)} SOL reserve kept back for fees and rent,
                      including its new token account. Wallets with nothing available can&apos;t be selected for a buy.</>
                    ) : reserveError ? (
                      <span className="alert-inline">
                        {reserveError}.{' '}
                        <button type="button" className="btn-link" onClick={() => void fetchReserve()}>Retry</button>
                      </span>
                    ) : 'Loading the per-wallet reserve…'}
                    {' '}The server works this out again at buy time and rejects any wallet whose amount is above it.
                  </div>

                  {buyError && (
                    buyError.uncertain ? (
                      <div className="alert" role="alert" style={{ marginTop: 16 }}>
                        {buyError.message} The outcome is unknown: some buys may have gone through.
                        Balances are being re-read; before trying again, check each selected wallet on Solscan.
                      </div>
                    ) : (
                      <div className="alert-inline" role="alert" style={{ marginTop: 14 }}>{buyError.message}</div>
                    )
                  )}
                </div>

                {pendingBuy ? (
                  <div className="callout" style={{ margin: '0 20px 18px' }} aria-live="polite">
                    <div className="kicker kicker-accent" style={{ letterSpacing: '.16em' }}>Confirm · spends real SOL</div>
                    <div className="stack" style={{ gap: 9, marginTop: 13 }}>
                      <Line k="Pool" v={truncateAddress(pendingBuy.body.poolAddress, 6, 6)} />
                      <Line k="Wallets" v={`${pendingBuy.body.walletPublicKeys.length} from ${pendingBuy.groupName}`} />
                      <Line k="Mode" v={pendingBuy.body.walletPublicKeys.length === 1 ? 'Individual' : 'Sequential'} />
                      {pendingBuy.body.amountMode === 'percent' ? (
                        <Line k="Amount" v={`${bpsLabel(pendingBuy.body.percentBps)} of available, per wallet`} strong />
                      ) : (
                        <Line k="Amount" v={`${lamportsToSolString(pendingBuy.totalLamports ?? '0')} SOL total (per-wallet amounts)`} strong />
                      )}
                    </div>
                    {buying && (
                      <div className="hint" style={{ fontSize: 11, marginTop: 13 }}>
                        Buying from {pendingBuy.body.walletPublicKeys.length === 1 ? 'the wallet' : 'each wallet in turn'} and waiting for on-chain
                        confirmation. This takes several seconds per wallet; keep this tab open to see the result.
                      </div>
                    )}
                    <div className="row-flex" style={{ justifyContent: 'flex-end', gap: 7, marginTop: 15 }}>
                      <button type="button" className="btn" disabled={buying} onClick={() => setPendingBuy(null)}>Cancel</button>
                      <button type="button" className="btn btn-accent" disabled={buying} onClick={confirmBuy}>
                        {buying ? 'Buying…' : 'Confirm and buy'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card-foot">
                    <span className="meta" style={{ color: buyBlocker ? 'var(--ink-4)' : undefined }}>
                      {buyBlocker ?? (amountMode === 'percent' && 'bps' in percent
                        ? `${bpsLabel(percent.bps)} of available from ${buySelected.length} ${buySelected.length === 1 ? 'wallet' : 'wallets'}`
                        : `${formatSol(perWalletTotal, 6)} SOL from ${buySelected.length} ${buySelected.length === 1 ? 'wallet' : 'wallets'}`)}
                    </span>
                    <button type="button" className="btn btn-accent" disabled={buying || !!buyBlocker} onClick={reviewBuy}>
                      Buy
                    </button>
                  </div>
                )}

                {buyResult && (
                  <BuyResultView
                    request={buyResult.request}
                    result={buyResult.result}
                    onDismiss={() => setBuyResult(null)}
                  />
                )}
              </div>

              {/* withdraw (real SOL, the selected wallets → one destination) */}
              <div className="glass glow">
                <div className="card-head">
                  <span className="section-title">Withdraw</span>
                  {rosterPurpose === 'withdraw' ? (
                    withdrawSelected.length > 0 && (
                      <span className="tag tag-accent">
                        {withdrawSelected.length} {withdrawSelected.length === 1 ? 'wallet' : 'wallets'}
                      </span>
                    )
                  ) : (
                    <button type="button" className="btn-link" disabled={buyLocked} onClick={() => changeRosterPurpose('withdraw')}>
                      Select wallets to withdraw →
                    </button>
                  )}
                </div>
                <WithdrawPanel
                  sources={withdrawSelected.map(m => ({ publicKey: m.public_key, label: `#${m.index}`, lamports: balances[m.public_key]?.lamports }))}
                  quickPicks={fundingWallets.map(w => ({ publicKey: w.public_key, label: 'your funding wallet' }))}
                  context={openGroup ? `from ${openGroup.name}` : undefined}
                  emptyHint={rosterPurpose === 'withdraw' ? 'Select wallets in the roster' : 'Switch the roster to Withdraw to select wallets'}
                  onFundsMoved={afterWithdraw}
                />
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
                    {stats ? `${stats.funded === null ? '' : `${stats.funded} funded · `}${sol(stats.lamports)} SOL` : 'Balances not synced'}
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

/** Per-wallet buy outcomes, matched to wallets by public key. */
function BuyResultView({ request, result, onDismiss }: {
  request: BuyRequest
  result: BuyResult
  onDismiss: () => void
}) {
  const total = result.results.length
  const confirmed = result.results.filter(r => r.status === 'confirmed')
  const failed = result.results.filter(r => r.status === 'failed')
  const spentLamports = confirmed.reduce((sum, r) => sum + BigInt(r.amountIn ?? '0'), BigInt(0)).toString()
  const anySendFailed = failed.some(r => r.error === 'SEND_FAILED')
  const label = failed.length === 0 ? 'Confirmed' : confirmed.length === 0 ? 'Failed' : 'Partial'

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }} aria-live="polite">
      <div className="card-head" style={{ borderBottom: 0, paddingBottom: 8 }}>
        <div className="row-flex" style={{ gap: 9 }}>
          <span className="section-title" style={{ fontSize: 13.5 }}>Result · {request.groupName}</span>
          <span className={failed.length ? 'tag tag-danger' : 'tag tag-accent'}>{label}</span>
        </div>
        <button type="button" className="btn btn-xs" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="meta" style={{ padding: '0 20px 12px' }}>
        Bought from {confirmed.length} of {total} {total === 1 ? 'wallet' : 'wallets'} · {formatSol(spentLamports, 6)} SOL spent · pool {truncateAddress(request.body.poolAddress, 6, 6)}
      </div>

      {failed.length > 0 && (
        <div className="alert" role="alert" style={{ margin: '0 20px 14px' }}>
          {failed.length} of {total} {total === 1 ? 'wallet' : 'wallets'} did not buy; the reason is under each one below.
          {confirmed.length > 0 && <> The confirmed buys are final. Running Buy again with the same selection buys again from <strong>every</strong> selected wallet, so deselect the confirmed ones first.</>}
          {anySendFailed && <> A wallet marked &ldquo;not confirmed&rdquo; may still have bought: check it on Solscan before retrying it.</>}
        </div>
      )}

      {result.results.map(r => {
        const index = request.indexByKey[r.publicKey]
        const ok = r.status === 'confirmed'
        return (
          <div key={r.publicKey} style={{ padding: '10px 20px', borderBottom: '1px solid rgba(233,233,237,.05)' }}>
            <div className="row-flex" style={{ gap: 10, flexWrap: 'nowrap' }}>
              <StatusIcon status={r.status} />
              <span className="t-cell-mono" style={{ color: 'var(--ink-4)', minWidth: 22 }}>{index !== undefined ? `#${index}` : ''}</span>
              <span className="t-cell-mono" style={{ color: 'var(--ink-2)' }}>{truncateAddress(r.publicKey, 5, 4)}</span>
              <span className="t-cell-mono" style={{ color: ok ? 'var(--ink-1)' : 'var(--ink-4)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {r.amountIn ? `${formatSol(r.amountIn, 6)} SOL` : '—'}
              </span>
              <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap', minWidth: 120, textAlign: 'right' }}>
                {ok && r.signature
                  ? <SolscanLink kind="tx" id={r.signature}>{truncateAddress(r.signature, 6, 6)}</SolscanLink>
                  : <span style={{ color: ok ? 'var(--accent-400)' : 'var(--danger)' }}>{ok ? 'confirmed' : r.error === 'SEND_FAILED' ? 'not confirmed' : 'failed'}</span>}
              </span>
            </div>
            {!ok && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6, paddingLeft: 23, wordBreak: 'break-word' }}>
                {r.error === 'SEND_FAILED' ? (
                  <>Not confirmed — check the wallet on <SolscanLink kind="account" id={r.publicKey}>Solscan</SolscanLink> before retrying, it may have landed.</>
                ) : (
                  r.message ?? r.error ?? 'Failed'
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
