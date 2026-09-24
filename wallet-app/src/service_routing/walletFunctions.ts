import { FastifyInstance } from "fastify";
import * as wallet from "../service_functionality/wallet";
import pool from "../service_dataOperations/databaseConnectivity";
import { decrypt} from "../service_functionality/crypto"
import { fundingWalletSave, listPublicKey, listWallets, slaveWalletSave, validateForKeyPair } from "../service_dataOperations/databaseCalls";
import { getSeedPhrase,getLatestIndex } from "../service_dataOperations/databaseCalls";



//fuction that basically acts as a do all for wallet functions hence the name, caters for all wallet functions leading to only one import in index file
//this is a "protected" api call through fastify, will need valid jwt and authentication required
export async function walletFunctions(fastify: FastifyInstance){

    //grabs all user wallets for wallet manager, request only requires the user_id which will be the foreign key within the database for tb_wallets
      fastify.get("/listWallets", async (request, reply) => {
      const { user_ID } = request.query as { user_ID: string }        
        try {
            const results = await listWallets(pool,user_ID);

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

            const results = await listPublicKey(pool,wallet_ID)
            
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

    if(Number.isInteger(amountOfSlaves) && amountOfSlaves >= 1 && amountOfSlaves <= 25)
        return reply.status(400).send("Slave creation limit of 25: surpassed")

    const client = await pool.connect();

    try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user_ID]);


        const encryptedMnemonic = await getSeedPhrase(client,user_ID);
        const latestIndex = await getLatestIndex(client,user_ID, 'slave');
        const slaves = await wallet.createSlaveWallets(user_ID,encryptedMnemonic,latestIndex,amountOfSlaves); 
        const result = await slaveWalletSave(client,slaves, user_ID);

    await client.query('COMMIT');
    return reply.status(200).send(result);

    } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.status(500).send("Database Transaction Failure");
    } finally {
        client.release();
    }

})


    //creating, validating, and saving funding wallets 
fastify.post("/fundingWallets", async (request, reply) => {
    const {user_ID} = request.body as { user_ID: string}
        
    const client = await pool.connect();

    try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user_ID]);

        
        const encryptedMnemonic = await getSeedPhrase(client,user_ID);
        const latestIndex = await getLatestIndex(client,user_ID, 'funding');
        const fundingWallet = await wallet.createFundingWallet(user_ID,encryptedMnemonic,latestIndex);
        const result = await fundingWalletSave(client,user_ID,fundingWallet);

    await client.query('COMMIT');
    return reply.status(200).send(result);

    } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.status(500).send("Database Transaction Failure");
    } finally {
        client.release();
    }
   
      })





      //creating, validating, and saving fee wallets - however at this time, fee wallets are basically unused since funding wallets create and seed the pool
      //at the moment fee wallets dont have ownership transfered as of yet, which means the funding wallet is where exiting pool funds go back to / who collects the fees as well
      fastify.post("/feeWallets", async (request, reply) => {
    const { user_ID} = request.body as { user_ID: string}
        //fill in logic for, rethinking the whole fee wallet thing, as its just more headache for the transfer of ownership from funding to fee. Might as well just get rid 
        // of it
        //and use funding only.....still thinking tho
    
      })




//authenticate three things. User_id, wallet_type, and wallet_id
//must happen before deriving

fastify.post("/derive", async (request, reply) => {
    const { wallet_id, user_ID, wallet_type} = request.body as { wallet_id: string, user_ID: string, wallet_type: string}
    
    try {

        
        const result = await validateForKeyPair(pool,wallet_id,user_ID,wallet_type);

        if(result.length===0)
            return reply.status(404).send(`Could not validate wallet_ID: ${wallet_id} for user_ID: ${user_ID}`)

        const encryptedMnemonic = await getSeedPhrase(pool,user_ID);
        const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_ID);
        const derivedWallet = await wallet.deriveKeyPair(decryptedMnemonic,result[0].derivation_path)

    return reply.status(200).send({ publicKey: derivedWallet.publicKey, secretKey: Array.from(derivedWallet.secretKey) })

    } catch (error) {
        request.log.error(error);
        return reply.status(500).send("Internal server error");
    }
 
    
})


}