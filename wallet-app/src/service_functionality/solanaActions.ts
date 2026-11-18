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




