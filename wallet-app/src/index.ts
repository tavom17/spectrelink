import Fastify from "fastify"

const fastify = Fastify({ logger: true })

fastify.get("/health", async () => {
  return { status: "ok", service: "wallet-app" }
})

const start = async () => {
  await fastify.listen({ port: 3003, host: "0.0.0.0" })
}

start()
