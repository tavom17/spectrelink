import { VersionedTransaction, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { signingErrorCode } from "../interfaces";

//error with a code the route can map to a response
export class SigningError extends Error {
    constructor(public code: signingErrorCode, message: string){
        super(message);
    }
}

//deserialize only to attach signatures — never edits the message
export function signVersionedTransaction(transactionBase64: string, keypairs: { publicKey: string; secretKey: Uint8Array }[]): string {

    let tx: VersionedTransaction;
    try {
        tx = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
    } catch {
        throw new SigningError("DESERIALIZE_FAILED", "Transaction could not be deserialized");
    }

    //signers always sit in the first numRequiredSignatures static account keys
    const requiredSigners: string[] = tx.message.staticAccountKeys
        .slice(0, tx.message.header.numRequiredSignatures)
        .map(key => key.toBase58());

    //validate EVERY signer before signing ANY — no partial signing
    for(const keypair of keypairs){
        const slot = requiredSigners.indexOf(keypair.publicKey);

        if(slot === -1)
            throw new SigningError("SIGNER_NOT_IN_TRANSACTION", `${keypair.publicKey} is not a required signer`);

        //unsigned slots are 64 zero bytes
        if(tx.signatures[slot].some(byte => byte !== 0))
            throw new SigningError("ALREADY_SIGNED", `${keypair.publicKey} has already signed`);
    }

    //same message bytes for every signer — only the signatures array grows
    const messageBytes = tx.message.serialize();

    for(const keypair of keypairs){
        const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
        tx.addSignature(new PublicKey(keypair.publicKey), signature);
    }

    return Buffer.from(tx.serialize()).toString('base64');
}