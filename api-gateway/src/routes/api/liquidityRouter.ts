import { FastifyInstance } from "fastify"

export async function liquidityForwarder(fastify: FastifyInstance) {
  fastify.get("/tokens", async (request, reply) => {
    const user_id = request.user.user_id
    const response = await fetch("http://liquidity-manager:3004/liquidity/tokens", {
      headers: { "x-user-id": user_id }
    })
    const data = await response.json()
    return reply.status(response.status).send(data)
  })

  fastify.post("/exit", async (request, reply) => {
    const user_id = request.user.user_id
    const response = await fetch("http://liquidity-manager:3004/liquidity/exit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user_id
      },
      body: JSON.stringify(request.body)
    })
    const data = await response.json()
    return reply.status(response.status).send(data)
  })
}