import Fastify from "fastify"
import { launchRoutes } from "./routes/launch"
import pool from "./db"
import fastifyMultipart from "@fastify/multipart"


const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok", service: "coin-launcher" }
})

fastify.register(fastifyMultipart)
fastify.register(launchRoutes,{prefix: "/launch"})

const start = async () => {
  try {
    await pool.query("SELECT 1")
    fastify.log.info("Postgres connected")

    await fastify.listen({ port: 3002, host: "0.0.0.0" })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
