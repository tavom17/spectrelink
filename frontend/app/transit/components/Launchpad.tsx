'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'
import poolConfigs from '@/lib/poolConfigs.json'
import { Sheet, SheetHead, Switch, Seg, Range, StepHead, CopyButton, ChevronDown, CheckIcon, CloseIcon } from '@/components/ui'

interface Wallet {
  wallet_id: string
  public_key: string
  wallet_type: 'master' | 'slave' | 'funding' | 'fee'
  label: string | null
}

interface PoolConfigEntry {
  configAddress: string
  label: string
  collectFeeMode: number
  dynamicFee: boolean
  compoundingPercent: number | null
  description: string
}

const DEFAULT_CONFIG_ADDRESS = 'FxWh7P9b5sU6LBu4b5SYZbYinTLnEUxWjiBDKVpj7ooF'

const CONFIG_DEFINITIONS: { term: string; desc: string }[] = [
  { term: 'Collect Fee Mode — SOL Only', desc: poolConfigs.definitions.collectFeeMode.solOnly },
  { term: 'Collect Fee Mode — Compounding', desc: poolConfigs.definitions.collectFeeMode.compounding },
  { term: 'Compounding Percent', desc: poolConfigs.definitions.compoundingPercent },
  { term: 'Dynamic Fee', desc: poolConfigs.definitions.dynamicFee },
  { term: 'Protocol Fee', desc: poolConfigs.definitions.protocolFee },
]

const SOL_ONLY_CONFIGS = poolConfigs.configs.solOnly as PoolConfigEntry[]
const COMPOUNDING_CONFIGS = poolConfigs.configs.compounding as PoolConfigEntry[]

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

interface LaunchStep {
  label: string
  activeAt: number
  doneAt: number
}

// Mirrors the job.updateProgress percent milestones in launchInitializer.ts. When auto-buy
// is enabled, the backend runs the auto-buy loop (85-94%) between pool creation (75%) and
// finalizing (95%), so that step is inserted only for auto-buy launches.
function buildLaunchSteps(autoBuyEnabled: boolean): LaunchStep[] {
  const steps: LaunchStep[] = [
    { label: 'Preparing wallet keys',       activeAt: 0,  doneAt: 10  },
    { label: 'Uploading image to Arweave',  activeAt: 10, doneAt: 20  },
    { label: 'Uploading metadata',          activeAt: 20, doneAt: 35  },
    { label: 'Creating mint account',       activeAt: 35, doneAt: 50  },
    { label: 'Attaching on-chain metadata', activeAt: 50, doneAt: 65  },
    { label: 'Minting token supply',        activeAt: 65, doneAt: 75  },
    { label: 'Creating liquidity pool',     activeAt: 75, doneAt: autoBuyEnabled ? 85 : 95 },
  ]
  if (autoBuyEnabled) {
    steps.push({ label: 'Auto-buying tokens', activeAt: 85, doneAt: 95 })
  }
  steps.push({ label: 'Finalizing', activeAt: 95, doneAt: 100 })
  return steps
}

function getPercent(status: JobStatus | null): number {
  if (!status) return 0
  if (status.state === 'completed') return 100
  if (!status.progress) return 0
  if (typeof status.progress === 'number') return status.progress
  return status.progress.percent ?? 0
}

function getStepStatus(
  step: LaunchStep,
  percent: number,
  state: string
): 'done' | 'active' | 'failed' | 'pending' {
  if (state === 'completed') return 'done'
  if (percent >= step.doneAt) return 'done'
  if (percent >= step.activeAt) return state === 'failed' ? 'failed' : 'active'
  return 'pending'
}

function truncate(pk: string) {
  return `${pk.slice(0, 8)}...${pk.slice(-8)}`
}

const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const int0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span style={{
      width: 16, height: 16, borderRadius: '50%', flex: 'none',
      border: `1.5px solid ${selected ? 'var(--accent)' : 'rgba(233,233,237,.22)'}`,
      background: selected ? 'var(--accent)' : 'transparent',
      boxShadow: selected ? 'inset 0 0 0 3px #1a1c2c' : 'none',
      transition: 'background .12s, border-color .12s',
    }} />
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

  // pool config
  const [configAddress, setConfigAddress] = useState(DEFAULT_CONFIG_ADDRESS)
  const [configPickerOpen, setConfigPickerOpen] = useState(false)

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
  const [jobHasAutoBuy, setJobHasAutoBuy] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchWallets = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiFetch<Wallet[]>('/api/wallets/listWallets')
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
        const data = await apiFetch<JobStatus>(`/api/coins/status/${jobId}`)
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
    fd.append('configAddress', configAddress)
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
      const res = await fetch('/api/coins/newLaunch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`)
      setJobHasAutoBuy(autoBuyEnabled)
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

  function handleUseConfig(address: string) {
    setConfigAddress(address)
    setConfigPickerOpen(false)
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
  const launchSteps = useMemo(() => buildLaunchSteps(jobHasAutoBuy), [jobHasAutoBuy])

  const launchDisabled = submitting || loadingWallets || !fundingWalletId || !feeWalletId || (autoBuyEnabled && !slaveWalletId)

  /* ── presentation-only derivations ─────────────────────────────── */

  const formattedTokenPrice = tokenPrice != null
    ? (() => {
        const places = Math.max(2, Math.ceil(-Math.log10(tokenPrice)) + 4)
        const raw = tokenPrice.toFixed(places)
        const trimmed = raw.replace(/(\.\d{2}.*?)0+$/, '$1')
        return `$${trimmed}`
      })()
    : null

  const estimate: { k: string; v: string | null; accent?: boolean }[] = [
    { k: 'SOL price',       v: solPrice != null ? usd2.format(solPrice) : null },
    { k: 'Est. market cap', v: marketCap != null ? usd0.format(marketCap) : null },
    { k: 'Token price',     v: formattedTokenPrice },
    { k: 'Pool supply',     v: parseFloat(supply) > 0 ? int0.format(parseFloat(supply) * (effectivePoolPct / 100)) : null, accent: advanced },
    { k: 'Cost',            v: solPrice != null && parseFloat(initialLiquiditySol) > 0 ? usd2.format(solPrice * parseFloat(initialLiquiditySol)) : null },
  ]

  const preflight: { text: string; ok: boolean }[] = [
    { text: image ? 'Token image ready' : 'Token image not chosen', ok: !!image },
    { text: selectedFunding ? 'Funding wallet selected' : 'Funding wallet not selected', ok: !!selectedFunding },
    { text: selectedFee ? 'Fee wallet selected' : 'Fee wallet not selected', ok: !!selectedFee },
    ...(autoBuyEnabled ? [{ text: selectedSlave ? 'Auto-buy wallet selected' : 'Auto-buy wallet not selected', ok: !!selectedSlave }] : []),
    { text: solPrice != null ? 'SOL price loaded' : 'SOL price unavailable', ok: solPrice != null },
  ]

  function walletButton(type: 'funding' | 'fee' | 'slave', selected: Wallet | undefined, id: string) {
    return (
      <button
        type="button"
        id={id}
        className="input select-btn"
        onClick={() => setPickerOpen(type)}
        disabled={loadingWallets}
      >
        {loadingWallets
          ? <span className="placeholder">Loading…</span>
          : selected
            ? <span>{truncate(selected.public_key)}</span>
            : <span className="placeholder">Select {type} wallet</span>}
        <ChevronDown />
      </button>
    )
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">SPL deployment and mint management</div>
        <Seg
          options={[{ id: 'default', label: 'Default' }, { id: 'advanced', label: 'Advanced' }] as const}
          value={advanced ? 'advanced' : 'default'}
          onChange={m => setAdvanced(m === 'advanced')}
          label="Launch mode"
        />
      </div>

      <div className="split-layout">
        <form id="launch-form" onSubmit={handleSubmit} className="stack">

          {error && <div className="alert" role="alert">{error}</div>}

          {/* ── 1 Token identity ───────────────────────────────── */}
          <section className="glass glow card">
            <StepHead n={1} title="Token identity" />
            <div className="grid-auto" style={{ '--min': '200px', gap: 16 } as React.CSSProperties}>
              <div className="field">
                <label className="label" htmlFor="lp-name">Token name</label>
                <input id="lp-name" className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spectre Coin" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lp-symbol">Symbol</label>
                <input id="lp-symbol" className="input mono" type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. SPCT" maxLength={10} required />
              </div>
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label className="label" htmlFor="lp-desc">Description</label>
              <textarea id="lp-desc" className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your token..." required rows={3} />
            </div>

            <div className="row-flex" style={{ gap: 14, marginTop: 16, flexWrap: 'nowrap' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 11, flex: 'none', overflow: 'hidden',
                border: imagePreview ? '1px solid var(--line-2)' : '1px dashed rgba(233,233,237,.16)',
                background: 'rgba(16,18,32,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {imagePreview
                  ? <img src={imagePreview} alt="Token preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span className="mono" style={{ fontSize: 9, color: 'rgba(233,233,237,.58)' }}>IMG</span>}
              </div>
              <div className="field" style={{ gap: 9 }}>
                <span className="label">Token image</span>
                <label className="btn btn-accent btn-sm" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {image ? image.name : 'Choose file →'}
                  <input type="file" accept="image/*" onChange={handleImageChange} required style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </section>

          {/* ── Social links (advanced) ───────────────────────── */}
          {advanced && (
            <section className="glass glow card enter">
              <StepHead n="◇" title="Social links" />
              <div className="grid-auto" style={{ '--min': '180px', gap: 16 } as React.CSSProperties}>
                <div className="field">
                  <label className="label" htmlFor="lp-web">Website</label>
                  <input id="lp-web" className="input" type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="lp-x">X</label>
                  <input id="lp-x" className="input" type="text" value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="@handle" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="lp-tg">Telegram</label>
                  <input id="lp-tg" className="input" type="text" value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="t.me/..." />
                </div>
              </div>
            </section>
          )}

          {/* ── 2 Token parameters ────────────────────────────── */}
          <section className="glass glow card">
            <StepHead n={2} title="Token parameters" />
            <div className="grid-auto" style={{ '--min': '170px', gap: 16 } as React.CSSProperties}>
              <div className="field">
                <label className="label" htmlFor="lp-dec">Decimals</label>
                <input id="lp-dec" className="input mono" type="number" value={decimals} onChange={e => setDecimals(Number(e.target.value))} min={0} max={9} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lp-supply">Total supply</label>
                <input id="lp-supply" className="input mono" type="number" value={supply} onChange={e => setSupply(e.target.value)} placeholder="e.g. 1000000000" min={1} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lp-liq">Initial liquidity (SOL)</label>
                <input id="lp-liq" className="input mono" type="number" value={initialLiquiditySol} onChange={e => setInitialLiquiditySol(e.target.value)} placeholder="e.g. 1.5" min={0} step="0.01" required />
              </div>
            </div>

            {advanced && (
              <>
                <div className="field" style={{ marginTop: 22 }}>
                  <label className="label" htmlFor="lp-pool">
                    Pool % of supply
                    <span className="label-value mono">{poolPercentage}%</span>
                  </label>
                  <Range id="lp-pool" min={1} max={100} value={poolPercentage} onChange={setPoolPercentage} />
                </div>
                <div className="row-flex" style={{ gap: '16px 26px', marginTop: 22 }}>
                  <Switch checked={revoke} onChange={setRevoke} label="Revoke mint authority" />
                  <Switch checked={lockMetaData} onChange={setLockMetaData} label="Lock metadata" />
                </div>
              </>
            )}
          </section>

          {/* ── 3 Pool configuration ──────────────────────────── */}
          <section className="glass glow card">
            <StepHead n={3} title="Pool configuration" />
            <div className="row-flex" style={{ gap: 12, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 280px' }}>
                <label className="label" htmlFor="lp-config">Config address</label>
                <input
                  id="lp-config"
                  className="input mono"
                  type="text"
                  value={configAddress}
                  onChange={e => setConfigAddress(e.target.value)}
                  placeholder="e.g. FxWh7P9b5sU6LBu4b5SYZbYinTLnEUxWjiBDKVpj7ooF"
                  required
                  style={{ fontSize: 12 }}
                />
              </div>
              <button type="button" className="btn" onClick={() => setConfigPickerOpen(true)}>
                Browse configs
              </button>
            </div>
          </section>

          {/* ── 4 Wallet selection + auto-buy ─────────────────── */}
          <section className="glass glow card">
            <StepHead n={4} title="Wallet selection" />
            <div className="grid-auto" style={{ '--min': '200px', gap: 16 } as React.CSSProperties}>
              <div className="field">
                <label className="label" htmlFor="lp-funding">Funding wallet</label>
                {walletButton('funding', selectedFunding, 'lp-funding')}
              </div>
              <div className="field">
                <label className="label" htmlFor="lp-fee">Fee wallet</label>
                {walletButton('fee', selectedFee, 'lp-fee')}
              </div>
            </div>

            <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid rgba(233,233,237,.07)' }}>
              <div className="row-flex" style={{ justifyContent: 'space-between' }}>
                <span className="step-title" style={{ color: 'var(--ink-3)' }}>Auto-buy</span>
                <Switch checked={autoBuyEnabled} onChange={setAutoBuyEnabled} label="Enable auto-buy on launch" />
              </div>

              {autoBuyEnabled && (
                <div className="enter" style={{ marginTop: 20 }}>
                  <div className="grid-auto" style={{ '--min': '150px', gap: 16 } as React.CSSProperties}>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label className="label" htmlFor="lp-slave">Slave wallet</label>
                      {walletButton('slave', selectedSlave, 'lp-slave')}
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="lp-buys">Number of buys</label>
                      <input
                        id="lp-buys"
                        className="input mono"
                        type="number"
                        value={numberOfBuys}
                        onChange={e => setNumberOfBuys(Math.max(1, Math.min(10, Number(e.target.value))))}
                        min={1} max={10} step={1}
                      />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="lp-spb">SOL per buy</label>
                      <input
                        id="lp-spb"
                        className="input mono"
                        type="number"
                        value={solPerBuy}
                        onChange={e => setSolPerBuy(e.target.value)}
                        placeholder="0.0000"
                        min={0} step="0.0001"
                      />
                    </div>
                  </div>

                  <div className="split" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <div>
                      <div className="kv-k">Est. % supply / buy</div>
                      <div className="mono" style={{ marginTop: 7, fontSize: 14, color: estimatedPctPerBuy != null && estimatedPctPerBuy >= 0.5 ? 'var(--danger)' : 'var(--text)' }}>
                        {estimatedPctPerBuy != null ? `${estimatedPctPerBuy.toFixed(3)}%` : '—'}
                        {estimatedPctPerBuy != null && estimatedPctPerBuy >= 0.5 && (
                          <span className="tag tag-danger" style={{ marginLeft: 8 }}>High</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="kv-k">Total SOL required</div>
                      <div className="mono" style={{ marginTop: 7, fontSize: 14 }}>
                        {totalSolRequired != null ? `${totalSolRequired.toFixed(4)} SOL` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </form>

        {/* ── aside: estimate + launch ───────────────────────────── */}
        <aside className="aside-sticky stack">
          <div className="glass glass-accent glow glow-bright" style={{ padding: 20 }}>
            <div className="kicker">Launch estimate</div>
            <div className="split" style={{ marginTop: 16 }}>
              {estimate.map(e => (
                <div key={e.k} className="kv" style={{ padding: '11px 14px' }}>
                  <span className="kv-k">{e.k}</span>
                  <span className={e.v == null ? 'kv-v none' : 'kv-v'} style={e.v != null && e.accent ? { color: 'var(--accent-300)' } : undefined}>
                    {e.v ?? '—'}
                  </span>
                </div>
              ))}
            </div>
            <button type="submit" form="launch-form" className="btn btn-accent btn-block" style={{ marginTop: 16 }} disabled={launchDisabled}>
              {submitting ? 'Queuing…' : 'Launch token →'}
            </button>
            <div className="hint" style={{ marginTop: 11, textAlign: 'center', fontSize: 11 }}>
              {advanced ? 'Advanced launch' : 'Default launch · 100% of supply to pool, mint revoked, metadata locked'}
            </div>
          </div>

          <div className="glass-quiet" style={{ padding: '16px 18px' }}>
            <div className="kicker">Preflight</div>
            {preflight.map(p => (
              <div key={p.text} className="row-flex" style={{ gap: 9, marginTop: 12, flexWrap: 'nowrap' }}>
                <span className="dot" style={{ width: 5, height: 5, background: p.ok ? 'var(--accent-400)' : 'var(--accent-700)' }} />
                <span style={{ fontSize: 12, color: p.ok ? 'var(--ink-2)' : 'var(--ink-3)' }}>{p.text}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Wallet picker ─────────────────────────────────────────── */}
      {pickerOpen && (
        <Sheet onClose={() => setPickerOpen(null)} width={560} labelledBy="lp-picker-title">
          <SheetHead
            id="lp-picker-title"
            title={`Select ${pickerOpen} wallet`}
            sub={`${pickerWallets.length} available`}
            onClose={() => setPickerOpen(null)}
          />
          {pickerWallets.length === 0 ? (
            <div className="empty">No {pickerOpen} wallets found. Create one in Wallets.</div>
          ) : (
            <div>
              <div className="t-head" style={{ gridTemplateColumns: '22px 26px 1fr 90px', padding: '10px 26px' }}>
                <span /><span /><span>Address</span><span>Label</span>
              </div>
              {pickerWallets.map(w => {
                const isSelected = w.wallet_id === pickerSelected
                return (
                  <div
                    key={w.wallet_id}
                    className="t-row clickable glow glow-sm"
                    onClick={() => handlePickerSelect(w.wallet_id)}
                    style={{ gridTemplateColumns: '22px 26px 1fr 90px', padding: '12px 26px', background: isSelected ? 'rgba(145,132,217,.08)' : undefined }}
                  >
                    <RadioDot selected={isSelected} />
                    <CopyButton text={w.public_key} />
                    <span className="t-cell-mono" style={{ color: isSelected ? 'var(--accent-300)' : 'var(--ink-1)' }}>{truncate(w.public_key)}</span>
                    <span className="t-cell-mono" style={{ color: 'var(--ink-3)' }}>{w.label ?? '—'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Sheet>
      )}

      {/* ── Pool config picker ────────────────────────────────────── */}
      {configPickerOpen && (
        <Sheet onClose={() => setConfigPickerOpen(false)} width={680} labelledBy="lp-config-title">
          <SheetHead id="lp-config-title" title="Browse pool configs" sub="Meteora DAMM v2" onClose={() => setConfigPickerOpen(false)} />

          <div className="sheet-section">
            <div className="kicker" style={{ marginBottom: 14 }}>Definitions</div>
            <div className="stack" style={{ gap: 10 }}>
              {CONFIG_DEFINITIONS.map(({ term, desc }) => (
                <div key={term}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{term}</div>
                  <div className="hint" style={{ marginTop: 2 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {([['SOL only', SOL_ONLY_CONFIGS], ['Compounding', COMPOUNDING_CONFIGS]] as const).map(([title, list]) => (
            <div key={title}>
              <div className="kicker" style={{ padding: '12px 26px', background: 'rgba(16,18,32,.35)', borderBottom: '1px solid var(--line-soft)' }}>{title}</div>
              {list.map(cfg => {
                const inUse = cfg.configAddress === configAddress
                return (
                  <div key={cfg.configAddress} className="t-row hover" style={{ gridTemplateColumns: '1fr auto', padding: '13px 26px', gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: inUse ? 'var(--accent-300)' : 'var(--ink-1)' }}>{cfg.label}</div>
                      <div className="hint" style={{ marginTop: 3 }}>{cfg.description}</div>
                    </div>
                    <button type="button" className={inUse ? 'btn btn-accent btn-xs' : 'btn btn-xs'} onClick={() => handleUseConfig(cfg.configAddress)}>
                      {inUse ? 'In use' : 'Use'}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </Sheet>
      )}

      {/* ── Launch progress ───────────────────────────────────────── */}
      {modalOpen && (
        <Sheet onClose={handleClose} width={500} labelledBy="lp-progress-title">
          <SheetHead
            id="lp-progress-title"
            title={isDone ? 'Launch complete' : isFailed ? 'Launch failed' : 'Launching token'}
            sub={isDone ? 'Token is live on Solana' : isFailed ? 'An error occurred' : 'Processing on-chain…'}
            onClose={handleClose}
          />

          <div className="sheet-section">
            <div className="stack" style={{ gap: 12 }}>
              {launchSteps.map(step => {
                const status = getStepStatus(step, percent, jobStatus?.state ?? 'waiting')
                return (
                  <div key={step.label} className="row-flex" style={{ gap: 12, flexWrap: 'nowrap' }}>
                    <span style={{ width: 18, height: 18, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {status === 'done' && <span style={{ color: 'var(--accent-400)' }}><CheckIcon size={12} /></span>}
                      {status === 'active' && <span className="ring-spin" />}
                      {status === 'failed' && <span style={{ color: 'var(--danger)' }}><CloseIcon size={12} /></span>}
                      {status === 'pending' && <span className="dot" style={{ width: 5, height: 5, background: 'var(--ink-5)' }} />}
                    </span>
                    <span style={{
                      fontSize: 12.5,
                      color: status === 'done' ? 'var(--ink-2)' : status === 'active' ? 'var(--text)' : status === 'failed' ? 'var(--danger)' : 'var(--ink-5)',
                    }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="progress-track">
                <div className={isFailed ? 'progress-fill failed' : 'progress-fill'} style={{ width: `${percent}%` }} />
              </div>
              <div className="meta" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>{isFailed ? 'Failed' : isDone ? 'Complete' : 'In progress'}</span>
                <span>{percent}%</span>
              </div>
            </div>
          </div>

          {isDone && jobStatus?.value && (
            <div className="sheet-section stack" style={{ gap: 14 }}>
              {([
                { label: 'Mint address', value: jobStatus.value.mintAddress },
                { label: 'Pool address', value: jobStatus.value.poolAddress },
              ] as const).map(item => (
                <div key={item.label}>
                  <div className="kicker">{item.label}</div>
                  <div className="row-flex" style={{ marginTop: 6, flexWrap: 'nowrap' }}>
                    <span className="addr" style={{ flex: 1 }}>{item.value}</span>
                    <CopyButton text={item.value} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isFailed && jobStatus?.failed && (
            <div className="sheet-section">
              <div className="alert">{jobStatus.failed}</div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}
