'use client'

/**
 * Command centre data layer.
 *
 * Bundle groups, their wallets, funding wallets and SOL balances are live
 * reads through the gateway ("live reads" below). Token data, distribute,
 * buy and retry still come from local fixtures until those endpoints exist.
 * The reserve math, skew split and price walk are the real formulas.
 *
 * The panel only ever touches these functions, so wiring the rest means
 * replacing the bodies in "fixture reads".
 */

import type { ApiFetch } from './api'

/* ------------------------------------------------------------------ types */

export interface TokenSnapshot {
  mint_address: string
  name: string
  symbol: string
  image_uri: string | null
  decimals: number
  pool_address: string
  pool_type: string            // "DAMM v2"
  pool_sol_reserves: number
  pool_token_reserves: number
  price_usd: number
  change_24h: number           // fraction, e.g. -0.0412
  user_owned: boolean          // renders the "Your launch" badge
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

export type LegStatus = 'pending' | 'sent' | 'confirmed' | 'failed' | 'blocked'

export interface JobLeg {
  leg: number                  // 1-based
  transfers: number
  status: LegStatus
  signature: string | null
  error: string | null
  blocked_by: number | null
}

export interface Job {
  job_id: string
  kind: 'distribute' | 'buy'
  legs: JobLeg[]
}

export interface BuySimulation {
  ok: boolean
  legs: number
  tip_lamports: number
  reason: string | null
}

/* ------------------------------------------------------- reserve math */

export const ACCOUNT_RENT_LAMPORTS = 890_880
export const ATA_RENT_LAMPORTS = 2_039_280
export const TX_FEE_LAMPORTS = 10_000
export const BUNDLE_TIP_LAMPORTS = 1_000_000
/** Smallest trade we will let a wallet fire once its floor is covered. */
export const MIN_TRADE_LAMPORTS = 1_000_000
/** Jito bundles cap at 5 transactions; a distribute leg fits 21 transfers. */
export const MAX_TX_PER_BUNDLE = 5
export const TRANSFERS_PER_TX = 21

export const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * Lamports a wallet cannot spend: its own rent if it is currently empty, the
 * token account it does not have yet, and one signature.
 */
export function floorLamports(w: Pick<GroupMember, 'lamports' | 'ata_exists'>): number {
  return (w.lamports === 0 ? ACCOUNT_RENT_LAMPORTS : 0)
    + (w.ata_exists ? 0 : ATA_RENT_LAMPORTS)
    + TX_FEE_LAMPORTS
}

/** Balance a wallet needs before it can be included in a buy. */
export function minimumBuyLamports(w: Pick<GroupMember, 'lamports' | 'ata_exists'>): number {
  return floorLamports(w) + MIN_TRADE_LAMPORTS
}

export function canBuy(w: GroupMember): boolean {
  return w.lamports >= minimumBuyLamports(w)
}

export interface ReserveMath {
  wallets: number
  overheadLamports: number
  tradeableLamports: number
}

/** Reserve math over the selected wallets only, never the whole group. */
export function reserveMath(selected: GroupMember[], totalLamports: number): ReserveMath {
  const overheadLamports = selected.reduce((sum, w) => sum + floorLamports(w), 0)
  return {
    wallets: selected.length,
    overheadLamports,
    tradeableLamports: Math.max(0, totalLamports - overheadLamports),
  }
}

export function distributeTxCount(walletCount: number): number {
  return Math.ceil(walletCount / TRANSFERS_PER_TX) || 0
}

export function bundleCount(txCount: number): number {
  return Math.ceil(txCount / MAX_TX_PER_BUNDLE) || 0
}

/**
 * Split `totalLamports` across `count` wallets with a linear skew: 0% is flat,
 * 60% means the last wallet receives 60% more than the mean and the first 60%
 * less. Remainder lands on the first wallet so the parts sum exactly.
 */
export function skewedSplit(totalLamports: number, count: number, skewPct: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [totalLamports]
  const skew = skewPct / 100
  const mean = totalLamports / count
  const parts = Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * 2 - 1   // -1 → +1
    return Math.floor(mean * (1 + skew * t))
  })
  const drift = totalLamports - parts.reduce((a, b) => a + b, 0)
  parts[0] += drift
  return parts
}

/**
 * Price after each wallet buys, as a constant-product walk:
 * price_i = price0 * ((R + cumulative_i) / R)^2
 */
export function priceWalk(price0: number, solReserves: number, spendsSol: number[]): number[] {
  if (solReserves <= 0) return spendsSol.map(() => price0)
  let cum = 0
  return spendsSol.map(spend => {
    cum += spend
    const ratio = (solReserves + cum) / solReserves
    return price0 * ratio * ratio
  })
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

export function usd(n: number): string {
  if (!isFinite(n)) return '—'
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toPrecision(3)}`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function pct(fraction: number, digits = 2): string {
  const v = fraction * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}


/* ------------------------------------------------------------- live reads */
/*
 * These go through the gateway with the caller's apiFetch (lib/api), which
 * attaches the bearer token and handles 401 → refresh. Errors are ApiError.
 *   loadGroups          GET  /api/wallets/bundleGroups
 *   loadGroupMembers    GET  /api/wallets/bundleGroups/:groupID/wallets
 *   loadFundingWallets  GET  /api/wallets/listWallets        (wallet_type=funding)
 *   loadBalances        GET  /api/wallets/balance?public_key= (one call per key)
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

/** Members come back unfunded; hydrate them with loadBalances. A 404 means the group is gone. */
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

/** SOL balance in lamports, or null if the read failed. */
async function loadLamports(apiFetch: ApiFetch, publicKey: string): Promise<number | null> {
  try {
    const data = await apiFetch<{ balance: number }>(`/api/wallets/balance?public_key=${encodeURIComponent(publicKey)}`)
    return typeof data.balance === 'number' ? Math.round(data.balance * LAMPORTS_PER_SOL) : null
  } catch {
    return null
  }
}

export async function loadFundingWallets(apiFetch: ApiFetch): Promise<FundingWallet[]> {
  const wallets = await apiFetch<ApiWallet[]>('/api/wallets/listWallets')
  const funding = wallets.filter(w => w.wallet_type === 'funding')
  const lamports = await Promise.all(funding.map(w => loadLamports(apiFetch, w.public_key)))
  return funding.map((w, i) => ({ wallet_id: w.wallet_id, public_key: w.public_key, lamports: lamports[i] }))
}

export interface BalanceEntry { lamports: number; ata_exists: boolean }

/**
 * Balances for the roster. The balance route takes a single key, so this
 * fans out one call per wallet; keys whose read failed are left out.
 * The route reports SOL only, so ata_exists is always false and the reserve
 * math assumes every token account still has to be created.
 */
export async function loadBalances(apiFetch: ApiFetch, publicKeys: string[]): Promise<Record<string, BalanceEntry>> {
  const lamports = await Promise.all(publicKeys.map(k => loadLamports(apiFetch, k)))
  const out: Record<string, BalanceEntry> = {}
  publicKeys.forEach((k, i) => {
    const l = lamports[i]
    if (l !== null) out[k] = { lamports: l, ata_exists: false }
  })
  return out
}

/* ---------------------------------------------------------- fixture reads */
/*
 * Endpoints these stand in for, once a backend exists:
 *   loadToken           GET  /api/command-center/token?mint=
 *   distribute          POST /api/bundles/distribute         { funding_wallet_id, total_lamports, skew_pct, targets }
 *   simulateBuy         POST /api/bundles/buy/simulate       { mint, pool_address, slippage_bps, tip_lamports, targets }
 *   executeBuy          POST /api/bundles/buy                (same body)
 *   retryLeg            POST /api/bundles/job/:jobId/retry   { leg }
 */

/** Fake network latency so loading states are visible while building. */
function settle<T>(value: T, ms = 320): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms))
}

export function loadToken(mint: string): Promise<TokenSnapshot> {
  return settle(fixtureToken(mint))
}

/** Stands in for GET /api/liquidity/tokens, behind the "my tokens" button. */
export function loadMyTokens(): Promise<TokenSnapshot[]> {
  return settle(fixtureMyTokens())
}

export interface Target { wallet_id: string; lamports: number }

export function distribute(targets: Target[]): Promise<Job> {
  return settle(fixtureJob('distribute', distributeTxCount(targets.length), targets.length), 700)
}

export function simulateBuy(targets: Target[], tipLamports: number): Promise<BuySimulation> {
  const txCount = targets.length
  return settle(
    { ok: targets.length > 0, legs: bundleCount(txCount), tip_lamports: tipLamports, reason: targets.length ? null : 'No funded wallets selected' },
    600,
  )
}

export function executeBuy(targets: Target[]): Promise<Job> {
  return settle(fixtureJob('buy', bundleCount(targets.length), targets.length), 800)
}

export function retryLeg(job: Job, leg: number): Promise<Job> {
  const legs = job.legs.map(l =>
    l.leg < leg
      ? l
      : {
          ...l,
          status: 'confirmed' as LegStatus,
          signature: pseudoKey(40_000 + l.leg) + pseudoKey(50_000 + l.leg),
          error: null,
          blocked_by: null,
        },
  )
  return settle({ ...job, legs }, 500)
}

/* -------------------------------------------------------------- fixtures */

/** Deterministic base58-looking key so addresses render realistically. */
function pseudoKey(seed: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let out = ''
  let x = (seed * 2654435761) % 4294967296
  for (let i = 0; i < 44; i++) {
    x = (x * 1103515245 + 12345) % 4294967296
    out += alphabet[x % alphabet.length]
  }
  return out
}

function fixtureToken(mint: string): TokenSnapshot {
  return {
    mint_address: mint || pseudoKey(1),
    name: 'Nocturne',
    symbol: 'NCTN',
    image_uri: null,
    decimals: 6,
    pool_address: pseudoKey(99),
    pool_type: 'DAMM v2',
    pool_sol_reserves: 412.64,
    pool_token_reserves: 780_000_000,
    price_usd: 0.000182,
    change_24h: 0.0637,
    user_owned: true,
  }
}

function fixtureMyTokens(): TokenSnapshot[] {
  const base = fixtureToken('')
  return [
    base,
    { ...base, mint_address: pseudoKey(2), name: 'Halfstep', symbol: 'HALF', pool_address: pseudoKey(98), pool_sol_reserves: 88.2, price_usd: 0.0000441, change_24h: -0.1284 },
    { ...base, mint_address: pseudoKey(3), name: 'Dead air', symbol: 'DEAD', pool_address: pseudoKey(97), pool_sol_reserves: 1204.9, price_usd: 0.00311, change_24h: 0.0042, user_owned: false },
  ]
}

function fixtureJob(kind: Job['kind'], legCount: number, transfers: number): Job {
  const legs = Math.max(1, legCount)
  const per = Math.max(1, Math.ceil(transfers / legs))
  const failAt = legs >= 3 ? 3 : 0
  return {
    job_id: `${kind}_${Date.now().toString(36)}`,
    kind,
    legs: Array.from({ length: legs }, (_, i) => {
      const leg = i + 1
      const failed = leg === failAt
      const blocked = failAt > 0 && leg > failAt
      return {
        leg,
        transfers: leg === legs ? transfers - per * (legs - 1) || per : per,
        status: (failed ? 'failed' : blocked ? 'blocked' : 'confirmed') as LegStatus,
        signature: failed || blocked ? null : pseudoKey(20_000 + leg) + pseudoKey(30_000 + leg),
        error: failed ? 'Bundle not landed — tip account contention' : null,
        blocked_by: blocked ? failAt : null,
      }
    }),
  }
}
