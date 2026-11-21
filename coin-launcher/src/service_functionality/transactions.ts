import { ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { connection } from "../connection";

export interface txLifetime {
    blockhash: string;
    lastValidBlockHeight: number;
}

//send a fully signed base64 tx and confirm against the blockhash it was built with
export async function sendAndConfirmSigned(signedBase64: string, lifetime: txLifetime): Promise<string> {
    //skipPreflight — established Helius load-balancer mitigation
    const signature = await connection.sendRawTransaction(Buffer.from(signedBase64, "base64"), {
        skipPreflight: true,
        maxRetries: 3,
    });

    const result = await connection.confirmTransaction({ signature, ...lifetime }, "confirmed");
    if(result.value.err)
        throw new Error(`Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);

    return signature;
}

//SDK-built ixs may carry their own compute budget — we set ours, duplicates fail
function withoutComputeBudget(instructions: TransactionInstruction[]){
    return instructions.filter(ix => !ix.programId.equals(ComputeBudgetProgram.programId));
}

export function compileWithComputeBudget(
    payer: PublicKey,
    instructions: TransactionInstruction[],
    blockhash: string,
    unitLimit: number,
    priorityMicroLamports: number
): VersionedTransaction {
    const message = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
            ...withoutComputeBudget(instructions),
        ],
    }).compileToV0Message();

    return new VersionedTransaction(message);
}

//simulate unsigned at max limit → real CU usage
export async function measureComputeUnits(
    payer: PublicKey,
    instructions: TransactionInstruction[],
    blockhash: string,
    simulationLimit: number,
    priorityMicroLamports: number
): Promise<number> {
    const tx = compileWithComputeBudget(payer, instructions, blockhash, simulationLimit, priorityMicroLamports);
    const simulation = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });

    if(simulation.value.err)
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)} | ${simulation.value.logs?.slice(-5).join(" | ")}`);
    if(!simulation.value.unitsConsumed)
        throw new Error("Simulation returned no unitsConsumed");

    return simulation.value.unitsConsumed;
}