import Fastify from "fastify"
import { tokenListRoutes } from "./routes/tokenList"
import { exitRoutes } from "./routes/exitPosition"
import pool from "./db"

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