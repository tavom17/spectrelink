import Fastify from "fastify"
import { tokenListRoutes } from "./service_routing/tokenList"
import { exitRoutes } from "./service_routing/exitPosition"
import pool from "./service_dataOperations/databaseConnectivity"

const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok", service: "liquidity-manager" }
})

fastify.register(tokenListRoutes, { prefix: "/liquidity" })
fastify.register(exitRoutes, { prefix: "/liquidity" })

const start = async () => {
  try {
    await pool.query("SELECT 1")
    fastify.log.info("Postgres connected")
    await fastify.listen({ port: 3004, host: "0.0.0.0" })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()