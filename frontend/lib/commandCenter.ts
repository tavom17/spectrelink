'use client'

/**
 * Command centre data layer.
 *
 * Bundle groups, their wallets, funding wallets, SOL balances and distribute
 * go through the gateway ("live calls" below). Token data, buy and retry
 * still come from local fixtures until those endpoints exist.
 * The buy floor and price walk are the real formulas.
 *
 * The panel only ever touches these functions, so wiring the rest means
 * replacing the bodies in "fixture reads".
 */

import type { ApiFetch } from './api'
import { fetchGroupBalances, type WalletBalance } from './balances'

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

/** A buy job (still fixture-backed). Distribute results are DistributeResult. */
export interface Job {
  job_id: string
  kind: 'buy'
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
/** Jito bundles cap at 5 transactions. */
export const MAX_TX_PER_BUNDLE = 5

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

export function bundleCount(txCount: number): number {
  return Math.ceil(txCount / MAX_TX_PER_BUNDLE) || 0
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


/* ------------------------------------------------------------- live calls */
/*
 * These go through the gateway with the caller's apiFetch (lib/api), which
 * attaches the bearer token and handles 401 → refresh. Errors are ApiError.
 *   loadGroups          GET  /api/wallets/bundleGroups
 *   loadGroupMembers    GET  /api/wallets/bundleGroups/:groupID/wallets
 *   loadFundingWallets  GET  /api/wallets/listWallets        (wallet_type=funding)
 *                       POST /api/wallets/groupBalance       (one request for all of them)
 *   distributeToGroup   POST /api/liquidity/bundleGroups/:groupID/distribute
 * Roster balances are read through useWalletBalances (lib/balances).
 * groupBalance reports SOL only, so ata_exists is always false and the reserve
 * math assumes every token account still has to be created.
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

/* ---------------------------------------------------------- fixture reads */
/*
 * Endpoints these stand in for, once a backend exists:
 *   loadToken           GET  /api/command-center/token?mint=
 *   simulateBuy        POST /api/bundles/buy/simulate       { mint, pool_address, slippage_bps, tip_lamports, targets }
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

export function simulateBuy(targets: Target[], tipLamports: number): Promise<BuySimulation> {
  const txCount = targets.length
  return settle(
    { ok: targets.length > 0, legs: bundleCount(txCount), tip_lamports: tipLamports, reason: targets.length ? null : 'No funded wallets selected' },
    600,
  )
}

export function executeBuy(targets: Target[]): Promise<Job> {
  return settle(fixtureJob(bundleCount(targets.length), targets.length), 800)
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

function fixtureJob(legCount: number, transfers: number): Job {
  const kind = 'buy' as const
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
