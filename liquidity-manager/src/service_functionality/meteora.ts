import { Transaction, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js"
import {
  CpAmm, SwapMode, derivePositionNftAccount, getCurrentPoint, getTokenProgram,
  InitializeCustomizeablePoolParams, MAX_SQRT_PRICE, MIN_SQRT_PRICE, PreparePoolCreationParams, unwrapSOLInstruction
} from "@meteora-ag/cp-amm-sdk";
import { connection } from "../connection"   //shared — one Connection per service


//wrapped SOL mint — fixed address, no package needed
const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112")
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const cpAmm = new CpAmm(connection)


//move to liquidity manager once all is up and running
export async function exitPosition(
  poolAddress: string,
  positionAddress: string,
  positionNftMint: string,
  fundingKeypair: { publicKey: string, secretKey: number[] }
): Promise<{ exitTxSig: string }> {

  const fundingWallet = Keypair.fromSecretKey(new Uint8Array(fundingKeypair.secretKey))
  const poolPubkey = new PublicKey(poolAddress)
  const positionPubkey = new PublicKey(positionAddress)

  const poolState = await cpAmm.fetchPoolState(poolPubkey)
  const positionNftAccount = derivePositionNftAccount(new PublicKey(positionNftMint))
  const currentPoint = await getCurrentPoint(connection, poolState.activationType)

  const tx = await cpAmm.removeAllLiquidity({
    owner: fundingWallet.publicKey,
    position: positionPubkey,
    pool: poolPubkey,
    positionNftAccount,
    tokenAAmountThreshold: new BN(0),
    tokenBAmountThreshold: new BN(0),
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    vestings: [],
    currentPoint
  })

  const txSig = await connection.sendTransaction(tx, [fundingWallet])
  await connection.confirmTransaction(txSig, "finalized")

  //unwrap wSOL back to native SOL
  const unwrapIx = await unwrapSOLInstruction(fundingWallet.publicKey)
  const unwrapTx = new Transaction().add(unwrapIx)
  const unwrapSig = await connection.sendTransaction(unwrapTx, [fundingWallet])
  await connection.confirmTransaction(unwrapSig, "confirmed")

  return { exitTxSig: txSig }
}



//SOL → token swap instructions for one wallet — no signing, no sending
//caller compiles, wallet-app signs, caller sends
export async function buildBuyInstructions(
  walletPublicKey: string,
  poolAddress: string,
  amountInLamports: bigint,
  slippagePercent: number
){
  const payer = new PublicKey(walletPublicKey)
  const pool = new PublicKey(poolAddress)
  const poolState = await cpAmm.fetchPoolState(pool)

  //which side of the pool is SOL
  const solIsA = poolState.tokenAMint.equals(NATIVE_MINT)
  const solIsB = poolState.tokenBMint.equals(NATIVE_MINT)
  if(!solIsA && !solIsB)
    throw new Error("POOL_NOT_SOL_PAIRED")

  const outputTokenMint = solIsA ? poolState.tokenBMint : poolState.tokenAMint
  const tokenAProgram = getTokenProgram(poolState.tokenAFlag)
  const tokenBProgram = getTokenProgram(poolState.tokenBFlag)

  //decimals straight from the RPC — works for Token and Token-2022, no spl-token import
  const [supplyA, supplyB, currentPoint] = await Promise.all([
    connection.getTokenSupply(poolState.tokenAMint),
    connection.getTokenSupply(poolState.tokenBMint),
    getCurrentPoint(connection, poolState.activationType),
  ])

  //BN at the SDK boundary only — bigint → string → BN, never through Number
  const amountIn = new BN(amountInLamports.toString())

  const quote = cpAmm.getQuote2({
    inputTokenMint: NATIVE_MINT,
    poolState,
    currentPoint,
    amountIn,
    slippage: slippagePercent,
    swapMode: SwapMode.ExactIn,
    tokenADecimal: supplyA.value.decimals,
    tokenBDecimal: supplyB.value.decimals,
    hasReferral: false,
  })

  const tx = await cpAmm.swap2({
    payer,
    pool,
    inputTokenMint: NATIVE_MINT,
    outputTokenMint,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram,
    tokenBProgram,
    referralTokenAccount: null,
    poolState,
    swapMode: SwapMode.ExactIn,
    amountIn,
    minimumAmountOut: quote.minimumAmountOut!,
  })

  return {
    instructions: tx.instructions,
    minimumOut: quote.minimumAmountOut!.toString(),
    outputTokenMint: outputTokenMint.toBase58(),
  }
}