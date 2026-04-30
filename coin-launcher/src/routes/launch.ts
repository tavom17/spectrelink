import {uploadImage,uploadMetadata} from "../irys"
import {createCustomPool} from "../meteora"
import {createTokenMint,mintSupply} from "../solana"
import fastifyMultipart from "@fastify/multipart"
import { FastifyInstance } from "fastify";
import pool from "../db"






export async function launchRoutes(fastify: FastifyInstance){
    fastify.register(fastifyMultipart);
    fastify.post('/newToken', async (request,reply) =>{
        
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
      case 'decimals':  decimals = part.value as number; break
      case 'supply':  supply = part.value as number; break
      case 'initialLiquiditySol':  initialLiquiditySol = part.value as number; break
      case 'fundingWalletId' :  fundingWalletId = part.value as string; break
      case 'feeWalletId':  feeWalletId = part.value as string; break
    }
  }
}
    });
}