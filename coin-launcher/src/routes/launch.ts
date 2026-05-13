import {uploadImage,uploadMetadata} from "../irys"
import {createCustomPool} from "../meteora"
import {createTokenMint,mintSupply,attachMetadata} from "../solana"
import { FastifyInstance } from "fastify";
import pool from "../db"






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
    }
  }
}

//derive secret key first and foremost from wallet derive for funding wallet
const fundingKeypairResponse = await fetch(`http://wallet-app:3003/internal/derive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
        wallet_id: fundingWalletId, 
        user_id: userId, 
        wallet_type: "funding" 
    })
})

const fundingKeypair = await fundingKeypairResponse.json()


//get public key for fee wallet from wallet id

const feeWalletResponse = await fetch(`http://wallet-app:3003/internal/listPublicKey?wallet_id=${feeWalletId}`)
const feeWalletData = await feeWalletResponse.json()
const feeWalletPublicKey = feeWalletData[0].public_key




//pass info to irys to save images and host on chain
const imageURL = await uploadImage(imageBuffer!, mimeType, fundingKeypair.secretKey)
const metaData = {
  name: name,
  symbol: symbol,
  description: description,
  image: imageURL,
  external_url: website,
  extensions: {
    twitter,
    telegram,
    website
  }
}

const metaDataURI = await uploadMetadata(metaData, fundingKeypair.secretKey)

//pass info to solana token program to create mint address

// create mint account
const { mintAddress, mintTxSig } = await createTokenMint(decimals, fundingKeypair)

console.log("mintAddress:", mintAddress)
console.log("mintTxSig:", mintTxSig)
// attach metadata
const { metadataTxSig } = await attachMetadata(mintAddress, name, symbol, metaDataURI, fundingKeypair)
const metadataTxSigString = Buffer.from(metadataTxSig).toString('base64')


// mint supply to funding wallet ATA
await mintSupply(mintAddress, BigInt(supply), decimals, fundingKeypair)

console.log("supply minted successfully")

const tokenBAmountLamports = BigInt(Math.floor(Number(initialLiquiditySol) * 1_000_000_000))
const tokenAAmountBaseUnits = BigInt(supply) * BigInt(10 ** decimals)

//finally the createpool and extract info
const poolInfo = await createCustomPool(mintAddress,tokenAAmountBaseUnits,tokenBAmountLamports,decimals,fundingKeypair)
const poolAddress = poolInfo.poolAddress
const poolPosition = poolInfo.poolPosition
const launchTxSig = poolInfo.launchTxSig
//db insert 

try {

  //position_tx_sig is for later when the funding to fee ownership is transfered
await pool.query(
  `INSERT INTO tb_tokens (user_id, fee_wallet_id, mint_address, name, symbol, decimals, supply, metadata_uri, image_uri, metadata_tx_sig, pool_address, position_address, position_tx_sig, launch_tx_sig, website, twitter, telegram, launched_at) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())`,
  [userId, feeWalletId, mintAddress, name, symbol, decimals, supply, metaDataURI, imageURL, metadataTxSigString, poolAddress, poolPosition, null, launchTxSig, website, twitter, telegram]
)
  return reply.status(201).send({ mintAddress, poolAddress, metaDataURI, launchTxSig })
} catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: "Token launch failed at DB insert" })
}

})


}