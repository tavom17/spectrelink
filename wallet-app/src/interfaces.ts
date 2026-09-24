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