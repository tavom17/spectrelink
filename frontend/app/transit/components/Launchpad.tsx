'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'

interface Wallet {
  wallet_id: string
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
  label: string | null
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

function truncate(pk: string) {
  return `${pk.slice(0, 8)}...${pk.slice(-8)}`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy address"
      style={{
        background: 'transparent',
        border: '1px solid var(--glass-border)',
        cursor: 'pointer',
        padding: '3px 7px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: copied ? 'rgba(1,1,1,0.6)' : 'var(--faint)',
        transition: 'color 0.15s',
      }}
    >
      {copied
        ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 6L4.5 9L10.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="0.5" stroke="currentColor" strokeWidth="1"/><rect x="1" y="3" width="7" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" fill="white"/></svg>
      }
    </button>
  )
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <div style={{
      width: '16px', height: '16px', borderRadius: '50%',
      border: '1.5px solid rgba(1,1,1,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      background: selected ? 'rgba(1,1,1,0.85)' : 'transparent',
      transition: 'background 0.12s',
    }}>
      {selected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
    </div>
  )
}

function Toggle({ value, onChange, label: tLabel }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: '36px', height: '20px', borderRadius: '10px',
          background: value ? 'rgba(1,1,1,0.75)' : 'rgba(1,1,1,0.15)',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: '3px',
          left: value ? '19px' : '3px',
          width: '14px', height: '14px', borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
        }} />
      </button>
      <span style={{ ...mono, fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>{tLabel}</span>
    </div>
  )
}

export default function Launchpad() {
  const { accessToken } = useAuth()
  const { apiFetch } = useApiFetch()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loadingWallets, setLoadingWallets] = useState(true)

  // mode
  const [advanced, setAdvanced] = useState(false)

  // core fields
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

  // advanced fields
  const [poolPercentage, setPoolPercentage] = useState(100)
  const [revoke, setRevoke] = useState(true)
  const [lockMetaData, setLockMetaData] = useState(true)
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')

  // sol price
  const [solPrice, setSolPrice] = useState<number | null>(null)

  // auto-buy fields
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(false)
  const [slaveWalletId, setSlaveWalletId] = useState('')
  const [numberOfBuys, setNumberOfBuys] = useState(1)
  const [solPerBuy, setSolPerBuy] = useState('')

  // wallet picker
  const [pickerOpen, setPickerOpen] = useState<'funding' | 'fee' | 'slave' | null>(null)

  // submission + job
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
      // wallets unavailable
    } finally {
      setLoadingWallets(false)
    }
  }, [accessToken])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  useEffect(() => {
    async function fetchSolPrice() {
      try {
        const res = await fetch('/sol-price')
        const json = await res.json()
        const price = Number(json?.price)
        if (!isNaN(price) && price > 0) setSolPrice(price)
      } catch { /* price unavailable */ }
    }
    fetchSolPrice()
    function onVisibilityChange() {
      if (!document.hidden) fetchSolPrice()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const effectivePoolPct = advanced ? poolPercentage : 100

  const tokenPrice = useMemo(() => {
    const sol = parseFloat(initialLiquiditySol)
    const sup = parseFloat(supply)
    if (!sol || !sup || !effectivePoolPct || !solPrice) return null
    return (sol * solPrice) / (sup * (effectivePoolPct / 100))
  }, [initialLiquiditySol, supply, effectivePoolPct, solPrice])

  const marketCap = useMemo(() => {
    if (tokenPrice == null) return null
    const sup = parseFloat(supply)
    if (!sup) return null
    return tokenPrice * sup
  }, [tokenPrice, supply])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (!jobId || !accessToken) return
    const poll = async () => {
      try {
        const data = await apiFetch<JobStatus>(`/api/api/coins/status/${jobId}`)
        setJobStatus(data)
        if (data.state === 'completed' || data.state === 'failed') stopPolling()
      } catch { /* swallow */ }
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
    fd.append('poolPercentage', String(advanced ? poolPercentage : 100))
    fd.append('revoke', String(advanced ? revoke : true))
    fd.append('lockMetaData', String(advanced ? lockMetaData : true))
    fd.append('fundingWalletId', fundingWalletId)
    fd.append('feeWalletId', feeWalletId)
    fd.append('website', advanced ? website : '')
    fd.append('twitter', advanced ? twitter : '')
    fd.append('telegram', advanced ? telegram : '')
    fd.append('autoBuyEnabled', String(autoBuyEnabled))
    if (autoBuyEnabled) {
      fd.append('slaveWalletId', slaveWalletId)
      fd.append('numberOfBuys', String(numberOfBuys))
      fd.append('solPerBuy', solPerBuy)
    }

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
  const feeWallets    = wallets.filter(w => w.wallet_type === 'fee')
  const slaveWallets  = wallets.filter(w => w.wallet_type === 'slave')
  const selectedFunding = fundingWallets.find(w => w.wallet_id === fundingWalletId)
  const selectedFee     = feeWallets.find(w => w.wallet_id === feeWalletId)
  const selectedSlave   = slaveWallets.find(w => w.wallet_id === slaveWalletId)

  const pickerWallets  = pickerOpen === 'funding' ? fundingWallets : pickerOpen === 'slave' ? slaveWallets : feeWallets
  const pickerSelected = pickerOpen === 'funding' ? fundingWalletId : pickerOpen === 'slave' ? slaveWalletId : feeWalletId
  function handlePickerSelect(id: string) {
    if (pickerOpen === 'funding') setFundingWalletId(id)
    else if (pickerOpen === 'slave') setSlaveWalletId(id)
    else setFeeWalletId(id)
    setPickerOpen(null)
  }

  const estimatedPctPerBuy = useMemo(() => {
    const spb = parseFloat(solPerBuy)
    const liq = parseFloat(initialLiquiditySol)
    if (!spb || !liq || !effectivePoolPct) return null
    return (spb / liq) * effectivePoolPct
  }, [solPerBuy, initialLiquiditySol, effectivePoolPct])

  const totalSolRequired = useMemo(() => {
    const spb = parseFloat(solPerBuy)
    if (!spb || !numberOfBuys) return null
    return numberOfBuys * spb
  }, [numberOfBuys, solPerBuy])

  const percent = getPercent(jobStatus)
  const isDone = jobStatus?.state === 'completed'
  const isFailed = jobStatus?.state === 'failed'

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%' }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 2px; background: rgba(1,1,1,0.2); outline: none; cursor: pointer; width: 100%; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: rgba(1,1,1,0.8); cursor: pointer; }
        input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: rgba(1,1,1,0.8); cursor: pointer; border: none; }
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
            <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
            <div style={{ ...bebas, fontSize: '36px', letterSpacing: '0.05em', color: 'var(--white)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '24px', alignSelf: 'flex-start', border: '1px solid var(--glass-border)', width: 'fit-content' }}>
        {(['default', 'advanced'] as const).map(mode => {
          const active = (mode === 'advanced') === advanced
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setAdvanced(mode === 'advanced')}
              style={{
                ...mono,
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '8px 20px',
                border: 'none',
                cursor: 'pointer',
                background: active ? 'var(--white)' : 'transparent',
                color: active ? 'var(--deep)' : 'var(--faint)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {mode}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ ...mono, fontSize: '12px', color: 'rgba(200,50,50,0.8)', marginBottom: '24px', padding: '12px 16px', border: '1px solid rgba(200,50,50,0.3)', background: 'rgba(200,50,50,0.05)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* ── Token Identity ─────────────────────────────────── */}
        <div style={{ border: '1px solid var(--glass-border)', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>Token Identity</div>

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

        {/* ── Token Parameters ───────────────────────────────── */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>Token Parameters</div>

          <div style={{ display: 'grid', gridTemplateColumns: advanced ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '20px', marginBottom: advanced ? '24px' : '0' }}>
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
            {advanced && (
              <div>
                <label style={labelStyle}>
                  Pool % of Supply
                  <span style={{ marginLeft: '8px', color: 'var(--white)', letterSpacing: '0.05em' }}>{poolPercentage}%</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '10px' }}>
                  <input
                    type="range"
                    min={1} max={100}
                    value={poolPercentage}
                    onChange={e => setPoolPercentage(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>

          {advanced && (
            <div style={{ display: 'flex', gap: '32px' }}>
              <Toggle value={revoke} onChange={setRevoke} label="Revoke Mint Authority" />
              <Toggle value={lockMetaData} onChange={setLockMetaData} label="Lock Metadata" />
            </div>
          )}
        </div>

        {/* ── Market Cap Estimator ──────────────────────────── */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'rgba(0,0,0,0.03)', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: '40px', flexWrap: 'wrap', marginBottom: '1px' }}>

          {/* SOL price — always visible once loaded, shows — while waiting */}
          <div>
            <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>SOL PRICE</div>
            <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: 'var(--white)' }}>
              {solPrice != null
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(solPrice)
                : '—'}
            </div>
          </div>

          <div>
            <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>EST. MARKET CAP</div>
            <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: 'var(--white)' }}>
              {marketCap != null
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(marketCap)
                : '—'}
            </div>
          </div>

          <div>
            <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>TOKEN PRICE</div>
            <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: 'var(--white)' }}>
              {tokenPrice != null
                ? (() => {
                    const places = Math.max(2, Math.ceil(-Math.log10(tokenPrice)) + 4)
                    const raw = tokenPrice.toFixed(places)
                    const trimmed = raw.replace(/(\.\d{2}.*?)0+$/, '$1')
                    return `$${trimmed}`
                  })()
                : '—'}
            </div>
          </div>

          <div>
            <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>COST</div>
            <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: 'var(--white)' }}>
              {solPrice != null && parseFloat(initialLiquiditySol) > 0
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(solPrice * parseFloat(initialLiquiditySol))
                : '—'}
            </div>
          </div>

          <div>
            <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>POOL SUPPLY</div>
            <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: 'var(--white)' }}>
              {parseFloat(supply) > 0
                ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(parseFloat(supply) * (effectivePoolPct / 100))
                : '—'}
            </div>
          </div>

        </div>

        {/* ── Social Links (advanced only) ───────────────────── */}
        {advanced && (
          <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '1px' }}>
            <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>Social Links</div>
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
        )}

        {/* ── Wallet Selection ───────────────────────────────── */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '32px' }}>
          <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '24px' }}>Wallet Selection</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {(['funding', 'fee'] as const).map(type => {
              const selected = type === 'funding' ? selectedFunding : selectedFee
              return (
                <div key={type}>
                  <label style={labelStyle}>{type === 'funding' ? 'Funding Wallet' : 'Fee Wallet'}</label>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(type)}
                    disabled={loadingWallets}
                    style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: loadingWallets ? 'not-allowed' : 'pointer', textAlign: 'left', gap: '8px' }}
                  >
                    <span style={{ color: selected ? 'var(--white)' : 'var(--faint)' }}>
                      {loadingWallets ? 'Loading...' : selected ? truncate(selected.public_key) : `Select ${type} wallet`}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
                      <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Auto-Buy ──────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--glass-border)', borderTop: 'none', background: 'var(--deep)', padding: '28px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: autoBuyEnabled ? '24px' : '0' }}>
            <div style={{ ...mono, fontSize: '11px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>Auto-Buy</div>
            <Toggle value={autoBuyEnabled} onChange={setAutoBuyEnabled} label="Enable auto-buy on launch" />
          </div>

          {autoBuyEnabled && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: '20px', marginBottom: '20px' }}>

                {/* Slave wallet selector — same pattern as funding/fee */}
                <div>
                  <label style={labelStyle}>Slave Wallet</label>
                  <button
                    type="button"
                    onClick={() => setPickerOpen('slave')}
                    disabled={loadingWallets}
                    style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: loadingWallets ? 'not-allowed' : 'pointer', textAlign: 'left', gap: '8px' }}
                  >
                    <span style={{ color: selectedSlave ? 'var(--white)' : 'var(--faint)' }}>
                      {loadingWallets ? 'Loading...' : selectedSlave ? truncate(selectedSlave.public_key) : 'Select slave wallet'}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
                      <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                <div>
                  <label style={labelStyle}>Number of Buys</label>
                  <input
                    type="number"
                    value={numberOfBuys}
                    onChange={e => setNumberOfBuys(Math.max(1, Math.min(10, Number(e.target.value))))}
                    min={1} max={10} step={1}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>SOL per Buy</label>
                  <input
                    type="number"
                    value={solPerBuy}
                    onChange={e => setSolPerBuy(e.target.value)}
                    placeholder="0.00"
                    min={0} step="0.01"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Estimator row */}
              <div style={{ display: 'flex', gap: '40px', padding: '14px 18px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Est. % Supply / Buy</div>
                  <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: estimatedPctPerBuy != null && estimatedPctPerBuy >= 0.5 ? 'rgba(200,120,50,0.9)' : 'var(--white)' }}>
                    {estimatedPctPerBuy != null ? `${estimatedPctPerBuy.toFixed(3)}%` : '—'}
                    {estimatedPctPerBuy != null && estimatedPctPerBuy >= 0.5 && (
                      <span style={{ ...mono, fontSize: '9px', letterSpacing: '0.1em', marginLeft: '8px', color: 'rgba(200,120,50,0.9)' }}>HIGH</span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.18em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Total SOL Required</div>
                  <div style={{ ...mono, fontSize: '15px', letterSpacing: '0.04em', color: 'var(--white)' }}>
                    {totalSolRequired != null ? `${totalSolRequired.toFixed(4)} SOL` : '—'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || loadingWallets || !fundingWalletId || !feeWalletId || (autoBuyEnabled && !slaveWalletId)}
          style={{
            ...mono, fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase',
            border: '1px solid var(--white)',
            background: submitting ? 'transparent' : 'var(--white)',
            color: submitting ? 'var(--white)' : 'var(--deep)',
            padding: '14px 40px', cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting || loadingWallets || !fundingWalletId || !feeWalletId || (autoBuyEnabled && !slaveWalletId) ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: '10px',
          }}
        >
          {submitting ? 'Queuing...' : 'Launch Token →'}
        </button>
      </form>

      {/* ── Wallet Picker Modal ────────────────────────────────────── */}
      {pickerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}
          onClick={e => { if (e.target === e.currentTarget) setPickerOpen(null) }}
        >
          <div style={{ background: '#f0f0f0', border: '1px solid var(--glass-border)', width: '520px', maxWidth: '92vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.15s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.15)' }}>

            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ ...bebas, fontSize: '18px', letterSpacing: '0.08em', color: 'var(--white)' }}>
                SELECT {pickerOpen?.toUpperCase()} WALLET
              </div>
              <button type="button" onClick={() => setPickerOpen(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--faint)', padding: '4px', display: 'flex' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '32px 36px 1fr 80px', padding: '10px 22px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.04)', flexShrink: 0 }}>
              {['', '', 'ADDRESS', 'LABEL'].map((h, i) => (
                <div key={i} style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--faint)', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {pickerWallets.length === 0 ? (
                <div style={{ ...mono, fontSize: '12px', color: 'var(--faint)', padding: '24px 22px' }}>
                  No {pickerOpen} wallets found. Create one in Wallet Manager.
                </div>
              ) : pickerWallets.map((w, i) => {
                const isSelected = w.wallet_id === pickerSelected
                return (
                  <div
                    key={w.wallet_id}
                    onClick={() => handlePickerSelect(w.wallet_id)}
                    style={{
                      display: 'grid', gridTemplateColumns: '32px 36px 1fr 80px', alignItems: 'center',
                      padding: '13px 22px',
                      borderBottom: i < pickerWallets.length - 1 ? '1px solid var(--glass-border)' : 'none',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(0,0,0,0.05)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <RadioDot selected={isSelected} />
                    <div onClick={e => e.stopPropagation()}>
                      <CopyButton text={w.public_key} />
                    </div>
                    <span style={{ ...mono, fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.04em', paddingLeft: '12px' }}>
                      {truncate(w.public_key)}
                    </span>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--faint)', letterSpacing: '0.04em' }}>
                      {w.label ?? '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Launch Progress Modal ──────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div style={{ background: '#f0f0f0', border: '1px solid var(--glass-border)', width: '480px', maxWidth: '90vw', animation: 'fadeIn 0.18s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ ...bebas, fontSize: '22px', letterSpacing: '0.08em', color: 'var(--white)', lineHeight: 1 }}>
                  {isDone ? 'LAUNCH COMPLETE' : isFailed ? 'LAUNCH FAILED' : 'LAUNCHING TOKEN'}
                </div>
                <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.2em', color: 'var(--faint)', textTransform: 'uppercase', marginTop: '4px' }}>
                  {isDone ? 'Token is live on Solana' : isFailed ? 'An error occurred' : 'Processing on-chain...'}
                </div>
              </div>
              <button type="button" onClick={handleClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--faint)', padding: '4px', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {LAUNCH_STEPS.map(step => {
                const status = getStepStatus(step, percent, jobStatus?.state ?? 'waiting')
                return (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
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
                    <span style={{
                      ...mono, fontSize: '12px', letterSpacing: '0.06em',
                      color: status === 'done' ? 'rgba(1,1,1,0.65)' : status === 'active' ? 'var(--white)' : status === 'failed' ? 'rgba(200,50,50,0.8)' : 'rgba(1,1,1,0.28)',
                    }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '0 24px 20px' }}>
              <div style={{ height: '3px', background: 'rgba(1,1,1,0.1)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${percent}%`, background: isFailed ? 'rgba(200,50,50,0.6)' : 'rgba(1,1,1,0.55)', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ ...mono, fontSize: '10px', color: 'var(--faint)', marginTop: '8px', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
                <span>{isFailed ? 'Failed' : isDone ? 'Complete' : 'In progress'}</span>
                <span>{percent}%</span>
              </div>
            </div>

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

            {isFailed && jobStatus?.failed && (
              <div style={{ borderTop: '1px solid rgba(200,50,50,0.2)', padding: '16px 24px', background: 'rgba(200,50,50,0.04)' }}>
                <div style={{ ...mono, fontSize: '11px', color: 'rgba(200,50,50,0.75)', lineHeight: 1.6 }}>{jobStatus.failed}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
