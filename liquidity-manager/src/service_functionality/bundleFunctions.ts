import {
    Connection, PublicKey, SystemProgram, ComputeBudgetProgram,
    TransactionMessage, VersionedTransaction,TransactionInstruction
} from "@solana/web3.js";
import {buyAmountMode, buyErrorCode, distributionTransfer, unsignedDistributionTx, groupWallet } from "../interfaces";
import { connection } from "../connection";
import { buildBuyInstructions } from "./meteora";
import { SWAP_SLIPPAGE_PERCENT, BUY_PRIORITY_MICROLAMPORTS, CU_SAFETY_MULTIPLIER, SIMULATION_CU_LIMIT } from "../config";



//chunk transfers into the fewest txs possible, funding wallet = fee payer + source
//pure given a blockhash — no RPC, no signing
export function buildDistributionTransactions(
    fundingPublicKey: string,
    transfers: distributionTransfer[],
    blockhash: string,
    maxTransfersPerTx: number,
    priorityMicroLamports: number
): unsignedDistributionTx[] {

    const payer = new PublicKey(fundingPublicKey);
    const transactions: unsignedDistributionTx[] = [];

    for(let start = 0; start < transfers.length; start += maxTransfersPerTx){
        const chunk = transfers.slice(start, start + maxTransfersPerTx);

        const instructions = [
            //system transfer ≈ 150 CU — 300 per transfer is generous headroom
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 + chunk.length * 300 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
            ...chunk.map(transfer => SystemProgram.transfer({
                fromPubkey: payer,
                toPubkey: new PublicKey(transfer.publicKey),
                lamports: transfer.transferAmount,
            })),
        ];

        const message = new TransactionMessage({
            payerKey: payer,
            recentBlockhash: blockhash,
            instructions,
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        const bytes = tx.serialize();

        //fail loudly here, not on-chain
        if(bytes.length > 1232)
            throw new Error(`Distribution transaction too large: ${bytes.length} bytes`);

        transactions.push({
            transaction: Buffer.from(bytes).toString('base64'),
            positions: chunk.map(transfer => transfer.position),
        });
    }

    return transactions;
}


//wallet-app: one group's wallets, ordered by position — ownership enforced there
export async function getGroupWallets(user_ID: string, group_ID: string): Promise<groupWallet[]> {
    const params = new URLSearchParams({ user_ID, group_ID });
    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/getBundleGroupWallets?${params}`);

    if(response.status === 404)
        throw new Error("BUNDLE_GROUP_NOT_FOUND");
    if(!response.ok)
        throw new Error(`Failed to fetch bundle group wallets (${response.status})`);

    return await response.json() as groupWallet[];
}


//wallet-app signs — keys never leave wallet-app
export async function signWithWalletApp(user_ID: string, pubKeys: string[], transaction: string): Promise<string> {
    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, pubKeys, transaction }),
    });

    const body = await response.json() as { transaction?: string; error?: string; message?: string };

    if(!response.ok || !body.transaction)
        throw new Error(`Signing failed (${response.status}): ${body.error} ${body.message ?? ""}`);

    return body.transaction;
}


//plain RPC send + confirm against the blockhash the tx was built with
export async function sendAndConfirm(
    connection: Connection,
    signedBase64: string,
    blockhash: string,
    lastValidBlockHeight: number
): Promise<string> {

    //skipPreflight — established Helius load-balancer mitigation
    const signature = await connection.sendRawTransaction(Buffer.from(signedBase64, 'base64'), {
        skipPreflight: true,
        maxRetries: 3,
    });

    const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    if(result.value.err)
        throw new Error(`Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);

    return signature;
}


//strip any compute budget ixs the SDK added — we set our own, duplicates fail
function withoutComputeBudget(instructions: TransactionInstruction[]){
    return instructions.filter(ix => !ix.programId.equals(ComputeBudgetProgram.programId));
}

//compile instructions into an UNSIGNED v0 tx with our compute budget in front
export function compileWithComputeBudget(
    payerPublicKey: string,
    instructions: TransactionInstruction[],
    blockhash: string,
    unitLimit: number,
    priorityMicroLamports: number
): VersionedTransaction {
    const message = new TransactionMessage({
        payerKey: new PublicKey(payerPublicKey),
        recentBlockhash: blockhash,
        instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
            ...withoutComputeBudget(instructions),
        ],
    }).compileToV0Message();

    return new VersionedTransaction(message);
}

//simulate at max limit, unsigned, to measure real CU usage
export async function measureComputeUnits(
    connection: Connection,
    payerPublicKey: string,
    instructions: TransactionInstruction[],
    blockhash: string,
    simulationLimit: number,
    priorityMicroLamports: number
): Promise<number> {
    const tx = compileWithComputeBudget(payerPublicKey, instructions, blockhash, simulationLimit, priorityMicroLamports);

    const simulation = await connection.simulateTransaction(tx, {
        sigVerify: false,              //unsigned — wallet-app hasn't signed yet
        replaceRecentBlockhash: true,
    });

    if(simulation.value.err)
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)} | ${simulation.value.logs?.slice(-5).join(" | ")}`);

    if(!simulation.value.unitsConsumed)
        throw new Error("Simulation returned no unitsConsumed");

    return simulation.value.unitsConsumed;
}

//known per-wallet failure — code is safe to return, cause stays in the logs
//expected = the user's input/balance (warn); unexpected = chain/service (error)
export class BuyError extends Error {
    constructor(public code: buyErrorCode, message: string, public expected: boolean, options?: { cause?: unknown }){
        super(message, options);
    }
}


//pure — how much this wallet spends, from what it can spare
export function resolveBuyAmount(
    available: bigint,
    amountMode: buyAmountMode,
    perWalletAmount: string | undefined,
    percentBps: number | undefined
): bigint {

    if(available <= 0n)
        throw new BuyError("INSUFFICIENT_FUNDS", "Wallet balance does not exceed its reserve", true);

    if(amountMode === "percent"){
        //multiply first, divide last — integer basis points, no floats
        const amount = available * BigInt(percentBps!) / 10_000n;
        if(amount <= 0n)
            throw new BuyError("AMOUNT_TOO_SMALL", "Percentage of available balance rounds to 0 lamports", true);
        return amount;
    }

    const requested = BigInt(perWalletAmount!);
    if(requested > available)
        throw new BuyError("AMOUNT_EXCEEDS_AVAILABLE", `Requested ${requested} lamports, ${available} available`, true);

    return requested;
}


//one wallet, one buy: build → measure → compile → sign as the wallet → send
//fresh blockhash per wallet — a long sequential run would outlive one blockhash
//pool state re-fetched per wallet — each earlier buy moved the price
export async function executeWalletBuy(user_ID: string, poolAddress: string, walletPublicKey: string, amountIn: bigint){

    const latest = await connection.getLatestBlockhash('confirmed');

    const { instructions, minimumOut, outputTokenMint } =
        await buildBuyInstructions(walletPublicKey, poolAddress, amountIn, SWAP_SLIPPAGE_PERCENT);

    let unitsConsumed: number;
    try {
        unitsConsumed = await measureComputeUnits(
            connection, walletPublicKey, instructions, latest.blockhash, SIMULATION_CU_LIMIT, BUY_PRIORITY_MICROLAMPORTS
        );
    } catch (error) {
        throw new BuyError("SIMULATION_FAILED", "Swap simulation failed (slippage or pool state)", false, { cause: error });
    }

    const unitLimit = Math.ceil(unitsConsumed * CU_SAFETY_MULTIPLIER);
    const unsignedTx = compileWithComputeBudget(walletPublicKey, instructions, latest.blockhash, unitLimit, BUY_PRIORITY_MICROLAMPORTS);

    const unsignedBytes = unsignedTx.serialize();
    if(unsignedBytes.length > 1232)
        throw new Error(`Buy transaction too large: ${unsignedBytes.length} bytes`);

    let signed: string;
    try {
        signed = await signWithWalletApp(user_ID, [walletPublicKey], Buffer.from(unsignedBytes).toString('base64'));
    } catch (error) {
        throw new BuyError("SIGNING_FAILED", "Wallet could not sign the buy", false, { cause: error });
    }

    let signature: string;
    try {
        signature = await sendAndConfirm(connection, signed, latest.blockhash, latest.lastValidBlockHeight);
    } catch (error) {
        throw new BuyError("SEND_FAILED", "Buy was not confirmed — check the wallet before retrying", false, { cause: error });
    }

    return { signature, minimumOut, outputTokenMint, unitsConsumed, unitLimit };
}