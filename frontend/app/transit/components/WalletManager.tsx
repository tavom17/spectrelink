'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

interface Wallet {
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
}

const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }
const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif" }

const TYPE_ORDER = ['master', 'funding', 'fee', 'slave'] as const

export default function WalletManager() {
  const { accessToken } = useAuth()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loadingWallets, setLoadingWallets] = useState(true)
  const [error, setError] = useState('')
  const [slaveCount, setSlaveCount] = useState(1)
  const [creating, setCreating] = useState<string | null>(null)

  const fetchWallets = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Wallet[]>('/api/api/wallets/listWallets', accessToken)
      setWallets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallets')
    } finally {
      setLoadingWallets(false)
    }
  }, [accessToken])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  async function createWallet(type: 'slave' | 'funding' | 'fee') {
    if (!accessToken) return
    setCreating(type)
    setError('')
    try {
      if (type === 'slave') {
        await apiFetch('/api/api/wallets/slaveWallets', accessToken, {
          method: 'POST',
          body: JSON.stringify({ amountOfSlaves: slaveCount }),
        })
      } else if (type === 'funding') {
        await apiFetch('/api/api/wallets/fundingWallets', accessToken, { method: 'POST', body: JSON.stringify({}) })
      } else {
        await apiFetch('/api/api/wallets/feeWallets', accessToken, { method: 'POST', body: JSON.stringify({}) })
      }
      await fetchWallets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
    } finally {
      setCreating(null)
    }
  }

  const counts = {
    slave:   wallets.filter(w => w.wallet_type === 'slave').length,
    funding: wallets.filter(w => w.wallet_type === 'funding').length,
    fee:     wallets.filter(w => w.wallet_type === 'fee').length,
  }

  const sorted = [...wallets].sort(
    (a, b) => TYPE_ORDER.indexOf(a.wallet_type as typeof TYPE_ORDER[number]) - TYPE_ORDER.indexOf(b.wallet_type as typeof TYPE_ORDER[number])
  )

  const btnBase: React.CSSProperties = {
    ...mono,
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

  const typeColor: Record<string, string> = {
    master:  'rgba(1,1,1,0.45)',
    slave:   'rgba(1,1,1,0.72)',
    funding: 'rgba(1,1,1,0.72)',
    fee:     'rgba(1,1,1,0.72)',
  }

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

          {/* Slave wallets row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', width: '140px', textTransform: 'uppercase' }}>
              Slave Wallets
            </div>
            <input
              type="number"
              min={1}
              max={20}
              value={slaveCount}
              onChange={e => setSlaveCount(Math.max(1, Math.min(20, Number(e.target.value))))}
              style={{
                ...mono,
                width: '64px',
                padding: '8px 10px',
                background: 'transparent',
                border: '1px solid var(--glass-border)',
                color: 'var(--white)',
                fontSize: '13px',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <button
              onClick={() => createWallet('slave')}
              disabled={creating !== null}
              style={{ ...btnBase, opacity: creating !== null ? 0.45 : 1 }}
            >
              {creating === 'slave' ? 'Creating...' : 'Create'}
              {creating !== 'slave' && <span>→</span>}
            </button>
          </div>

          {/* Funding wallet row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', width: '140px', textTransform: 'uppercase' }}>
              Funding Wallet
            </div>
            <button
              onClick={() => createWallet('funding')}
              disabled={creating !== null}
              style={{ ...btnBase, opacity: creating !== null ? 0.45 : 1 }}
            >
              {creating === 'funding' ? 'Creating...' : 'Create'}
              {creating !== 'funding' && <span>→</span>}
            </button>
          </div>

          {/* Fee wallet row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em', width: '140px', textTransform: 'uppercase' }}>
              Fee Wallet
            </div>
            <button
              onClick={() => createWallet('fee')}
              disabled={creating !== null}
              style={{ ...btnBase, opacity: creating !== null ? 0.45 : 1 }}
            >
              {creating === 'fee' ? 'Creating...' : 'Create'}
              {creating !== 'fee' && <span>→</span>}
            </button>
          </div>

        </div>
      </div>

      {/* Wallet List */}
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
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0', padding: '10px 28px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.04)' }}>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase' }}>Type</div>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--faint)', textTransform: 'uppercase' }}>Public Key</div>
            </div>
            {sorted.map((w, i) => (
              <div
                key={w.public_key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr',
                  padding: '14px 28px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.1em', color: typeColor[w.wallet_type] ?? 'var(--dim)', textTransform: 'uppercase' }}>
                  {w.wallet_type}
                </div>
                <div style={{ ...mono, fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.04em', wordBreak: 'break-all' }}>
                  {w.public_key}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
