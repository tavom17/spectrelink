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

export type executionMode = "sequential" | "bundle";
export type buyAmountMode = "perWallet" | "percent";

export type buyErrorCode =
    | "INSUFFICIENT_FUNDS"
    | "AMOUNT_EXCEEDS_AVAILABLE"
    | "AMOUNT_TOO_SMALL"
    | "SIMULATION_FAILED"
    | "SIGNING_FAILED"
    | "SEND_FAILED";

export interface buyRequest {
    user_ID: string;
    poolAddress: string;
    walletPublicKeys: string[];
    executionMode: executionMode;
    amountMode: buyAmountMode;
    amounts?: Record<string, string>;   //perWallet: publicKey → lamports string
    percentBps?: number;                //percent: 1–10000
}

export interface walletBuyResult {
    publicKey: string;
    status: "confirmed" | "failed";
    signature?: string;
    amountIn?: string;
    minimumOut?: string;
    error?: string;
    message?: string;
}

export type withdrawMode = "all" | "amount";

export interface withdrawRequest {
    user_ID: string;
    walletPublicKeys: string[];
    destination: string;
    mode: withdrawMode;
    amounts?: Record<string, string>;   //amount mode: publicKey → lamports string
}

export interface closableTokenAccount {
    address: string;
    programId: string;
}

export interface withdrawPlan {
    publicKey: string;
    amount: bigint;                       //lamports to transfer (fee payer's is reduced by the fee)
    closeAccounts: closableTokenAccount[];
}

export interface withdrawSkip {
    publicKey: string;
    error: string;
    message: string;
}

export interface withdrawTxResult {
    status: "confirmed" | "failed";
    wallets: string[];
    feePayer: string;
    signature?: string;
    error?: string;
    message?: string;
}