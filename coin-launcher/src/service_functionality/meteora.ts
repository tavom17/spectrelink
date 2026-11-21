import { Keypair, PublicKey } from "@solana/web3.js"
import BN from "bn.js"
import { CpAmm, MAX_SQRT_PRICE, MIN_SQRT_PRICE, derivePoolAddress, derivePositionAddress } from "@meteora-ag/cp-amm-sdk"
import { connection } from "../connection"
import { signWithWalletApp } from "./walletApp"
import { compileWithComputeBudget, measureComputeUnits, sendAndConfirmSigned } from "./transactions"
import { LAUNCH_PRIORITY_MICROLAMPORTS, SIMULATION_CU_LIMIT, CU_SAFETY_MULTIPLIER } from "../config"
import { poolLaunchParams } from "../interfaces"

const cpAmm = new CpAmm(connection)
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")   //our mint
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")        //WSOL stays legacy
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112")


//pool tx: position-NFT keypair is ephemeral and signs here; wallet-app signs as funding
export async function createPool(params: poolLaunchParams): Promise<{ poolAddress: string; launchTxSig: string; poolPosition: string; positionNftMint: string }> {

  const funding = new PublicKey(params.fundingPublicKey)
  const mint = new PublicKey(params.mintAddress)
  const config = new PublicKey(params.configAddress)
  const positionNftKeypair = Keypair.generate()

  const tokenAAmount = new BN(params.tokenAAmount.toString())
  const tokenBAmount = new BN(params.tokenBAmount.toString())

  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount,
    tokenBAmount,
    minSqrtPrice: MIN_SQRT_PRICE,
    maxSqrtPrice: MAX_SQRT_PRICE,
    collectFeeMode: 1,
  })

  const poolAddress = derivePoolAddress(config, mint, WSOL_MINT)
  const positionAddress = derivePositionAddress(positionNftKeypair.publicKey)

  const poolTx = await cpAmm.createPool({
    payer: funding,
    creator: funding,
    config,
    positionNft: positionNftKeypair.publicKey,
    tokenAMint: mint,
    tokenBMint: WSOL_MINT,
    tokenAAmount,
    tokenBAmount,
    initSqrtPrice,
    liquidityDelta,
    activationPoint: null,
    tokenAProgram: TOKEN_2022_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
  })

  const latest = await connection.getLatestBlockhash("confirmed")

  //measure, then pay priority only on what's used (+20%)
  const unitsConsumed = await measureComputeUnits(funding, poolTx.instructions, latest.blockhash, SIMULATION_CU_LIMIT, LAUNCH_PRIORITY_MICROLAMPORTS)
  const unitLimit = Math.ceil(unitsConsumed * CU_SAFETY_MULTIPLIER)

  const tx = compileWithComputeBudget(funding, poolTx.instructions, latest.blockhash, unitLimit, LAUNCH_PRIORITY_MICROLAMPORTS)
  if(tx.serialize().length > 1232)
    throw new Error("Pool transaction exceeds 1232 bytes")

  //position NFT signs its slot; /sign's ALREADY_SIGNED only checks the funding slot it's asked for
  tx.sign([positionNftKeypair])

  const signed = await signWithWalletApp(params.userId, [params.fundingPublicKey], Buffer.from(tx.serialize()).toString("base64"))
  const launchTxSig = await sendAndConfirmSigned(signed, latest)

  return {
    poolAddress: poolAddress.toBase58(),
    launchTxSig,
    poolPosition: positionAddress.toBase58(),
    positionNftMint: positionNftKeypair.publicKey.toBase58(),
  }
}