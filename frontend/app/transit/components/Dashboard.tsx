'use client'

/**
 * Dashboard — not wired to the API yet. Every number comes from
 * lib/placeholders and the page is tagged "Preview data" until it is.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { PreviewTag, Seg, TokenTile } from '@/components/ui'
import {
  DASH_STATS, PNL_SERIES, PNL_HEADLINE, PNL_SPLIT, WALLET_COMPOSITION, RECENT_LAUNCHES,
  type PnlRange,
} from '@/lib/placeholders'

const RANGES = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'All', label: 'All' },
] as const satisfies readonly { id: PnlRange; label: string }[]

export default function Dashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [range, setRange] = useState<PnlRange>('30d')
  const walletTotal = WALLET_COMPOSITION.reduce((s, w) => s + w.count, 0)

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Portfolio overview</div>
        <PreviewTag />
      </div>

      {/* stat tiles */}
      <div className="grid-auto" style={{ '--min': '190px' } as React.CSSProperties}>
        {DASH_STATS.map(s => (
          <div key={s.label} className="glass glow lift" style={{ padding: '17px 18px 16px', '--glow-size': '220px' } as React.CSSProperties}>
            <div className="kicker">{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
              <span className="value-xl">{s.value}</span>
              {s.unit && <span className="hint">{s.unit}</span>}
            </div>
            <div className="hint" style={{ marginTop: 9, fontSize: 11 }}>{s.note}</div>
          </div>
        ))}
      </div>

      <div className="grid-auto" style={{ '--min': '330px', marginTop: 14 } as React.CSSProperties}>
        {/* PnL */}
        <div className="glass glow" style={{ padding: '20px 22px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="kicker">Profit and loss · {range === 'All' ? 'all time' : range}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 40, letterSpacing: '-.025em', color: 'var(--accent-400)', lineHeight: 1.1 }}>
                  {PNL_HEADLINE.value}
                </span>
                <span className="hint" style={{ fontSize: 13 }}>{PNL_HEADLINE.unit}</span>
                <span className="tag tag-accent" style={{ textTransform: 'none', letterSpacing: 0 }}>{PNL_HEADLINE.change}</span>
              </div>
            </div>
            <Seg small options={RANGES} value={range} onChange={setRange} label="PnL range" />
          </div>

          <div style={{ marginTop: 16 }}>
            <LineChart values={PNL_SERIES[range]} stepDays={range === 'All' ? 7 : 1} unit="SOL" />
          </div>

          <div className="split" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {PNL_SPLIT.map(p => (
              <div key={p.label}>
                <div className="kicker" style={{ letterSpacing: '.18em' }}>{p.label}</div>
                <div className="mono" style={{ marginTop: 8, fontSize: 17, color: p.accent ? 'var(--text)' : 'var(--ink-2)' }}>{p.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* wallet composition */}
        <div className="glass glow" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div className="kicker">Wallet composition</div>
            <button type="button" className="btn-link" onClick={() => onNavigate?.('bundler')}>Manage →</button>
          </div>
          <div className="stack" style={{ gap: 18, marginTop: 20 }}>
            {WALLET_COMPOSITION.map(w => (
              <div key={w.label}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'rgba(233,233,237,.80)' }}>{w.label}</span>
                  <span className="mono" style={{ fontSize: 12.5 }}>{w.count}</span>
                </div>
                <div className="bar-track" style={{ marginTop: 8 }}>
                  <div className="bar-fill" style={{ width: `${(w.count / walletTotal) * 100}%` }} />
                </div>
                <div className="meta" style={{ marginTop: 7 }}>{w.sol} SOL held</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* recent launches */}
      <div className="glass glow" style={{ marginTop: 14, '--glow-size': '360px' } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 13px' }}>
          <span className="kicker">Recent launches</span>
          <button type="button" className="btn-link" onClick={() => onNavigate?.('liquidity')}>View all →</button>
        </div>
        <div className="t-scroll">
          <div style={{ minWidth: 560 }}>
            <div className="t-head" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', borderTop: '1px solid var(--line-soft)' }}>
              <span>Token</span><span>Launched</span><span>Launched with</span><span>Fees</span><span className="t-right">PnL</span>
            </div>
            {RECENT_LAUNCHES.map(r => (
              <div key={r.sym} className="t-row hover glow glow-sm" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 22px' }}>
                <div className="row-flex" style={{ gap: 11, flexWrap: 'nowrap' }}>
                  <TokenTile symbol={r.sym} size={28} />
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                    <span style={{ fontSize: 12.5 }}>{r.name}</span>
                    <span className="meta" style={{ fontSize: 10 }}>{r.sym}</span>
                  </div>
                </div>
                <span className="t-cell-mono" style={{ color: 'var(--ink-3)' }}>{r.date}</span>
                <span className="t-cell-mono">{r.liq}</span>
                <span className="t-cell-mono">{r.fees}</span>
                <span className="t-cell-mono t-right" style={{ color: r.pnl < 0 ? 'var(--ink-3)' : 'var(--accent-400)' }}>
                  {r.pnl >= 0 ? '+' : ''}{r.pnl.toFixed(2)} SOL
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ line chart */

const CHART_H = 150
const PAD = { top: 10, right: 12, bottom: 22, left: 40 }

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1
  const raw = span / (count - 1)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function fmtDay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Single-series cumulative line: 2px stroke, 10% wash, crosshair + tooltip. */
function LineChart({ values, stepDays, unit }: { values: number[]; stepDays: number; unit: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dates = useMemo(() => {
    const today = new Date()
    return values.map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - (values.length - 1 - i) * stepDays)
      return d
    })
  }, [values, stepDays])

  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const plotW = width - PAD.left - PAD.right
  const plotH = CHART_H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (values.length === 1 ? plotW : (i / (values.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const base = y(Math.max(yMin, 0))
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`
  const last = values.length - 1

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const t = (e.clientX - r.left) / r.width
    setHover(Math.max(0, Math.min(last, Math.round(t * last))))
  }

  const fmtVal = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${unit}`

  return (
    <div className="chart" ref={wrapRef}>
      <svg height={CHART_H} viewBox={`0 0 ${width} ${CHART_H}`} role="img"
        aria-label={`Cumulative PnL, ${fmtVal(values[0])} to ${fmtVal(values[last])}`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
              stroke={t === 0 ? 'rgba(233,233,237,.16)' : 'rgba(233,233,237,.06)'} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end"
              fill="rgba(233,233,237,.45)" fontSize="10" fontFamily="var(--mono)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={CHART_H - 4} fill="rgba(233,233,237,.45)" fontSize="10" fontFamily="var(--mono)">{fmtDay(dates[0])}</text>
        <text x={width - PAD.right} y={CHART_H - 4} textAnchor="end" fill="rgba(233,233,237,.45)" fontSize="10" fontFamily="var(--mono)">Today</text>

        <path d={area} fill="var(--accent)" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="var(--accent-400)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="rgba(233,233,237,.22)" strokeWidth={1} />
        )}
        <circle cx={x(hover ?? last)} cy={y(values[hover ?? last])} r={4.5} fill="var(--accent-300)" stroke="var(--bg)" strokeWidth={2} />

        <rect x={PAD.left} y={0} width={plotW} height={CHART_H} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ cursor: 'crosshair' }} />
      </svg>

      {hover !== null && (
        <div className="chart-tip" style={{ left: x(hover), top: y(values[hover]) - 6 }}>
          <strong>{fmtVal(values[hover])}</strong>
          <span>{stepDays === 7 ? `Week of ${fmtDay(dates[hover])}` : fmtDay(dates[hover])}</span>
        </div>
      )}
    </div>
  )
}
