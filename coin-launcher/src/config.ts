export const LAUNCH_PRIORITY_MICROLAMPORTS = 100_000;
export const MINT_TX_CU_LIMIT = 200_000;          //mint+metadata+supply in one tx — fixed, well above its real cost
export const SIMULATION_CU_LIMIT = 1_400_000;      //pool tx: simulate at max, then size to real usage
export const CU_SAFETY_MULTIPLIER = 1.2;