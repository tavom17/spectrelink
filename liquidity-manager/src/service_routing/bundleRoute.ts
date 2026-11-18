import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../connection";
import { computeBaseReserve, distributionLogic } from "../service_functionality/distributionMath";
import { buildDistributionTransactions, getGroupWallets, signWithWalletApp, sendAndConfirm,compileWithComputeBudget, measureComputeUnits } from "../service_functionality/bundleFunctions";
import { RESERVE_CONFIG, MAX_TRANSFERS_PER_TX, DISTRIBUTION_PRIORITY_MICROLAMPORTS, TOKEN_ACCOUNT_SIZE } from "../config";
import { distributionTransfer, distributionTxResult, splitMode } from "../interfaces";
import { assertSolPairedPool, buildBuyInstructions } from "../service_functionality/meteora";
import { SWAP_SLIPPAGE_PERCENT, BUY_PRIORITY_MICROLAMPORTS, CU_SAFETY_MULTIPLIER, SIMULATION_CU_LIMIT } from "../config";
import { BuyError, resolveBuyAmount, executeWalletBuy } from "../service_functionality/bundleFunctions";
import { buyRequest, walletBuyResult } from "../interfaces";

const MAX_BUY_WALLETS = 25;
const LAMPORTS_STRING = /^[1-9]\d*$/;

export async function bundleEndpoints(fastify: FastifyInstance){

fastify.post("/distribute", async (request, reply) => {
    const { user_ID, group_ID, fundingPublicKey, grandTotal, splitMode } = request.body as {
        user_ID: string, group_ID: string, fundingPublicKey: string, grandTotal: string, splitMode: splitMode
    }

    if(!user_ID || !group_ID || !fundingPublicKey || !grandTotal)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "user_ID, group_ID, fundingPublicKey and grandTotal are required" });

    if(splitMode !== "even" && splitMode !== "random")
        return reply.status(400).send({ error: "BAD_REQUEST", message: "splitMode must be 'even' or 'random'" });

    //lamports travel as strings over JSON — convert once at the boundary
    let total: bigint;
    try {
        total = BigInt(grandTotal);
    } catch {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "grandTotal must be an integer string of lamports" });
    }

    try {
        const groupWallets = await getGroupWallets(user_ID, group_ID);

        //all chain reads in parallel
        const [systemRent, ataRent, fundingBalance, latest] = await Promise.all([
            connection.getMinimumBalanceForRentExemption(0),
            connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE),
            connection.getBalance(new PublicKey(fundingPublicKey)),
            connection.getLatestBlockhash('confirmed'),
        ]);

        const walletCount = groupWallets.length;
        const baseReserve = computeBaseReserve(BigInt(systemRent), BigInt(ataRent), RESERVE_CONFIG);

        //budget must cover every slave's reserve with something left to split
        const minimumTotal = baseReserve * BigInt(walletCount);
        if(total <= minimumTotal)
            return reply.status(400).send({
                error: "INSUFFICIENT_BUDGET",
                message: `grandTotal must exceed ${minimumTotal} lamports for ${walletCount} wallets`,
            });

        //funding must cover the total + its own tx fees + stay rent-exempt itself
        const txCount = BigInt(Math.ceil(walletCount / MAX_TRANSFERS_PER_TX));
        const estimatedFees = txCount * (RESERVE_CONFIG.baseFeePerTx + RESERVE_CONFIG.priorityFeePerTx);
        const required = total + estimatedFees + BigInt(systemRent);

        if(BigInt(fundingBalance) < required)
            return reply.status(400).send({
                error: "INSUFFICIENT_FUNDS",
                message: `Funding wallet has ${fundingBalance} lamports, needs ${required}`,
            });

        const { allocations } = distributionLogic({ grandTotal: total, walletCount, baseReserve, splitMode });

        //zip by POSITION, never by array index
        const pubkeyByPosition = new Map(groupWallets.map(wallet => [wallet.position, wallet.public_key]));
        const transfers: distributionTransfer[] = allocations.map(allocation => {
            const publicKey = pubkeyByPosition.get(allocation.position);
            if(!publicKey)
                throw new Error(`No wallet at position ${allocation.position}`);
            return { position: allocation.position, publicKey, transferAmount: allocation.transferAmount };
        });

        const unsignedTxs = buildDistributionTransactions(
            fundingPublicKey, transfers, latest.blockhash, MAX_TRANSFERS_PER_TX, DISTRIBUTION_PRIORITY_MICROLAMPORTS
        );

        //independent txs — partial funding is acceptable, report per tx
        const results: distributionTxResult[] = [];
        for(const unsignedTx of unsignedTxs){
            try {
                const signed = await signWithWalletApp(user_ID, [fundingPublicKey], unsignedTx.transaction);
                const signature = await sendAndConfirm(connection, signed, latest.blockhash, latest.lastValidBlockHeight);
                results.push({ status: "confirmed", signature, positions: unsignedTx.positions });
            } catch (error) {
                request.log.error(error);
                results.push({ status: "failed", positions: unsignedTx.positions, error: (error as Error).message });
            }
        }

        const allConfirmed = results.every(result => result.status === "confirmed");

        //207 = partial success; bigints as strings for JSON
        return reply.status(allConfirmed ? 200 : 207).send({
            baseReserve: baseReserve.toString(),
            allocations: transfers.map(transfer => ({
                position: transfer.position,
                publicKey: transfer.publicKey,
                transferAmount: transfer.transferAmount.toString(),
            })),
            transactions: results,
        });

    } catch (error) {
        if((error as Error).message === "BUNDLE_GROUP_NOT_FOUND")
            return reply.status(404).send({ error: "BUNDLE_GROUP_NOT_FOUND", message: "Bundle group not found" });

        request.log.error(error);
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Distribution failed" });
    }
})


///buy for one or many wallets — one wallet = individual buy
fastify.post("/buy", async (request, reply) => {
    const { user_ID, poolAddress, walletPublicKeys, executionMode, amountMode, amounts, percentBps } = request.body as buyRequest

    //---------- validate before touching the chain ----------
    if(!user_ID || !poolAddress)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "user_ID and poolAddress are required" });

    if(!Array.isArray(walletPublicKeys))
        return reply.status(400).send({ error: "BAD_REQUEST", message: "walletPublicKeys must be an array" });

    const keys = [...new Set(walletPublicKeys.map(key => String(key).trim()).filter(key => key.length > 0))];
    if(keys.length === 0 || keys.length > MAX_BUY_WALLETS)
        return reply.status(400).send({ error: "BAD_REQUEST", message: `Between 1 and ${MAX_BUY_WALLETS} wallets required` });

    if(executionMode !== "sequential" && executionMode !== "bundle")
        return reply.status(400).send({ error: "BAD_REQUEST", message: "executionMode must be 'sequential' or 'bundle'" });

    //single wallet ignores the mode; bundles land in 1b
    if(executionMode === "bundle" && keys.length > 1)
        return reply.status(501).send({ error: "BUNDLE_MODE_NOT_AVAILABLE", message: "Bundle buys are not available yet — use sequential" });

    if(amountMode === "percent"){
        if(!Number.isInteger(percentBps) || percentBps! < 1 || percentBps! > 10_000)
            return reply.status(400).send({ error: "BAD_REQUEST", message: "percentBps must be an integer from 1 to 10000" });
    } else if(amountMode === "perWallet"){
        const missing = keys.filter(key => !amounts || !LAMPORTS_STRING.test(String(amounts[key] ?? "")));
        if(missing.length > 0)
            return reply.status(400).send({ error: "BAD_REQUEST", message: `A positive lamports amount is required for: ${missing.join(", ")}` });
    } else {
        return reply.status(400).send({ error: "BAD_REQUEST", message: "amountMode must be 'perWallet' or 'percent'" });
    }

    try {
    await assertSolPairedPool(poolAddress);
} catch {
    return reply.status(400).send({ error: "INVALID_POOL", message: "Not a SOL-paired Meteora DAMM v2 pool" });
}

    try {
        //reserve is the same for every wallet — fetch rents once
        const [systemRent, ataRent] = await Promise.all([
            connection.getMinimumBalanceForRentExemption(0),
            connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE),
        ]);
        const baseReserve = computeBaseReserve(BigInt(systemRent), BigInt(ataRent), RESERVE_CONFIG);

        //sequential — each wallet succeeds or fails on its own
        const results: walletBuyResult[] = [];
        for(const walletPublicKey of keys){
            try {
                const balance = BigInt(await connection.getBalance(new PublicKey(walletPublicKey), 'confirmed'));
                const amountIn = resolveBuyAmount(balance - baseReserve, amountMode, amounts?.[walletPublicKey], percentBps);

                const buy = await executeWalletBuy(user_ID, poolAddress, walletPublicKey, amountIn);

                results.push({
                    publicKey: walletPublicKey,
                    status: "confirmed",
                    signature: buy.signature,
                    amountIn: amountIn.toString(),
                    minimumOut: buy.minimumOut,
                });

            } catch (error) {
                if(error instanceof BuyError){
                    //expected = their balance/input → warn; unexpected → error with the cause
                    if(error.expected)
                        request.log.warn({ wallet: walletPublicKey, code: error.code }, error.message);
                    else
                        request.log.error({ wallet: walletPublicKey, code: error.code, err: error.cause }, error.message);

                    results.push({ publicKey: walletPublicKey, status: "failed", error: error.code, message: error.message });
                } else {
                    request.log.error({ wallet: walletPublicKey, err: error }, "Unexpected buy failure");
                    results.push({ publicKey: walletPublicKey, status: "failed", error: "BUY_FAILED", message: "Buy failed" });
                }
            }
        }

        const confirmed = results.filter(result => result.status === "confirmed").length;

        //200 = every wallet bought; 207 = some or none did — details per wallet
        return reply.status(confirmed === results.length ? 200 : 207).send({
            executionMode: "sequential",
            confirmed,
            failed: results.length - confirmed,
            results,
        });

    } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Buy failed" });
    }
})

//what every wallet keeps back for its own fees and rent — frontend uses it to show "available"
fastify.get("/reserve", async (request, reply) => {
    try {
        const [systemRent, ataRent] = await Promise.all([
            connection.getMinimumBalanceForRentExemption(0),
            connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE),
        ]);
        const baseReserve = computeBaseReserve(BigInt(systemRent), BigInt(ataRent), RESERVE_CONFIG);
        return reply.status(200).send({ baseReserve: baseReserve.toString() });
    } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Failed to compute reserve" });
    }
})

}