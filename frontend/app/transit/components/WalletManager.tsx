'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'
import { Sheet, SheetHead, Seg, PreviewTag, CopyButton, ChevronDown, CheckIcon } from '@/components/ui'
import { WALLET_TYPE_HOLDINGS, BUNDLE_GROUPS, type PlaceholderGroup } from '@/lib/placeholders'

interface Wallet {
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
  wallet_id: string
}

type Filter = 'all' | Wallet['wallet_type']

const TYPE_ORDER = ['master', 'funding', 'fee', 'slave'] as const
const PAGE_SIZE = 10

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

  // Bundle groups — placeholder until the groups endpoint exists
  const [groups, setGroups] = useState<PlaceholderGroup[]>(BUNDLE_GROUPS)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupSize, setNewGroupSize] = useState('10')

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
      if (balances[w.public_key] !== undefined) return
      if (fetchingRef.current.has(w.public_key)) return
      fetchingRef.current.add(w.public_key)
      apiFetch<{ balance: number }>(`/api/wallets/balance?public_key=${encodeURIComponent(w.public_key)}`)
        .then(data => setBalances(prev => ({ ...prev, [w.public_key]: data.balance })))
        .catch(() => setBalances(prev => ({ ...prev, [w.public_key]: null })))
        .finally(() => fetchingRef.current.delete(w.public_key))
    })
  }, [page, filter, wallets, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

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
        await apiFetch('/api/wallets/slaveWallets', {
          method: 'POST',
          body: JSON.stringify({ amountOfSlaves: slaveCount }),
        })
      } else if (type === 'funding') {
        await apiFetch('/api/wallets/fundingWallets', { method: 'POST', body: JSON.stringify({}) })
      } else {
        await apiFetch('/api/wallets/feeWallets', { method: 'POST', body: JSON.stringify({}) })
      }
      await fetchWallets()
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
      apiFetch<{ balance: number }>(`/api/wallets/balance?public_key=${encodeURIComponent(withdrawWallet.public_key)}`)
        .then(data => setBalances(prev => ({ ...prev, [withdrawWallet.public_key]: data.balance })))
        .catch(() => setBalances(prev => ({ ...prev, [withdrawWallet.public_key]: null })))
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }

  /** Placeholder: adds a group locally. */
  function createGroup() {
    const label = newGroupName.trim() || `Group ${groups.length + 1}`
    const size = Math.max(1, parseInt(newGroupSize, 10) || 10)
    setGroups(prev => [...prev, { id: `g${Date.now()}`, label, size, funded: 0, sol: '0.0000' }])
    setNewGroupName('')
    setNewGroupSize('10')
    setGroupsOpen(true)
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
                    max={20}
                    value={slaveCount}
                    onChange={e => setSlaveCount(Math.max(1, Math.min(20, Number(e.target.value))))}
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
                {t.id === 'slave' && <span className="hint" style={{ fontSize: 11 }}>up to 20 at once</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── bundle groups (placeholder) ──────────────────────────── */}
      <div className="glass glow" style={{ marginTop: 14, '--glow-size': '400px' } as React.CSSProperties}>
        <div className="card-head">
          <span className="step-title">Bundle groups</span>
          <div className="row-flex">
            <span className="meta">{groups.length} groups · {groups.reduce((a, g) => a + g.size, 0)} wallets assigned</span>
            <PreviewTag />
          </div>
        </div>
        <div style={{ padding: '18px 20px 20px' }}>
          <div style={{ padding: '17px 18px', borderRadius: 13, border: '1px dashed rgba(145,132,217,.34)', background: 'rgba(66,58,106,.16)' }}>
            <div className="kicker kicker-accent">Create a group</div>
            <div className="row-flex" style={{ alignItems: 'flex-end', gap: 12, marginTop: 14 }}>
              <div className="field" style={{ flex: '1 1 190px' }}>
                <label className="label" htmlFor="wm-group-name">Group name</label>
                <input id="wm-group-name" className="input" placeholder="e.g. Launch set B" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label className="label" htmlFor="wm-group-size">Wallets</label>
                <input id="wm-group-size" className="input mono" inputMode="numeric" value={newGroupSize} onChange={e => setNewGroupSize(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
              <button type="button" className="btn btn-accent" onClick={createGroup}>Create group →</button>
            </div>
            <div className="hint" style={{ marginTop: 11 }}>Pulls the next unassigned slave wallets from the registry.</div>
          </div>

          <button type="button" className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => setGroupsOpen(o => !o)} aria-expanded={groupsOpen}>
            <ChevronDown size={11} style={{ transition: 'transform .3s var(--ease)', transform: groupsOpen ? 'none' : 'rotate(-90deg)' }} />
            {groupsOpen ? 'Hide groups' : 'Show groups'}
          </button>

          <div style={{ overflow: 'hidden', transition: 'max-height .45s var(--ease), opacity .3s ease', maxHeight: groupsOpen ? 1600 : 0, opacity: groupsOpen ? 1 : 0 }}>
            <div className="grid-fill" style={{ '--min': '190px', gap: 12, paddingTop: 16 } as React.CSSProperties}>
              {groups.map(g => (
                <div key={g.id} className="glass glow glow-bright" style={{ padding: '15px 16px', borderRadius: 13, '--glow-size': '200px' } as React.CSSProperties}>
                  <div style={{ fontSize: 13.5 }}>{g.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 13 }}>
                    <span className="value-lg">{g.size}</span>
                    <span className="hint" style={{ fontSize: 11 }}>wallets</span>
                  </div>
                  <div className="meta" style={{ marginTop: 9 }}>{g.funded} funded · {g.sol} SOL</div>
                </div>
              ))}
            </div>
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
