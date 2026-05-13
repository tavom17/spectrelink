'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'

interface Wallet {
  wallet_id: string
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
}

interface LaunchResult {
  mintAddress: string
  poolAddress: string
  metaDataURI: string
  launchTxSig: string
}

const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }
const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif" }

const inputStyle: React.CSSProperties = {
  ...mono,
  width: '100%',
  padding: '9px 12px',
  background: 'transparent',
  border: '1px solid var(--glass-border)',
  color: 'var(--white)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: '10px',
  letterSpacing: '0.15em',
  color: 'var(--faint)',
  textTransform: 'uppercase',
  marginBottom: '6px',
  display: 'block',
}

export default function Launchpad() {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loadingWallets, setLoadingWallets] = useState(true)

  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [decimals, setDecimals] = useState(6)
  const [supply, setSupply] = useState('')
  const [initialLiquiditySol, setInitialLiquiditySol] = useState('')
  const [fundingWalletId, setFundingWalletId] = useState('')
  const [feeWalletId, setFeeWalletId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LaunchResult | null>(null)

  const fetchWallets = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Wallet[]>('/api/api/wallets/listWallets')
      setWallets(data)
    } catch {
      // wallets unavailable — selects will show empty state
    } finally {
      setLoadingWallets(false)
    }
  }, [accessToken])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  const fundingWallets = wallets.filter(w => w.wallet_type === 'funding')
  const feeWallets = wallets.filter(w => w.wallet_type === 'fee')

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken || !image) return
    setSubmitting(true)
    setError('')
    setResult(null)

    const fd = new FormData()
    fd.append('image', image)
    fd.append('name', name)
    fd.append('symbol', symbol)
    fd.append('description', description)
    fd.append('decimals', String(decimals))
    fd.append('supply', supply)
    fd.append('initialLiquiditySol', initialLiquiditySol)
    fd.append('fundingWalletId', fundingWalletId)
    fd.append('feeWalletId', feeWalletId)

    try {
      const res = await fetch('/api/api/coins/newLaunch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`)
      setResult(data as LaunchResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '12px' }}>
          SPL token deployment and mint management
        </div>
        <h1 style={{ ...bebas, fontSize: '48px', letterSpacing: '0.06em', color: 'var(--white)', lineHeight: 1, margin: 0 }}>
          COIN LAUNCHPAD
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--glass-border)', border: '1px solid var(--glass-border)', marginBottom: '32px' }}>
        {[
          { label: 'TOKENS LAUNCHED', value: '—' },
          { label: 'ACTIVE MINTS',    value: '—' },
          { label: 'PENDING TXS',     value: '—' },
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

      {result && (
        <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)', padding: '28px', marginBottom: '32px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '20px' }}>
            Launch Complete
          </div>
          {([
            { label: 'MINT ADDRESS', value: result.mintAddress },
            { label: 'POOL ADDRESS', value: result.poolAddress },
            { label: 'LAUNCH TX',    value: result.launchTxSig },
            { label: 'METADATA URI', value: result.metaDataURI },
          ] as const).map(item => (
            <div key={item.label} style={{ marginBottom: '16px' }}>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>
                {item.label}
              </div>
              <div style={{ ...mono, fontSize: '12px', color: 'var(--dim)', wordBreak: 'break-all' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* Token Identity */}
        <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>
            Token Identity
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Token Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Spectre Coin"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. SPCT"
                maxLength={10}
                required
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe your token..."
              required
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Token Image</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="preview"
                  style={{ width: '56px', height: '56px', objectFit: 'cover', border: '1px solid var(--glass-border)', flexShrink: 0 }}
                />
              )}
              <label style={{
                ...mono,
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                border: '1px solid var(--glass-border)',
                color: 'var(--white)',
                padding: '9px 20px',
                cursor: 'pointer',
                display: 'inline-block',
                whiteSpace: 'nowrap',
              }}>
                {image ? image.name : 'Choose File →'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  required
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Token Parameters */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>
            Token Parameters
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Decimals</label>
              <input
                type="number"
                value={decimals}
                onChange={e => setDecimals(Number(e.target.value))}
                min={0}
                max={9}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Total Supply</label>
              <input
                type="number"
                value={supply}
                onChange={e => setSupply(e.target.value)}
                placeholder="e.g. 1000000000"
                min={1}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Initial Liquidity (SOL)</label>
              <input
                type="number"
                value={initialLiquiditySol}
                onChange={e => setInitialLiquiditySol(e.target.value)}
                placeholder="e.g. 1.5"
                min={0}
                step="0.01"
                required
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Wallet Selection */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '32px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>
            Wallet Selection
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Funding Wallet</label>
              <select
                value={fundingWalletId}
                onChange={e => setFundingWalletId(e.target.value)}
                required
                disabled={loadingWallets}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">
                  {loadingWallets ? 'Loading...' : fundingWallets.length === 0 ? 'No funding wallets' : 'Select funding wallet'}
                </option>
                {fundingWallets.map(w => (
                  <option key={w.wallet_id} value={w.wallet_id}>
                    {w.public_key.slice(0, 8)}...{w.public_key.slice(-8)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fee Wallet</label>
              <select
                value={feeWalletId}
                onChange={e => setFeeWalletId(e.target.value)}
                required
                disabled={loadingWallets}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">
                  {loadingWallets ? 'Loading...' : feeWallets.length === 0 ? 'No fee wallets' : 'Select fee wallet'}
                </option>
                {feeWallets.map(w => (
                  <option key={w.wallet_id} value={w.wallet_id}>
                    {w.public_key.slice(0, 8)}...{w.public_key.slice(-8)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || loadingWallets}
          style={{
            ...mono,
            fontSize: '12px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            border: '1px solid var(--white)',
            background: submitting ? 'transparent' : 'var(--white)',
            color: submitting ? 'var(--white)' : 'var(--deep)',
            padding: '14px 40px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting || loadingWallets ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {submitting ? 'Launching...' : 'Launch Token →'}
        </button>

      </form>
    </div>
  )
}
