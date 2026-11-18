'use client'

import { useEffect, useRef, useState } from 'react'
import { useApiFetch } from '@/lib/api'
import { solToLamports, formatSol, lamportsToSolString } from '@/lib/balances'
import {
  withdrawFromWallets, withdrawFailure, isPlausibleAddress, MAX_WITHDRAW_WALLETS,
  type WithdrawMode, type WithdrawRequestBody, type WithdrawResult, type WithdrawSkip, type WithdrawFailure,
} from '@/lib/withdraw'
import { Seg, SolscanLink, StatusIcon, Line } from '@/components/ui'

/** A wallet funds can be withdrawn from. `label` is how the screen names it ("#3", "funding"). */
export interface WithdrawSource {
  publicKey: string
  label: string
  /** Last known balance (lamports string); undefined when not read yet. */
  lamports?: string
}

/** One of the user's own wallets offered as a destination shortcut. */
export interface WithdrawQuickPick {
  publicKey: string
  label: string
}

const MODES = [
  { id: 'all', label: 'Withdraw all' },
  { id: 'amount', label: 'Specific amount' },
] as const satisfies readonly { id: WithdrawMode; label: string }[]

/** Exactly what the user confirmed; sent as-is. */
interface WithdrawRequest {
  body: WithdrawRequestBody
  labelByKey: Record<string, string>
  /** amount mode only: the sum of every wallet's amount, in lamports. */
  totalLamports: string | null
  /** Set when the destination is one of the quick picks. */
  destinationLabel: string | null
}

function short(a: string, head = 5, tail = 4): string {
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`
}

/**
 * Withdraw form, confirmation and results for one or many source wallets.
 * Sends real SOL. After any response that may have moved funds (200, 207,
 * or an uncertain failure) it calls `onFundsMoved` so the screen can re-read
 * the balances it shows.
 */
export default function WithdrawPanel({ sources, quickPicks, context, emptyHint, onFundsMoved, onBusyChange }: {
  sources: WithdrawSource[]
  quickPicks: WithdrawQuickPick[]
  /** Shown in the confirmation after the wallet count, e.g. "from Launch set B". */
  context?: string
  /** Shown instead of the form when no wallet is selected. */
  emptyHint?: string
  onFundsMoved: (sourceKeys: string[], destination: string) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const { apiFetch } = useApiFetch()

  const [mode, setMode] = useState<WithdrawMode>('all')
  const [destinationInput, setDestinationInput] = useState('')
  /** SOL typed per wallet, keyed by public key. Kept when a wallet is deselected. */
  const [amountSol, setAmountSol] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<WithdrawRequest | null>(null)
  const [sending, setSending] = useState(false)
  // Synchronous guard: state updates land a render late, a ref blocks a double click.
  const sendingRef = useRef(false)
  const [error, setError] = useState<WithdrawFailure | null>(null)
  /** Per-wallet reasons from the last response (WOULD_LEAVE_DUST etc.), shown on that wallet's row. */
  const [rowNotes, setRowNotes] = useState<Record<string, WithdrawSkip>>({})
  const [result, setResult] = useState<{ request: WithdrawRequest; result: WithdrawResult } | null>(null)

  /* ------------------------------------------------------------- derived */

  const sourceKeys = sources.map(s => s.publicKey)
  const sourceKeySig = sourceKeys.join(',')
  const destination = destinationInput.trim()
  const destinationIsSource = !!destination && sourceKeys.includes(destination)
  const destinationPlausible = isPlausibleAddress(destination)
  const pickLabel = quickPicks.find(p => p.publicKey === destination)?.label ?? null
  const picks = quickPicks.filter(p => !sourceKeys.includes(p.publicKey))

  const amounts = sources.map(s => {
    const raw = amountSol[s.publicKey] ?? ''
    return { s, raw, parsed: solToLamports(raw) }
  })
  const amountLamports = amounts.flatMap(a => ('lamports' in a.parsed ? [a.parsed.lamports] : []))
  const amountsReady = sources.length > 0 && amountLamports.length === sources.length
  const amountTotal = amountLamports.reduce((sum, l) => sum + BigInt(l), BigInt(0)).toString()

  /** Why Withdraw is disabled, or null when it can be reviewed. */
  const blocker: string | null =
    sources.length === 0 ? (emptyHint ?? 'Select wallets to withdraw from')
    : sources.length > MAX_WITHDRAW_WALLETS ? `Select at most ${MAX_WITHDRAW_WALLETS} wallets`
    : !destination ? 'Enter a destination address'
    : !destinationPlausible ? 'Destination is not a valid Solana address'
    : destinationIsSource ? 'Destination cannot be one of the selected wallets'
    : mode === 'amount' && !amountsReady ? 'Enter a positive SOL amount for every selected wallet'
    : null

  const locked = sending || !!pending

  /* ------------------------------------------------------------- effects */

  useEffect(() => { onBusyChange?.(sending) }, [sending]) // eslint-disable-line react-hooks/exhaustive-deps

  // A confirmation is for one exact set of wallets.
  useEffect(() => { cancelPending() }, [sourceKeySig])

  /* ------------------------------------------------------------- actions */

  /** Drops an open confirmation (inputs changed). Never while a request is in flight. */
  function cancelPending() {
    if (!sendingRef.current) setPending(null)
  }

  function edited() {
    setError(null)
    cancelPending()
  }

  function setAmount(publicKey: string, value: string) {
    setAmountSol(prev => ({ ...prev, [publicKey]: value }))
    setRowNotes(prev => {
      if (!prev[publicKey]) return prev
      const next = { ...prev }
      delete next[publicKey]
      return next
    })
    edited()
  }

  /** Step one of two: snapshot the request and show the confirmation. Nothing is sent here. */
  function review() {
    if (sendingRef.current) return
    setError(null)
    if (blocker) { setError({ message: blocker, uncertain: false, skipped: [] }); return }
    const walletPublicKeys = [...sourceKeys]
    const labelByKey = Object.fromEntries(sources.map(s => [s.publicKey, s.label]))
    let body: WithdrawRequestBody
    let totalLamports: string | null = null
    if (mode === 'amount') {
      const map: Record<string, string> = {}
      for (const a of amounts) {
        if (!('lamports' in a.parsed)) return
        map[a.s.publicKey] = a.parsed.lamports
      }
      body = { walletPublicKeys, destination, mode: 'amount', amounts: map }
      totalLamports = amountTotal
    } else {
      body = { walletPublicKeys, destination, mode: 'all' }
    }
    setPending({ body, labelByKey, totalLamports, destinationLabel: pickLabel })
  }

  /** Step two: the only path that sends SOL. */
  async function confirm() {
    const req = pending
    if (!req || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    setResult(null)
    setRowNotes({})
    let moved = false
    try {
      const res = await withdrawFromWallets(apiFetch, req.body)
      setResult({ request: req, result: res })
      setRowNotes(Object.fromEntries(res.skipped.map(s => [s.publicKey, s])))
      moved = true
    } catch (err) {
      const failure = withdrawFailure(err)
      setError(failure)
      setRowNotes(Object.fromEntries(failure.skipped.map(s => [s.publicKey, s])))
      moved = failure.uncertain
    } finally {
      sendingRef.current = false
      setPending(null)
      setSending(false)
    }
    // Funds moved (200 or 207), or may have: let the screen re-read balances. Not awaited.
    if (moved) onFundsMoved(req.body.walletPublicKeys, req.body.destination)
  }

  /* ----------------------------------------------------------- rendering */

  const amountCols = 'minmax(28px, auto) 1fr auto 112px 44px'
  // Notes for wallets that have no amount row on screen (withdraw-all mode, or deselected since).
  const unplacedNotes = Object.values(rowNotes).filter(n => mode !== 'amount' || !sourceKeys.includes(n.publicKey))

  return (
    <>
      <div className="card-body">
        <div className="field">
          <span className="label">Mode</span>
          <Seg small options={MODES} value={mode} onChange={v => { if (!locked) { setMode(v); setError(null) } }} label="Withdraw mode" />
          <div className="hint" style={{ fontSize: 11 }}>
            {mode === 'all'
              ? 'Empties every selected wallet and closes its empty token accounts. Token accounts that still hold tokens are kept.'
              : 'Sends the SOL amount you set for each wallet. Every selected wallet needs an amount.'}
          </div>
        </div>

        {mode === 'amount' && (
          <div style={{ marginTop: 14 }}>
            {sources.length === 0 ? (
              <div className="hint">{emptyHint ?? 'Select wallets to set an amount for each.'}</div>
            ) : (
              <div style={{ borderRadius: 10, border: '1px solid var(--line-soft)', overflow: 'hidden' }}>
                <div className="t-head" style={{ gridTemplateColumns: amountCols, padding: '8px 12px' }}>
                  <span /><span>Wallet</span><span className="t-right">Balance</span><span className="t-right">Send (SOL)</span><span />
                </div>
                {amounts.map(({ s, raw, parsed }) => {
                  const invalid = !!raw.trim() && 'error' in parsed
                  const over = 'lamports' in parsed && s.lamports !== undefined && BigInt(parsed.lamports) > BigInt(s.lamports)
                  const note = rowNotes[s.publicKey]
                  return (
                    <div key={s.publicKey} style={{ borderBottom: '1px solid rgba(233,233,237,.05)' }}>
                      <div className="t-row" style={{ gridTemplateColumns: amountCols, padding: '7px 12px', alignItems: 'center', borderBottom: 0 }}>
                        <span className="t-cell-mono" style={{ color: 'var(--ink-4)' }}>{s.label}</span>
                        <span className="t-cell-mono" style={{ color: 'var(--ink-2)' }} title={s.publicKey}>{short(s.publicKey)}</span>
                        <span className="t-cell-mono t-right" style={{ color: 'var(--ink-3)' }}>{s.lamports !== undefined ? formatSol(s.lamports, 4) : '—'}</span>
                        <input
                          className="input mono"
                          value={raw}
                          onChange={e => setAmount(s.publicKey, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') review() }}
                          disabled={locked}
                          inputMode="decimal"
                          placeholder="0.05"
                          aria-label={`SOL to withdraw from wallet ${s.label}`}
                          aria-invalid={invalid || over || !!note}
                          title={invalid ? (parsed as { error: string }).error : over ? 'More than this wallet holds' : undefined}
                          style={{ fontSize: 12, textAlign: 'right', padding: '6px 9px', borderColor: invalid || over || note ? 'var(--danger-line)' : undefined }}
                        />
                        <button
                          type="button"
                          className="btn btn-xs"
                          disabled={locked || !s.lamports || s.lamports === '0'}
                          onClick={() => s.lamports && setAmount(s.publicKey, lamportsToSolString(s.lamports))}
                          title="Whole balance (empties the wallet)"
                        >
                          Max
                        </button>
                      </div>
                      {(note || invalid) && (
                        <div className="alert-inline" style={{ padding: '0 12px 8px', wordBreak: 'break-word' }}>
                          {note ? note.message : (parsed as { error: string }).error}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="t-row" style={{ gridTemplateColumns: amountCols, padding: '8px 12px' }}>
                  <span /><span className="meta">Total</span><span />
                  <span className="t-cell-mono t-right" style={{ color: 'var(--ink-1)' }}>{amountLamports.length ? formatSol(amountTotal, 6) : '—'}</span>
                  <span />
                </div>
              </div>
            )}
            <div className="hint" style={{ fontSize: 11, marginTop: 10 }}>
              A wallet must end at exactly 0 or at/above the rent minimum, never in between. Max empties it.
              If an amount would leave less than rent, the server rejects that wallet and its row shows the most you can send while
              keeping the wallet open, and the amount that empties it.
            </div>
          </div>
        )}

        <div className="field" style={{ marginTop: 20 }}>
          <label className="label" htmlFor="wd-destination">Destination</label>
          <input
            id="wd-destination"
            className="input mono"
            value={destinationInput}
            onChange={e => { setDestinationInput(e.target.value); edited() }}
            onKeyDown={e => { if (e.key === 'Enter') review() }}
            disabled={locked}
            placeholder="Any Solana address"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!destination && (!destinationPlausible || destinationIsSource)}
            style={{ fontSize: 12 }}
          />
          {destination && !destinationPlausible && <div className="alert-inline">Not a valid Solana address.</div>}
          {destinationIsSource && <div className="alert-inline">That is one of the wallets you are withdrawing from.</div>}
          {picks.length > 0 && (
            <div className="row-flex" style={{ gap: 6, marginTop: 4 }}>
              <span className="meta" style={{ color: 'var(--ink-4)' }}>Your funding wallets:</span>
              {picks.map(p => (
                <button
                  key={p.publicKey}
                  type="button"
                  className="btn btn-xs"
                  disabled={locked}
                  onClick={() => { setDestinationInput(p.publicKey); edited() }}
                  title={p.publicKey}
                  style={{ textTransform: 'none', letterSpacing: '.02em', borderColor: p.publicKey === destination ? 'rgba(145,132,217,.45)' : undefined }}
                >
                  {short(p.publicKey, 4, 4)}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          error.uncertain ? (
            <div className="alert" role="alert" style={{ marginTop: 16, display: 'block' }}>
              {error.message} The outcome is unknown: some transfers may have gone through.
              Balances are being re-read; before trying again, check the wallets on Solscan.
            </div>
          ) : (
            <div className="alert-inline" role="alert" style={{ marginTop: 14 }}>{error.message}</div>
          )
        )}
        {unplacedNotes.length > 0 && (
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {unplacedNotes.map(n => (
              <div key={n.publicKey} className="alert-inline" style={{ wordBreak: 'break-word' }}>
                {short(n.publicKey)}: {n.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {pending ? (
        <div className="callout" style={{ margin: '0 20px 18px' }} aria-live="polite">
          <div className="kicker kicker-accent" style={{ letterSpacing: '.16em' }}>Confirm · sends real SOL</div>
          <div className="stack" style={{ gap: 9, marginTop: 13 }}>
            <Line k="Wallets" v={`${pending.body.walletPublicKeys.length}${context ? ` ${context}` : ''}`} />
            <Line k="Mode" v={pending.body.mode === 'all' ? 'Withdraw all (empties each wallet)' : 'Specific amount per wallet'} />
            {pending.totalLamports !== null && <Line k="Total" v={`${lamportsToSolString(pending.totalLamports)} SOL`} strong />}
            <Line k="Destination" v={pending.body.destination} wrap />
            {pending.destinationLabel && <Line k="" v={`(${pending.destinationLabel})`} />}
          </div>
          <div className="hint" style={{ fontSize: 11, marginTop: 13 }}>
            Check the destination above character by character. Funds sent to the wrong address cannot be recovered.
            {sending && <> Sending and waiting for on-chain confirmation; keep this tab open to see the result.</>}
          </div>
          <div className="row-flex" style={{ justifyContent: 'flex-end', gap: 7, marginTop: 15 }}>
            <button type="button" className="btn" disabled={sending} onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="btn btn-accent" disabled={sending} onClick={confirm}>
              {sending ? 'Withdrawing…' : 'Confirm and send'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card-foot">
          <span className="meta" style={{ color: blocker ? 'var(--ink-4)' : undefined }}>
            {blocker ?? (mode === 'amount'
              ? `${formatSol(amountTotal, 6)} SOL from ${sources.length} ${sources.length === 1 ? 'wallet' : 'wallets'}`
              : `Everything from ${sources.length} ${sources.length === 1 ? 'wallet' : 'wallets'}`)}
          </span>
          <button type="button" className="btn btn-accent" disabled={sending || !!blocker} onClick={review}>
            Withdraw
          </button>
        </div>
      )}

      {result && <WithdrawResultView request={result.request} result={result.result} onDismiss={() => setResult(null)} />}
    </>
  )
}

/** Per-transaction outcomes plus the wallets the server skipped. */
function WithdrawResultView({ request, result, onDismiss }: {
  request: WithdrawRequest
  result: WithdrawResult
  onDismiss: () => void
}) {
  const confirmed = result.transactions.filter(t => t.status === 'confirmed')
  const failed = result.transactions.filter(t => t.status === 'failed')
  const clean = failed.length === 0 && result.skipped.length === 0
  const label = clean ? 'Confirmed' : confirmed.length === 0 ? 'Failed' : 'Partial'
  const confirmedWallets = confirmed.reduce((n, t) => n + t.wallets.length, 0)
  const name = (pk: string) => request.labelByKey[pk] ?? ''

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }} aria-live="polite">
      <div className="card-head" style={{ borderBottom: 0, paddingBottom: 8 }}>
        <div className="row-flex" style={{ gap: 9 }}>
          <span className="section-title" style={{ fontSize: 13.5 }}>Withdraw result</span>
          <span className={clean ? 'tag tag-accent' : 'tag tag-danger'}>{label}</span>
        </div>
        <button type="button" className="btn btn-xs" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="meta" style={{ padding: '0 20px 12px', wordBreak: 'break-all' }}>
        {confirmedWallets} of {request.body.walletPublicKeys.length} {request.body.walletPublicKeys.length === 1 ? 'wallet' : 'wallets'} withdrawn
        {request.totalLamports !== null && <> · {lamportsToSolString(request.totalLamports)} SOL requested</>} · to {result.destination}
      </div>

      {!clean && confirmed.length > 0 && request.body.mode === 'amount' && (
        <div className="alert" role="alert" style={{ margin: '0 20px 14px', display: 'block' }}>
          The confirmed transfers are final. Withdrawing again with the same amounts sends them again from <strong>every</strong> selected wallet,
          so deselect or change the ones that went through first.
        </div>
      )}

      {result.transactions.map((tx, i) => (
        <div key={i} style={{ padding: '10px 20px', borderBottom: '1px solid rgba(233,233,237,.05)' }}>
          <div className="row-flex" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <StatusIcon status={tx.status} />
            <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              Tx {i + 1} · {tx.status === 'confirmed' ? 'confirmed' : tx.error === 'WITHDRAW_FAILED' ? 'not confirmed' : 'failed'}
            </span>
            <span className="mono" style={{ fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {tx.signature
                ? <SolscanLink kind="tx" id={tx.signature}>{short(tx.signature, 8, 8)}</SolscanLink>
                : <span style={{ color: 'var(--ink-5)' }}>no signature</span>}
            </span>
          </div>
          <div className="row-flex" style={{ gap: 8, marginTop: 6, paddingLeft: 23 }}>
            {tx.wallets.map(pk => (
              <span key={pk} className="t-cell-mono" style={{ fontSize: 10.5 }} title={pk}>
                <SolscanLink kind="account" id={pk}>{name(pk) ? `${name(pk)} ` : ''}{short(pk)}</SolscanLink>
              </span>
            ))}
          </div>
          {tx.status === 'failed' && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6, paddingLeft: 23, wordBreak: 'break-word' }}>
              {tx.error === 'WITHDRAW_FAILED'
                ? 'Not confirmed — check the wallets on Solscan before retrying.'
                : tx.message ?? tx.error ?? 'Failed'}
            </div>
          )}
        </div>
      ))}

      {result.skipped.length > 0 && (
        <>
          <div className="t-head" style={{ gridTemplateColumns: '1fr', padding: '10px 20px' }}>
            <span>Skipped · {result.skipped.length}</span>
          </div>
          {result.skipped.map(s => (
            <div key={s.publicKey} style={{ padding: '9px 20px', borderBottom: '1px solid rgba(233,233,237,.05)' }}>
              <span className="t-cell-mono" style={{ color: 'var(--ink-2)' }} title={s.publicKey}>
                {name(s.publicKey) ? `${name(s.publicKey)} ` : ''}{short(s.publicKey)}
              </span>
              <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, wordBreak: 'break-word' }}>{s.message || s.error}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
