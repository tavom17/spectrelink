import { FastifyInstance } from "fastify";
import { launchQueue } from "../launchInitializer";



export async function getStatus(fastify: FastifyInstance){

 fastify.get("/status/:jobId", async (request, reply) => {
      const { jobId } = request.params as { jobId: string }  
      try {
      const job = await launchQueue.getJob(jobId)   
      const jobState = await job?.getState()   

    if (!job) 
        return reply.status(404).send({ error: "Job not found" })
        
            const data = { 
                progress: job?.progress,
                value : job?.returnvalue,
                failed : job?.failedReason,
                state : jobState
            }

            return reply.status(200).send(data)
           
        } catch (error) {
            return reply.status(500).send(error)
        }
      })
      return 
}