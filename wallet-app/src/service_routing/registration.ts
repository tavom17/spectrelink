import { FastifyInstance } from "fastify";
import { generateSeedPhrase,deriveKeyPair} from "../service_functionality/wallet";
import { encrypt } from "../service_functionality/crypto";
import { registrationWalletSave } from "../service_dataOperations/databaseCalls";


//walletRoute doesnt really explain the reason for this, basically wallet-app handles all wallet functions, including generating the first master seed phrase
//when the user registers I wanted this to act like ledger or phantom, new account, show seed phrase to write down etc, instead of having the user create a wallet then create master
//so this is specifically only when the user registers their account, this sets the master seed phrase and derivation path beginning
export async function register(fastify: FastifyInstance) {
  fastify.post("/register", async (request, reply) => {



    try{
    //set in .env file, used for docker container creation
    const masterSecret = process.env.ENCRYPTION_KEY;
        if (!masterSecret) throw new Error("ENCRYPTION_KEY not set")

    const { user_ID } = request.body as { user_ID: string }  
    
    const seedPhrase = generateSeedPhrase(); 
    const encryptedSeedPhrase = encrypt(masterSecret, user_ID, seedPhrase);
    const masterWalletPath = "m/44'/501'/0'/0'"
    const publicKey = (await deriveKeyPair(seedPhrase,masterWalletPath)).publicKey;
    
   const response = await registrationWalletSave(user_ID,publicKey,masterWalletPath,'master',encryptedSeedPhrase)
    
   if (response.rowCount && response.rowCount > 0) {
    reply.status(201).send({ message: "Master Wallet Created", seedPhrase: seedPhrase })
    }
    
    }catch(err){
    fastify.log.error(err)
    return reply.status(500).send({ error: "Internal server error" })
    }


    })
}