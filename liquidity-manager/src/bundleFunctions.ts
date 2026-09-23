// bundleFunctions.ts

export async function validateGroupMembers(group_id, targetPubKeys): Promise<void>
export async function fetchSlaveStates(pubKeys): Promise<SlaveState[]>

export function planDistribution(slaves, totalLamports, skewPct, fundingBalance): Plan
export function packSetup(allocations): RecipientGroup[]
export function packBuy(recipients): RecipientGroup[]

export function buildSetupTransaction(group, allocations, fundingPubKey, blockhash): string
export function buildBuyTransaction(group, quotes, fundingPubKey, blockhash): string

// the wallet-app call — one round trip for the whole batch
export async function signTransactions(
    user_id: string,
    txs: { id: string; transaction: string; signers: string[] }[]
): Promise<SignedTx[]>

export async function sendBundle(signedTxs: string[]): Promise<string[]>
export async function sendSequential(signedTxs: string[]): Promise<string[]>