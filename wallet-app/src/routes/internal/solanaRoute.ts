import { FastifyInstance } from "fastify"
import { getWalletBalance, withdrawSol } from "../../solanaActions"
import { getKeypairForWallet } from "./walletFunctions"

export async function solanaRoutes(fastify: FastifyInstance) {

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

  fastify.post("/withdraw", async (request, reply) => {
    const { wallet_id, user_id, destination, amount, wallet_type } = 
      request.body as { wallet_id: string, user_id: string, destination: string, amount: number, wallet_type: string }
    try{
        const derivedWallet = await getKeypairForWallet(wallet_id, user_id, wallet_type)
        const result = await withdrawSol(derivedWallet.secretKey, destination, amount)
        return reply.status(200).send(result)
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: "Withdrawal failed" })
    }
})
}