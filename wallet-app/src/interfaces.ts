//to organize for easier reply for users wallets
export interface walletList{
      public_key: string
      wallet_type: string
}

export interface DerivedWallet{
    publicKey: string
    secretKey: Uint8Array //64 BYTES - 0-32 = secret key, 33-64 = public key
}

export interface signers{
    publicKey: string;
    derivationPath: string;
};

//sloppy I know as this is the same as signers, will clean up, just need
//better naming for the create wallet functions
export interface walletCreations{
    publicKey: string;
    index: number;
    derivationPath: string;
};

export interface savedWallet {
    wallet_id: string;
    public_key: string;
};


//for listing bundle groups cuh
export interface bundleGroupList {
    group_id: string;
    group_name: string;
    created_at: Date;
    // wallet_count: number;   // most likely will use
}

export interface bundleGroupWallets { 
    position: number; 
    wallet_id: string; 
    public_key: string 
}

export type signingErrorCode = "DESERIALIZE_FAILED" | "SIGNER_NOT_IN_TRANSACTION" | "ALREADY_SIGNED";

export interface signerRow {
    public_key: string;
    derivation_path: string;
}

//below used only for irys uploads --recently moved from coin-launcher to provide "safe" signing
export interface tokenMetadataInput {
    name: string;
    symbol: string;
    description: string;
    website: string;
    twitter: string;
    telegram: string;
}

export interface uploadAssetsRequest {
    user_ID: string;
    fundingWalletId: string;
    imageBase64: string;
    mimeType: string;
    metadata: tokenMetadataInput;
}