import { FastifyInstance } from "fastify";


export async function launcherForwarder(fastify: FastifyInstance){
    fastify.post("/newLaunch", async (request, reply) => {
    const user_id = request.user.user_id
//this fetch is unique due to the multipart fastify we are forwarding 
//duplex: half required when streaming a request body through Node.js fetch
//ts ignore on body cause typescript doesnt know request.raw is valid until runtime

        const response = await fetch("http://coin-launcher:3002/launch/newToken", {
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
    const { jobId } = request.params as { jobId: string }
    
    const response = await fetch(`http://coin-launcher:3002/launch/status/${jobId}`)
    const data = await response.json()
    return reply.status(response.status).send(data)
})
}
