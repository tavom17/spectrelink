import { Keypair, PublicKey } from "@solana/web3.js"
import BN from "bn.js"
import { CpAmm, MAX_SQRT_PRICE, MIN_SQRT_PRICE, derivePoolAddress,derivePositionAddress } from "@meteora-ag/cp-amm-sdk"
import { connection } from './connection'

const cpAmm = new CpAmm(connection)
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")



export async function createPool(
  mintAddress: string,
  tokenAAmount: bigint,
  tokenBAmount: bigint,
  decimals: number,
  configAddress: string,
  fundingKeypair: { publicKey: string, secretKey: number[] }
): Promise<{ poolAddress: string, launchTxSig: string, poolPosition: string, positionNftMint: string }> {

  
  const fundingWallet = Keypair.fromSecretKey(new Uint8Array(fundingKeypair.secretKey))
  const positionNftKeypair = Keypair.generate()

  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount: new BN(tokenAAmount.toString()),
    tokenBAmount: new BN(tokenBAmount.toString()),
    minSqrtPrice: MIN_SQRT_PRICE,
    maxSqrtPrice: MAX_SQRT_PRICE,
    collectFeeMode: 1
  })

// after preparing the pool params, before sending:
const poolAddress = derivePoolAddress(
  new PublicKey(configAddress),
  new PublicKey(mintAddress),
  new PublicKey("So11111111111111111111111111111111111111112")
)

const positionAddress = derivePositionAddress(
  positionNftKeypair.publicKey
)


  const poolTx = await cpAmm.createPool({
    payer: fundingWallet.publicKey,
    creator: fundingWallet.publicKey,
    config: new PublicKey(configAddress),
    positionNft: positionNftKeypair.publicKey,
    tokenAMint: new PublicKey(mintAddress),
    tokenBMint: new PublicKey("So11111111111111111111111111111111111111112"),
    tokenAAmount: new BN(tokenAAmount.toString()),
    tokenBAmount: new BN(tokenBAmount.toString()),
    initSqrtPrice,
    liquidityDelta,
    activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID
  })


  const txSig = await connection.sendTransaction(poolTx, [fundingWallet, positionNftKeypair])
  await connection.confirmTransaction(txSig, "confirmed")

 return {
  poolAddress: poolAddress.toString(),
  launchTxSig: txSig,
  poolPosition: positionAddress.toString(),
  positionNftMint: positionNftKeypair.publicKey.toString()
}
}