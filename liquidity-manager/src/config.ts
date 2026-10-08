// config.ts — the values
import { reserveConfig } from "./interfaces";

export const RESERVE_CONFIG: reserveConfig = {
    txHeadroom: 5,
    baseFeePerTx: 5_000n,
    priorityFeePerTx: 10_000n,
    tipPerTx: 1_000_000n,
};