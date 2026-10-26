import { FastifyInstance } from "fastify";


//wallet-app sends errors as plain text today — response.json() would throw on them
//read as text, parse if it's JSON, otherwise wrap it so the frontend always gets JSON
async function parseResponse(response: Response){
    const text = await response.text()
    try {
        return JSON.parse(text)
    } catch {
        return { error: text }
    }
}

export async function walletForward(fastify: FastifyInstance){

fastify.get("/listWallets", async (request, reply) => {
    const user_ID = request.user.user_id
    const params = new URLSearchParams({ user_ID })

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/listWallets?${params}`)

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


fastify.post("/slaveWallets", async (request, reply) => {
    const user_ID = request.user.user_id
    const { amountOfSlaves } = request.body as { amountOfSlaves: number }

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/slaveWallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, amountOfSlaves })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


fastify.post("/fundingWallets", async (request, reply) => {
    const user_ID = request.user.user_id

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/fundingWallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


//TODO: wallet-app /internal/feeWallets is an empty stub — this will hang until fee wallets are decided
fastify.post("/feeWallets", async (request, reply) => {
    const user_ID = request.user.user_id

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/feeWallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


fastify.get("/balance", async (request, reply) => {
    const { public_key } = request.query as { public_key: string }
    const params = new URLSearchParams({ public_key })

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/balance?${params}`)

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


fastify.post("/withdraw", async (request, reply) => {
    const user_ID = request.user.user_id
    //pick fields explicitly — never spread the client body (client could inject its own user_ID)
    //TODO: confirm these field names when the withdraw route is rewritten in wallet-app
    const { wallet_id, wallet_type, destination, amount } = request.body as {
        wallet_id: string, wallet_type: string, destination: string, amount: string
    }

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, wallet_id, wallet_type, destination, amount })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})

}



export async function walletBundleForward(fastify: FastifyInstance){

fastify.post("/bundleGroups", async (request, reply) => {
    const user_ID = request.user.user_id
    //pick fields explicitly — never spread the client body
    const { amountOfSlaves, label } = request.body as { amountOfSlaves: number, label: string }

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/createBundleGroups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, amountOfSlaves, label })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


fastify.get("/bundleGroups", async (request, reply) => {
    const user_ID = request.user.user_id
    const params = new URLSearchParams({ user_ID })

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/listBundleGroups?${params}`)

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


fastify.get("/bundleGroups/:groupID/wallets", async (request, reply) => {
    const user_ID = request.user.user_id
    const { groupID } = request.params as { groupID: string }
    const params = new URLSearchParams({ user_ID, group_ID: groupID })

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/getBundleGroupWallets?${params}`)

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})

}