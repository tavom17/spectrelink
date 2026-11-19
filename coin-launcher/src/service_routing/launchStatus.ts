import { FastifyInstance } from "fastify";
import { launchQueue } from "../service_functionality/launchInitializer";


export async function getStatus(fastify: FastifyInstance){
fastify.get('/status/:jobId', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string
    const { jobId } = request.params as { jobId: string }

    if(!userId)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "Missing user identity" })

    try {
        const job = await launchQueue.getJob(jobId)

        //someone else's job looks exactly like a missing one — never confirm it exists
        if(!job || job.data.userId !== userId)
            return reply.status(404).send({ error: "Job not found" })

        const state = await job.getState()

        //same response shape as before — the frontend's polling keeps working
        return reply.status(200).send({
            progress: job.progress,
            value: job.returnvalue,
            failed: job.failedReason,
            state,
        })
    } catch (error) {
        request.log.error(error)
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Could not read job status" })
    }
})
}