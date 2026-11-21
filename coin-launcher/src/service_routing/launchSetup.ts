import { FastifyInstance } from "fastify";
import { launchQueue } from "../service_functionality/launchInitializer";
import { validateLaunchInput } from "../service_functionality/launchValidation";
import { LaunchJobData } from "../interfaces";


export async function launchRoutes(fastify: FastifyInstance){
fastify.post('/newToken', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string

    //set by api-gateway from the JWT — missing means it didn't come through the gateway
    if(!userId)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "Missing user identity" })

    //variable decs
    let imageBuffer: Buffer | null = null
    let revoke: boolean = true
    let revokeFreeze: boolean = true
    let lockMetaData: boolean = true
    let mimeType: string = ''
    let name: string = ''
    let symbol: string = ''
    let poolPercentage: number = 100
    let description: string = ''
    let decimals: number = 0
    let supply: number = 0
    let configAddress: string = ''
    let initialLiquiditySol: number = 0
    let fundingWalletId: string = ''
    let feeWalletId: string = ''
    let website: string = ''
    let twitter: string = ''
    let telegram: string = ''
    let autoBuyEnabled: boolean = false
    let slaveWalletId: string | null = null
    let numberOfBuys: number = 0
    let solPerBuy: number = 0

    //fastify multipart streams the data — loop and route each part to file or field
    //a malformed body or oversized file throws mid-stream: that's the client's problem → 400
    try {
        for await (const part of request.parts()) {
            if (part.type === 'file') {
                imageBuffer = await part.toBuffer()
                mimeType = part.mimetype
            } else if (part.type === 'field') {
                switch (part.fieldname) {
                    case 'name': name = part.value as string; break
                    case 'symbol': symbol = part.value as string; break
                    case 'description': description = part.value as string; break
                    case 'decimals': decimals = Number(part.value); break
                    case 'revoke': revoke = part.value === 'true'; break
                    case 'revokeFreeze': revokeFreeze = part.value === 'true'; break
                    case 'lockMetaData': lockMetaData = part.value === 'true'; break
                    case 'supply': supply = Number(part.value); break
                    case 'configAddress': configAddress = part.value as string; break
                    case 'poolPercentage': poolPercentage = Number(part.value); break
                    case 'initialLiquiditySol': initialLiquiditySol = Number(part.value); break
                    case 'fundingWalletId': fundingWalletId = part.value as string; break
                    case 'feeWalletId': feeWalletId = part.value as string; break
                    case 'website': website = part.value as string; break
                    case 'twitter': twitter = part.value as string; break
                    case 'telegram': telegram = part.value as string; break
                    case 'autoBuyEnabled': autoBuyEnabled = part.value === 'true'; break
                    case 'slaveWalletId': slaveWalletId = part.value as string; break
                    case 'numberOfBuys': numberOfBuys = Number(part.value); break
                    case 'solPerBuy': solPerBuy = Number(part.value); break
                }
            }
        }
    } catch (error) {
        request.log.warn({ err: error }, "Unreadable launch form")
        return reply.status(400).send({ error: "BAD_REQUEST", message: "Could not read the launch form (check the image size)" })
    }

    const fields: Omit<LaunchJobData, "imageBase64"> = {
        userId, revoke,revokeFreeze, lockMetaData, mimeType,
        name: name.trim(), symbol: symbol.trim(), description,
        poolPercentage, decimals, supply, configAddress, initialLiquiditySol,
        fundingWalletId, feeWalletId, website, twitter, telegram,
        autoBuyEnabled, slaveWalletId, numberOfBuys, solPerBuy,
    }

    //every problem at once, before anything is queued or spent
    const errors = validateLaunchInput(fields, imageBuffer?.length ?? 0)
    if(errors.length > 0)
        return reply.status(400).send({ error: "VALIDATION_FAILED", message: errors.join("; "), errors })

    try {
        //base64 in Redis — ~3x smaller than number[], and exactly what wallet-app's upload takes
        const jobData: LaunchJobData = { ...fields, imageBase64: imageBuffer!.toString('base64') }
        const job = await launchQueue.add("token-launch-queue", jobData)
        return reply.status(202).send({ jobId: job.id })
    } catch (error) {
        request.log.error(error)
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Could not queue the launch" })
    }
})
}