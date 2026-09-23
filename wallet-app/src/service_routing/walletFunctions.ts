import { FastifyInstance } from "fastify";
import * as wallet from "../service_functionality/wallet";
import pool from "../service_dataOperations/databaseConnectivity";
import { decrypt} from "../service_functionality/crypto"
import { fundingWalletSave, listPublicKey, listWallets, slaveWalletSave } from "../service_dataOperations/databaseCalls";
import { getSeedPhrase,getLatestIndex } from "../service_dataOperations/databaseCalls";



//fuction that basically acts as a do all for wallet functions hence the name, caters for all wallet functions leading to only one import in index file
//this is a "protected" api call through fastify, will need valid jwt and authentication required
export async function walletFunctions(fastify: FastifyInstance){

    //grabs all user wallets for wallet manager, request only requires the user_id which will be the foreign key within the database for tb_wallets
      fastify.get("/listWallets", async (request, reply) => {
      const { user_ID } = request.query as { user_ID: string }        
        try {
            const results = await listWallets(user_ID);

            if(!results || results.rowCount === 0)
                return reply.status(200).send(`No wallet results for user_ID : ${user_ID}`)

            return reply.status(200).send(results.rows)
        } catch (error) {
            reply.status(500).send(["Internal service error"])
        }
      })



//quick get to send public key in exchange for wallet_id
      fastify.get("/listPublicKey", async (request, reply) => {
      const { wallet_ID } = request.query as { wallet_ID: string }        
        try {
            const results = await listPublicKey(wallet_ID)
            
            if(!results || results.rowCount === 0)
                return reply.status(200).send(`No wallet results for wallet_id : ${wallet_ID}`)

            return reply.status(200).send(results.rows)
        } catch (error) {
            reply.status(500).send(["Internal service error"])
        }
      })

//creating, validating, and saving slave wallets
fastify.post("/slaveWallets", async (request, reply) => {
    const { user_ID, amountOfSlaves } = request.body as { user_ID: string, amountOfSlaves: number }
    
    const slaves = await wallet.createSlaveWallets(amountOfSlaves, user_ID); 
    const latestIndex = await getLatestIndex(user_ID, 'slave');
    const response = await slaveWalletSave(slaves, user_ID, latestIndex);

    if(response ==='successful')
        return reply.status(200).send(response);
    else
        return reply.status(403).send(response);
})


    //creating, validating, and saving funding wallets 
fastify.post("/fundingWallets", async (request, reply) => {
    const { user_ID} = request.body as { user_ID: string}
        
    const fundingWallet = await wallet.createFundingWallet(user_ID);
    const response = await fundingWalletSave(fundingWallet.wallet,user_ID,fundingWallet.index);
    
    if(response ==='successful')
        return reply.status(200).send(response);
    else
        return reply.status(403).send(response);
      })





      //creating, validating, and saving fee wallets - however at this time, fee wallets are basically unused since funding wallets create and seed the pool
      //at the moment fee wallets dont have ownership transfered as of yet, which means the funding wallet is where exiting pool funds go back to / who collects the fees as well
      fastify.post("/feeWallets", async (request, reply) => {
    const { user_ID} = request.body as { user_ID: string}
        //fill in logic for, rethinking the whole fee wallet thing, as its just more headache for the transfer of ownership from funding to fee. Might as well just get rid 
        // of it
        //and use funding only.....still thinking tho
    
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

