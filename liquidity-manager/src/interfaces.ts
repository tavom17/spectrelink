// interfaces.ts

export type splitMode = "even" | "random";
export type sendMode = "basic" | "senderMax";

export interface distributionParams {
    grandTotal: bigint;
    walletCount: number;
    baseReserve: bigint;
    splitMode: splitMode;
    variance?: number;
    rng?: () => number;
}

export interface walletAllocation {
    position: number;
    transferAmount: bigint;
}

export interface distributionResult {
    allocations: walletAllocation[];
}

// config.ts to alter hard coded values
export interface reserveConfig {
    txHeadroom: number;          // e.g. 5 transactions' worth
    baseFeePerTx: bigint;        // 5_000n
    priorityFeePerTx: bigint;    // e.g. 10_000n
    tipPerTx: bigint;            // 1_000_000n (senderMax worst case)
}

export interface groupWallet {
    position: number;
    wallet_id: string;
    public_key: string;
}

export interface distributionTransfer {
    position: number;
    publicKey: string;
    transferAmount: bigint;
}

export interface unsignedDistributionTx {
    transaction: string;     //base64, unsigned
    positions: number[];     //which slaves this tx funds
}

export interface distributionTxResult {
    status: "confirmed" | "failed";
    positions: number[];
    signature?: string;
    error?: string;
}