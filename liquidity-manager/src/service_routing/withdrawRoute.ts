import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../connection";
import { signWithWalletApp, sendAndConfirm } from "../service_functionality/bundleFunctions";
import {
    findClosableTokenAccounts, computeWithdrawFee, buildWithdrawTransaction, packWithdrawGroups
} from "../service_functionality/withdrawFunctions";
import { WITHDRAW_PRIORITY_MICROLAMPORTS } from "../config";
import { withdrawRequest, withdrawPlan, withdrawSkip, withdrawTxResult } from "../interfaces";

const MAX_WITHDRAW_WALLETS = 25;
const LAMPORTS_STRING = /^[1-9]\d*$/;

function isValidAddress(value: string): boolean {
    try { new PublicKey(value); return true; } catch { return false; }
}


export async function withdrawEndpoints(fastify: FastifyInstance){

//one or many wallets → one destination
fastify.post("/withdraw", async (request, reply) => {
    const { user_ID, walletPublicKeys, destination, mode, amounts } = request.body as withdrawRequest

    //---------- validate before touching the chain ----------
    if(!user_ID || !destination)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "user_ID and destination are required" });

    //users are free to choose any destination — but it must be a real address
    if(!isValidAddress(destination))
        return reply.status(400).send({ error: "INVALID_DESTINATION", message: "Destination is not a valid Solana address" });

    if(!Array.isArray(walletPublicKeys))
        return reply.status(400).send({ error: "BAD_REQUEST", message: "walletPublicKeys must be an array" });

    const keys = [...new Set(walletPublicKeys.map(key => String(key).trim()).filter(key => key.length > 0))];
    if(keys.length === 0 || keys.length > MAX_WITHDRAW_WALLETS)
        return reply.status(400).send({ error: "BAD_REQUEST", message: `Between 1 and ${MAX_WITHDRAW_WALLETS} wallets required` });

    const invalidKeys = keys.filter(key => !isValidAddress(key));
    if(invalidKeys.length > 0)
        return reply.status(400).send({ error: "BAD_REQUEST", message: `Invalid wallet addresses: ${invalidKeys.join(", ")}` });

    if(keys.includes(destination))
        return reply.status(400).send({ error: "BAD_REQUEST", message: "Destination cannot also be a source wallet" });

    if(mode === "amount"){
        const missing = keys.filter(key => !amounts || !LAMPORTS_STRING.test(String(amounts[key] ?? "")));
        if(missing.length > 0)
            return reply.status(400).send({ error: "BAD_REQUEST", message: `A positive lamports amount is required for: ${missing.join(", ")}` });
    } else if(mode !== "all"){
        return reply.status(400).send({ error: "BAD_REQUEST", message: "mode must be 'all' or 'amount'" });
    }

    try {
        //one call for every balance, rent once, one blockhash for the run
        const [accounts, systemRentNumber, latest] = await Promise.all([
            connection.getMultipleAccountsInfo(keys.map(key => new PublicKey(key)), 'confirmed'),
            connection.getMinimumBalanceForRentExemption(0),
            connection.getLatestBlockhash('confirmed'),
        ]);
        const systemRent = BigInt(systemRentNumber);

        //token accounts only matter when draining
        const closables = mode === "all"
            ? await Promise.all(keys.map(key => findClosableTokenAccounts(key)))
            : keys.map(() => []);

        //---------- per-wallet plan, or a clear reason it's skipped ----------
        const plans: withdrawPlan[] = [];
        const skipped: withdrawSkip[] = [];

        keys.forEach((publicKey, i) => {
            const balance = BigInt(accounts[i]?.lamports ?? 0);
            const closeAccounts = closables[i];

            if(mode === "all"){
                if(balance === 0n && closeAccounts.length === 0){
                    skipped.push({ publicKey, error: "NOTHING_TO_WITHDRAW", message: "Wallet is empty" });
                    return;
                }
                plans.push({ publicKey, amount: balance, closeAccounts });
                return;
            }

            //amount mode — a wallet may end at exactly 0 or at/above rent-exempt, never in between
            const requested = BigInt(amounts![publicKey]);
            if(requested > balance){
                skipped.push({ publicKey, error: "AMOUNT_EXCEEDS_BALANCE", message: `Requested ${requested}, balance ${balance}` });
                return;
            }
            const remaining = balance - requested;
            if(remaining > 0n && remaining < systemRent){
                skipped.push({
                    publicKey,
                    error: "WOULD_LEAVE_DUST",
                    message: `Would leave ${remaining} lamports (below ${systemRent} rent minimum). Max ${balance - systemRent} keeps the wallet open, ${balance} empties it`,
                });
                return;
            }
            plans.push({ publicKey, amount: requested, closeAccounts: [] });
        });

        if(plans.length === 0)
            return reply.status(400).send({ error: "NOTHING_TO_WITHDRAW", message: "No selected wallet can withdraw", skipped });

        //---------- pack, then each tx: fee payer = wallet sending the most, fee comes out of its transfer ----------
        const groups = packWithdrawGroups(plans, destination, latest.blockhash, WITHDRAW_PRIORITY_MICROLAMPORTS);
        const results: withdrawTxResult[] = [];

        for(const group of groups){
            const feePayerPlan = group.reduce((max, plan) => plan.amount > max.amount ? plan : max);
            const wallets = group.map(plan => plan.publicKey);
            const fee = computeWithdrawFee(group, WITHDRAW_PRIORITY_MICROLAMPORTS);

            if(feePayerPlan.amount <= fee){
                results.push({ status: "failed", wallets, feePayer: feePayerPlan.publicKey, error: "FEE_UNPAYABLE", message: "No wallet in this transaction holds enough SOL to pay its fee" });
                continue;
            }

            //fee payer's transfer shrinks by the fee — it still ends at the same final balance
            const finalGroup = group.map(plan => plan === feePayerPlan ? { ...plan, amount: plan.amount - fee } : plan);

            try {
                const unsignedTx = buildWithdrawTransaction(finalGroup, destination, feePayerPlan.publicKey, latest.blockhash, WITHDRAW_PRIORITY_MICROLAMPORTS);
                const unsignedBase64 = Buffer.from(unsignedTx.serialize()).toString('base64');

                //every wallet in the tx signs — /sign rejects any key that isn't this user's
                const signed = await signWithWalletApp(user_ID, wallets, unsignedBase64);
                const signature = await sendAndConfirm(connection, signed, latest.blockhash, latest.lastValidBlockHeight);

                results.push({ status: "confirmed", wallets, feePayer: feePayerPlan.publicKey, signature });
            } catch (error) {
                request.log.error({ wallets, err: error }, "Withdraw transaction failed");
                results.push({ status: "failed", wallets, feePayer: feePayerPlan.publicKey, error: "WITHDRAW_FAILED", message: "Not confirmed — check the wallets before retrying" });
            }
        }

        const allConfirmed = results.every(result => result.status === "confirmed") && skipped.length === 0;

        return reply.status(allConfirmed ? 200 : 207).send({ mode, destination, transactions: results, skipped });

    } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Withdraw failed" });
    }
})

}