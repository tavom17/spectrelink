import { FastifyInstance } from "fastify";
import { VersionedTransaction, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { deriveKeyPair } from '../../wallet'
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
    fastify.post("/sign", async (request,reply) =>{
        const {user_id,signers, transaction } = request.body as {user_id: string, signers: signers[], transaction: VersionedTransaction}
        try {
            const result = await pool.query('select user_id, public_key, derivation_path from tb_wallets where user_id = $1',[user_id])
            if(result === null || result.rowCount ===0){
                return reply.status(500).send("User_id not found")
            }


        } catch (error) {
            return reply.status(500)
        }
        //first validate user_id matches owned public keys in DB

        //derive keys for all wallets in signers

        //once validated and derived, deserialize the transaction


        //sign the transaction, serialize and return



    })
}