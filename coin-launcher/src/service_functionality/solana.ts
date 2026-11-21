import {
    address, createNoopSigner, generateKeyPairSigner, pipe, some, none,
    createTransactionMessage, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions, partiallySignTransactionMessageWithSigners,
    getBase64EncodedWireTransaction, type Blockhash, type Instruction,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import {
    TOKEN_2022_PROGRAM_ADDRESS, AuthorityType, extension, getMintSize,
    getInitializeMetadataPointerInstruction, getInitializeMintInstruction, getInitializeTokenMetadataInstruction,
    getUpdateTokenMetadataUpdateAuthorityInstruction, findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction, getMintToInstruction, getSetAuthorityInstruction,
} from "@solana-program/token-2022";
import { connection } from "../connection";
import { signWithWalletApp } from "./walletApp";
import { sendAndConfirmSigned } from "./transactions";
import { LAUNCH_PRIORITY_MICROLAMPORTS, MINT_TX_CU_LIMIT } from "../config";
import { token2022LaunchParams } from "../interfaces";


//ONE atomic tx: mint account + metadata pointer + mint + on-mint metadata + supply + authority changes
//the mint keypair is ephemeral — it signs here and is discarded; wallet-app signs as funding
export async function createToken2022(params: token2022LaunchParams): Promise<{ mintAddress: string; txSig: string }> {

    const fundingAddress = address(params.fundingPublicKey);
    const funding = createNoopSigner(fundingAddress);     //marks funding as a required signer — wallet-app fills it
    const mint = await generateKeyPairSigner();          //ephemeral — never stored

    //space: pointer extension only — InitializeTokenMetadata grows the account itself
    //lamports: the FULL final size (pointer + metadata) — underfund this and the metadata step fails
    const metadataPointerExtension = extension("MetadataPointer", {
        authority: fundingAddress,
        metadataAddress: mint.address,
    });
    const tokenMetadataExtension = extension("TokenMetadata", {
        updateAuthority: some(fundingAddress),
        mint: mint.address,
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        additionalMetadata: new Map(),           //socials/description live in the Arweave JSON, not on-chain
    });

    const space = BigInt(getMintSize([metadataPointerExtension]));
    const fullSize = getMintSize([metadataPointerExtension, tokenMetadataExtension]);
    const [rentLamports, latest] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(fullSize),
        connection.getLatestBlockhash("confirmed"),
    ]);

    //funding's Token-2022 ATA — receives the full supply
    const [fundingAta] = await findAssociatedTokenPda({
        owner: fundingAddress,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        mint: mint.address,
    });

    //order matters: pointer BEFORE InitializeMint, and CreateAccount + pointer + mint in the same tx
    const instructions: Instruction[] = [
        getSetComputeUnitLimitInstruction({ units: MINT_TX_CU_LIMIT }),
        getSetComputeUnitPriceInstruction({ microLamports: LAUNCH_PRIORITY_MICROLAMPORTS }),

        getCreateAccountInstruction({
            payer: funding,
            newAccount: mint,
            lamports: rentLamports,
            space,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        getInitializeMetadataPointerInstruction({
            mint: mint.address,
            authority: fundingAddress,
            metadataAddress: mint.address,
        }),
        getInitializeMintInstruction({
            mint: mint.address,
            decimals: params.decimals,
            mintAuthority: fundingAddress,
            freezeAuthority: params.revokeFreeze ? null : fundingAddress,   //revoked by default
        }),
        getInitializeTokenMetadataInstruction({
            metadata: mint.address,
            updateAuthority: fundingAddress,
            mint: mint.address,
            mintAuthority: funding,
            name: params.name,
            symbol: params.symbol,
            uri: params.uri,
        }),

        getCreateAssociatedTokenIdempotentInstruction({
            payer: funding,
            ata: fundingAta,
            owner: fundingAddress,
            mint: mint.address,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        getMintToInstruction({
            mint: mint.address,
            token: fundingAta,
            mintAuthority: funding,
            amount: params.supply * 10n ** BigInt(params.decimals),
        }),
    ];

    //revoke AFTER minting — the mint authority is needed above
    if(params.revokeMint)
        instructions.push(getSetAuthorityInstruction({
            owned: mint.address,
            owner: funding,
            authorityType: AuthorityType.MintTokens,
            newAuthority: null,
        }));

    //lock metadata = remove its update authority, permanently
    if(params.lockMetadata)
        instructions.push(getUpdateTokenMetadataUpdateAuthorityInstruction({
            metadata: mint.address,
            updateAuthority: funding,
            newUpdateAuthority: none(),
        }));

    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(funding, m),
        m => setTransactionMessageLifetimeUsingBlockhash(
            { blockhash: latest.blockhash as Blockhash, lastValidBlockHeight: BigInt(latest.lastValidBlockHeight) }, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );

    //the mint keypair signs now; the noop funding signer leaves its slot empty for wallet-app
    const partiallySigned = await partiallySignTransactionMessageWithSigners(message);
    const partialBase64 = getBase64EncodedWireTransaction(partiallySigned);

    if(Buffer.from(partialBase64, "base64").length > 1232)
        throw new Error("Mint transaction exceeds 1232 bytes");

    const signed = await signWithWalletApp(params.userId, [params.fundingPublicKey], partialBase64);
    const txSig = await sendAndConfirmSigned(signed, latest);

    return { mintAddress: mint.address, txSig };
}