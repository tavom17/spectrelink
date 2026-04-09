import { FastifyInstance } from "fastify";
import { generateSeedPhrase,deriveKeyPair} from "../../wallet";
import { encrypt } from "../../crypto";
import pool from "../../db";



export async function register(fastify: FastifyInstance) {
  fastify.post("/register", async (request, reply) => {



    try{
    //set in .env file, used for docker container creation
    const masterSecret = process.env.ENCRYPTION_KEY;
        if (!masterSecret) throw new Error("ENCRYPTION_KEY not set")

    const { userID } = request.body as { userID: string }  
    
    const seedPhrase = generateSeedPhrase(); 
    const encryptedSeedPhrase = encrypt(masterSecret, userID, seedPhrase);
    const masterWalletPath = "m/44'/501'/0'/0'"
    const publicKey = (await deriveKeyPair(seedPhrase,masterWalletPath)).publicKey;
    
    const insertData = await pool.query(
            
          `INSERT INTO tb_wallets (user_id, wallet_index,derivation_path,public_key, encrypted_mnemonic, wallet_type, label) 
           VALUES ($1, $2,$3, $4,$5, $6, $7)`,
          [userID, 0, masterWalletPath, publicKey, encryptedSeedPhrase, 'master', 'first registration']
            );

reply.status(201).send({ message: "Master Wallet Created", seedPhrase: seedPhrase })
    }catch(err){
    fastify.log.error(err)
    return reply.status(500).send({ error: "Internal server error" })
    }


    })
}