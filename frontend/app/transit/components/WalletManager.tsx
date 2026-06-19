'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'

interface Wallet {
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
  wallet_id: string
}

const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }
const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif" }

const TYPE_ORDER = ['master', 'funding', 'fee', 'slave'] as const
const PAGE_SIZE = 10

const typeColor: Record<string, string> = {
  master:  'var(--white)',
  slave:   'var(--dim)',
  funding: 'var(--dim)',
  fee:     'var(--dim)',
}

const btnBase: React.CSSProperties = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: '11px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  border: '1px solid var(--glass-border)',
  background: 'transparent',
  color: 'var(--white)',
  padding: '9px 20px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

export default function WalletManager() {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loadingWallets, setLoadingWallets] = useState(true)
  const [error, setError] = useState('')
  const [slaveCount, setSlaveCount] = useState(1)
  const [creating, setCreating] = useState<string | null>(null)
  const [page, setPage] = useState(0)

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

  const fetchWallets = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Wallet[]>('/api/api/wallets/listWallets')
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

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageWallets = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Fetch balances only for wallets currently visible on this page
  useEffect(() => {
    if (!accessToken || pageWallets.length === 0) return
    pageWallets.forEach(w => {
      if (balances[w.public_key] !== undefined) return
      if (fetchingRef.current.has(w.public_key)) return
      fetchingRef.current.add(w.public_key)
      apiFetch<{ balance: number }>(`/api/api/wallets/balance?public_key=${encodeURIComponent(w.public_key)}`)
        .then(data => setBalances(prev => ({ ...prev, [w.public_key]: data.balance })))
        .catch(() => setBalances(prev => ({ ...prev, [w.public_key]: null })))
        .finally(() => fetchingRef.current.delete(w.public_key))
    })
  }, [page, wallets, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createWallet(type: 'slave' | 'funding' | 'fee') {
    if (!accessToken) return
    setCreating(type)
    setError('')
    try {
      if (type === 'slave') {
        await apiFetch('/api/api/wallets/slaveWallets', {
          method: 'POST',
          body: JSON.stringify({ amountOfSlaves: slaveCount }),
        })
      } else if (type === 'funding') {
        await apiFetch('/api/api/wallets/fundingWallets', { method: 'POST', body: JSON.stringify({}) })
      } else {
        await apiFetch('/api/api/wallets/feeWallets', { method: 'POST', body: JSON.stringify({}) })
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
      await apiFetch('/api/api/wallets/withdraw', {
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
      apiFetch<{ balance: number }>(`/api/api/wallets/balance?public_key=${encodeURIComponent(withdrawWallet.public_key)}`)
        .then(data => setBalances(prev => ({ ...prev, [withdrawWallet.public_key]: data.balance })))
        .catch(() => setBalances(prev => ({ ...prev, [withdrawWallet.public_key]: null })))
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }

  const counts = {
    slave:   wallets.filter(w => w.wallet_type === 'slave').length,
    funding: wallets.filter(w => w.wallet_type === 'funding').length,
    fee:     wallets.filter(w => w.wallet_type === 'fee').length,
  }

  const currentBalance = withdrawWallet ? balances[withdrawWallet.public_key] : undefined

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '12px' }}>
          HD-derived Solana wallet management
        </div>
        <h1 style={{ ...bebas, fontSize: '48px', letterSpacing: '0.06em', color: 'var(--white)', lineHeight: 1, margin: 0 }}>
          WALLET MANAGER
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--glass-border)', border: '1px solid var(--glass-border)', marginBottom: '32px' }}>
        {[
          { label: 'SLAVE WALLETS',   value: loadingWallets ? '—' : String(counts.slave) },
          { label: 'FUNDING WALLETS', value: loadingWallets ? '—' : String(counts.funding) },
          { label: 'FEE WALLETS',     value: loadingWallets ? '—' : String(counts.fee) },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--deep)', padding: '24px 28px' }}>
            <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '10px' }}>
              {stat.label}
            </div>
            <div style={{ ...bebas, fontSize: '36px', letterSpacing: '0.05em', color: 'var(--white)' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ ...mono, fontSize: '12px', color: 'rgba(200,50,50,0.8)', marginBottom: '24px', padding: '12px 16px', border: '1px solid rgba(200,50,50,0.3)', background: 'rgba(200,50,50,0.05)' }}>
          {error}
        </div>
      )}

      {/* Create Actions */}
      <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)', padding: '28px', marginBottom: '32px' }}>
        <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '20px' }}>
          Create Wallets
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', width: '140px', textTransform: 'uppercase' }}>
              Slave Wallets
            </div>
            <input
              type="number" min={1} max={20} value={slaveCount}
              onChange={e => setSlaveCount(Math.max(1, Math.min(20, Number(e.target.value))))}
              style={{ ...mono, width: '64px', padding: '8px 10px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--white)', fontSize: '13px', outline: 'none', textAlign: 'center' }}
            />
            <button onClick={() => createWallet('slave')} disabled={creating !== null} style={{ ...btnBase, opacity: creating !== null ? 0.45 : 1 }}>
              {creating === 'slave' ? 'Creating...' : 'Create'}{creating !== 'slave' && <span>→</span>}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', width: '140px', textTransform: 'uppercase' }}>
              Funding Wallet
            </div>
            <button onClick={() => createWallet('funding')} disabled={creating !== null} style={{ ...btnBase, opacity: creating !== null ? 0.45 : 1 }}>
              {creating === 'funding' ? 'Creating...' : 'Create'}{creating !== 'funding' && <span>→</span>}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', width: '140px', textTransform: 'uppercase' }}>
              Fee Wallet
            </div>
            <button onClick={() => createWallet('fee')} disabled={creating !== null} style={{ ...btnBase, opacity: creating !== null ? 0.45 : 1 }}>
              {creating === 'fee' ? 'Creating...' : 'Create'}{creating !== 'fee' && <span>→</span>}
            </button>
          </div>

        </div>
      </div>

      {/* Wallet Registry */}
      <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>
            Wallet Registry
          </div>
          <div style={{ ...mono, fontSize: '11px', color: 'var(--faint)' }}>
            {wallets.length} total
          </div>
        </div>

        {loadingWallets ? (
          <div style={{ padding: '32px 28px', ...mono, fontSize: '12px', color: 'var(--faint)' }}>
            Loading wallets...
          </div>
        ) : wallets.length === 0 ? (
          <div style={{ padding: '32px 28px', ...mono, fontSize: '12px', color: 'var(--faint)' }}>
            No wallets found. Create slave, funding, or fee wallets above.
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 130px 110px', padding: '10px 28px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.04)', alignItems: 'center' }}>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase' }}>Type</div>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase' }}>Public Key</div>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase', textAlign: 'right', paddingRight: '16px' }}>Balance</div>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase', textAlign: 'right' }}>Action</div>
            </div>

            {pageWallets.map((w, i) => {
              const bal = balances[w.public_key]
              const balStr = bal === undefined
                ? '—'
                : bal === null
                ? 'err'
                : `${bal.toFixed(4)} SOL`
              const balColor = bal === undefined || bal === null ? 'var(--faint)' : bal === 0 ? 'var(--dim)' : 'var(--white)'

              return (
                <div
                  key={w.public_key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 1fr 130px 110px',
                    padding: '14px 28px',
                    borderBottom: i < pageWallets.length - 1 ? '1px solid var(--glass-border)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.1em', color: typeColor[w.wallet_type] ?? 'var(--dim)', textTransform: 'uppercase' }}>
                    {w.wallet_type}
                  </div>
                  <div style={{ ...mono, fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.04em', wordBreak: 'break-all', paddingRight: '16px' }}>
                    {w.public_key}
                  </div>
                  <div style={{ ...mono, fontSize: '12px', color: balColor, textAlign: 'right', paddingRight: '16px' }}>
                    {balStr}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {w.wallet_type !== 'master' && (
                      <button
                        onClick={() => openWithdraw(w)}
                        style={{
                          ...mono,
                          fontSize: '10px',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          border: '1px solid var(--glass-border)',
                          background: 'transparent',
                          color: 'var(--white)',
                          padding: '6px 14px',
                          cursor: 'pointer',
                        }}
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '16px 28px', borderTop: '1px solid var(--glass-border)' }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ ...mono, fontSize: '20px', background: 'transparent', border: 'none', color: page === 0 ? 'var(--faint)' : 'var(--white)', cursor: page === 0 ? 'default' : 'pointer', lineHeight: 1, padding: '4px 8px' }}
                >
                  ←
                </button>
                <div style={{ ...mono, fontSize: '11px', color: 'var(--faint)', letterSpacing: '0.1em' }}>
                  {page + 1} / {totalPages}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  style={{ ...mono, fontSize: '20px', background: 'transparent', border: 'none', color: page === totalPages - 1 ? 'var(--faint)' : 'var(--white)', cursor: page === totalPages - 1 ? 'default' : 'pointer', lineHeight: 1, padding: '4px 8px' }}
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Withdraw Modal */}
      {withdrawWallet && (
        <div
          onClick={closeWithdraw}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--deep)', border: '1px solid var(--glass-border)', padding: '40px', width: '500px', maxWidth: '92vw', position: 'relative' }}
          >
            <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Withdraw SOL · {withdrawWallet.wallet_type}
            </div>
            <div style={{ ...bebas, fontSize: '30px', letterSpacing: '0.06em', color: 'var(--white)', marginBottom: '6px' }}>
              WITHDRAW
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
              <div style={{ padding: '12px', background: '#fff', display: 'inline-block' }}>
                <QRCodeSVG value={withdrawWallet.public_key} size={160} />
              </div>
            </div>

            {withdrawSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                <div style={{ fontSize: '36px', marginBottom: '14px', color: 'var(--white)' }}>✓</div>
                <div style={{ ...mono, fontSize: '13px', color: 'var(--white)', marginBottom: '28px', letterSpacing: '0.06em' }}>
                  Withdrawal submitted
                </div>
                <button
                  onClick={closeWithdraw}
                  style={{ ...mono, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--white)', padding: '10px 32px', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Recipient */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Recipient Address
                  </div>
                  <input
                    type="text"
                    placeholder="Solana wallet address..."
                    value={withdrawRecipient}
                    onChange={e => setWithdrawRecipient(e.target.value)}
                    disabled={withdrawing}
                    style={{ ...mono, width: '100%', padding: '10px 14px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--white)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Amount */}
                <div style={{ marginBottom: '28px' }}>
                  <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Amount (SOL)</span>
                    {typeof currentBalance === 'number' && (
                      <span style={{ color: 'var(--dim)' }}>Available: {currentBalance.toFixed(4)} SOL</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="0.0000"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      disabled={withdrawing}
                      style={{ ...mono, flex: 1, padding: '10px 14px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--white)', fontSize: '14px', outline: 'none' }}
                    />
                    {typeof currentBalance === 'number' && currentBalance > 0 && (
                      <button
                        onClick={() => setWithdrawAmount(String(currentBalance))}
                        disabled={withdrawing}
                        style={{ ...mono, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--white)', padding: '10px 18px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                </div>

                {withdrawError && (
                  <div style={{ ...mono, fontSize: '12px', color: 'rgba(200,50,50,0.8)', marginBottom: '20px', padding: '10px 14px', border: '1px solid rgba(200,50,50,0.3)', background: 'rgba(200,50,50,0.05)' }}>
                    {withdrawError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={closeWithdraw}
                    disabled={withdrawing}
                    style={{ ...mono, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--faint)', padding: '10px 24px', cursor: withdrawing ? 'default' : 'pointer', opacity: withdrawing ? 0.45 : 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    style={{ ...mono, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--white)', padding: '10px 28px', cursor: withdrawing ? 'default' : 'pointer', opacity: withdrawing ? 0.45 : 1 }}
                  >
                    {withdrawing ? 'Sending...' : 'Confirm →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
