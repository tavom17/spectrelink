'use client'

/**
 * SOL balance reads.
 *
 *   POST /api/wallets/groupBalance  { publicKeys: string[] }  (max 100)
 *     → [{ publicKey, lamports, sol }]
 *
 * `lamports` is the exact value (a decimal string). `sol` is for display only;
 * never do math on it. A wallet with lamports "0" is a real zero balance.
 *
 * Balances are fetched on demand only (page load, group/tab change, new rows
 * coming into view, manual refresh, and right after a distribute or withdraw).
 * Nothing here polls.
 */

import { useRef, useState } from 'react'
import { useApiFetch, type ApiFetch } from './api'

export interface WalletBalance {
  publicKey: string
  lamports: string
  sol: number
}

/** The gateway rejects more than this many keys per request. */
export const MAX_GROUP_BALANCE_KEYS = 100

function isWalletBalance(v: unknown): v is WalletBalance {
  const e = v as WalletBalance
  return !!e
    && typeof e.publicKey === 'string'
    && typeof e.lamports === 'string' && /^\d+$/.test(e.lamports)
    && typeof e.sol === 'number'
}

function uniqueKeys(publicKeys: string[]): string[] {
  return [...new Set(publicKeys.map(k => k.trim()).filter(Boolean))]
}

export interface GroupBalanceResult {
  /** Keyed by publicKey, never by position. */
  balances: Record<string, WalletBalance>
  /** Keys whose request was non-2xx or hit a network error. */
  failed: string[]
}

/**
 * One POST per 100 keys (a single request unless more than 100 are passed).
 * Results are matched to keys by `publicKey`, never by array index.
 */
export async function fetchGroupBalances(apiFetch: ApiFetch, publicKeys: string[]): Promise<GroupBalanceResult> {
  const keys = uniqueKeys(publicKeys)
  const chunks: string[][] = []
  for (let i = 0; i < keys.length; i += MAX_GROUP_BALANCE_KEYS) chunks.push(keys.slice(i, i + MAX_GROUP_BALANCE_KEYS))

  const settled = await Promise.allSettled(chunks.map(async chunk => {
    const rows = await apiFetch<unknown>('/api/wallets/groupBalance', {
      method: 'POST',
      body: JSON.stringify({ publicKeys: chunk }),
    })
    if (!Array.isArray(rows)) throw new Error('Unexpected groupBalance response')
    return rows
  }))

  const balances: Record<string, WalletBalance> = {}
  const failed: string[] = []
  settled.forEach((res, i) => {
    if (res.status === 'rejected') { failed.push(...chunks[i]); return }
    const requested = new Set(chunks[i])
    for (const row of res.value) {
      if (isWalletBalance(row) && requested.has(row.publicKey)) balances[row.publicKey] = row
    }
  })
  return { balances, failed }
}

/** Exact SOL string from a lamports string, e.g. "1500000000" → "1.5". No float math. */
export function lamportsToSolString(lamports: string): string {
  const digits = lamports.replace(/^0+/, '').padStart(10, '0')
  const whole = digits.slice(0, -9)
  const frac = digits.slice(-9).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/**
 * SOL the user typed → lamports string, by string math only (no parseFloat):
 * split on ".", pad/truncate the fraction to 9 digits, join, strip leading zeros.
 * "0.08" → "80000000". Rejects empty, non-numeric, negative, zero and >9 decimals.
 */
export function solToLamports(input: string): { lamports: string } | { error: string } {
  const s = input.trim()
  if (!s) return { error: 'Enter an amount.' }
  if (s.startsWith('-')) return { error: 'Amount must be positive.' }
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return { error: 'Enter a number, e.g. 0.08.' }
  const [whole, frac = ''] = s.split('.')
  if (frac.length > 9) return { error: 'SOL has at most 9 decimal places.' }
  const lamports = (whole + frac.padEnd(9, '0')).replace(/^0+/, '')
  if (!lamports) return { error: 'Amount must be greater than 0.' }
  return { lamports }
}

/** Lamports string → SOL for display, truncated (never rounded up) to `decimals`. BigInt only. */
export function formatSol(lamports: string, decimals = 4): string {
  const l = BigInt(lamports)
  const negative = l < BigInt(0)
  const abs = negative ? -l : l
  const perSol = BigInt(1_000_000_000)
  const whole = (abs / perSol).toString()
  const frac = (abs % perSol).toString().padStart(9, '0').slice(0, decimals)
  return `${negative ? '-' : ''}${whole}${decimals > 0 ? `.${frac}` : ''}`
}

export interface LoadOptions {
  /** Re-read keys that already have a balance (manual refresh, group change). */
  force?: boolean
  /**
   * Post-action read (after a distribute or withdraw): waits for any older
   * read of these keys to settle, then reads all of them again, so a response
   * from before the action can never land after this one.
   */
  fresh?: boolean
}

/** What a `load` call did; null when there was nothing to fetch. */
export interface LoadOutcome { ok: boolean }

/**
 * Balance cache for one panel. `load` batches keys into a single groupBalance
 * request, skips keys already in flight, and (unless `force`) keys that
 * already have a balance. `fresh` loads bypass both skips (see LoadOptions).
 */
export function useWalletBalances() {
  const { apiFetch } = useApiFetch()
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({})
  const [failed, setFailed] = useState<Record<string, true>>({})
  const [inFlightCount, setInFlightCount] = useState(0)
  /** The request currently reading each key. */
  const inFlight = useRef<Map<string, Promise<unknown>>>(new Map())
  // Mirrors `balances` so `load` sees the latest cache even from a stale closure.
  const known = useRef<Set<string>>(new Set())

  async function load(publicKeys: string[], { force = false, fresh = false }: LoadOptions = {}): Promise<LoadOutcome | null> {
    let keys = uniqueKeys(publicKeys)
    if (fresh) {
      const older = keys.map(k => inFlight.current.get(k)).filter((p): p is Promise<unknown> => !!p)
      if (older.length) await Promise.allSettled(older)
    } else {
      keys = keys.filter(k => !inFlight.current.has(k) && (force || !known.current.has(k)))
    }
    if (keys.length === 0) return null

    const request = fetchGroupBalances(apiFetch, keys)
    keys.forEach(k => inFlight.current.set(k, request))
    setInFlightCount(c => c + 1)
    try {
      const res = await request
      Object.keys(res.balances).forEach(k => known.current.add(k))
      res.failed.forEach(k => known.current.delete(k))
      setBalances(prev => {
        const next = { ...prev, ...res.balances }
        res.failed.forEach(k => { delete next[k] })
        return next
      })
      setFailed(prev => {
        const next = { ...prev }
        Object.keys(res.balances).forEach(k => { delete next[k] })
        res.failed.forEach(k => { next[k] = true })
        return next
      })
      return { ok: res.failed.length === 0 }
    } finally {
      keys.forEach(k => { if (inFlight.current.get(k) === request) inFlight.current.delete(k) })
      setInFlightCount(c => c - 1)
    }
  }

  return { balances, failed, loading: inFlightCount > 0, load }
}
