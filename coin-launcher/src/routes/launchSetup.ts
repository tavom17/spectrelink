
import { FastifyInstance } from "fastify";
import { LaunchJobData, launchQueue } from "../launchInitializer";






export async function launchRoutes(fastify: FastifyInstance){
    fastify.post('/newToken', async (request,reply) =>{
    const userId = request.headers['x-user-id'] as string
//variable decs 
let imageBuffer: Buffer | null = null
let mimeType: string = ''
let name: string = ''
let symbol: string = ''
let description: string = ''
let decimals: number = 0
let supply: number = 0
let initialLiquiditySol: number = 0
let fundingWalletId: string = ''
let feeWalletId: string = '' 
let website: string = ''
let twitter: string = ''
let telegram: string = ''  


//extract multipart form from request
const formData = request.parts();

//fastify multipart streams the data, convoluted ass way, but must now loop over
//and dictate what is file or field data
for await (const part of formData) {
  if (part.type === 'file') {

     imageBuffer = await part.toBuffer()
     mimeType = part.mimetype
  } else if (part.type === 'field') {
    switch (part.fieldname) {
      case 'name':  name = part.value as string; break
      case 'symbol':  symbol = part.value as string; break
      case 'description':  description = part.value as string; break
      case 'decimals': decimals = Number(part.value); break
      case 'supply': supply = Number(part.value); break
      case 'initialLiquiditySol': initialLiquiditySol = Number(part.value); break
      case 'fundingWalletId' :  fundingWalletId = part.value as string; break
      case 'feeWalletId':  feeWalletId = part.value as string; break
      case 'website':  website = part.value as string; break
      case 'twitter':  twitter = part.value as string; break
      case 'telegram':  telegram = part.value as string; break



    }
  }
}

  if (!imageBuffer) {
  return reply.status(400).send({ error: "Image is required" })
}

const jobData: LaunchJobData = {
  userId: userId,
  imageBuffer: Array.from(imageBuffer), 
  mimeType: mimeType,
  name: name,
  symbol: symbol,
  description: description,
  decimals: decimals,
  supply: supply,
  initialLiquiditySol: initialLiquiditySol,
  fundingWalletId: fundingWalletId,
  feeWalletId: feeWalletId,
  website: website,
  twitter: twitter,
  telegram: telegram
}

const job = await launchQueue.add("token-launch-queue", jobData)
return reply.status(202).send({ jobId: job.id })
})}