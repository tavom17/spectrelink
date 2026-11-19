import { Pool, PoolClient } from "pg";
import { tokenRecord } from "../interfaces";

//one row per launch — returns token_id; errors throw to the worker
export async function insertToken(client: Pool | PoolClient, token: tokenRecord): Promise<string> {
    const result = await client.query<{ token_id: string }>(
        `INSERT INTO tb_tokens (
            user_id, fee_wallet_id, funding_wallet_id, mint_address, name, symbol, decimals, supply,
            metadata_uri, image_uri, metadata_tx_sig, pool_address, position_address, position_nft_mint,
            position_tx_sig, launch_tx_sig, website, twitter, telegram,
            token_program, mint_authority_revoked, freeze_authority_revoked, metadata_locked, launched_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23, now())
         RETURNING token_id`,
        [
            token.userId, token.feeWalletId, token.fundingWalletId, token.mintAddress, token.name, token.symbol,
            token.decimals, token.supply, token.metadataUri, token.imageUri, token.metadataTxSig,
            token.poolAddress, token.positionAddress, token.positionNftMint, null, token.launchTxSig,
            token.website, token.twitter, token.telegram,
            token.tokenProgram, token.mintAuthorityRevoked, token.freezeAuthorityRevoked, token.metadataLocked,
        ]
    );
    return result.rows[0].token_id;
}