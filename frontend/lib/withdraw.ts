'use client'

/**
 * Withdraw data layer.
 *
 *   POST /api/liquidity/withdraw
 *     { walletPublicKeys: string[] (1–25), destination, mode: "all" | "amount",
 *       amounts?: { [publicKey]: lamports string } }   // amount mode: every wallet
 *     → 200 (all confirmed, nothing skipped) / 207 (anything else)
 *       { mode, destination, transactions: [...], skipped: [...] }
 *     → 400 { error, message, skipped? }   (BAD_REQUEST, INVALID_DESTINATION, NOTHING_TO_WITHDRAW)
 *
 * The gateway adds the user from the bearer token; the body never carries a user id.
 */

import { ApiError, apiErrorMessage, type ApiFetch } from './api'

/** The server accepts at most this many source wallets per request. */
export const MAX_WITHDRAW_WALLETS = 25

/** Base58, 32–44 chars: the shape of a Solana address. The server does the real check. */
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isPlausibleAddress(value: string): boolean {
  return SOLANA_ADDRESS.test(value)
}

export type WithdrawMode = 'all' | 'amount'

export type WithdrawRequestBody = {
  walletPublicKeys: string[]
  destination: string
} & (
  | { mode: 'all' }
  | { mode: 'amount'; amounts: Record<string, string> }   // publicKey → lamports string
)

export interface WithdrawTx {
  status: 'confirmed' | 'failed'
  wallets: string[]
  feePayer: string
  signature?: string
  error?: string               // WITHDRAW_FAILED | FEE_UNPAYABLE
  message?: string
}

export interface WithdrawSkip {
  publicKey: string
  error: string                // NOTHING_TO_WITHDRAW | AMOUNT_EXCEEDS_BALANCE | WOULD_LEAVE_DUST
  message: string
}

export interface WithdrawResult {
  mode: WithdrawMode
  destination: string
  transactions: WithdrawTx[]
  skipped: WithdrawSkip[]
}

function isWithdrawTx(v: unknown): v is WithdrawTx {
  const t = v as WithdrawTx
  return !!t && (t.status === 'confirmed' || t.status === 'failed') && Array.isArray(t.wallets)
}

function isWithdrawSkip(v: unknown): v is WithdrawSkip {
  const s = v as WithdrawSkip
  return !!s && typeof s.publicKey === 'string' && typeof s.error === 'string'
}

/**
 * Sends real SOL. Waits for on-chain confirmation, so it can take several
 * seconds. 200 and 207 both resolve; other statuses throw ApiError.
 */
export async function withdrawFromWallets(apiFetch: ApiFetch, body: WithdrawRequestBody): Promise<WithdrawResult> {
  const payload = body.mode === 'amount'
    ? { walletPublicKeys: body.walletPublicKeys, destination: body.destination, mode: body.mode, amounts: body.amounts }
    : { walletPublicKeys: body.walletPublicKeys, destination: body.destination, mode: body.mode }
  const data = await apiFetch<WithdrawResult>('/api/liquidity/withdraw', { method: 'POST', body: JSON.stringify(payload) })
  if (!data || !Array.isArray(data.transactions) || !data.transactions.every(isWithdrawTx)) {
    throw new Error('Unexpected withdraw response')
  }
  return { ...data, skipped: Array.isArray(data.skipped) ? data.skipped.filter(isWithdrawSkip) : [] }
}

/** What the form shows for a failed request. `uncertain`: funds may or may not have moved. */
export interface WithdrawFailure {
  message: string
  uncertain: boolean
  /** Per-wallet reasons from a 400 NOTHING_TO_WITHDRAW. */
  skipped: WithdrawSkip[]
}

export function withdrawFailure(err: unknown): WithdrawFailure {
  if (err instanceof ApiError) {
    // rejected before anything was sent: the server's message, inline
    if (err.status === 400) {
      const raw = (err.body as { skipped?: unknown } | null | undefined)?.skipped
      const skipped = Array.isArray(raw) ? raw.filter(isWithdrawSkip) : []
      return { message: apiErrorMessage(err) ?? 'The withdrawal was rejected.', uncertain: false, skipped }
    }
    // apiFetch already tried a token refresh and logged out if that failed
    if (err.status === 401) return { message: err.message, uncertain: false, skipped: [] }
  }
  // 500 / 502 / 504 / network / unreadable 2xx: transactions may have been sent
  return { message: 'The withdrawal failed on the server.', uncertain: true, skipped: [] }
}
