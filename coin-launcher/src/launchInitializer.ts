import { Queue,Worker,Job  } from 'bullmq'
import {uploadImage,uploadMetadata} from "./irys"
import {createPool} from "./meteora"
import {createTokenMint,mintSupply,attachMetadata} from "./solana"
import pool from './db'
import { autoBuy, getQuote, validateSupplyPercent } from './jupiterSwap'
import { connection as connectionRPC } from './connection'
import { PublicKey } from '@solana/web3.js'

//connection to redis
const connection = {
  host: 'redis-dev',
  port: 6379
}



  export interface LaunchJobData {
  userId: string
  imageBuffer: number[]  // Buffer serialized as array for Redis
  revoke: boolean //true or false for revoking mint authority, default = true
  lockMetaData: boolean
  mimeType: string
  poolPercentage: number
  name: string
  symbol: string
  description: string
  decimals: number
  supply: number
  configAddress: string
  initialLiquiditySol: number
  fundingWalletId: string
  feeWalletId: string
  website: string
  twitter: string
  telegram: string
  autoBuyEnabled: boolean
  slaveWalletId: string | null
  numberOfBuys: number
  solPerBuy: number
}


//create the queue, initialized in launchSetup
export const launchQueue = new Queue('token-launch-queue',{connection})


//create the worker, initialized in index.ts on server launch
export const launchWorker = new Worker("token-launch-queue",
 
async (job: Job<LaunchJobData>) => {


//derive secret key first and foremost from wallet derive for funding wallet
const fundingKeypairResponse = await fetch(`${process.env.WALLET_APP_URL}/internal/derive`, {
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

const feeWalletResponse = await fetch(`${process.env.WALLET_APP_URL}/internal/listPublicKey?wallet_id=${job.data.feeWalletId}`)
const feeWalletData = await feeWalletResponse.json()
//const feeWalletPublicKey = feeWalletData[0].public_key


//preflight checks for autobuy

if (job.data.autoBuyEnabled && job.data.slaveWalletId) {
  // Balance check, first get public key for slaveWalletId
  const slaveWalletResponse = await fetch(`${process.env.WALLET_APP_URL}/internal/listPublicKey?wallet_id=${job.data.slaveWalletId}`)
  const slaveWalletData = await slaveWalletResponse.json()
  const slavePublicKey = slaveWalletData[0].public_key

  const slaveBalance = await connectionRPC.getBalance(new PublicKey(slavePublicKey))
  const totalRequired = Math.floor(job.data.solPerBuy * job.data.numberOfBuys * 1_000_000_000)
  if (slaveBalance < totalRequired) {
    throw new Error(`Slave wallet insufficient balance. Has ${slaveBalance} lamports, needs ${totalRequired}`)
  }
}


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


// verify mint is readable before attaching metadata
let retries = 0
while (retries < 5) {
  const mintAccount = await connectionRPC.getAccountInfo(new PublicKey(mintAddress))
  if (mintAccount && mintAccount.data.length > 0) break
  retries++
  await new Promise(r => setTimeout(r, 2000))
}
if (retries === 5) throw new Error('Mint account not readable after creation — RPC sync issue')

console.log(`Mint account verified readable after ${retries} retries`)

await job.updateProgress({ step: 'Attaching metadata...', percent: 50 })
// attach metadata
const { metadataTxSig } = await attachMetadata(mintAddress, job.data.name, job.data.symbol, metaDataURI,job.data.lockMetaData, fundingKeypair)
const metadataTxSigString = Buffer.from(metadataTxSig).toString('base64')  


await job.updateProgress({ step: 'Minting supply...', percent: 65 })
// mint supply to funding wallet ATA
await mintSupply(mintAddress, BigInt(job.data.supply), job.data.decimals,job.data.revoke, fundingKeypair)
  

const tokenBAmountLamports = BigInt(Math.floor(Number(job.data.initialLiquiditySol) * 1_000_000_000))
const tokenAAmountBaseUnits = BigInt(Math.floor(job.data.supply * (job.data.poolPercentage / 100))) * BigInt(10 ** job.data.decimals)

await job.updateProgress({ step: 'Creating liquidity pool...', percent: 75 })
const poolInfo = await createPool(mintAddress, tokenAAmountBaseUnits, tokenBAmountLamports, job.data.decimals, job.data.configAddress, fundingKeypair)
const poolAddress = poolInfo.poolAddress
const poolPosition = poolInfo.poolPosition
const launchTxSig = poolInfo.launchTxSig
const positionNftMint = poolInfo.positionNftMint

if (job.data.autoBuyEnabled && job.data.slaveWalletId) {
  const solPerBuyLamports = BigInt(Math.floor(job.data.solPerBuy * 1_000_000_000))
  const testQuote = await getQuote(mintAddress, solPerBuyLamports)
  validateSupplyPercent(testQuote.outAmount, BigInt(job.data.supply), job.data.decimals)

  const slaveKeypairResponse = await fetch(`${process.env.WALLET_APP_URL}/internal/derive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_id: job.data.slaveWalletId,
      user_id: job.data.userId,
      wallet_type: 'slave'
    })
  })
  const slaveKeypair = await slaveKeypairResponse.json()

  for (let i = 0; i < job.data.numberOfBuys; i++) {
    await job.updateProgress({ step: `Auto-buy ${i + 1} of ${job.data.numberOfBuys}...`, percent: 85 + Math.floor((i / job.data.numberOfBuys) * 10) })
    await autoBuy(mintAddress, solPerBuyLamports, slaveKeypair)
  }
}

await job.updateProgress({ step: 'Finalizing...', percent: 95 })


//db insert 

try {

  //position_tx_sig is for later when the funding to fee ownership is transfered
await pool.query(
  `INSERT INTO tb_tokens (user_id, fee_wallet_id, funding_wallet_id, mint_address, name, symbol, decimals, supply, metadata_uri, image_uri, metadata_tx_sig, pool_address, position_address, position_nft_mint, position_tx_sig, launch_tx_sig, website, twitter, telegram, launched_at) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())`,
  [job.data.userId, job.data.feeWalletId, job.data.fundingWalletId, mintAddress, job.data.name, job.data.symbol, job.data.decimals, job.data.supply, metaDataURI, imageURL, metadataTxSigString, poolAddress, poolPosition, positionNftMint, null, launchTxSig, job.data.website, job.data.twitter, job.data.telegram]
)
} catch (error) {
    return { error: "Token launch failed at DB insert" }
}  
  
return { mintAddress, poolAddress } // stored as job result


}, {connection});