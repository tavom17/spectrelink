import { FastifyInstance } from "fastify"
import pool from "../db"
import { request } from "node:http"

export async function tokenListRoutes(fastify: FastifyInstance) {
  fastify.get('/tokens', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string

    try {
      const result = await pool.query(
        `SELECT token_id, mint_address, name, symbol, decimals, supply, pool_address, 
         position_address, position_nft_mint, funding_wallet_id, fee_wallet_id, metadata_uri, image_uri, website, 
         twitter, telegram, launch_tx_sig, launched_at 
         FROM tb_tokens WHERE user_id = $1 ORDER BY launched_at DESC`,
        [userId]
      )
      return reply.status(200).send(result.rows)
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: "Failed to fetch tokens" })
    }
  })

  fastify.get('/sortTokenDash', async (request, reply) =>{
    const { user_id } = request.query as { user_id: string }        
    
  })
}