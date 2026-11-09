import { FastifyInstance } from "fastify"
import { isAddress } from "@solana/kit"
import { getWalletBalance, getWalletGroupBalance, withdrawSol } from "../service_functionality/solanaActions"
//import { validateForKeyPair } from "../service_dataOperations/databaseCalls"
//import pool from "../service_dataOperations/databaseConnectivity"

//getMultipleAccounts accepts up to 100 addresses per call
const MAX_GROUP_BALANCE_KEYS = 100

export async function solanaRoutes(fastify: FastifyInstance) {

  //single wallet balance — frontend wallet manager
  fastify.get("/balance", async (request, reply) => {
    const { public_key } = request.query as { public_key: string }

    //invalid base58 would make address() throw → 500; it's the caller's mistake → 400
    if(!public_key || !isAddress(public_key))
      return reply.status(400).send({ error: "INVALID_PUBLIC_KEY", message: "A valid public_key is required" })

    try {
      const result = await getWalletBalance(public_key)
      return reply.status(200).send(result)
    } catch (error) {
      request.log.error(error)
      return reply.status(500).send({ error: "BALANCE_FETCH_FAILED", message: "Failed to fetch balance" })
    }
  })


  //many wallets in ONE rpc call — POST so the key list travels as JSON, not a giant URL
  //POST /groupBalance  { "publicKeys": ["key1", "key2", ...] }
  fastify.post("/groupBalance", async (request, reply) => {
    const { publicKeys } = request.body as { publicKeys: string[] }

    if(!Array.isArray(publicKeys))
      return reply.status(400).send({ error: "BAD_REQUEST", message: "publicKeys must be an array" })

    //trim, drop empties and duplicates
    const keys = [...new Set(publicKeys.map(key => String(key).trim()).filter(key => key.length > 0))]

    if(keys.length === 0 || keys.length > MAX_GROUP_BALANCE_KEYS)
      return reply.status(400).send({ error: "BAD_REQUEST", message: `Between 1 and ${MAX_GROUP_BALANCE_KEYS} public keys required` })

    const invalidKeys = keys.filter(key => !isAddress(key))
    if(invalidKeys.length > 0)
      return reply.status(400).send({ error: "INVALID_PUBLIC_KEY", message: `Invalid public keys: ${invalidKeys.join(", ")}` })

    try {
      const result = await getWalletGroupBalance(keys)
      return reply.status(200).send(result)
    } catch (error) {
      request.log.error(error)
      return reply.status(500).send({ error: "BALANCE_FETCH_FAILED", message: "Failed to fetch group balances" })
    }
  })


  //NEED TO FIX, REWROTE GETKEYPAIR TO VALIDATEFORKEYPAIR — rework later (parked)
  // fastify.post("/withdraw", ...)

}