export interface LaunchJobData {
    userId: string
    imageBase64: string       //Buffer serialized as array for Redis
    revoke: boolean              //revoke mint authority, default true
    revokeFreeze: boolean
    lockMetaData: boolean
    mimeType: string
    poolPercentage: number
    name: string
    symbol: string
    description: string
    decimals: number
    supply: number
    configAddress: string
    initialLiquiditySol: number
    fundingWalletId: string
    feeWalletId: string
    website: string
    twitter: string
    telegram: string
    autoBuyEnabled: boolean
    slaveWalletId: string | null
    numberOfBuys: number
    solPerBuy: number
}

export interface tokenRecord {
    userId: string;
    fundingWalletId: string;
    feeWalletId: string | null;
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    supply: string;               //whole tokens as a string — NUMERIC column
    metadataUri: string;
    imageUri: string;
    metadataTxSig: string | null;
    poolAddress: string;
    positionAddress: string;
    positionNftMint: string;
    launchTxSig: string;
    website: string;
    twitter: string;
    telegram: string;
    tokenProgram: "spl-token" | "token-2022";
    mintAuthorityRevoked: boolean;
    freezeAuthorityRevoked: boolean;
    metadataLocked: boolean;
}


// in LaunchJobData — new advanced setting, default true (revoked)
//revokeFreeze: boolean

export interface token2022LaunchParams {
    userId: string;
    fundingPublicKey: string;
    decimals: number;
    supply: bigint;            //whole tokens
    name: string;
    symbol: string;
    uri: string;               //Arweave metadata JSON
    revokeMint: boolean;
    revokeFreeze: boolean;
    lockMetadata: boolean;
}

export interface poolLaunchParams {
    userId: string;
    fundingPublicKey: string;
    mintAddress: string;
    tokenAAmount: bigint;      //token base units into the pool
    tokenBAmount: bigint;      //lamports into the pool
    configAddress: string;
}