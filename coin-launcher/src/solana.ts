import { createKeyPairSignerFromBytes, createSolanaRpc, generateKeyPairSigner, type Address,address, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, createTransactionMessage, pipe, signTransactionMessageWithSigners, getSignatureFromTransaction, createSolanaRpcSubscriptions, sendAndConfirmTransactionFactory} from "@solana/kit"
import { CreateAccountInput, getCreateAccountInstruction } from "@solana-program/system"
import * as token from "@solana-program/token"
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createMetadataAccountV3, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi"



const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!)
const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.HELIUS_WS_URL!)

const tokenProgramAddress : Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const rentProgramAddress : Address = address("SysvarRent111111111111111111111111111111111")




export async function createTokenMint(
  decimals: number,
  fundingKeypair: { publicKey: string, secretKey: number[] }
): Promise<{ mintAddress: string, mintTxSig: string }>{


const lamports = await rpc.getMinimumBalanceForRentExemption(82n).send()
const blockhash = await rpc.getLatestBlockhash().send();

//create signer for throwaway keypair for mint account
const mintKeypair = await generateKeyPairSigner()
//create signer from funding keypairs 
const fundingSigner = await createKeyPairSignerFromBytes(new Uint8Array(fundingKeypair.secretKey))


//take all the data created above and form the account input for create account instruction
const accountInput : CreateAccountInput = {
  payer: fundingSigner,
  newAccount: mintKeypair,
  lamports: lamports,
  space: 82n,
  programAddress: tokenProgramAddress
}

const account = getCreateAccountInstruction(accountInput)

const fundingAddress: Address = address(fundingKeypair.publicKey);


//create parameter for mint instruction
const mintInput: token.InitializeMintInput = {
  mint: mintKeypair.address,
  rent: rentProgramAddress,
  decimals: decimals,
  mintAuthority: fundingAddress,
  freezeAuthority: null
}

const mint = token.getInitializeMintInstruction(mintInput)


//create the transaction itself with both the instructions created above for account and mint
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayerSigner(fundingSigner, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(blockhash.value, tx),
  tx => appendTransactionMessageInstructions([account, mint], tx)
);


const signedTransaction =
await signTransactionMessageWithSigners(transactionMessage);
const transactionSignature = getSignatureFromTransaction(signedTransaction);

const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })
await sendAndConfirm(signedTransaction as Parameters<typeof sendAndConfirm>[0], { commitment: "finalized" })

return {mintAddress: mintKeypair.address, mintTxSig: transactionSignature}
}

//everything we do here is really to convert types to umi types for metaplex upload
export async function attachMetadata( 
  mintAddress: string,
  name: string,
  symbol: string,
  metadataUri: string,
  fundingKeypair: { publicKey: string, secretKey: number[] }) {

const umi = createUmi(process.env.HELIUS_RPC_URL!)
  .use(mplTokenMetadata())

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(fundingKeypair.secretKey))

const signer = createSignerFromKeypair(umi,keypair)

umi.use(signerIdentity(signer))


const metaDataInstruction = {
    mint: publicKey(mintAddress),
    mintAuthority: signer,
    payer: signer,
    updateAuthority: signer,
    collectionDetails: null,
    data: {
      name: name,
      symbol: symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null
    },
    isMutable: true
}

const result = await createMetadataAccountV3(umi,metaDataInstruction).sendAndConfirm(umi)

return {metadataTxSig:  result.signature}
}









export async function mintSupply(
  mintAddress: string,
  supply: bigint,
  decimals: number,
  fundingKeypair: { publicKey: string, secretKey: number[] }
): Promise<{ mintSupplyTxSig: string }>{



  
//associated token account time
//token isnt held by the wallet address or the mint address
//its held in another account that is created from the wallet and mint address
const fundingSigner = await createKeyPairSignerFromBytes(new Uint8Array(fundingKeypair.secretKey))

const fundingAddress: Address = address(fundingKeypair.publicKey);
const mintTypeAddress: Address = address(mintAddress);



//need seed object for finding associated token pda : 
const ataSeeds : token.AssociatedTokenSeeds = {
    /** The wallet address of the associated token account. */
    owner: fundingAddress,
    /** The address of the token program to use. */
    tokenProgram: tokenProgramAddress,
    /** The mint address of the associated token account. */
    mint: mintTypeAddress
};

const ataToken = await token.findAssociatedTokenPda(ataSeeds)

const ataInstruction = await token.getCreateAssociatedTokenInstructionAsync({
    payer: fundingSigner,
    owner: fundingAddress,
    mint: mintTypeAddress,
    ata: ataToken[0]
})


const mintInput : token.MintToInput = {
  /** The mint account. */
    mint: mintTypeAddress,
    /** The account to mint tokens to. */
    token: ataToken[0],
    /** The mint's minting authority or its multisignature account. */
    mintAuthority: fundingAddress,
    amount: (supply * 10n ** BigInt(decimals))
}
  

const mintIntruction = token.getMintToInstruction(mintInput)

const blockhash = await rpc.getLatestBlockhash().send();

//create the transaction itself with both the instructions created above for account and mint
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayerSigner(fundingSigner, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(blockhash.value, tx),
  tx => appendTransactionMessageInstructions([ataInstruction, mintIntruction], tx)
);


const signedTransaction =
await signTransactionMessageWithSigners(transactionMessage);
const transactionSignature = getSignatureFromTransaction(signedTransaction);

const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })
await sendAndConfirm(signedTransaction as Parameters<typeof sendAndConfirm>[0], { commitment: "finalized" })




 return {mintSupplyTxSig: transactionSignature} 
}