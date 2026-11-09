import {
    Connection, PublicKey, SystemProgram, ComputeBudgetProgram,
    TransactionMessage, VersionedTransaction
} from "@solana/web3.js";
import { distributionTransfer, unsignedDistributionTx, groupWallet } from "../interfaces";


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