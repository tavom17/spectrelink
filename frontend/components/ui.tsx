'use client'

/**
 * Shared Arcana UI primitives. Presentation only — no data or API logic lives
 * here. Styling comes from the classes in app/globals.css.
 */

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

/* ------------------------------------------------------------------ icons */

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronDown({ size = 10, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden style={style}>
      <path d="M2 3.8L5 6.8L8 3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden className={spinning ? 'spin' : undefined}>
      <path d="M12 7a5 5 0 1 1-1.6-3.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 1.2V4H9.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CheckIcon({ size = 9 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2 5.2 L4 7.2 L8 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ sheet */

/**
 * Modal sheet. Portalled to <body> so a glass ancestor's backdrop-filter can
 * never become its containing block. Clicking the backdrop or pressing Escape
 * calls onClose.
 */
export function Sheet({ onClose, width = 640, children, labelledBy }: {
  onClose: () => void
  width?: number
  children: ReactNode
  labelledBy?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Sheets only open after user interaction, so this is always client-side.
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet glow" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ maxWidth: width }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function SheetHead({ title, sub, onClose, lead, id }: {
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  lead?: ReactNode
  id?: string
}) {
  return (
    <div className="sheet-head">
      {lead}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="sheet-title" id={id}>{title}</div>
        {sub && <div className="kicker sheet-sub">{sub}</div>}
      </div>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- controls */

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track"><span className="switch-thumb" /></span>
      <span>{label}</span>
    </button>
  )
}

export function Check({ checked, disabled, onChange, title }: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className="check"
      disabled={disabled}
      title={title}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange() }}
    >
      {checked && <CheckIcon />}
    </button>
  )
}

export function Seg<T extends string>({ options, value, onChange, small, label }: {
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  small?: boolean
  label?: string
}) {
  return (
    <div className={small ? 'seg seg-sm' : 'seg'} role="tablist" aria-label={label}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          className="seg-opt"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Range input whose filled track follows the value. */
export function Range({ value, min, max, step = 1, onChange, id }: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  id?: string
}) {
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ '--fill': `${fill}%` } as CSSProperties}
    />
  )
}

/* ------------------------------------------------------------------ pieces */

export function StepHead({ n, title }: { n: ReactNode; title: string }) {
  return (
    <div className="step-head">
      <span className="step">{n}</span>
      <span className="step-title">{title}</span>
    </div>
  )
}

/** Marks a surface whose numbers come from lib/placeholders, not the API. */
export function PreviewTag() {
  return <span className="tag" title="Placeholder values — this section is not wired to the API yet">Preview data</span>
}

/** Token image with a lettered fallback. */
export function TokenTile({ src, symbol, size = 28, radius = 8 }: {
  src?: string | null
  symbol?: string
  /** px, or 'fill' to take the parent's box */
  size?: number | 'fill'
  radius?: number
}) {
  const [broken, setBroken] = useState(false)
  const show = !!src && !broken
  const box = size === 'fill' ? '100%' : size
  const fontSize = size === 'fill' ? 44 : Math.round(size * 0.4)
  return (
    <div className="tile" style={{ width: box, height: box, borderRadius: radius, fontSize }}>
      {show
        ? <img src={src as string} alt={symbol ?? ''} onError={() => setBroken(true)} />
        : <span aria-hidden>{(symbol || '?').charAt(0).toUpperCase()}</span>}
    </div>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button type="button" className="icon-btn" onClick={copy} title="Copy address" aria-label="Copy address" style={{ width: 26, height: 26, borderRadius: 7 }}>
      {copied
        ? <CheckIcon size={11} />
        : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="4" y="1" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" />
            <rect x="1" y="3" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="rgba(16,18,32,.9)" />
          </svg>
        )}
    </button>
  )
}

/* ------------------------------------------------------ action results */

export function SolscanLink({ kind, id, children }: { kind: 'tx' | 'account'; id?: string; children: ReactNode }) {
  if (!id) return <>{children}</>
  return (
    <a href={`https://solscan.io/${kind}/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </a>
  )
}

export function StatusIcon({ status }: { status: 'confirmed' | 'failed' | 'pending' }) {
  if (status === 'confirmed') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--accent-400)', flexShrink: 0 }} aria-label="Confirmed">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4.6 7.2 L6.3 8.9 L9.4 5.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (status === 'failed') return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--danger)', flexShrink: 0 }} aria-label="Failed">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 5 L9 9 M9 5 L5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-label="Pending">
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7 4 V7 L9 8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** Key/value line for confirmation callouts. `wrap` lets a long value (an address) break instead of overflow. */
export function Line({ k, v, strong, wrap }: { k: string; v: string; strong?: boolean; wrap?: boolean }) {
  return (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
      <span style={{ color: strong ? 'var(--accent-400)' : 'rgba(233,233,237,.55)', flexShrink: 0 }}>{k}</span>
      <span style={{ color: strong ? 'var(--accent-300)' : 'rgba(233,233,237,.78)', textAlign: 'right', ...(wrap ? { wordBreak: 'break-all' } : {}) }}>{v}</span>
    </div>
  )
}
