import { Transaction,Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js"
import { CpAmm, derivePositionNftAccount, getCurrentPoint, InitializeCustomizeablePoolParams, MAX_SQRT_PRICE, MIN_SQRT_PRICE, PreparePoolCreationParams, unwrapSOLInstruction } from "@meteora-ag/cp-amm-sdk";



const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const connection = new Connection(process.env.HELIUS_RPC_URL!)
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