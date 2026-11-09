import {  address, appendTransactionMessageInstruction, CompiledTransactionMessage, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, decompileTransactionMessage, FullySignedTransaction, getSignatureFromTransaction, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners, TransactionMessageBytes } from "@solana/kit"
import { getTransferSolInstruction } from "@solana-program/system"



const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!)
const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.HELIUS_WS_URL!)

//simple rpc call for wallet manager to showcase solana balances
//lamports travel as strings (bigint-safe), SOL is display only
export async function getWalletBalance(publicKey: string){
    const balance = await rpc.getBalance(address(publicKey)).send();
    const lamports = balance.value;

    return {
        publicKey,
        lamports: lamports.toString(),
        sol: Number(lamports) / 1_000_000_000,
    };
}


//one RPC round trip for up to 100 wallets — not one call per wallet
export async function getWalletGroupBalance(publicKeys: string[]){
    const addresses = publicKeys.map(publicKey => address(publicKey));

    //dataSlice length 0 — we only want lamports, not account data
    const accounts = await rpc.getMultipleAccounts(addresses, {
        encoding: 'base64',
        dataSlice: { offset: 0, length: 0 },
    }).send();

    return accounts.value.map((account, i) => {
        //null = account doesn't exist on-chain yet (never funded) — that's a real 0
        const lamports = account ? account.lamports : 0n;
        return {
            publicKey: publicKeys[i],
            lamports: lamports.toString(),
            sol: Number(lamports) / 1_000_000_000,
        };
    });
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

