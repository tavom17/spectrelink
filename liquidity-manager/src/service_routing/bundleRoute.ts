import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../connection";
import { computeBaseReserve, distributionLogic } from "../service_functionality/distributionMath";
import { buildDistributionTransactions, getGroupWallets, signWithWalletApp, sendAndConfirm,compileWithComputeBudget, measureComputeUnits } from "../service_functionality/bundleFunctions";
import { RESERVE_CONFIG, MAX_TRANSFERS_PER_TX, DISTRIBUTION_PRIORITY_MICROLAMPORTS, TOKEN_ACCOUNT_SIZE } from "../config";
import { distributionTransfer, distributionTxResult, splitMode } from "../interfaces";
import { buildBuyInstructions } from "../service_functionality/meteora";
import { SWAP_SLIPPAGE_PERCENT, BUY_PRIORITY_MICROLAMPORTS, CU_SAFETY_MULTIPLIER, SIMULATION_CU_LIMIT } from "../config";

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


//single wallet buy — the building block the bundle loop will repeat
fastify.post("/buy", async (request, reply) => {
    const { user_ID, poolAddress, walletPublicKey } = request.body as {
        user_ID: string, poolAddress: string, walletPublicKey: string
    }

    if(!user_ID || !poolAddress || !walletPublicKey)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "user_ID, poolAddress and walletPublicKey are required" });

    try {
        const [balance, systemRent, ataRent, latest] = await Promise.all([
            connection.getBalance(new PublicKey(walletPublicKey)),
            connection.getMinimumBalanceForRentExemption(0),
            connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE),
            connection.getLatestBlockhash('confirmed'),
        ]);

        //same reserve distribution set aside — spend only what's above it
        const baseReserve = computeBaseReserve(BigInt(systemRent), BigInt(ataRent), RESERVE_CONFIG);
        const amountIn = BigInt(balance) - baseReserve;

        if(amountIn <= 0n)
            return reply.status(400).send({
                error: "INSUFFICIENT_FUNDS",
                message: `Wallet has ${balance} lamports, reserve is ${baseReserve}`,
            });

        const { instructions, minimumOut, outputTokenMint } =
            await buildBuyInstructions(walletPublicKey, poolAddress, amountIn, SWAP_SLIPPAGE_PERCENT);

        //measure, then pay priority only on what we'll actually use (+20%)
        const unitsConsumed = await measureComputeUnits(
            connection, walletPublicKey, instructions, latest.blockhash, SIMULATION_CU_LIMIT, BUY_PRIORITY_MICROLAMPORTS
        );
        const unitLimit = Math.ceil(unitsConsumed * CU_SAFETY_MULTIPLIER);

        const unsignedTx = compileWithComputeBudget(
            walletPublicKey, instructions, latest.blockhash, unitLimit, BUY_PRIORITY_MICROLAMPORTS
        );

        const unsignedBytes = unsignedTx.serialize();
        if(unsignedBytes.length > 1232)
            throw new Error(`Buy transaction too large: ${unsignedBytes.length} bytes`);

        const unsignedBase64 = Buffer.from(unsignedBytes).toString('base64');

        //slave signs alone — fee payer AND authority
        const signed = await signWithWalletApp(user_ID, [walletPublicKey], unsignedBase64);
        const signature = await sendAndConfirm(connection, signed, latest.blockhash, latest.lastValidBlockHeight);

        return reply.status(200).send({
            signature,
            amountIn: amountIn.toString(),
            minimumOut,
            outputTokenMint,
            unitsConsumed,
            unitLimit,
        });

    } catch (error) {
        request.log.error(error);
        //TEMP: error.message exposed for debugging tonight — revert to a generic message once buys work
        return reply.status(500).send({ error: "BUY_FAILED", message: (error as Error).message });
    }
})

}