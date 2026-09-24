import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import  nacl from 'tweetnacl';
import { DerivedWallet,walletCreations } from "../interfaces";
import { decrypt } from "./crypto";



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
    const { default: bs58 } = await import('bs58');
    const address = bs58.encode(keypair.publicKey);
    //secret key is full 64 byte (0-32 = secret key only , 33-64 = public key  decoded) 
    const secret = keypair.secretKey;
    const wallet : DerivedWallet =  {publicKey: address, secretKey: secret};

    return wallet;
}



//need to add all functionality in this ts file
//i.e. creating slaves, then called from walletFunctions, output then passed to database in databaseCalls.ts
//LOOSE COUPLING, HIGH cohesion, currently if something cam along to create slaves from a different place, I cant reuse the creation logic 
//because its so fused in the routes and doesnt have its own function to call


export async function createSlaveWallets(user_ID: string,encryptedMnemonic: string, startingIndex: number,amountOfSlaves: number, ): Promise<Array<walletCreations>> {

    const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_ID);
    const slaves: walletCreations[] = [];
     
    

        for (let i = 0; i < amountOfSlaves; i++) {
            const calculatedIndex: number = (startingIndex + i);
            const derivationPath = `m/44'/501'/2'/${calculatedIndex}'`
            const derivedWallet = await deriveKeyPair(decryptedMnemonic, derivationPath);
            slaves[i] = {publicKey:derivedWallet.publicKey,index: calculatedIndex, derivationPath:derivationPath}
        }


    return slaves; 
}

export async function createFundingWallet(user_ID: string,encryptedMnemonic: string, index: number): Promise<walletCreations>{

    const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_ID);
    const derivationPath = `m/44/501/1/${index}`;
    const wallet = await deriveKeyPair(decryptedMnemonic, derivationPath);

    const fundingWallet = {publicKey: wallet.publicKey,index: index, derivationPath:derivationPath}
    return fundingWallet; 
}







