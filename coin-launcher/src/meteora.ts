import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js"
import { CpAmm, InitializeCustomizeablePoolParams, MAX_SQRT_PRICE, MIN_SQRT_PRICE, PreparePoolCreationParams } from "@meteora-ag/cp-amm-sdk";
import { getBaseFeeParams, getDynamicFeeParams, BaseFeeMode, ActivationType } from "@meteora-ag/cp-amm-sdk"

// Initialize a connection to the Solana network
const connection = new Connection(process.env.HELIUS_RPC_URL!);

// Create a new instance of the CpAmm SDK
const cpAmm = new CpAmm(connection);

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

export async function createCustomPool(
  mintAddress: string,        // tokenA mint
  tokenAAmount: bigint,       // tokens to seed pool with
  tokenBAmount: bigint,       // SOL amount in lamports
  decimals: number,           // tokenA decimals
  feeWalletPublicKey: string, // receives LP position NFT
  fundingKeypair: { publicKey: string, secretKey: number[] }
): Promise<{ poolAddress: string, launchTxSig: string, poolPosition: string }> {


const fundingWallet = Keypair.fromSecretKey(new Uint8Array(fundingKeypair.secretKey))
const positionNftKeypair = Keypair.generate()

// preparePoolCreationParams calculates initSqrtPrice and liquidityDelta for us
const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
  tokenAAmount: new BN(tokenAAmount.toString()),
  tokenBAmount: new BN(tokenBAmount.toString()),
  minSqrtPrice: MIN_SQRT_PRICE,
  maxSqrtPrice: MAX_SQRT_PRICE,
  collectFeeMode: 0
})


const baseFee = getBaseFeeParams(
  {
    baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear,
    feeTimeSchedulerParam: {
      startingFeeBps: 25,
      endingFeeBps: 25,
      numberOfPeriod: 0,
      totalDuration: 0,
    }
  },
  9,                        // tokenBDecimal - SOL
  ActivationType.Timestamp  // activationType
)

const { tx, pool, position } = await cpAmm.createCustomPool({
  payer: fundingWallet.publicKey,       // The wallet paying for the transaction
  creator: fundingWallet.publicKey,     // The creator of the pool
  positionNft: positionNftKeypair.publicKey, // The mint for the initial position NFT
  tokenAMint: new PublicKey(mintAddress),    // The mint address for token A - created token
  tokenBMint: new PublicKey("So11111111111111111111111111111111111111112"), // wSOL
  tokenAAmount: new BN(tokenAAmount.toString()), // Initial amount of token A to deposit
  tokenBAmount: new BN(tokenBAmount.toString()), // Initial amount of token B to deposit
  sqrtMinPrice: MIN_SQRT_PRICE,         // Minimum sqrt price
  sqrtMaxPrice: MAX_SQRT_PRICE,         // Maximum sqrt price
  initSqrtPrice,                        // Initial sqrt price in Q64 format - calculated above
  liquidityDelta,                       // Initial liquidity in Q64 format - calculated above
  poolFees: {
    baseFee: baseFee,
    compoundingFeeBps: 0,
    padding: 0,
    dynamicFee: null // no dynamic fee for default launch
  },
  hasAlphaVault: false,                 // no alpha vault
  collectFeeMode: 0,                    // 0: BothToken, 1: OnlyB, 2: Compounding
  activationPoint: null,                // null = immediate activation
  activationType: 1,                    // 0: slot, 1: timestamp
  tokenAProgram: TOKEN_PROGRAM_ID,      // Token program for token A
  tokenBProgram: TOKEN_PROGRAM_ID,      // Token program for token B
})


const txSig = await connection.sendTransaction(tx, [fundingWallet, positionNftKeypair])
await connection.confirmTransaction(txSig, "confirmed")

return { poolAddress: pool.toString(), launchTxSig: txSig, poolPosition: position.toString() }
}


