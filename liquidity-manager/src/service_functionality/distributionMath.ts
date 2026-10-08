import { distributionParams, distributionResult, reserveConfig } from "../interfaces";

const placeHolderResult : distributionResult = {
    allocations: [ {
    position: 1,
    transferAmount: 6789n
}],
    bundleCount: 25
}

//distributionParams
    // grandTotal: bigint;
    // walletCount: number;
    // baseReserve: bigint;
    // splitMode: splitMode;
    // variance?: number;
    // rng?: () => number;




export function computeBaseReserve(systemRent: bigint, ataRent: bigint, cfg: reserveConfig): bigint {
    const h = BigInt(cfg.txHeadroom);
    return systemRent + ataRent * 2n + h * (cfg.baseFeePerTx + cfg.priorityFeePerTx + cfg.tipPerTx);
}    



export async function distributionLogic(parameters: distributionParams): Promise<distributionResult> { 
//not the place for checking validity of numbers, assume numbers are valid, checked outside this function
//we return distributionResult, not any

//grandTotal adjusted for (baseReserve * walletCount)
const distributionAdjustedAmount: bigint = (parameters.grandTotal - (parameters.baseReserve * BigInt(parameters.walletCount)))

if(parameters.splitMode === "even"){
    const distributionArray = normalizationEven(distributionAdjustedAmount, parameters.baseReserve, parameters.walletCount)
}
if(parameters.splitMode === "random"){
    const distributionArray = normalizationRandom(distributionAdjustedAmount, parameters.baseReserve, parameters.walletCount)
}






    return placeHolderResult
}




export async function normalizationRandom(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number){

    //assign weights from (1-100) to all slaves randomly
    const percentageWeights: bigint[] = Array.from({ length: amountOfSlaves }, () => {
        return BigInt(Math.floor(Math.random() * 100) + 1);
    });

    let sumOfWeights: bigint = 0n;

    percentageWeights.forEach((weight) => {
        sumOfWeights += weight;
    });

    const actualPercentage : bigint[] = new Array(amountOfSlaves);

    for(let i =0; i<actualPercentage.length;i++){
        actualPercentage[i] = (percentageWeights[i]/sumOfWeights)
    }

    const amountDistributed: bigint[] = new Array(amountOfSlaves);

    for(let i =0; i<amountDistributed.length;i++){
        amountDistributed[i] = (((grandTotalAdjusted / 100n) * actualPercentage[i]) + base)
    }
    
    return amountDistributed;
    }


    export async function normalizationEven(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number){

        const amountDistributed: bigint[] = new Array(amountOfSlaves);

        for(let i = 0; i < amountDistributed.length;i++){
            amountDistributed[i] = ((grandTotalAdjusted / BigInt(amountOfSlaves)) + base)
        }
   
        return amountDistributed;
    }






