import Fastify from "fastify"
import pool from "./db"
import redis from "./redis"
import { register } from "./routes/internal/walletRoute"

const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok", service: "wallet-app" }
})

fastify.register(register,{prefix: "/internal"})

const start = async () => {
  try {
    await pool.query("SELECT 1")
    fastify.log.info("Postgres connected")

    await redis.ping()
    fastify.log.info("Redis connected")

    await fastify.listen({ port: 3003, host: "0.0.0.0" })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()