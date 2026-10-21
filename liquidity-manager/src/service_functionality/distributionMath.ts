// import { distributionParams, distributionResult, reserveConfig, walletAllocation } from "../interfaces";





// export function computeBaseReserve(systemRent: bigint, ataRent: bigint, cfg: reserveConfig): bigint {
//     const h = BigInt(cfg.txHeadroom);
//     return systemRent + ataRent * 2n + h * (cfg.baseFeePerTx + cfg.priorityFeePerTx + cfg.tipPerTx);
// }    



// export function distributionLogic(parameters: distributionParams): distributionResult { 
// //not the place for checking validity of numbers, assume numbers are valid, checked outside this function
// //we return distributionResult, not any

// //grandTotal adjusted for (baseReserve * walletCount)
// const distributionAdjustedAmount: bigint = (parameters.grandTotal - (parameters.baseReserve * BigInt(parameters.walletCount)))
// if(distributionAdjustedAmount <=0n)
//    return throw new Error("Distribution Amount");
    

// //had an if statement / didnt want let need const. Went to IIFE ()=> with if returns, still undefined or bigInt[]
// //trying our ternary operators (pretty coo, basically a conditional)
// //? is "then" if conditional is true
// //: is "else" if conditional is false

// const distributionArray = parameters.splitMode ==="even" 
// ? normalizationEven(distributionAdjustedAmount,parameters.baseReserve,parameters.walletCount)
// : normalizationRandom(distributionAdjustedAmount,parameters.baseReserve,parameters.walletCount)



// const wallets: walletAllocation[] = new Array(parameters.walletCount);
// //positions for bundling starts at zero, so i works fine no i +1 needed
// for(let i = 0; i < wallets.length; i++){
// wallets[i] = {
//     position: i,
//     transferAmount: distributionArray[i]
// }
// }


//     return {allocations: wallets}
// }




// export function normalizationRandom(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number){

//     //assign weights from (1-100) to all slaves randomly
//     const percentageWeights: bigint[] = Array.from({ length: amountOfSlaves }, () => {
//         return BigInt(Math.floor(Math.random() * 100) + 1);
//     });

//     let sumOfWeights: bigint = 0n;

//     percentageWeights.forEach((weight) => {
//         sumOfWeights += weight;
//     });


//     const amountDistributed: bigint[] = new Array(amountOfSlaves);

//     for(let i =0; i<amountDistributed.length;i++){
//         amountDistributed[i] = (((grandTotalAdjusted / 100n) * actualPercentage[i]) + base)
//     }
    
//     return amountDistributed;
//     }


//     export function normalizationEven(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number){

//         const amountDistributed: bigint[] = new Array(amountOfSlaves);

//         for(let i = 0; i < amountDistributed.length;i++){
//             amountDistributed[i] = ((grandTotalAdjusted / BigInt(amountOfSlaves)) + base)
//         }
   
//         return amountDistributed;
//     }






import { distributionParams, distributionResult, reserveConfig, walletAllocation } from "../interfaces";


export function computeBaseReserve(systemRent: bigint, ataRent: bigint, cfg: reserveConfig): bigint {
    const h = BigInt(cfg.txHeadroom);
    return systemRent + ataRent * 2n + h * (cfg.baseFeePerTx + cfg.priorityFeePerTx + cfg.tipPerTx);
}



export function distributionLogic(parameters: distributionParams): Promise<distributionResult> {

const distributionAdjustedAmount: bigint = (parameters.grandTotal - (parameters.baseReserve * BigInt(parameters.walletCount)))

const distributionArray = parameters.splitMode ==="even"
? normalizationEven(distributionAdjustedAmount,parameters.baseReserve,parameters.walletCount)
: normalizationRandom(distributionAdjustedAmount,parameters.baseReserve,parameters.walletCount)
// ISSUE (design): pass parameters.rng ?? Math.random into normalizationRandom (and give
//                 normalizationEven the same signature, ignoring it) so tests can be deterministic


const wallets: walletAllocation[] = new Array(parameters.walletCount);

for(let i = 0; i < wallets.length; i++){
wallets[i] = {
    position: i,
    transferAmount: distributionArray[i]
}
}

// ISSUE (correctness): assert here that Σ wallets[i].transferAmount === parameters.grandTotal,
//                      throw if not — one loop, catches every rounding bug

    return {allocations: wallets}

}




export function normalizationRandom(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number){

    // ISSUE (design): missing the agreed 1/3 floor —
    //                 floor = grandTotalAdjusted / 3n split evenly; weights split (grandTotalAdjusted - floor)

    const percentageWeights: bigint[] = Array.from({ length: amountOfSlaves }, () => {
        return BigInt(Math.floor(Math.random() * 100) + 1);
        // ISSUE (design): Math.random hardcoded — use the injected rng parameter
    });

    let sumOfWeights: bigint = 0n;

    percentageWeights.forEach((weight) => {
        sumOfWeights += weight;
    });
    // MINOR: cleaner as percentageWeights.reduce((a, b) => a + b, 0n)



    const amountDistributed: bigint[] = new Array(amountOfSlaves);

    for(let i =0; i<amountDistributed.length;i++){
        amountDistributed[i] = (((grandTotalAdjusted / 100n) * actualPercentage[i]) + base)
        // ISSUE (CRITICAL): divides first — loses up to 99 lamports before multiplying,
        //                   and /100 doesn't match the math (weights aren't % of 100).
        //                   multiply first: grandTotalAdjusted * percentageWeights[i] / sumOfWeights
    }

    // ISSUE (CRITICAL): integer division drops leftover lamports — sum < grandTotalAdjusted.
    //                   leftover = grandTotalAdjusted - Σ shares; hand out 1 lamport at a time from index 0

    return amountDistributed;
    }


    // MINOR: indentation of this function is off
    export function normalizationEven(grandTotalAdjusted: bigint, base: bigint, amountOfSlaves: number){

        const amountDistributed: bigint[] = new Array(amountOfSlaves);

        for(let i = 0; i < amountDistributed.length;i++){
            amountDistributed[i] = ((grandTotalAdjusted / BigInt(amountOfSlaves)) + base)
        }

        // ISSUE (CRITICAL): same leftover problem — grandTotalAdjusted / n floors;
        //                   remainder = grandTotalAdjusted % BigInt(n) lamports are lost.
        //                   add 1n to the first `remainder` wallets

        return amountDistributed;
    }

