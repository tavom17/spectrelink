import { Queue, Worker, Job } from 'bullmq'
import { PublicKey } from '@solana/web3.js'
import { createPool } from "./meteora"
import { createToken2022 } from "./solana"
import { autoBuy, getQuote, validateSupplyPercent } from './jupiterSwap'
import { deriveWallet, getWalletPublicKey, uploadTokenAssets } from './walletApp'
import { logger } from './logger'
import { connection as connectionRPC } from '../connection'
import pool from '../service_dataOperations/databaseConnectivity'
import { insertToken } from '../service_dataOperations/databaseCalls'
import { LaunchJobData } from '../interfaces'


if(!process.env.REDIS_HOST)
  throw new Error("REDIS_HOST is not set — coin-launcher cannot reach the launch queue")

//redis from env like every other dependency
const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT ?? 6379),
}

//producer side — launchSetup adds, launchStatus reads
export const launchQueue = new Queue('token-launch-queue', { connection: redisConnection })


//consumer — one attempt per job by design: retrying a launch would mint a SECOND token
export const launchWorker = new Worker('token-launch-queue', async (job: Job<LaunchJobData>) => {
  const log = logger.child({ jobId: job.id, userId: job.data.userId })
  log.info({ name: job.data.name, symbol: job.data.symbol }, "Launch started")

  //public key only — every funding signature now comes from wallet-app's /sign
  const fundingPublicKey = await getWalletPublicKey(job.data.fundingWalletId)

  //auto-buy preflight — before anything is spent
  if (job.data.autoBuyEnabled && job.data.slaveWalletId) {
    const slavePublicKey = await getWalletPublicKey(job.data.slaveWalletId)
    const slaveBalance = await connectionRPC.getBalance(new PublicKey(slavePublicKey))
    const totalRequired = Math.floor(job.data.solPerBuy * job.data.numberOfBuys * 1_000_000_000)   //float math — P6
    if (slaveBalance < totalRequired)
      throw new Error(`Auto-buy wallet has ${slaveBalance} lamports, needs ${totalRequired}`)
  }

  //image + metadata → Arweave inside wallet-app (also verifies the funding wallet is this user's)
  await job.updateProgress({ step: 'Uploading image and metadata to Arweave...', percent: 15 })
  const { imageUri: imageURL, metadataUri: metaDataURI } = await uploadTokenAssets(
    job.data.userId,
    job.data.fundingWalletId,
    job.data.imageBase64,
    job.data.mimeType,
    {
      name: job.data.name,
      symbol: job.data.symbol,
      description: job.data.description,
      website: job.data.website,
      twitter: job.data.twitter,
      telegram: job.data.telegram,
    }
  )
  log.info({ imageURL, metaDataURI }, "Assets uploaded")

  //ONE atomic tx: mint + on-mint metadata + full supply + authority revokes
  await job.updateProgress({ step: 'Creating token (mint, metadata, supply)...', percent: 40 })
  const { mintAddress, txSig: mintTxSig } = await createToken2022({
    userId: job.data.userId,
    fundingPublicKey,
    decimals: job.data.decimals,
    supply: BigInt(job.data.supply),
    name: job.data.name,
    symbol: job.data.symbol,
    uri: metaDataURI,
    revokeMint: job.data.revoke,
    revokeFreeze: job.data.revokeFreeze,
    lockMetadata: job.data.lockMetaData,
  })
  log.info({ mintAddress, mintTxSig }, "Token created")

  //RPC load-balancer lag — the pool tx simulates against the mint, make sure it's visible first
  let retries = 0
  while (retries < 5) {
    const mintAccount = await connectionRPC.getAccountInfo(new PublicKey(mintAddress), 'confirmed')
    if (mintAccount && mintAccount.data.length > 0) break
    retries++
    await new Promise(r => setTimeout(r, 2000))
  }
  if (retries === 5)
    throw new Error(`Mint ${mintAddress} not readable after creation — RPC sync issue`)

  //float math — replaced with lamport strings + basis points in P6
  const tokenBAmountLamports = BigInt(Math.floor(Number(job.data.initialLiquiditySol) * 1_000_000_000))
  const tokenAAmountBaseUnits = BigInt(Math.floor(job.data.supply * (job.data.poolPercentage / 100))) * BigInt(10 ** job.data.decimals)

  await job.updateProgress({ step: 'Creating liquidity pool...', percent: 70 })
  const { poolAddress, poolPosition, launchTxSig, positionNftMint } = await createPool({
    userId: job.data.userId,
    fundingPublicKey,
    mintAddress,
    tokenAAmount: tokenAAmountBaseUnits,
    tokenBAmount: tokenBAmountLamports,
    configAddress: job.data.configAddress,
  })
  log.info({ mintAddress, poolAddress, launchTxSig }, "Pool created")

  if (job.data.autoBuyEnabled && job.data.slaveWalletId) {
    const solPerBuyLamports = BigInt(Math.floor(job.data.solPerBuy * 1_000_000_000))
    const testQuote = await getQuote(mintAddress, solPerBuyLamports)
    validateSupplyPercent(testQuote.outAmount, BigInt(job.data.supply), job.data.decimals)

    //TEMPORARY raw key — the LAST one; replaced by liquidity-manager /buy in P5
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
      metadataTxSig: mintTxSig,                    //metadata lives in the mint tx now — base58, explorer-clickable
      poolAddress,
      positionAddress: poolPosition,
      positionNftMint,
      launchTxSig,
      website: job.data.website,
      twitter: job.data.twitter,
      telegram: job.data.telegram,
      tokenProgram: "token-2022",
      mintAuthorityRevoked: job.data.revoke,
      freezeAuthorityRevoked: job.data.revokeFreeze,
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