import { FastifyInstance } from "fastify";
import pool from "../service_dataOperations/databaseConnectivity";
import { lookupSigners, getSeedPhrase } from "../service_dataOperations/databaseCalls";
import { decrypt } from "../service_functionality/crypto";
import { deriveKeyPair } from "../service_functionality/wallet";
import { signVersionedTransaction, SigningError } from "../service_functionality/transactionSigning";

//wallet-app is the signing authority — keys never leave this service
//callers build + compile the tx, we sign and return it, callers broadcast
export async function transactionEndpoints(fastify: FastifyInstance){

fastify.post("/sign", async (request, reply) => {
    const { user_ID, pubKeys, transaction } = request.body as { user_ID: string, pubKeys: string[], transaction: string }

    if(!user_ID || !transaction || !Array.isArray(pubKeys) || pubKeys.length === 0)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "user_ID, pubKeys[] and transaction are required" });

    //duplicate pubkeys would break the found-count check below
    const requestedPubKeys = [...new Set(pubKeys)];

    try {
        //reads only, no writes — pool, no transaction, no lock
        const signerRows = await lookupSigners(pool, user_ID, requestedPubKeys);

        //ANY() only returns matches — any missing key isn't this user's (or doesn't exist)
        if(signerRows.length !== requestedPubKeys.length)
            return reply.status(403).send({ error: "PUBKEY_MISMATCH", message: "One or more public keys do not belong to this user" });

        //decrypt once, derive per signer
        const encryptedMnemonic = await getSeedPhrase(pool, user_ID);
        const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_ID);

        const keypairs = [];
        for(const row of signerRows){
            const derivedWallet = await deriveKeyPair(decryptedMnemonic, row.derivation_path);

            //stored path must re-derive the stored key — if not, the DB row is corrupt
            if(derivedWallet.publicKey !== row.public_key){
                request.log.error(`Derivation mismatch for ${row.public_key}`);
                return reply.status(500).send({ error: "DERIVATION_MISMATCH", message: "Stored wallet could not be re-derived" });
            }
            keypairs.push(derivedWallet);
        }

        const signedTransaction = signVersionedTransaction(transaction, keypairs);

        return reply.status(200).send({ transaction: signedTransaction, signedBy: requestedPubKeys });

    } catch (error) {
        //caller's tx problem — 400 with the named code
        if(error instanceof SigningError)
            return reply.status(400).send({ error: error.code, message: error.message });

        //never log transaction contents or key material — error only
        request.log.error(error);
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Signing failed" });
    }
})

}