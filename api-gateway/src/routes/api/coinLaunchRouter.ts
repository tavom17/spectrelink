import { FastifyInstance } from "fastify";


//read as text, parse if it's JSON, otherwise wrap it so the frontend always gets JSON
async function parseResponse(response: Response){
    const text = await response.text()
    try {
        return JSON.parse(text)
    } catch {
        return { error: text }
    }
}


export async function launcherForwarder(fastify: FastifyInstance){
    fastify.post("/newLaunch", async (request, reply) => {
    const user_id = request.user.user_id
//this fetch is unique due to the multipart fastify we are forwarding 
//duplex: half required when streaming a request body through Node.js fetch
//ts ignore on body cause typescript doesnt know request.raw is valid until runtime

        const response = await fetch(`${process.env.COIN_APP_URL}/launch/newToken`, {
            method: "POST",
            headers: { 
                "x-user-id": user_id,
                "content-type": request.headers["content-type"]!
            },
            // @ts-ignore
            body: request.raw,
            duplex: "half"
        })

    const data = await response.json()
    return reply.status(response.status).send(data)
})




fastify.get("/status/:jobId", async (request, reply) => {
    const user_id = request.user.user_id
    const { jobId } = request.params as { jobId: string }

    //identity from the verified JWT — coin-launcher's ownership check depends on it
    const response = await fetch(`${process.env.COIN_APP_URL}/launch/status/${encodeURIComponent(jobId)}`, {
        headers: { "x-user-id": user_id }
    })

    const data = await parseResponse(response)
    return reply.status(response.status).send(data)
})

}
