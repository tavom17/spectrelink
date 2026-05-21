'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'

interface Wallet {
  wallet_id: string
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
}

interface JobProgress {
  step: string
  percent: number
}

interface JobStatus {
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'
  progress: JobProgress | number | null
  value: { mintAddress: string; poolAddress: string } | null
  failed: string | null
}

const LAUNCH_STEPS = [
  { label: 'Preparing wallet keys',       activeAt: 0,  doneAt: 10  },
  { label: 'Uploading image to Arweave',  activeAt: 10, doneAt: 20  },
  { label: 'Uploading metadata',          activeAt: 20, doneAt: 35  },
  { label: 'Creating mint account',       activeAt: 35, doneAt: 50  },
  { label: 'Attaching on-chain metadata', activeAt: 50, doneAt: 65  },
  { label: 'Minting token supply',        activeAt: 65, doneAt: 80  },
  { label: 'Creating liquidity pool',     activeAt: 80, doneAt: 95  },
  { label: 'Finalizing',                  activeAt: 95, doneAt: 100 },
]

function getPercent(status: JobStatus | null): number {
  if (!status) return 0
  if (status.state === 'completed') return 100
  if (!status.progress) return 0
  if (typeof status.progress === 'number') return status.progress
  return status.progress.percent ?? 0
}

function getStepStatus(
  step: typeof LAUNCH_STEPS[number],
  percent: number,
  state: string
): 'done' | 'active' | 'failed' | 'pending' {
  if (state === 'completed') return 'done'
  if (percent >= step.doneAt) return 'done'
  if (percent >= step.activeAt) return state === 'failed' ? 'failed' : 'active'
  return 'pending'
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
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!jobId || !accessToken) return

    const poll = async () => {
      try {
        const data = await apiFetch<JobStatus>(`/api/api/coins/status/${jobId}`)
        setJobStatus(data)
        if (data.state === 'completed' || data.state === 'failed') {
          stopPolling()
        }
      } catch {
        // swallow poll errors — job may still be running
      }
    }

    poll()
    pollRef.current = setInterval(poll, 5000)
    return stopPolling
  }, [jobId, accessToken])

  function handleClose() {
    stopPolling()
    setModalOpen(false)
    setJobId(null)
    setJobStatus(null)
  }

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
    fd.append('website', website)
    fd.append('twitter', twitter)
    fd.append('telegram', telegram)

    try {
      const res = await fetch('/api/api/coins/newLaunch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`)
      setJobId(data.jobId)
      setModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed')
    } finally {
      setSubmitting(false)
    }
  }

  const fundingWallets = wallets.filter(w => w.wallet_type === 'funding')
  const feeWallets = wallets.filter(w => w.wallet_type === 'fee')
  const percent = getPercent(jobStatus)
  const isDone = jobStatus?.state === 'completed'
  const isFailed = jobStatus?.state === 'failed'

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%' }}>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

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

      <form onSubmit={handleSubmit}>

        {/* Token Identity */}
        <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>
            Token Identity
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Token Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spectre Coin" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Symbol</label>
              <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. SPCT" maxLength={10} required style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your token..." required rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div>
            <label style={labelStyle}>Token Image</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {imagePreview && (
                <img src={imagePreview} alt="preview" style={{ width: '56px', height: '56px', objectFit: 'cover', border: '1px solid var(--glass-border)', flexShrink: 0 }} />
              )}
              <label style={{ ...mono, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--glass-border)', color: 'var(--white)', padding: '9px 20px', cursor: 'pointer', display: 'inline-block', whiteSpace: 'nowrap' }}>
                {image ? image.name : 'Choose File →'}
                <input type="file" accept="image/*" onChange={handleImageChange} required style={{ display: 'none' }} />
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
              <input type="number" value={decimals} onChange={e => setDecimals(Number(e.target.value))} min={0} max={9} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Total Supply</label>
              <input type="number" value={supply} onChange={e => setSupply(e.target.value)} placeholder="e.g. 1000000000" min={1} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Initial Liquidity (SOL)</label>
              <input type="number" value={initialLiquiditySol} onChange={e => setInitialLiquiditySol(e.target.value)} placeholder="e.g. 1.5" min={0} step="0.01" required style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>
            Social Links <span style={{ opacity: 0.45 }}>(Optional)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Website</label>
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Twitter</label>
              <input type="text" value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="@handle" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telegram</label>
              <input type="text" value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="t.me/..." style={inputStyle} />
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
              <select value={fundingWalletId} onChange={e => setFundingWalletId(e.target.value)} required disabled={loadingWallets} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">{loadingWallets ? 'Loading...' : fundingWallets.length === 0 ? 'No funding wallets' : 'Select funding wallet'}</option>
                {fundingWallets.map(w => (
                  <option key={w.wallet_id} value={w.wallet_id}>{w.public_key.slice(0, 8)}...{w.public_key.slice(-8)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fee Wallet</label>
              <select value={feeWalletId} onChange={e => setFeeWalletId(e.target.value)} required disabled={loadingWallets} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">{loadingWallets ? 'Loading...' : feeWallets.length === 0 ? 'No fee wallets' : 'Select fee wallet'}</option>
                {feeWallets.map(w => (
                  <option key={w.wallet_id} value={w.wallet_id}>{w.public_key.slice(0, 8)}...{w.public_key.slice(-8)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

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
          {submitting ? 'Queuing...' : 'Launch Token →'}
        </button>

      </form>

      {/* Launch Progress Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            style={{
              background: '#f0f0f0',
              border: '1px solid var(--glass-border)',
              width: '480px',
              maxWidth: '90vw',
              animation: 'fadeIn 0.18s ease',
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            }}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ ...bebas, fontSize: '22px', letterSpacing: '0.08em', color: 'var(--white)', lineHeight: 1 }}>
                  {isDone ? 'LAUNCH COMPLETE' : isFailed ? 'LAUNCH FAILED' : 'LAUNCHING TOKEN'}
                </div>
                <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.2em', color: 'var(--faint)', textTransform: 'uppercase', marginTop: '4px' }}>
                  {isDone ? 'Token is live on Solana' : isFailed ? 'An error occurred' : 'Processing on-chain...'}
                </div>
              </div>
              <button
                onClick={handleClose}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--faint)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Steps */}
            <div style={{ padding: '20px 24px' }}>
              {LAUNCH_STEPS.map((step) => {
                const status = getStepStatus(step, percent, jobStatus?.state ?? 'waiting')
                return (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    {/* Status icon */}
                    <div style={{ width: '20px', height: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {status === 'done' && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 7L5.5 10.5L12 4" stroke="rgba(1,1,1,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {status === 'active' && (
                        <div style={{ width: '14px', height: '14px', border: '1.5px solid rgba(1,1,1,0.5)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      )}
                      {status === 'failed' && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 3L11 11M11 3L3 11" stroke="rgba(200,50,50,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
                      {status === 'pending' && (
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(1,1,1,0.2)' }} />
                      )}
                    </div>

                    {/* Step label */}
                    <span style={{
                      ...mono,
                      fontSize: '12px',
                      letterSpacing: '0.06em',
                      color: status === 'done' ? 'rgba(1,1,1,0.65)'
                           : status === 'active' ? 'var(--white)'
                           : status === 'failed' ? 'rgba(200,50,50,0.8)'
                           : 'rgba(1,1,1,0.28)',
                    }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Progress bar */}
            <div style={{ padding: '0 24px 20px' }}>
              <div style={{ height: '3px', background: 'rgba(1,1,1,0.1)', position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${percent}%`,
                  background: isFailed ? 'rgba(200,50,50,0.6)' : 'rgba(1,1,1,0.55)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ ...mono, fontSize: '10px', color: 'var(--faint)', marginTop: '8px', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
                <span>{isFailed ? 'Failed' : isDone ? 'Complete' : 'In progress'}</span>
                <span>{percent}%</span>
              </div>
            </div>

            {/* Result on completion */}
            {isDone && jobStatus?.value && (
              <div style={{ borderTop: '1px solid var(--glass-border)', padding: '20px 24px' }}>
                {([
                  { label: 'Mint Address', value: jobStatus.value.mintAddress },
                  { label: 'Pool Address', value: jobStatus.value.poolAddress },
                ] as const).map(item => (
                  <div key={item.label} style={{ marginBottom: '12px' }}>
                    <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '3px' }}>{item.label}</div>
                    <div style={{ ...mono, fontSize: '11px', color: 'var(--dim)', wordBreak: 'break-all' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Error on failure */}
            {isFailed && jobStatus?.failed && (
              <div style={{ borderTop: '1px solid rgba(200,50,50,0.2)', padding: '16px 24px', background: 'rgba(200,50,50,0.04)' }}>
                <div style={{ ...mono, fontSize: '11px', color: 'rgba(200,50,50,0.75)', lineHeight: 1.6 }}>
                  {jobStatus.failed}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
