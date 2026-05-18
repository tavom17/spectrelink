import { Queue,Worker,Job  } from 'bullmq'
import {uploadImage,uploadMetadata} from "./irys"
import {createCustomPool} from "./meteora"
import {createTokenMint,mintSupply,attachMetadata} from "./solana"
import pool from './db'

//connection to redis
const connection = {
  host: 'redis-dev',
  port: 6379
}



  export interface LaunchJobData {
  userId: string
  imageBuffer: number[]  // Buffer serialized as array for Redis
  mimeType: string
  name: string
  symbol: string
  description: string
  decimals: number
  supply: number
  initialLiquiditySol: number
  fundingWalletId: string
  feeWalletId: string
  website: string
  twitter: string
  telegram: string
}


//create the queue, initialized in launchSetup
export const launchQueue = new Queue('token-launch-queue',{connection})


//create the worker, initialized in index.ts on server launch
export const launchWorker = new Worker("token-launch-queue",
 
async (job: Job<LaunchJobData>) => {


//derive secret key first and foremost from wallet derive for funding wallet
const fundingKeypairResponse = await fetch(`http://wallet-app:3003/internal/derive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
        wallet_id: job.data.fundingWalletId, 
        user_id: job.data.userId, 
        wallet_type: "funding" 
    })
})

const fundingKeypair = await fundingKeypairResponse.json()



//get public key for fee wallet from wallet id

const feeWalletResponse = await fetch(`http://wallet-app:3003/internal/listPublicKey?wallet_id=${job.data.feeWalletId}`)
const feeWalletData = await feeWalletResponse.json()
const feeWalletPublicKey = feeWalletData[0].public_key



  await job.updateProgress({ step: 'Uploading image to Arweave...', percent: 10 })
  const imageBuffer = Buffer.from(job.data.imageBuffer)

//pass info to irys to save images and host on chain
  const imageURL = await uploadImage(imageBuffer,job.data.mimeType,fundingKeypair.secretKey)
  
  const metaData = {
  name: job.data.name,
  symbol: job.data.symbol,
  description: job.data.description,
  image: imageURL,
  external_url: job.data.website,
  extensions: {
    twitter: job.data.twitter,
    telegram: job.data.telegram,
    website: job.data.website
  }
}


  await job.updateProgress({ step: 'Uploading metadata...', percent: 20 })
const metaDataURI = await uploadMetadata(metaData, fundingKeypair.secretKey)
  
  await job.updateProgress({ step: 'Creating mint account...', percent: 35 })
// create mint account
const { mintAddress, mintTxSig } = await createTokenMint(job.data.decimals, fundingKeypair)
console.log("mintAddress:", mintAddress)
console.log("mintTxSig:", mintTxSig)

await job.updateProgress({ step: 'Attaching metadata...', percent: 50 })
// attach metadata
const { metadataTxSig } = await attachMetadata(mintAddress, job.data.name, job.data.symbol, metaDataURI, fundingKeypair)
const metadataTxSigString = Buffer.from(metadataTxSig).toString('base64')  


await job.updateProgress({ step: 'Minting supply...', percent: 65 })
// mint supply to funding wallet ATA
await mintSupply(mintAddress, BigInt(job.data.supply), job.data.decimals, fundingKeypair)
  

const tokenBAmountLamports = BigInt(Math.floor(Number(job.data.initialLiquiditySol) * 1_000_000_000))
const tokenAAmountBaseUnits = BigInt(job.data.supply) * BigInt(10 ** job.data.decimals)


await job.updateProgress({ step: 'Creating liquidity pool...', percent: 80 })
//finally the createpool and extract info
const poolInfo = await createCustomPool(mintAddress,tokenAAmountBaseUnits,tokenBAmountLamports,job.data.decimals,fundingKeypair)
const poolAddress = poolInfo.poolAddress
const poolPosition = poolInfo.poolPosition
const launchTxSig = poolInfo.launchTxSig

await job.updateProgress({ step: 'Finalizing...', percent: 95 })
//db insert 

try {

  //position_tx_sig is for later when the funding to fee ownership is transfered
await pool.query(
  `INSERT INTO tb_tokens (user_id, fee_wallet_id, mint_address, name, symbol, decimals, supply, metadata_uri, image_uri, metadata_tx_sig, pool_address, position_address, position_tx_sig, launch_tx_sig, website, twitter, telegram, launched_at) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())`,
  [job.data.userId, job.data.feeWalletId, mintAddress, job.data.name, job.data.symbol, job.data.decimals, job.data.supply, metaDataURI, imageURL, metadataTxSigString, poolAddress, poolPosition, null, launchTxSig, job.data.website, job.data.twitter, job.data.telegram]
)
} catch (error) {
    return { error: "Token launch failed at DB insert" }
}  
  
return { mintAddress, poolAddress } // stored as job result


}, {connection});