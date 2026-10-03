/**
 * Placeholder data for the parts of the UI that are not wired to the API yet.
 *
 * Everything here mirrors the projectUpdate design (Spectre Links Omnia) so the
 * layout can be reviewed end to end. Each consumer renders a "Preview data" tag
 * next to anything sourced from this file — when an endpoint lands, replace the
 * import with the real call and drop the tag.
 */

/* ---------------------------------------------------------------- dashboard */

export const DASH_STATS = [
  { label: 'Tokens launched',    value: '12',    unit: '',    note: '3 in the last 30 days' },
  { label: 'Wallets',            value: '50',    unit: '',    note: '5 funding · 40 slave · 5 fee' },
  { label: 'SOL across wallets', value: '84.12', unit: 'SOL', note: '31 funded · 19 empty' },
  { label: 'Open positions',     value: '3',     unit: '',    note: 'Meteora DAMM v2' },
  { label: 'Fees accrued',       value: '4.82',  unit: 'SOL', note: '1.24 unclaimed' },
]

export type PnlRange = '7d' | '30d' | 'All'

/** Cumulative PnL in SOL, oldest first. One point per day (7d/30d) or per week (All). */
export const PNL_SERIES: Record<PnlRange, number[]> = {
  '7d':  [14.1, 15.3, 14.8, 16.2, 16.9, 17.6, 18.44],
  '30d': [0.4, 1.9, 1.5, 3.8, 3.1, 5.6, 4.9, 7.8, 6.9, 7.4, 9.6, 9.1, 11.3, 10.8, 13.2, 12.6, 14.1, 15.3, 14.8, 16.2, 16.9, 17.6, 18.44],
  'All': [-1.2, 0.3, -0.4, 2.1, 1.6, 1.1, 4.2, 3.7, 6.8, 5.9, 9.2, 8.3, 11.4, 10.6, 13.9, 13.1, 16.2, 15.8, 18.44],
}

export const PNL_HEADLINE = { value: '+18.44', unit: 'SOL', change: '+21.9%' }

export const PNL_SPLIT = [
  { label: 'Realized',     value: '+22.81 SOL', accent: true },
  { label: 'Unrealized',   value: '-4.37 SOL',  accent: false },
  { label: 'Fees claimed', value: '3.58 SOL',   accent: false },
]

export const WALLET_COMPOSITION = [
  { label: 'Funding', count: 5,  sol: '79.40' },
  { label: 'Slave',   count: 40, sol: '4.16' },
  { label: 'Fee',     count: 5,  sol: '0.56' },
]

export const RECENT_LAUNCHES = [
  { name: 'Truetest',   sym: 'TTEST', date: 'Jun 1, 2026',  liq: '4.20 SOL', fees: '1.24 SOL', pnl: 6.10 },
  { name: 'Christian',  sym: 'CTEST', date: 'Jun 1, 2026',  liq: '3.00 SOL', fees: '0.86 SOL', pnl: 2.44 },
  { name: 'Coinlytest', sym: 'COINT', date: 'May 21, 2026', liq: '2.50 SOL', fees: '0.42 SOL', pnl: -0.88 },
  { name: 'Testtest',   sym: 'TST',   date: 'May 13, 2026', liq: '1.80 SOL', fees: '0.31 SOL', pnl: 1.02 },
  { name: 'Testtoken',  sym: 'TEST',  date: 'May 11, 2026', liq: '1.50 SOL', fees: '0.18 SOL', pnl: 0.35 },
]

/* ------------------------------------------------------------------ wallets */

/** Holdings and funded counts per wallet type — needs a batched balance read. */
export const WALLET_TYPE_HOLDINGS: Record<'funding' | 'slave' | 'fee', { sol: string; funded: string }> = {
  funding: { sol: '79.40', funded: '5 / 5' },
  slave:   { sol: '4.16',  funded: '26 / 40' },
  fee:     { sol: '0.56',  funded: '3 / 5' },
}

export interface PlaceholderGroup {
  id: string
  label: string
  size: number
  funded: number
  sol: string
}

export const BUNDLE_GROUPS: PlaceholderGroup[] = [
  { id: 'primary', label: 'Primary',    size: 25, funded: 25, sol: '2.4180' },
  { id: 'warm',    label: 'Warm set',   size: 25, funded: 14, sol: '0.9340' },
  { id: 'cold',    label: 'Cold set',   size: 25, funded: 6,  sol: '0.2160' },
  { id: 'snipe',   label: 'Snipe ring', size: 12, funded: 12, sol: '1.1050' },
]

/* ----------------------------------------------------------------- settings */

export interface SettingRow { k: string; note: string; v: string; action?: boolean }

export const SETTING_GROUPS: { title: string; rows: SettingRow[] }[] = [
  { title: 'Network', rows: [
    { k: 'RPC endpoint', note: 'Private Helius node',          v: 'mainnet-helius' },
    { k: 'Commitment',   note: 'Confirmation level for reads', v: 'confirmed' },
    { k: 'Websocket',    note: 'Live balance streaming',       v: 'On' },
  ]},
  { title: 'Execution', rows: [
    { k: 'Priority fee', note: 'Micro-lamports per compute unit', v: '25,000' },
    { k: 'Jito tip',     note: 'Per bundle',                      v: '0.001 SOL' },
    { k: 'Max retries',  note: 'Per leg before the job fails',    v: '3' },
  ]},
  { title: 'Session', rows: [
    { k: 'Auto-lock',       note: 'Locks the keystore when idle',      v: '15 min' },
    { k: 'Derivation path', note: 'HD seed path for new wallets',      v: "m/44'/501'/0'" },
    { k: 'Key export',      note: 'Requires the session passphrase',   v: 'Allowed' },
  ]},
  { title: 'Danger zone', rows: [
    { k: 'Rotate keystore',     note: 'Re-derives every slave wallet',     v: 'Run', action: true },
    { k: 'Purge empty wallets', note: 'Removes zero-balance wallets',      v: 'Run', action: true },
    { k: 'Clear local cache',   note: 'Balances, metadata and job history', v: 'Run', action: true },
  ]},
]
