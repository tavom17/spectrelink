import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import  nacl from 'tweetnacl';
import bs58 from "bs58";

interface DerivedWallet{
    publicKey: string
    secretKey: Uint8Array //64 BYTES - 0-32 = secret key, 33-64 = public key
}



//to be used only on initial user registration
export function generateSeedPhrase(): string{
    const seedPhrase = bip39.generateMnemonic(256);
    return seedPhrase;
}



export async function deriveKeyPair(seedPhrase: string, path: string): Promise<DerivedWallet> {
    const seed = await bip39.mnemonicToSeed(seedPhrase);
    const derived = derivePath(path, seed.toString('hex'));
    const keypair = nacl.sign.keyPair.fromSeed(derived.key);
    //public key return is string encoded = address, not the buffer array
    const address = bs58.encode(keypair.publicKey);
    //secret key is full 64 byte (0-32 = secret key only , 33-64 = public key  decoded) 
    const secret = keypair.secretKey;
    const wallet : DerivedWallet =  {publicKey: address, secretKey: secret};

    return wallet;
}

