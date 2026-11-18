import { FastifyInstance } from "fastify"



//read as text, parse if it's JSON, otherwise wrap it so the frontend always gets JSON
async function parseResponse(response: Response){
    const text = await response.text()
    try {
        return JSON.parse(text)
    } catch {
        return { error: text }
    }
}


export async function liquidityForwarder(fastify: FastifyInstance) {
  fastify.get("/tokens", async (request, reply) => {
    const user_id = request.user.user_id
    const response = await fetch(`${process.env.LIQUIDITY_APP_URL}/liquidity/tokens`, {
      headers: { "x-user-id": user_id }
    })
    const data = await response.json()
    return reply.status(response.status).send(data)
  })

  fastify.post("/exit", async (request, reply) => {
    const user_id = request.user.user_id
    const response = await fetch(`${process.env.LIQUIDITY_APP_URL}/liquidity/exit`, {
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


  //POST /api/liquidity/bundleGroups/:groupID/distribute
//body: { fundingPublicKey, grandTotal (lamports as string), splitMode: "even" | "random" }
fastify.post("/bundleGroups/:groupID/distribute", async (request, reply) => {
    const user_ID = request.user.user_id
    const { groupID } = request.params as { groupID: string }

    //pick fields explicitly — never spread the client body
    const { fundingPublicKey, grandTotal, splitMode } = request.body as {
        fundingPublicKey: string, grandTotal: string, splitMode: string
    }

    const response = await fetch(`${process.env.LIQUIDITY_APP_URL}/liquidity/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, group_ID: groupID, fundingPublicKey, grandTotal, splitMode })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


//POST /api/liquidity/buy
fastify.post("/buy", async (request, reply) => {
    const user_ID = request.user.user_id
    //explicit fields — never spread the client body
    const { poolAddress, walletPublicKeys, executionMode, amountMode, amounts, percentBps } = request.body as {
        poolAddress: string, walletPublicKeys: string[], executionMode: string,
        amountMode: string, amounts?: Record<string, string>, percentBps?: number
    }

    const response = await fetch(`${process.env.LIQUIDITY_APP_URL}/liquidity/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, poolAddress, walletPublicKeys, executionMode, amountMode, amounts, percentBps })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})


//POST /api/liquidity/withdraw
fastify.post("/withdraw", async (request, reply) => {
    const user_ID = request.user.user_id
    const { walletPublicKeys, destination, mode, amounts } = request.body as {
        walletPublicKeys: string[], destination: string, mode: string, amounts?: Record<string, string>
    }

    const response = await fetch(`${process.env.LIQUIDITY_APP_URL}/liquidity/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, walletPublicKeys, destination, mode, amounts })
    })

    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})

fastify.get("/reserve", async (request, reply) => {
    const response = await fetch(`${process.env.LIQUIDITY_APP_URL}/liquidity/reserve`)
    const data = await parseResponse(response);
    return reply.status(response.status).send(data)
})
}