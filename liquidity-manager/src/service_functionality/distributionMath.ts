



export async function normalization(grandTotal: bigint, base: bigint, amountOfSlaves: number){

    //assign weights from (1-100) to all slaves randomly
    const percentageWeights: bigint[] = Array.from({ length: amountOfSlaves }, () => {
        return BigInt(Math.floor(Math.random() * 100) + 1);
    });

    let sumOfWeights: bigint = 0n;

    percentageWeights.forEach((weight) => {
        sumOfWeights += weight;
    });
    


    }







