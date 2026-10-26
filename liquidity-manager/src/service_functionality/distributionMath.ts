import { distributionParams, distributionResult, reserveConfig, walletAllocation } from "../interfaces";


export function computeBaseReserve(systemRent: bigint, ataRent: bigint, cfg: reserveConfig): bigint {
    const h = BigInt(cfg.txHeadroom);
    return systemRent + ataRent * 2n + h * (cfg.baseFeePerTx + cfg.priorityFeePerTx + cfg.tipPerTx);
}



export function distributionLogic(parameters: distributionParams): distributionResult {

//grandTotal adjusted for (baseReserve * walletCount)
const distributionAdjustedAmount: bigint = (parameters.grandTotal - (parameters.baseReserve * BigInt(parameters.walletCount)))

//this subtraction is this function's own result — negative = negative transfers, so throw here
if(distributionAdjustedAmount <= 0n)
    throw new Error("Grand total does not cover base reserve for all wallets in bundle group");

//rng injected — defaults to Math.random, tests pass a seeded one for deterministic output
const rng = parameters.rng ?? Math.random;


// //had an if statement / didnt want let need const. Went to IIFE ()=> with if returns, still undefined or bigInt[]
// //trying our ternary operators (pretty coo, basically a conditional)
// //? is "then" if conditional is true
// //: is "else" if conditional is false
const distributionArray = parameters.splitMode === "even"
? normalizationEven(distributionAdjustedAmount, parameters.baseReserve, parameters.walletCount, rng)
: normalizationRandom(distributionAdjustedAmount, parameters.baseReserve, parameters.walletCount, rng)


const wallets: walletAllocation[] = new Array(parameters.walletCount);
//positions for bundling starts at zero, so i works fine no i + 1 needed
for(let i = 0; i < wallets.length; i++){
wallets[i] = {
    position: i,
    transferAmount: distributionArray[i]
}
}

//every lamport accounted for, catches any rounding bug
const sumOfTransfers: bigint = wallets.reduce((total, wallet) => total + wallet.transferAmount, 0n);
if(sumOfTransfers !== parameters.grandTotal)
    throw new Error(`Distribution mismatch: allocated ${sumOfTransfers}, expected ${parameters.grandTotal}`);

    return {allocations: wallets}

}




export function normalizationRandom(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number, rng: () => number){

    const slaveCount: bigint = BigInt(amountOfSlaves);

    //1/3 floor — guaranteed even amount per wallet, no dust buys
    //floor leftover from integer division rolls into the pool, nothing lost
    const floorPerWallet: bigint = (grandTotalAdjusted / 3n) / slaveCount;
    const pool: bigint = grandTotalAdjusted - (floorPerWallet * slaveCount);

    //assign weights from (1-100) to all slaves randomly
    //uses injected rng instead of hardcoded Math.random
    const percentageWeights: bigint[] = Array.from({ length: amountOfSlaves }, () => {
        return BigInt(Math.floor(rng() * 100) + 1);
    });

    const sumOfWeights: bigint = percentageWeights.reduce((a, b) => a + b, 0n);

    const amountDistributed: bigint[] = new Array(amountOfSlaves);
    let poolAllocated: bigint = 0n;

    for(let i = 0; i < amountDistributed.length; i++){
        const poolShare: bigint = (pool * percentageWeights[i]) / sumOfWeights;
        poolAllocated += poolShare;
        amountDistributed[i] = poolShare + floorPerWallet + base;
    }

    //FIX: truncation leaves < amountOfSlaves lamports behind — hand out 1 lamport at a time from index 0
    const leftover: bigint = pool - poolAllocated;
    for(let i = 0; i < Number(leftover); i++){
        amountDistributed[i] += 1n;
    }

    return amountDistributed;
}


export function normalizationEven(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number, rng: () => number){

    const slaveCount: bigint = BigInt(amountOfSlaves);
    const evenShare: bigint = grandTotalAdjusted / slaveCount;

    //FIX: remainder from integer division — always < amountOfSlaves lamports
    const remainder: bigint = grandTotalAdjusted % slaveCount;

    const amountDistributed: bigint[] = new Array(amountOfSlaves);

    for(let i = 0; i < amountDistributed.length; i++){
        amountDistributed[i] = evenShare + base;
    }

    //FIX: hand out the remainder 1 lamport at a time from index 0
    for(let i = 0; i < Number(remainder); i++){
        amountDistributed[i] += 1n;
    }

    return amountDistributed;
}