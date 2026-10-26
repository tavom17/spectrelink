'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '@/lib/auth'
import { useApiFetch, ApiError } from '@/lib/api'
import { Sheet, SheetHead, Seg, CopyButton, ChevronDown, CheckIcon } from '@/components/ui'
import { WALLET_TYPE_HOLDINGS } from '@/lib/placeholders'

/** GET /api/wallets/listWallets — one row per wallet, [] when none */
interface Wallet {
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
  wallet_id: string
}

/** POST /api/wallets/slaveWallets returns an array of these; /fundingWallets returns one */
interface CreatedWallet {
  wallet_id: string
  public_key: string
}

/** GET /api/wallets/bundleGroups — newest first, [] when none */
interface BundleGroup {
  group_id: string
  group_name: string
  created_at: string
}

/** POST /api/wallets/bundleGroups */
interface CreatedBundleGroup {
  groupID: string
  label: string
  publicKeys: string[]
}

/** GET /api/wallets/bundleGroups/:groupID/wallets — ordered by position */
interface BundleGroupWallet {
  position: number
  wallet_id: string
  public_key: string
}

type Filter = 'all' | Wallet['wallet_type']

const TYPE_ORDER = ['master', 'funding', 'fee', 'slave'] as const
const PAGE_SIZE = 10
const MAX_SLAVES = 25
const GROUP_SIZES = [5, 10, 15, 20, 25] as const
const GROUP_LABEL_MAX = 64

function truncate(pk: string) {
  return `${pk.slice(0, 6)}…${pk.slice(-6)}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function errorStatus(err: unknown) {
  return err instanceof ApiError ? err.status : 0
}

const TYPE_CARDS = [
  { id: 'funding', label: 'Funding wallets', desc: 'Hold treasury SOL and pay for launches and distributions.' },
  { id: 'slave',   label: 'Slave wallets',   desc: 'Bundle buyers. Funded per job, rotated between launches.' },
  { id: 'fee',     label: 'Fee wallets',     desc: 'Receive creator fees and pool claim payouts.' },
] as const

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'master', label: 'Master' },
  { id: 'funding', label: 'Funding' },
  { id: 'fee', label: 'Fee' },
  { id: 'slave', label: 'Slave' },
] as const satisfies readonly { id: Filter; label: string }[]

export default function WalletManager() {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loadingWallets, setLoadingWallets] = useState(true)
  const [error, setError] = useState('')
  const [slaveCount, setSlaveCount] = useState(1)
  const [creating, setCreating] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')

  // balances: undefined = not fetched, null = error, number = SOL
  const [balances, setBalances] = useState<Record<string, number | null | undefined>>({})
  const fetchingRef = useRef<Set<string>>(new Set())

  // Withdraw modal
  const [withdrawWallet, setWithdrawWallet] = useState<Wallet | null>(null)
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')
  const [withdrawSuccess, setWithdrawSuccess] = useState(false)

  // Bundle groups
  const [groups, setGroups] = useState<BundleGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [groupsError, setGroupsError] = useState('')
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupSize, setNewGroupSize] = useState<number>(10)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupNameError, setGroupNameError] = useState('')
  const [groupFormError, setGroupFormError] = useState('')
  const [createdGroup, setCreatedGroup] = useState<CreatedBundleGroup | null>(null)

  // Bundle group detail sheet
  const [openGroup, setOpenGroup] = useState<BundleGroup | null>(null)
  const [groupWallets, setGroupWallets] = useState<BundleGroupWallet[] | null>(null)
  const [groupWalletsError, setGroupWalletsError] = useState('')
  const [groupNotFound, setGroupNotFound] = useState(false)

  const fetchWallets = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Wallet[]>('/api/wallets/listWallets')
      setWallets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallets')
    } finally {
      setLoadingWallets(false)
    }
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchWallets() }, [fetchWallets])

  const fetchGroups = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<BundleGroup[]>('/api/wallets/bundleGroups')
      setGroups(data)
      setGroupsError('')
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : 'Failed to load bundle groups')
    } finally {
      setLoadingGroups(false)
    }
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchGroups() }, [fetchGroups])

  /** Fetches one wallet's balance into `balances`, skipping keys already in flight. */
  function loadBalance(publicKey: string) {
    if (fetchingRef.current.has(publicKey)) return
    fetchingRef.current.add(publicKey)
    apiFetch<{ balance: number }>(`/api/wallets/balance?public_key=${encodeURIComponent(publicKey)}`)
      .then(data => setBalances(prev => ({ ...prev, [publicKey]: typeof data.balance === 'number' ? data.balance : null })))
      .catch(() => setBalances(prev => ({ ...prev, [publicKey]: null })))
      .finally(() => fetchingRef.current.delete(publicKey))
  }

  const sorted = [...wallets].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.wallet_type as typeof TYPE_ORDER[number]) -
      TYPE_ORDER.indexOf(b.wallet_type as typeof TYPE_ORDER[number])
  )
  const filtered = filter === 'all' ? sorted : sorted.filter(w => w.wallet_type === filter)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageWallets = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Fetch balances only for wallets currently visible on this page
  useEffect(() => {
    if (!accessToken || pageWallets.length === 0) return
    pageWallets.forEach(w => {
      if (balances[w.public_key] === undefined) loadBalance(w.public_key)
    })
  }, [page, filter, wallets, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the open group's wallets, then their balances (one balance call per key)
  useEffect(() => {
    if (!openGroup || !accessToken) return
    let cancelled = false
    setGroupWallets(null)
    setGroupWalletsError('')
    setGroupNotFound(false)
    apiFetch<BundleGroupWallet[]>(`/api/wallets/bundleGroups/${encodeURIComponent(openGroup.group_id)}/wallets`)
      .then(data => {
        if (cancelled) return
        setGroupWallets(data)
        data.forEach(w => { if (balances[w.public_key] === undefined) loadBalance(w.public_key) })
      })
      .catch(err => {
        if (cancelled) return
        if (errorStatus(err) === 404) setGroupNotFound(true)
        else setGroupWalletsError(err instanceof Error ? err.message : 'Failed to load group wallets')
      })
    return () => { cancelled = true }
  }, [openGroup?.group_id]) // eslint-disable-line react-hooks/exhaustive-deps

  function changeFilter(next: Filter) {
    setFilter(next)
    setPage(0)
  }

  async function createWallet(type: 'slave' | 'funding' | 'fee') {
    if (!accessToken) return
    setCreating(type)
    setError('')
    try {
      if (type === 'slave') {
        const created = await apiFetch<CreatedWallet[]>('/api/wallets/slaveWallets', {
          method: 'POST',
          body: JSON.stringify({ amountOfSlaves: slaveCount }),
        })
        setWallets(prev => [...prev, ...created.map(w => ({ ...w, wallet_type: 'slave' as const }))])
      } else if (type === 'funding') {
        const created = await apiFetch<CreatedWallet>('/api/wallets/fundingWallets', { method: 'POST', body: JSON.stringify({}) })
        setWallets(prev => [...prev, { ...created, wallet_type: 'funding' }])
      } else {
        await apiFetch('/api/wallets/feeWallets', { method: 'POST', body: JSON.stringify({}) })
        await fetchWallets()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
    } finally {
      setCreating(null)
    }
  }

  function openWithdraw(wallet: Wallet) {
    setWithdrawWallet(wallet)
    setWithdrawRecipient('')
    setWithdrawAmount('')
    setWithdrawError('')
    setWithdrawSuccess(false)
  }

  function closeWithdraw() {
    if (withdrawing) return
    setWithdrawWallet(null)
    setWithdrawSuccess(false)
  }

  async function handleWithdraw() {
    if (!withdrawWallet) return
    const amount = parseFloat(withdrawAmount)
    if (!withdrawRecipient.trim() || isNaN(amount) || amount <= 0) {
      setWithdrawError('Enter a valid recipient address and amount.')
      return
    }
    setWithdrawing(true)
    setWithdrawError('')
    try {
      await apiFetch('/api/wallets/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          wallet_id: withdrawWallet.wallet_id,
          wallet_type: withdrawWallet.wallet_type,
          destination: withdrawRecipient.trim(),
          amount,
        }),
      })
      setWithdrawSuccess(true)
      // Refresh balance for this wallet after success
      setBalances(prev => ({ ...prev, [withdrawWallet.public_key]: undefined }))
      fetchingRef.current.delete(withdrawWallet.public_key)
      loadBalance(withdrawWallet.public_key)
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    if (creatingGroup) return
    const label = newGroupName.trim()
    if (label.length < 1 || label.length > GROUP_LABEL_MAX) {
      setGroupNameError(`Group name must be 1–${GROUP_LABEL_MAX} characters.`)
      return
    }
    setCreatingGroup(true)
    setGroupNameError('')
    setGroupFormError('')
    try {
      const created = await apiFetch<CreatedBundleGroup>('/api/wallets/bundleGroups', {
        method: 'POST',
        body: JSON.stringify({ amountOfSlaves: newGroupSize, label }),
      })
      // The create response has no created_at; the list is newest-first, so prepend with the client time
      setGroups(prev => [{ group_id: created.groupID, group_name: created.label, created_at: new Date().toISOString() }, ...prev])
      setCreatedGroup(created)
      setNewGroupName('')
      setGroupsOpen(true)
      // The group's slave wallets are new registry rows too
      fetchWallets()
    } catch (err) {
      const status = errorStatus(err)
      const message = err instanceof Error ? err.message : ''
      if (status === 409) setGroupNameError('A bundle group with that name already exists.')
      else if (status === 400) setGroupFormError(message || 'Invalid bundle group request.')
      else if (status === 401) setGroupFormError(message || 'Session expired. Please log in again.')
      else setGroupFormError('Something went wrong creating the bundle group. Please try again.')
    } finally {
      setCreatingGroup(false)
    }
  }

  function closeGroup() {
    setOpenGroup(null)
  }

  const counts = {
    slave:   wallets.filter(w => w.wallet_type === 'slave').length,
    funding: wallets.filter(w => w.wallet_type === 'funding').length,
    fee:     wallets.filter(w => w.wallet_type === 'fee').length,
  }

  const currentBalance = withdrawWallet ? balances[withdrawWallet.public_key] : undefined

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">HD-derived Solana wallet management</div>
        <div className="meta">{loadingWallets ? 'Loading…' : `${wallets.length} total`}</div>
      </div>

      {error && <div className="alert" style={{ marginBottom: 14 }}>{error}</div>}

      {/* ── wallet types ─────────────────────────────────────────── */}
      <div className="grid-auto" style={{ '--min': '255px' } as React.CSSProperties}>
        {TYPE_CARDS.map(t => {
          const active = filter === t.id
          const holdings = WALLET_TYPE_HOLDINGS[t.id]
          return (
            <div
              key={t.id}
              className="glass glow glow-bright lift"
              onClick={() => changeFilter(active ? 'all' : t.id)}
              style={{ padding: '20px 22px', cursor: 'pointer', borderColor: active ? 'rgba(145,132,217,.42)' : undefined, '--glow-size': '260px' } as React.CSSProperties}
              aria-pressed={active}
              title={active ? 'Show all wallets' : `Show ${t.id} wallets in the registry`}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="kicker">{t.label}</span>
                <ChevronDown size={11} style={{ color: 'var(--ink-4)', transition: 'transform .2s', transform: active ? 'rotate(180deg)' : 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 14 }}>
                <span className="mono" style={{ fontSize: 34, letterSpacing: '-.02em' }}>{loadingWallets ? '—' : counts[t.id]}</span>
                <span className="hint">wallets</span>
              </div>
              <div className="row-flex" style={{ gap: 18, marginTop: 14 }} title="Placeholder values — not wired to the API yet">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="kicker" style={{ fontSize: 9, letterSpacing: '.16em' }}>Holdings</span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{holdings.sol} SOL</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="kicker" style={{ fontSize: 9, letterSpacing: '.16em' }}>Funded</span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{holdings.funded}</span>
                </div>
                <span className="tag" style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: 8.5 }}>Preview</span>
              </div>
              <div className="hint" style={{ marginTop: 16 }}>{t.desc}</div>

              <div
                className="row-flex"
                style={{ gap: 9, marginTop: 16, paddingTop: 15, borderTop: '1px solid rgba(233,233,237,.07)' }}
                onClick={e => e.stopPropagation()}
              >
                {t.id === 'slave' && (
                  <input
                    type="number"
                    min={1}
                    max={MAX_SLAVES}
                    value={slaveCount}
                    onChange={e => setSlaveCount(Math.max(1, Math.min(MAX_SLAVES, Number(e.target.value))))}
                    className="input mono"
                    aria-label="Number of slave wallets to create"
                    style={{ width: 64, padding: '8px 10px', fontSize: 12 }}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-accent btn-sm"
                  onClick={() => createWallet(t.id)}
                  disabled={creating !== null}
                >
                  {creating === t.id ? 'Creating…' : 'Create →'}
                </button>
                {t.id === 'slave' && <span className="hint" style={{ fontSize: 11 }}>up to {MAX_SLAVES} at once</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── bundle groups ────────────────────────────────────────── */}
      <div className="glass glow" style={{ marginTop: 14, '--glow-size': '400px' } as React.CSSProperties}>
        <div className="card-head">
          <span className="step-title">Bundle groups</span>
          <span className="meta">{loadingGroups ? 'Loading…' : `${groups.length} groups`}</span>
        </div>
        <div style={{ padding: '18px 20px 20px' }}>
          <form
            onSubmit={createGroup}
            noValidate
            style={{ padding: '17px 18px', borderRadius: 13, border: '1px dashed rgba(145,132,217,.34)', background: 'rgba(66,58,106,.16)' }}
          >
            <div className="kicker kicker-accent">Create a group</div>
            <div className="row-flex" style={{ alignItems: 'flex-end', gap: 12, marginTop: 14 }}>
              <div className="field" style={{ flex: '1 1 190px' }}>
                <label className="label" htmlFor="wm-group-name">Group name</label>
                <input
                  id="wm-group-name"
                  className="input"
                  placeholder="e.g. Launch set B"
                  maxLength={GROUP_LABEL_MAX}
                  value={newGroupName}
                  onChange={e => { setNewGroupName(e.target.value); setGroupNameError('') }}
                  disabled={creatingGroup}
                  aria-invalid={!!groupNameError}
                  aria-describedby={groupNameError ? 'wm-group-name-err' : undefined}
                />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label className="label" htmlFor="wm-group-size">Wallets</label>
                <select
                  id="wm-group-size"
                  className="input mono"
                  value={newGroupSize}
                  onChange={e => setNewGroupSize(Number(e.target.value))}
                  disabled={creatingGroup}
                >
                  {GROUP_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-accent" disabled={creatingGroup}>
                {creatingGroup ? 'Creating…' : 'Create group →'}
              </button>
            </div>
            {groupNameError && <div id="wm-group-name-err" className="alert-inline" style={{ marginTop: 9 }}>{groupNameError}</div>}
            {groupFormError && <div className="alert" style={{ marginTop: 12 }}>{groupFormError}</div>}
            <div className="hint" style={{ marginTop: 11 }}>Derives {newGroupSize} new slave wallets and assigns them to the group.</div>

            {createdGroup && (
              <div style={{ marginTop: 16, paddingTop: 15, borderTop: '1px solid rgba(233,233,237,.07)' }}>
                <div className="row-flex" style={{ justifyContent: 'space-between' }}>
                  <span className="kicker">Created “{createdGroup.label}” · {createdGroup.publicKeys.length} wallets</span>
                  <button type="button" className="btn btn-xs" onClick={() => setCreatedGroup(null)}>Dismiss</button>
                </div>
                <div className="stack" style={{ gap: 4, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
                  {createdGroup.publicKeys.map((pk, i) => (
                    <div key={pk} className="row-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <span className="t-cell-mono" style={{ color: 'var(--ink-4)', width: 22 }}>{String(i).padStart(2, '0')}</span>
                      <span className="t-cell-mono" style={{ color: 'var(--ink-1)' }} title={pk}>{truncate(pk)}</span>
                      <CopyButton text={pk} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>

          <button type="button" className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => setGroupsOpen(o => !o)} aria-expanded={groupsOpen}>
            <ChevronDown size={11} style={{ transition: 'transform .3s var(--ease)', transform: groupsOpen ? 'none' : 'rotate(-90deg)' }} />
            {groupsOpen ? 'Hide groups' : 'Show groups'}
          </button>

          <div style={{ overflow: 'hidden', transition: 'max-height .45s var(--ease), opacity .3s ease', maxHeight: groupsOpen ? 1600 : 0, opacity: groupsOpen ? 1 : 0 }}>
            {groupsError ? (
              <div className="alert" style={{ marginTop: 16 }}>{groupsError}</div>
            ) : loadingGroups ? (
              <div className="empty">Loading bundle groups…</div>
            ) : groups.length === 0 ? (
              <div className="empty">No bundle groups yet. Create one above.</div>
            ) : (
              <div className="grid-fill" style={{ '--min': '190px', gap: 12, paddingTop: 16, maxHeight: 1560, overflowY: 'auto' } as React.CSSProperties}>
                {groups.map(g => (
                  <div
                    key={g.group_id}
                    className="glass glow glow-bright lift"
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenGroup(g)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenGroup(g) } }}
                    title="View group wallets"
                    style={{ padding: '15px 16px', borderRadius: 13, cursor: 'pointer', '--glow-size': '200px' } as React.CSSProperties}
                  >
                    <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.group_name}</div>
                    <div className="meta" style={{ marginTop: 9 }}>Created {formatDate(g.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── registry ─────────────────────────────────────────────── */}
      <div className="glass glow" style={{ marginTop: 14, '--glow-size': '420px' } as React.CSSProperties}>
        <div className="card-head">
          <span className="step-title">Wallet registry</span>
          <div className="row-flex">
            <Seg small options={FILTERS} value={filter} onChange={changeFilter} label="Wallet type" />
            <span className="meta">{filtered.length} shown</span>
          </div>
        </div>

        {loadingWallets ? (
          <div className="empty">Loading wallets…</div>
        ) : wallets.length === 0 ? (
          <div className="empty">No wallets found. Create slave, funding, or fee wallets above.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No {filter} wallets yet.</div>
        ) : (
          <>
            <div className="t-scroll">
              <div style={{ minWidth: 620 }}>
                <div className="t-head" style={{ gridTemplateColumns: '34px 84px 1fr 130px 110px' }}>
                  <span>#</span><span>Type</span><span>Public key</span><span className="t-right">Balance</span><span className="t-right">Action</span>
                </div>
                {pageWallets.map((w, i) => {
                  const bal = balances[w.public_key]
                  const balStr = bal === undefined ? '—' : bal === null ? 'err' : `${bal.toFixed(4)} SOL`
                  const balColor = bal === undefined || bal === null ? 'var(--ink-5)' : bal === 0 ? 'var(--ink-3)' : 'var(--ink-1)'
                  return (
                    <div key={w.public_key} className="t-row hover glow glow-sm" style={{ gridTemplateColumns: '34px 84px 1fr 130px 110px' }}>
                      <span className="t-cell-mono" style={{ color: 'var(--ink-4)' }}>{String(page * PAGE_SIZE + i + 1).padStart(2, '0')}</span>
                      <span>
                        <span className={w.wallet_type === 'master' ? 'tag tag-accent' : 'tag'} style={{ fontSize: 8.5 }}>{w.wallet_type}</span>
                      </span>
                      <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                        <span className="t-cell-mono" style={{ color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.public_key}</span>
                        <CopyButton text={w.public_key} />
                      </div>
                      <span className="t-cell-mono t-right" style={{ color: balColor }}>{balStr}</span>
                      <div className="t-right">
                        {w.wallet_type !== 'master' && (
                          <button type="button" className="btn btn-xs" onClick={() => openWithdraw(w)}>Withdraw</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {totalPages > 1 && (
              <div className="pager">
                <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">←</button>
                <span>{page + 1} / {totalPages}</span>
                <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} aria-label="Next page">→</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── bundle group detail ──────────────────────────────────── */}
      {openGroup && (
        <Sheet onClose={closeGroup} width={560} labelledBy="bg-title">
          <SheetHead
            id="bg-title"
            title={openGroup.group_name}
            sub={`Created ${formatDate(openGroup.created_at)}${groupWallets ? ` · ${groupWallets.length} wallets` : ''}`}
            onClose={closeGroup}
          />
          {groupNotFound ? (
            <div className="empty">Bundle group not found.</div>
          ) : groupWalletsError ? (
            <div className="sheet-body"><div className="alert">{groupWalletsError}</div></div>
          ) : groupWallets === null ? (
            <div className="empty">Loading wallets…</div>
          ) : (
            <div>
              <div className="t-head" style={{ gridTemplateColumns: '40px 1fr 130px', padding: '10px 26px' }}>
                <span>Pos</span><span>Public key</span><span className="t-right">Balance</span>
              </div>
              {groupWallets.map(w => {
                const bal = balances[w.public_key]
                const balStr = bal === undefined ? '—' : bal === null ? 'err' : `${bal.toFixed(4)} SOL`
                const balColor = bal === undefined || bal === null ? 'var(--ink-5)' : bal === 0 ? 'var(--ink-3)' : 'var(--ink-1)'
                return (
                  <div key={w.wallet_id} className="t-row glow glow-sm" style={{ gridTemplateColumns: '40px 1fr 130px', padding: '12px 26px' }}>
                    <span className="t-cell-mono" style={{ color: 'var(--ink-4)' }}>{String(w.position).padStart(2, '0')}</span>
                    <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                      <span className="t-cell-mono" style={{ color: 'var(--ink-1)' }} title={w.public_key}>{truncate(w.public_key)}</span>
                      <CopyButton text={w.public_key} />
                    </div>
                    <span className="t-cell-mono t-right" style={{ color: balColor }}>{balStr}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Sheet>
      )}

      {/* ── withdraw ─────────────────────────────────────────────── */}
      {withdrawWallet && (
        <Sheet onClose={closeWithdraw} width={500} labelledBy="wd-title">
          <SheetHead id="wd-title" title="Withdraw SOL" sub={`${withdrawWallet.wallet_type} wallet`} onClose={closeWithdraw} />

          <div className="sheet-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--text)' }}>
              <QRCodeSVG value={withdrawWallet.public_key} size={148} bgColor="#e9e9ed" fgColor="#161826" />
            </div>
            <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap', maxWidth: '100%' }}>
              <span className="addr" style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center' }}>{withdrawWallet.public_key}</span>
              <CopyButton text={withdrawWallet.public_key} />
            </div>
          </div>

          <div className="sheet-body">
            {withdrawSuccess ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ width: 40, height: 40, margin: '0 auto 14px', borderRadius: '50%', border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-300)' }}>
                  <CheckIcon size={16} />
                </div>
                <div style={{ fontSize: 14, marginBottom: 22 }}>Withdrawal submitted</div>
                <button type="button" className="btn" onClick={closeWithdraw}>Close</button>
              </div>
            ) : (
              <div className="stack" style={{ gap: 18 }}>
                <div className="field">
                  <label className="label" htmlFor="wd-to">Recipient address</label>
                  <input
                    id="wd-to"
                    className="input mono"
                    type="text"
                    placeholder="Solana wallet address..."
                    value={withdrawRecipient}
                    onChange={e => setWithdrawRecipient(e.target.value)}
                    disabled={withdrawing}
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="wd-amt">
                    Amount (SOL)
                    {typeof currentBalance === 'number' && (
                      <span className="label-value mono" style={{ color: 'var(--ink-3)' }}>Available: {currentBalance.toFixed(4)} SOL</span>
                    )}
                  </label>
                  <div className="row-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <input
                      id="wd-amt"
                      className="input mono"
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="0.0000"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      disabled={withdrawing}
                    />
                    {typeof currentBalance === 'number' && currentBalance > 0 && (
                      <button type="button" className="btn" onClick={() => setWithdrawAmount(String(currentBalance))} disabled={withdrawing}>
                        Max
                      </button>
                    )}
                  </div>
                </div>

                {withdrawError && <div className="alert">{withdrawError}</div>}

                <div className="row-flex" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={closeWithdraw} disabled={withdrawing}>Cancel</button>
                  <button type="button" className="btn btn-accent" onClick={handleWithdraw} disabled={withdrawing}>
                    {withdrawing ? 'Sending…' : 'Confirm →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}
