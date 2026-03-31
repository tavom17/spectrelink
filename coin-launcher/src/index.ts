import Fastify from "fastify"

const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok", service: "coin-launcher" }
})

const start = async () => {
  await fastify.listen({ port: 3002, host: "0.0.0.0" })
}

start()
