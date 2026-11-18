'use client'

/**
 * Command centre data layer.
 *
 * Everything here goes through the gateway ("live calls" below): bundle
 * groups, their wallets, funding wallets, SOL balances, the user's launched
 * tokens, distribute, buy and the per-wallet reserve. The reserve is used
 * only to grey out wallets with nothing available to trade; the server
 * enforces it at buy time.
 */

import type { ApiFetch } from './api'
import { fetchGroupBalances, type WalletBalance } from './balances'

/* ------------------------------------------------------------------ types */

/** A row from GET /api/liquidity/tokens (the fields this panel uses). */
export interface LaunchedToken {
  token_id: string
  mint_address: string
  name: string
  symbol: string
  image_uri: string | null
  pool_address: string
  launched_at: string
}

export interface GroupMember {
  wallet_id: string
  public_key: string
  index: number                // 1-based position inside the group
  lamports: number
  ata_exists: boolean
}

export interface BundleGroup {
  group_id: string
  name: string
  created_at: string           // ISO
  members: GroupMember[] | null  // null until the group's wallets have been read
}

export interface FundingWallet {
  wallet_id: string
  public_key: string
  lamports: number | null      // null when the balance read failed
}

/* ------------------------------------------------------- reserve math */

export const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * GET /api/liquidity/reserve → { baseReserve: lamports string }: what every
 * wallet keeps back for its own fees and rent. Same value for every wallet.
 */
export async function loadBaseReserve(apiFetch: ApiFetch): Promise<string> {
  const data = await apiFetch<{ baseReserve?: unknown }>('/api/liquidity/reserve')
  const r = data?.baseReserve
  if (typeof r !== 'string' || !/^\d+$/.test(r)) throw new Error('Unexpected reserve response')
  return r
}

/** Lamports a wallet can spend on a buy: balance − baseReserve (may be ≤ 0). BigInt on lamport strings. */
export function availableLamports(balanceLamports: string, baseReserve: string): bigint {
  return BigInt(balanceLamports) - BigInt(baseReserve)
}

/* ------------------------------------------------------------ formatting */

export function sol(lamports: number, decimals = 4): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(decimals)
}

export function truncateAddress(a: string, head = 4, tail = 4): string {
  if (!a) return '—'
  if (a.length <= head + tail + 1) return a
  return `${a.slice(0, head)}…${a.slice(-tail)}`
}


/* ------------------------------------------------------------- live calls */
/*
 * These go through the gateway with the caller's apiFetch (lib/api), which
 * attaches the bearer token and handles 401 → refresh. Errors are ApiError.
 *   loadGroups          GET  /api/wallets/bundleGroups
 *   loadGroupMembers    GET  /api/wallets/bundleGroups/:groupID/wallets
 *   loadFundingWallets  GET  /api/wallets/listWallets        (wallet_type=funding)
 *                       POST /api/wallets/groupBalance       (one request for all of them)
 *   distributeToGroup   POST /api/liquidity/bundleGroups/:groupID/distribute
 *   loadMyTokens        GET  /api/liquidity/tokens
 *   buyFromWallets      POST /api/liquidity/buy
 *   loadBaseReserve     GET  /api/liquidity/reserve
 * Roster balances are read through useWalletBalances (lib/balances).
 * Withdraw lives in lib/withdraw.
 */

interface ApiWallet {
  public_key: string
  wallet_type: 'master' | 'funding' | 'slave' | 'fee'
  wallet_id: string
}

interface ApiBundleGroup {
  group_id: string
  group_name: string
  created_at: string
}

interface ApiGroupWallet {
  position: number             // 0-based
  wallet_id: string
  public_key: string
}

export async function loadGroups(apiFetch: ApiFetch): Promise<BundleGroup[]> {
  const rows = await apiFetch<ApiBundleGroup[]>('/api/wallets/bundleGroups')
  return rows.map(g => ({ group_id: g.group_id, name: g.group_name, created_at: g.created_at, members: null }))
}

/** Members come back unfunded; hydrate them from useWalletBalances. A 404 means the group is gone. */
export async function loadGroupMembers(apiFetch: ApiFetch, groupId: string): Promise<GroupMember[]> {
  const rows = await apiFetch<ApiGroupWallet[]>(`/api/wallets/bundleGroups/${encodeURIComponent(groupId)}/wallets`)
  return rows.map(w => ({
    wallet_id: w.wallet_id,
    public_key: w.public_key,
    index: w.position + 1,
    lamports: 0,
    ata_exists: false,
  }))
}

/**
 * Funding wallets with balances from one groupBalance request (every funding
 * wallet is an option in the funding select). lamports is null when the read
 * failed or the key came back missing.
 */
export async function loadFundingWallets(apiFetch: ApiFetch): Promise<FundingWallet[]> {
  const wallets = await apiFetch<ApiWallet[]>('/api/wallets/listWallets')
  const funding = wallets.filter(w => w.wallet_type === 'funding')
  const { balances } = funding.length
    ? await fetchGroupBalances(apiFetch, funding.map(w => w.public_key))
    : { balances: {} as Record<string, WalletBalance> }
  return funding.map(w => {
    const b = balances[w.public_key]
    return { wallet_id: w.wallet_id, public_key: w.public_key, lamports: b ? lamportsToNumber(b.lamports) : null }
  })
}

export type SplitMode = 'even' | 'random'

export interface DistributeAllocation {
  position: number             // 0-based, same as the roster's position (shown as #position+1)
  publicKey: string
  transferAmount: string       // lamports
}

export interface DistributeTx {
  status: 'confirmed' | 'failed'
  signature?: string
  positions: number[]
  error?: string
}

/** 200 = every transaction confirmed; 207 = at least one failed. Amounts are lamport strings. */
export interface DistributeResult {
  baseReserve: string
  allocations: DistributeAllocation[]
  transactions: DistributeTx[]
}

/**
 * Sends real SOL from the funding wallet to EVERY wallet in the group. Waits
 * for on-chain confirmation, so it can take several seconds. The gateway adds
 * the user from the bearer token; the body never carries a user id.
 */
export async function distributeToGroup(
  apiFetch: ApiFetch,
  groupId: string,
  body: { fundingPublicKey: string; grandTotal: string; splitMode: SplitMode },
): Promise<DistributeResult> {
  const data = await apiFetch<DistributeResult>(`/api/liquidity/bundleGroups/${encodeURIComponent(groupId)}/distribute`, {
    method: 'POST',
    body: JSON.stringify({ fundingPublicKey: body.fundingPublicKey, grandTotal: body.grandTotal, splitMode: body.splitMode }),
  })
  if (!data || !Array.isArray(data.allocations) || !Array.isArray(data.transactions)) {
    throw new Error('Unexpected distribute response')
  }
  return data
}

/**
 * Lamports string → number for the buy-floor math. Exact below 2^53 lamports
 * (~9M SOL), far above any wallet this panel handles.
 */
export function lamportsToNumber(lamports: string): number {
  return Number(lamports)
}

/** The user's launched tokens, newest first. Only rows with a pool are returned. */
export async function loadMyTokens(apiFetch: ApiFetch): Promise<LaunchedToken[]> {
  const rows = await apiFetch<unknown>('/api/liquidity/tokens')
  if (!Array.isArray(rows)) throw new Error('Unexpected tokens response')
  return rows.filter((t): t is LaunchedToken =>
    !!t && typeof t.mint_address === 'string' && typeof t.pool_address === 'string' && t.pool_address.length > 0,
  )
}

/* ------------------------------------------------------------------- buy */

export type ExecutionMode = 'sequential' | 'bundle'
export type BuyAmountMode = 'perWallet' | 'percent'

/**
 * The server accepts up to 25 wallets, but a sequential run takes several
 * seconds per wallet and can outlast the proxy timeout. Kept at 10 until buys
 * move to a background job.
 */
export const MAX_BUY_WALLETS_PER_REQUEST = 10

export type BuyRequestBody = {
  poolAddress: string
  walletPublicKeys: string[]
  executionMode: ExecutionMode
} & (
  | { amountMode: 'perWallet'; amounts: Record<string, string> }   // publicKey → lamports string
  | { amountMode: 'percent'; percentBps: number }                  // integer, 1–10000
)

export interface WalletBuyResult {
  publicKey: string
  status: 'confirmed' | 'failed'
  signature?: string
  amountIn?: string            // lamports
  minimumOut?: string
  error?: string               // INSUFFICIENT_FUNDS | AMOUNT_EXCEEDS_AVAILABLE | … | SEND_FAILED | BUY_FAILED
  message?: string
}

/** 200 = every wallet bought; 207 = some or none did. `results` is per wallet. */
export interface BuyResult {
  executionMode: ExecutionMode
  confirmed: number
  failed: number
  results: WalletBuyResult[]
}

function isWalletBuyResult(v: unknown): v is WalletBuyResult {
  const r = v as WalletBuyResult
  return !!r && typeof r.publicKey === 'string' && (r.status === 'confirmed' || r.status === 'failed')
}

/**
 * Buys from each wallet, one after another (sequential), waiting for
 * on-chain confirmation of each. Sends real SOL and can take several seconds
 * per wallet. The gateway adds the user from the bearer token; the body never
 * carries a user id. 200 and 207 both resolve; other statuses throw ApiError.
 */
export async function buyFromWallets(apiFetch: ApiFetch, body: BuyRequestBody): Promise<BuyResult> {
  const payload = body.amountMode === 'percent'
    ? { poolAddress: body.poolAddress, walletPublicKeys: body.walletPublicKeys, executionMode: body.executionMode, amountMode: body.amountMode, percentBps: body.percentBps }
    : { poolAddress: body.poolAddress, walletPublicKeys: body.walletPublicKeys, executionMode: body.executionMode, amountMode: body.amountMode, amounts: body.amounts }
  const data = await apiFetch<BuyResult>('/api/liquidity/buy', { method: 'POST', body: JSON.stringify(payload) })
  if (!data || !Array.isArray(data.results) || !data.results.every(isWalletBuyResult)) {
    throw new Error('Unexpected buy response')
  }
  return data
}

/**
 * Percent the user typed → integer basis points, by string math only:
 * "50" → 5000, "12.5" → 1250, "0.5" is rejected (minimum 1%). At most 2 decimals.
 */
export function percentToBps(input: string): { bps: number } | { error: string } {
  const s = input.trim().replace(/%$/, '').trim()
  if (!s) return { error: 'Enter a percentage.' }
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return { error: 'Enter a number from 1 to 100.' }
  const [whole, frac = ''] = s.split('.')
  if (frac.length > 2) return { error: 'At most 2 decimal places.' }
  const bps = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  if (bps < 100 || bps > 10_000) return { error: 'Enter a percentage from 1 to 100.' }
  return { bps }
}

/** Integer basis points → "12.5%" for display. */
export function bpsLabel(bps: number): string {
  const whole = Math.floor(bps / 100)
  const frac = String(bps % 100).padStart(2, '0').replace(/0+$/, '')
  return `${whole}${frac ? `.${frac}` : ''}%`
}
