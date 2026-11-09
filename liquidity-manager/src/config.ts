// config.ts — the values
import { reserveConfig } from "./interfaces";

//per-slave reserve inputs — rent values are fetched at runtime, never hardcoded
export const RESERVE_CONFIG: reserveConfig = {
    txHeadroom: 5,
    baseFeePerTx: 5_000n,
    priorityFeePerTx: 10_000n,
    tipPerTx: 1_000_000n,
};

//20 transfers ≈ 1,220 bytes with compute budget ixs — 18 leaves margin under the 1,232 limit
export const MAX_TRANSFERS_PER_TX = 18;
export const DISTRIBUTION_PRIORITY_MICROLAMPORTS = 50_000;
export const TOKEN_ACCOUNT_SIZE = 165;