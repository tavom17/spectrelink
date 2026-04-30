import Fastify from "fastify"
import { launchRoutes } from "./routes/launch"

const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok", service: "coin-launcher" }
})


fastify.register(launchRoutes,{prefix: "/launch"})

const start = async () => {
  await fastify.listen({ port: 3002, host: "0.0.0.0" })
}

start()
