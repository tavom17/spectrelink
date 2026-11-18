import {
    PublicKey, SystemProgram, ComputeBudgetProgram,
    TransactionInstruction, TransactionMessage, VersionedTransaction
} from "@solana/web3.js";
import { connection } from "../connection";
import { closableTokenAccount, withdrawPlan } from "../interfaces";
import { BASE_FEE_PER_SIGNATURE } from "../config";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const NATIVE_MINT = "So11111111111111111111111111111111111111112";
const CLOSE_ACCOUNT_INSTRUCTION = 9;   //same index in Token and Token-2022


//token accounts we can close: empty ones, or wSOL (closing it unwraps the SOL)
//accounts still holding tokens stay open
export async function findClosableTokenAccounts(owner: string): Promise<closableTokenAccount[]> {
    const ownerKey = new PublicKey(owner);

    const [legacy, token2022] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(ownerKey, { programId: TOKEN_PROGRAM }, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(ownerKey, { programId: TOKEN_2022_PROGRAM }, 'confirmed'),
    ]);

    const closable: closableTokenAccount[] = [];
    const byProgram = [[TOKEN_PROGRAM, legacy], [TOKEN_2022_PROGRAM, token2022]] as const;

    for(const [programId, result] of byProgram){
        for(const { pubkey, account } of result.value){
            const info = account.data.parsed.info;
            const isEmpty = info.tokenAmount.amount === "0";
            const isWrappedSol = info.mint === NATIVE_MINT;

            if(isEmpty || isWrappedSol)
                closable.push({ address: pubkey.toBase58(), programId: programId.toBase58() });
        }
    }

    return closable;
}


//raw CloseAccount — rent (and any wrapped SOL) goes straight to the destination
function closeAccountInstruction(account: string, destination: PublicKey, owner: PublicKey, programId: string){
    return new TransactionInstruction({
        programId: new PublicKey(programId),
        keys: [
            { pubkey: new PublicKey(account), isSigner: false, isWritable: true },
            { pubkey: destination,            isSigner: false, isWritable: true },
            { pubkey: owner,                  isSigner: true,  isWritable: false },
        ],
        data: Buffer.from([CLOSE_ACCOUNT_INSTRUCTION]),
    });
}


//deterministic — no simulation needed for transfers + closes
function computeUnitLimit(plans: withdrawPlan[]): number {
    const closes = plans.reduce((count, plan) => count + plan.closeAccounts.length, 0);
    return 1_000 + plans.length * 300 + closes * 3_000;
}


//base fee per signature + priority on the requested limit
export function computeWithdrawFee(plans: withdrawPlan[], priorityMicroLamports: number): bigint {
    const signers = BigInt(plans.length);
    const priority = BigInt(Math.ceil(computeUnitLimit(plans) * priorityMicroLamports / 1_000_000));
    return BASE_FEE_PER_SIGNATURE * signers + priority;
}


//unsigned v0 tx — feePayer is the first static key; every wallet in plans signs
export function buildWithdrawTransaction(
    plans: withdrawPlan[],
    destination: string,
    feePayer: string,
    blockhash: string,
    priorityMicroLamports: number
): VersionedTransaction {

    const destinationKey = new PublicKey(destination);
    const instructions: TransactionInstruction[] = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit(plans) }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
    ];

    for(const plan of plans){
        const owner = new PublicKey(plan.publicKey);

        if(plan.amount > 0n)
            instructions.push(SystemProgram.transfer({ fromPubkey: owner, toPubkey: destinationKey, lamports: plan.amount }));

        for(const account of plan.closeAccounts)
            instructions.push(closeAccountInstruction(account.address, destinationKey, owner, account.programId));
    }

    const message = new TransactionMessage({
        payerKey: new PublicKey(feePayer),
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    return new VersionedTransaction(message);
}


//greedy: add wallets until the next one would push the tx past 1232 bytes
//fewest transactions automatically, whatever mix of transfers and closes
export function packWithdrawGroups(
    plans: withdrawPlan[],
    destination: string,
    blockhash: string,
    priorityMicroLamports: number
): withdrawPlan[][] {

    const groups: withdrawPlan[][] = [];
    let current: withdrawPlan[] = [];

    for(const plan of plans){
        const candidate = [...current, plan];
        const size = buildWithdrawTransaction(candidate, destination, candidate[0].publicKey, blockhash, priorityMicroLamports)
            .serialize().length;

        if(size <= 1232){
            current = candidate;
            continue;
        }

        if(current.length === 0)
            throw new Error(`Wallet ${plan.publicKey} alone exceeds the transaction size limit`);

        groups.push(current);
        current = [plan];
    }

    if(current.length > 0)
        groups.push(current);

    return groups;
}