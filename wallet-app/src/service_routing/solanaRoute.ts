import { FastifyInstance } from "fastify"
import { getWalletBalance, withdrawSol } from "../service_functionality/solanaActions"
//import { validateForKeyPair } from "../service_dataOperations/databaseCalls"
//import pool from "../service_dataOperations/databaseConnectivity"

export async function solanaRoutes(fastify: FastifyInstance) {

// front end sends get request hits this get endpoint which ultimately calls getWalletBalance() inside solanaActions.ts

  fastify.get("/balance", async (request, reply) => {
    const { public_key } = request.query as { public_key: string }
    try {
      const result = await getWalletBalance(public_key)
      return reply.status(200).send(result)
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: "Failed to fetch balance" })
    }
  })

   
     //http://wallet-app:3003/internal/createBundleGroups
  // front end hits this when user wants to withdraw solana from any wallet in the wallet manager
  //backend receives this post request, generates a keypair for the wallet, inorder to sign the transaction, then calls withdraw sol from solanaActions.ts
  // solanaActions.ts withdrawSol() is what ultimately builds the transaction and rips it

  //NEED TO FIX, REWROTE GETKEYPAIR TO VALIDATEFORKEYPAIR .........rework function here
//   fastify.post("/withdraw", async (request, reply) => {
//     const { wallet_id, user_id, destination, amount, wallet_type } = 
//       request.body as { wallet_id: string, user_id: string, destination: string, amount: number, wallet_type: string }
//     try{
//         const derivedWallet = await validateForKeyPair(pool,wallet_id, user_id, wallet_type)
//         const result = await withdrawSol(derivedWallet.secretKey, destination, amount)
//         return reply.status(200).send(result)
//     } catch (error) {
//       fastify.log.error(error)
//       return reply.status(500).send({ error: "Withdrawal failed" })
//     }
// })

}
