import { Queue, Worker, Job } from 'bullmq'
import { PublicKey } from '@solana/web3.js'
import { uploadImage, uploadMetadata } from "./irys"
import { createPool } from "./meteora"
import { createTokenMint, mintSupply, attachMetadata } from "./solana"
import { autoBuy, getQuote, validateSupplyPercent } from './jupiterSwap'
import { deriveWallet, getWalletPublicKey } from './walletApp'
import { logger } from './logger'
import { connection as connectionRPC } from '../connection'
import pool from '../service_dataOperations/databaseConnectivity'
import { insertToken } from '../service_dataOperations/databaseCalls'
import { LaunchJobData } from '../interfaces'


//redis from env like every other dependency
const redisConnection = {
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT ?? 6379),
}

//producer side — launchSetup adds, launchStatus reads
export const launchQueue = new Queue('token-launch-queue', { connection: redisConnection })


//consumer — one attempt per job by design: retrying a launch would mint a SECOND token
export const launchWorker = new Worker('token-launch-queue', async (job: Job<LaunchJobData>) => {
  const log = logger.child({ jobId: job.id, userId: job.data.userId })
  log.info({ name: job.data.name, symbol: job.data.symbol }, "Launch started")

  //TEMPORARY raw key — removed in P4 when everything signs through /sign
  const fundingKeypair = await deriveWallet(job.data.userId, job.data.fundingWalletId, "funding")

  //auto-buy preflight — before anything is spent
  if (job.data.autoBuyEnabled && job.data.slaveWalletId) {
    const slavePublicKey = await getWalletPublicKey(job.data.slaveWalletId)
    const slaveBalance = await connectionRPC.getBalance(new PublicKey(slavePublicKey))
    const totalRequired = Math.floor(job.data.solPerBuy * job.data.numberOfBuys * 1_000_000_000)   //float math — P6
    if (slaveBalance < totalRequired)
      throw new Error(`Auto-buy wallet has ${slaveBalance} lamports, needs ${totalRequired}`)
  }

  await job.updateProgress({ step: 'Uploading image to Arweave...', percent: 10 })
  const imageURL = await uploadImage(Buffer.from(job.data.imageBuffer), job.data.mimeType, fundingKeypair.secretKey)

  const metaData = {
    name: job.data.name,
    symbol: job.data.symbol,
    description: job.data.description,
    image: imageURL,
    external_url: job.data.website,
    extensions: {
      twitter: job.data.twitter,
      telegram: job.data.telegram,
      website: job.data.website,
    },
  }

  await job.updateProgress({ step: 'Uploading metadata...', percent: 20 })
  const metaDataURI = await uploadMetadata(metaData, fundingKeypair.secretKey)

  await job.updateProgress({ step: 'Creating mint account...', percent: 35 })
  const { mintAddress, mintTxSig } = await createTokenMint(job.data.decimals, fundingKeypair)
  log.info({ mintAddress, mintTxSig }, "Mint created")

  //verify mint is readable before attaching metadata (RPC load-balancer lag)
  let retries = 0
  while (retries < 5) {
    const mintAccount = await connectionRPC.getAccountInfo(new PublicKey(mintAddress))
    if (mintAccount && mintAccount.data.length > 0) break
    retries++
    await new Promise(r => setTimeout(r, 2000))
  }
  if (retries === 5)
    throw new Error(`Mint ${mintAddress} not readable after creation — RPC sync issue`)

  await job.updateProgress({ step: 'Attaching metadata...', percent: 50 })
  const { metadataTxSig } = await attachMetadata(mintAddress, job.data.name, job.data.symbol, metaDataURI, job.data.lockMetaData, fundingKeypair)
  const metadataTxSigString = Buffer.from(metadataTxSig).toString('base64')   //base64 kept until P3 removes attachMetadata

  await job.updateProgress({ step: 'Minting supply...', percent: 65 })
  await mintSupply(mintAddress, BigInt(job.data.supply), job.data.decimals, job.data.revoke, fundingKeypair)

  //float math — replaced with lamport strings + basis points in P6
  const tokenBAmountLamports = BigInt(Math.floor(Number(job.data.initialLiquiditySol) * 1_000_000_000))
  const tokenAAmountBaseUnits = BigInt(Math.floor(job.data.supply * (job.data.poolPercentage / 100))) * BigInt(10 ** job.data.decimals)

  await job.updateProgress({ step: 'Creating liquidity pool...', percent: 75 })
  const { poolAddress, poolPosition, launchTxSig, positionNftMint } =
    await createPool(mintAddress, tokenAAmountBaseUnits, tokenBAmountLamports, job.data.decimals, job.data.configAddress, fundingKeypair)
  log.info({ mintAddress, poolAddress, launchTxSig }, "Pool created")

  if (job.data.autoBuyEnabled && job.data.slaveWalletId) {
    const solPerBuyLamports = BigInt(Math.floor(job.data.solPerBuy * 1_000_000_000))
    const testQuote = await getQuote(mintAddress, solPerBuyLamports)
    validateSupplyPercent(testQuote.outAmount, BigInt(job.data.supply), job.data.decimals)

    //TEMPORARY raw key — replaced by liquidity-manager /buy in P5
    const slaveKeypair = await deriveWallet(job.data.userId, job.data.slaveWalletId, "slave")

    for (let i = 0; i < job.data.numberOfBuys; i++) {
      await job.updateProgress({ step: `Auto-buy ${i + 1} of ${job.data.numberOfBuys}...`, percent: 85 + Math.floor((i / job.data.numberOfBuys) * 10) })
      await autoBuy(mintAddress, solPerBuyLamports, slaveKeypair)
    }
  }

  await job.updateProgress({ step: 'Finalizing...', percent: 95 })

  //on-chain is done at this point — a failed insert must FAIL the job, loudly, with what's needed to recover
  try {
    await insertToken(pool, {
      userId: job.data.userId,
      fundingWalletId: job.data.fundingWalletId,
      feeWalletId: job.data.feeWalletId || null,
      mintAddress,
      name: job.data.name,
      symbol: job.data.symbol,
      decimals: job.data.decimals,
      supply: String(job.data.supply),
      metadataUri: metaDataURI,
      imageUri: imageURL,
      metadataTxSig: metadataTxSigString,
      poolAddress,
      positionAddress: poolPosition,
      positionNftMint,
      launchTxSig,
      website: job.data.website,
      twitter: job.data.twitter,
      telegram: job.data.telegram,
      tokenProgram: "spl-token",                   //"token-2022" from P3
      mintAuthorityRevoked: job.data.revoke,
      freezeAuthorityRevoked: true,                //createTokenMint sets freeze authority to null
      metadataLocked: job.data.lockMetaData,
    })
  } catch (error) {
    log.error({ err: error, mintAddress, poolAddress, positionNftMint, launchTxSig }, "LAUNCHED ON-CHAIN BUT NOT RECORDED — manual recovery needed")
    throw new Error(`Token launched on-chain (mint ${mintAddress}, pool ${poolAddress}) but the record was not saved`)
  }

  log.info({ mintAddress, poolAddress }, "Launch complete")
  return { mintAddress, poolAddress }

}, { connection: redisConnection })


//BullMQ events → logs, so failed launches are never silent
launchWorker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, userId: job?.data.userId, err: error }, "Launch failed")
})