import { FastifyInstance } from "fastify";
import { VersionedTransaction, PublicKey, VersionedMessage } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { deriveKeyPair } from '../../wallet'
import { getSeedPhrase } from "./walletFunctions";
import { decrypt } from '../../crypto'
import pool from "../../db"

interface signers{
    publicKey: string;
    derivationPath: string;
}[];


//CREATE TABLE tb_wallets (
//    wallet_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//    user_id            UUID NOT NULL REFERENCES tb_users(user_id) ON DELETE CASCADE,
//    wallet_index       INT NOT NULL,
//    derivation_path    VARCHAR NOT NULL,
//    public_key         VARCHAR UNIQUE NOT NULL,
//    encrypted_mnemonic TEXT NOT NULL,
//    wallet_type        VARCHAR NOT NULL DEFAULT 'slave' CHECK (wallet_type IN ('slave', 'funding', 'fee', 'master')),
//    label              VARCHAR,
//    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
//    CONSTRAINT uq_user_wallet_index UNIQUE (user_id, wallet_index)

//route for receiving versioned serialized transactions
//this is important because wallet-app is the owner for the keys ....no decrypted keys over the wire
//this is in place to handle securely the signing of transactions and reply with a signed transaction for the calling service
 
async function signTransaction(fastify: FastifyInstance){
    fastify.post("/signSingle", async (request,reply) =>{
        const {user_id, pubKeys, transaction } = request.body as {user_id: string, pubKeys: string[], transaction: string}

        //first validate user_id matches owned public keys in DB, aka lookupSigners-Function

        //derive keys for all wallets in signers

        //once validated and derived, deserialize the transaction


        //sign the transaction, serialize and return
        const pubKeyMap = await lookupSigners(user_id,pubKeys);
        
        //if nothing is found in db for that userID
        if(pubKeyMap ===null)
            return reply.status(400)

        //turn transaction string which is really a base64encodedwiretransaction (string) from solana/kit into buffer, then deserialize
        //turning it into the transaction object
        //now that transaction object is alive, we can take the message value and turn that into bytes to sign for 
        const transactionBytes = Buffer.from(transaction,'base64');
        const tx = VersionedTransaction.deserialize(transactionBytes);
        const messageBytes = tx.message.serialize();
        
        //normal seedPhrase decryption madness, will need to clean up wallet_app and all this
        const seedPhrase = await getSeedPhrase(user_id)   
        const decryptedSeedPhrase = decrypt(seedPhrase, process.env.ENCRYPTION_KEY!,user_id)
        var signature;


        for(const [publicKey,derivationPath] of pubKeyMap){
        
        var keypair = await deriveKeyPair(decryptedSeedPhrase,derivationPath)
        signature = nacl.sign.detached(messageBytes,keypair.secretKey)
        tx.addSignature(publicKey,signature)
        }
        const signedBytes = tx.serialize()
        
        return reply.status(200).send({signedTransactionBytes:signedBytes})
    })
}

// 1. lookupSigners regressed back to the three-shape problem we already fixed. It now returns 0 | "DB server error" | Map — same issue as before, just with different placeholder values instead of null/Error. The catch block is still swallowing real DB errors into a string. Fix the contract back to Map | null, let failures throw.

// 2. Your caller only checks pubKeyMap === 0 — it never checks the "DB server error" string case. If that branch hits, you fall through and try to iterate a string as a Map. Directly caused by #1.

// 3. The Map iteration destructuring is wrong. lookupSigners builds Map<public_key, row> where each value is the whole row object ({ public_key, derivation_path }), not the path alone. Your for (const [pubKeys, derivationPath] of pubKeyMap) assumes the second element is a plain string — it's actually an object. You're deriving keypairs against [object Object], not a path.

// 4. Your inner loop variable pubKeys shadows the outer function parameter pubKeys (the full array). Same name, different meaning, easy to reference the wrong one later without a type error catching it.

// 5. Biggest one: you never actually produce a signature. addSignature takes (publicKey, signature) — a signature is the output of signing the message bytes, not the secret key itself. You're calling deserializedTransaction.addSignature(pubKeys, keypair.secretKey) — passing the raw secret key where a signature is expected. You skipped the actual signing step entirely. Go back to §5 of the doc: sign deserializedTransaction.message.serialize() with the keypair first (either manually via nacl, or tx.sign([keypair]) per our last exchange), then the signature gets placed.

// 6. No identity check. Nowhere do you verify the derived pubkey actually equals the pubkey you looked up / were asked to sign for. That's your PUBKEY_MISMATCH gate — currently absent.

// 7. No check that each requested pubkey is actually a required signer in the deserialized transaction (staticAccountKeys). That's SIGNER_NOT_IN_TRANSACTION from the contract — also absent.

// 8. No check that all requested pubKeys were actually found in the DB. ANY() only returns matches — if one of five requested pubkeys doesn't exist in tb_wallets, your map just silently has 4 entries instead of 5, and your loop happily signs 4 and says nothing about the missing one. Compare map size against the request array length before proceeding.

// 9. No ALREADY_SIGNED check before signing — contract requires reject, not silent overwrite.

// 10. No try/catch around VersionedTransaction.deserialize() — malformed input currently throws unhandled instead of returning DESERIALIZE_FAILED.

// 11. The function never sends a response. You compute reserializedTransaction and the function just... ends. No reply.send(...) on the success path, at all.

// 12. The serialized output isn't re-encoded to base64 before it would be sent back — same encoding step you did on the way in, missing on the way out.

// 13. reply.status(500) for a not-found case is the wrong status class. 500 means "we broke," not "user/pubkey not found" — that's a client-side problem (400/404 territory), and per your own contract it should map to a specific named error (USER_NOT_FOUND / PUBKEY_MISMATCH), not a generic 500.

// Fix in this order: #1/#2 (lookup contract), #5 (actually sign), #3/#4 (map iteration), #6–#10 (validation gates from the contract), #11–#13 (response). Bring it back once those are in.



async function lookupSigners(userId: string, pubkeys: string[]) {


            try {
                const result = await pool.query(
                    `SELECT public_key, derivation_path FROM tb_wallets
                    WHERE user_id = $1 AND public_key = ANY($2::text[])`,
                    [userId, pubkeys]
                    );

            if(!result || result.rowCount ===0){
                return null
            }
             return new Map(result.rows.map(r => [r.public_key, r.derivation_path]));

        } catch (error) {
            throw(error)
        }

 
}