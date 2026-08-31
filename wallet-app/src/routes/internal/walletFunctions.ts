import { FastifyInstance } from "fastify";
import * as wallet from "./../../wallet";
import pool from "../../db";
import { decrypt } from "../../crypto";

//to organize for easier reply for users wallets
interface walletList{
      public_key: string
      wallet_type: string
}

//fuction that basically acts as a do all for wallet functions hence the name, caters for all wallet functions leading to only one import in index file
//this is a "protected" api call through fastify, will need valid jwt and authentication required
export async function walletFunctions(fastify: FastifyInstance){

    //grabs all user wallets for wallet manager, request only requires the user_id which will be the foreign key within the database for tb_wallets
      fastify.get("/listWallets", async (request, reply) => {
      const { user_id } = request.query as { user_id: string }        
        try {
            const results = await pool.query<walletList>(
            `select public_key,wallet_type,wallet_id from tb_wallets
            where user_id = $1`,[user_id]) 
            
            if(!results || results.rowCount === 0)
                return reply.status(200).send(`No wallet results for user_ID : ${user_id}`)

            return reply.status(200).send(results.rows)
        } catch (error) {
            reply.status(500).send(["Internal service error"])
        }
      })



//quick get to send public key in exchange for wallet_id
      fastify.get("/listPublicKey", async (request, reply) => {
      const { wallet_id } = request.query as { wallet_id: string }        
        try {
            const results = await pool.query<walletList>(
            `select public_key from tb_wallets
            where wallet_id = $1`,[wallet_id]) 
            
            if(!results || results.rowCount === 0)
                return reply.status(200).send(`No wallet results for wallet_id : ${wallet_id}`)

            return reply.status(200).send(results.rows)
        } catch (error) {
            reply.status(500).send(["Internal service error"])
        }
      })

//creating, validating, and saving slave wallets
fastify.post("/slaveWallets", async (request, reply) => {
    const { user_id, amountOfSlaves } = request.body as { user_id: string, amountOfSlaves: number }
    
    const encryptedMnemonic = await getSeedPhrase(user_id)
    const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_id)
    const oneIndexPastMax = await getLatestIndex(user_id, 'slave')
    const slaves: string[] = []

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        for (let i = 0; i < amountOfSlaves; i++) {
            const derivedWallet = await wallet.deriveKeyPair(decryptedMnemonic, `m/44'/501'/2'/${oneIndexPastMax + i}'`)
            slaves.push(derivedWallet.publicKey)

            await client.query(
                `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user_id, oneIndexPastMax + i, `m/44'/501'/2'/${oneIndexPastMax + i}'`, derivedWallet.publicKey, 'slave']
            )
        }

        await client.query('COMMIT')
        return reply.status(201).send({ wallets: slaves })

    } catch (error) {
        await client.query('ROLLBACK')
        fastify.log.error(error)
        return reply.status(500).send({ error: "Internal server error" })
    } finally {
        client.release()
    }
})


    //creating, validating, and saving funding wallets 
      fastify.post("/fundingWallets", async (request, reply) => {
    const { user_id} = request.body as { user_id: string}
    
    const encryptedMnemonic = await getSeedPhrase(user_id)
    const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_id)
    const oneIndexPastMax = await getLatestIndex(user_id, 'funding')

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

            const derivedWallet = await wallet.deriveKeyPair(decryptedMnemonic, `m/44'/501'/1'/${oneIndexPastMax}'`)

            await client.query(
                `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user_id, oneIndexPastMax, `m/44'/501'/1'/${oneIndexPastMax}'`, derivedWallet.publicKey, 'funding']
            )
        

        await client.query('COMMIT')
        return reply.status(201).send({ publicKey: derivedWallet.publicKey, wallets: 'funding' })

    } catch (error) {
        await client.query('ROLLBACK')
        fastify.log.error(error)
        return reply.status(500).send({ error: "Internal server error" })
    } finally {
        client.release()
    }
      })

      //creating, validating, and saving fee wallets - however at this time, fee wallets are basically unused since funding wallets create and seed the pool
      //at the moment fee wallets dont have ownership transfered as of yet, which means the funding wallet is where exiting pool funds go back to / who collects the fees as well
      fastify.post("/feeWallets", async (request, reply) => {
    const { user_id} = request.body as { user_id: string}
    
    const encryptedMnemonic = await getSeedPhrase(user_id)
    const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_id)
    const oneIndexPastMax = await getLatestIndex(user_id, 'fee')

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

            const derivedWallet = await wallet.deriveKeyPair(decryptedMnemonic, `m/44'/501'/3'/${oneIndexPastMax}'`)

            await client.query(
                `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user_id, oneIndexPastMax, `m/44'/501'/3'/${oneIndexPastMax}'`, derivedWallet.publicKey, 'fee']
            )
        

        await client.query('COMMIT')
        return reply.status(201).send({publicKey: derivedWallet.publicKey, wallets: 'fee' })

    } catch (error) {
        await client.query('ROLLBACK')
        fastify.log.error(error)
        return reply.status(500).send({ error: "Internal server error" })
    } finally {
        client.release()
    }
      })




//http wrapper for deriving keypair in wallet.ts - mostly for coin launcher as an http launcher
//secondly, security, anyone authenticated can pass a wallet_type and public key and get a derived keypair back
//this means we need to authenticate three things. User_id, wallet_type, and wallet_id
//note : just added consumer function getKeypairForWallet so solanaRoute can also use it
fastify.post("/derive", async (request, reply) => {
    const { wallet_id, user_id, wallet_type} = request.body as { wallet_id: string, user_id: string, wallet_type: string}
    
    
    try {
       const derivedWallet = await getKeypairForWallet(wallet_id, user_id, wallet_type)
    return reply.status(200).send({ publicKey: derivedWallet.publicKey, secretKey: Array.from(derivedWallet.secretKey) })
    } catch (error) {
        fastify.log.error(error)
        return reply.status(500).send({ error: "Internal server error" })
    }
      })


}

//helper function for all other routes that require a secret key from a public key selected
//derive uses this function as well. This was a last minute change as a new route required and it was silly for derive to handle
//abstracted the validation from derive and the retrieval into this function, derive and other routes can now use this one
// the problem was derive is a post endpoint and not an actual exportable function
export async function getKeypairForWallet(wallet_id: string, user_id: string, wallet_type: string) {
    const response = await pool.query(
        `SELECT derivation_path FROM tb_wallets 
         WHERE wallet_id = $1 AND user_id = $2 AND wallet_type = $3`,
        [wallet_id, user_id, wallet_type]
    )

    if (!response || response.rowCount === 0) 
        throw new Error("Wallet validation failed")

    const encryptedMnemonic = await getSeedPhrase(user_id)
    const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_id)
    return await wallet.deriveKeyPair(decryptedMnemonic, response.rows[0].derivation_path)
}

//this function is only ever used when retrieving a keypair, as we take derivation path and seed phrase which needs to be decrypted
async function getSeedPhrase(user_id: string): Promise<string>{
            try {
            const encryptedSeedPhrase = await pool.query(
                  `select encrypted_mnemonic from tb_wallets
                  where user_id = $1 and wallet_type = $2`,[user_id, 'master'])

            if(!encryptedSeedPhrase || encryptedSeedPhrase.rowCount ===0) 
                  return "null"
            
            return encryptedSeedPhrase.rows[0].encrypted_mnemonic;

            } catch (error) {
                  return "Internal service error - DB"
            }
}

//function required in order to maintain integrity for derivation path
//can't reuse derivation paths, so this pulls lates wallet_index and increments by one when creating new wallets
async function getLatestIndex(user_id: string, wallet_type: string):Promise<number>{
                  try {
            const index = await pool.query(
                  `select MAX(wallet_index) from tb_wallets
                  where user_id = $1 and wallet_type = $2`,[user_id, wallet_type])

            if(!index || index.rowCount ===0) 
                  return 0
            const maxIndex = index.rows[0].max
            return maxIndex ===null ? 0 : maxIndex + 1;

            } catch (error) {
                  return -1
            }
}