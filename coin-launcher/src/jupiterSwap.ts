import { connection as connectionRPC} from './connection' //from connection.ts one rpc connection
import {Keypair, VersionedTransaction } from '@solana/web3.js'

const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote'
const JUPITER_SWAP_URL = 'https://api.jup.ag/swap/v1/swap'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const MAX_SUPPLY_PERCENT = 0.5

const headers = { 'x-api-key': process.env.JUPITER_API_KEY! }

export async function getQuote(
  mintAddress: string,
  amountInLamports: bigint,
): Promise<any> {
  const url = `${JUPITER_QUOTE_URL}?inputMint=${SOL_MINT}&outputMint=${mintAddress}&amount=${amountInLamports.toString()}&slippageBps=300`
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`Jupiter quote failed: ${response.statusText}`)
  return response.json()
}

export function validateSupplyPercent(
  outAmount: string,
  totalSupply: bigint,
  decimals: number
): void {
  const tokensReceived = BigInt(outAmount)
  const supplyInRaw = totalSupply * BigInt(10 ** decimals)
  const percent = (Number(tokensReceived) / Number(supplyInRaw)) * 100

  if (percent >= MAX_SUPPLY_PERCENT) {
    throw new Error(
      `Auto-buy would acquire ${percent.toFixed(3)}% of supply — exceeds ${MAX_SUPPLY_PERCENT}% cap. Reduce solPerBuy.`
    )
  }
}

export async function autoBuy(
  mintAddress: string,
  amountInLamports: bigint,
  slaveKeypair: { publicKey: string; secretKey: number[] },
): Promise<{ buyTxSig: string; tokensReceived: string }> {

  const wallet = Keypair.fromSecretKey(new Uint8Array(slaveKeypair.secretKey))

  // 1. Quote
  const quoteResponse = await getQuote(mintAddress, amountInLamports)
  if (quoteResponse.error) throw new Error(`Jupiter quote error: ${quoteResponse.error}`)

  // 2. Swap transaction
 const swapResponse = await fetch(JUPITER_SWAP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({
    quoteResponse,
    userPublicKey: wallet.publicKey.toString(),
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto'
  })
})

  if (!swapResponse.ok) throw new Error(`Jupiter swap request failed: ${swapResponse.statusText}`)
  const swapData = await swapResponse.json()
  if (swapData.error) throw new Error(`Jupiter swap error: ${swapData.error}`)

  // 3. Deserialize, sign, send
  const txBuffer = Buffer.from(swapData.swapTransaction, 'base64')
  const transaction = VersionedTransaction.deserialize(txBuffer)
  transaction.sign([wallet])

  const txSig = await connectionRPC.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3
  })

  await connectionRPC.confirmTransaction(txSig, 'confirmed')

  return { buyTxSig: txSig, tokensReceived: quoteResponse.outAmount }
}