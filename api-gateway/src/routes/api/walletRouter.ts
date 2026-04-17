import { FastifyInstance } from "fastify";


export async function walletForward(fastify: FastifyInstance){
  fastify.get("/listWallets", async (request, reply) => {
    const user_id = request.user.user_id    

    const response = await fetch(`http://wallet-app:3003/internal/listWallets?user_id=${user_id}`, {
    method: "GET"
})

    const data = await response.json()
    return reply.status(response.status).send(data)
})

fastify.post("/slaveWallets", async (request, reply) => {
    const user_id = request.user.user_id
    const { amountOfSlaves } = request.body as { amountOfSlaves: number }

    const response = await fetch("http://wallet-app:3003/internal/slaveWallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, amountOfSlaves })
    })

    const data = await response.json()
    return reply.status(response.status).send(data)
})


fastify.post("/fundingWallets", async (request, reply) => {
    const user_id = request.user.user_id

    const response = await fetch("http://wallet-app:3003/internal/fundingWallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id })
    })

    const data = await response.json()
    return reply.status(response.status).send(data)
})


fastify.post("/feeWallets", async (request, reply) => {
    const user_id = request.user.user_id

    const response = await fetch("http://wallet-app:3003/internal/feeWallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id })
    })

    const data = await response.json()
    return reply.status(response.status).send(data)
})

}