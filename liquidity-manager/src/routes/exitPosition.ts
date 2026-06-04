import { FastifyInstance } from "fastify"
import { exitPosition } from "../meteora"

export async function exitRoutes(fastify: FastifyInstance) {
  fastify.post('/exit', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string
    const { poolAddress, positionAddress, positionNftMint, fundingWalletId } =
      request.body as { poolAddress: string, positionAddress: string, positionNftMint: string, fundingWalletId: string }

    const fundingKeypairResponse = await fetch('http://wallet-app:3003/internal/derive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_id: fundingWalletId, user_id: userId, wallet_type: 'funding' })
    })
    const fundingKeypair = await fundingKeypairResponse.json()

    try {
      const result = await exitPosition(poolAddress, positionAddress, positionNftMint, fundingKeypair)
      return reply.status(200).send(result)
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to exit position' })
    }
  })
}