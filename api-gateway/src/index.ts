import Fastify from "fastify"
import { loginRoute } from "./routes/auth/login"

const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok" }
})

fastify.register(loginRoute)

const start = async () => {
  await fastify.listen({ port: 3001, host: "0.0.0.0" })
}

start()