import {  address, appendTransactionMessageInstruction, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, getSignatureFromTransaction, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners } from "@solana/kit"
import { getTransferSolInstruction } from "@solana-program/system"



const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!)
const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.HELIUS_WS_URL!)

//simple rpc call for wallet manager to showcase solana balances
export async function getWalletBalance(publicKey: string){
try {
     const balance = await rpc.getBalance(address(publicKey)).send()
    return {balance: (Number(balance.value)/1000000000)}
} catch (error) {
    return error
}
   
}


//allows withdraws from any wallet to any valid solana wallet, required to get your money out !!
export async function withdrawSol(sourceKeypair:Uint8Array, destinationKeypair: string, amount: number){
const lamportsTran = BigInt(Math.floor(amount * 1_000_000_000))

const signer = await createKeyPairSignerFromBytes(sourceKeypair)

const transferInstruction = getTransferSolInstruction(
{
    'amount': lamportsTran,
    'destination' : address(destinationKeypair),
    'source' : signer

})

try {
const blockhash = await rpc.getLatestBlockhash().send()

const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayerSigner(signer, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(blockhash.value, tx),
  tx => appendTransactionMessageInstruction(transferInstruction, tx)
);


const signedTransaction =
await signTransactionMessageWithSigners(transactionMessage);
const transactionSignature = getSignatureFromTransaction(signedTransaction);

const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })
await sendAndConfirm(signedTransaction as Parameters<typeof sendAndConfirm>[0], { commitment: "finalized" })

return { withdrawTxSig: transactionSignature}
} catch (error) {
    if (error instanceof Error && error.message.includes('insufficient lamports')) {
        return { error: "Insufficient SOL balance for this withdrawal" }
    }
    return { error: "Withdrawal failed" }
}

}