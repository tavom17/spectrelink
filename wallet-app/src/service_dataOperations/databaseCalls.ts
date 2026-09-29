import { walletCreations, walletList,savedWallet } from "../interfaces";
import { Pool, PoolClient } from "pg";

//rules for db call functions
//Query logic only
//atomic transaction logic in route functions for multi call connections
//pass a pool or a poolclient to the db calls
//pool for single query calls
//poolClient for multi call transactions

//list wallets 
export async function listWallets(client: Pool | PoolClient, user_ID: string){

  const result =  await client.query<walletList>(
                `select public_key,wallet_type,wallet_id from tb_wallets
                where user_id = $1`,[user_ID]);
                
  return result;               
}


//list public key

export async function listPublicKey(client: Pool | PoolClient, wallet_ID: string){

   const result = await client.query<walletList>(
            `select public_key from tb_wallets
            where wallet_id = $1`,[wallet_ID]);
            
    return result;        
}


//only the saving, all other steps isolated to exact create slaves function
export async function slaveWalletSave(client: Pool | PoolClient, slave: walletCreations[], user_ID: string){

    const result = await client.query<savedWallet>(
        `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
         SELECT $1, idx, path, pubkey, 'slave'
         FROM unnest($2::int[], $3::text[], $4::text[]) AS t(idx, path, pubkey)
         RETURNING wallet_id, public_key`,
        [
            user_ID,
            slave.map(s => s.index),
            slave.map(s => s.derivationPath),
            slave.map(s => s.publicKey),
        ]
    );
    return result.rows;


}


export async function fundingWalletSave(client: Pool | PoolClient, user_ID: string, wallet: walletCreations){
   
  
    const result = await client.query(
                `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user_ID, wallet.index, wallet.derivationPath, wallet.publicKey, 'funding']
            )
        
        

        return result.rows;
}


export async function registrationWalletSave(client: Pool | PoolClient, user_ID: string, publicKey: string, derivationPath: string, walletType: string, encryptedMnemonic: string){
     
    const response = await client.query(
            
          `INSERT INTO tb_wallets (user_id, wallet_index,derivation_path,public_key, encrypted_mnemonic, wallet_type, label) 
           VALUES ($1, $2,$3, $4,$5, $6, $7)`,
          [user_ID, 0, derivationPath, publicKey, encryptedMnemonic, 'master', 'first registration']
            );

        return response;
}






//this function is only ever used when retrieving a keypair, as we take derivation path and seed phrase which needs to be decrypted
export async function getSeedPhrase(client: Pool | PoolClient,user_id: string): Promise<string>{
            try {
            const encryptedSeedPhrase = await client.query(
                  `select encrypted_mnemonic from tb_wallets
                  where user_id = $1 and wallet_type = $2`,[user_id, 'master'])

            if(!encryptedSeedPhrase || encryptedSeedPhrase.rowCount ===0) 
                  return "null"
            
            return encryptedSeedPhrase.rows[0].encrypted_mnemonic;

            } catch (error) {
                  return "Internal service error - DB"
            }
}

//function required in order to maintain integrity for derivation path
//can't reuse derivation paths, so this pulls latest wallet_index and increments by one when creating new wallets
export async function getLatestIndex(client: Pool | PoolClient,user_id: string, wallet_type: string):Promise<number>{
            
    try {

            const index = await client.query(
                  `select MAX(wallet_index) from tb_wallets
                  where user_id = $1 and wallet_type = $2`,[user_id, wallet_type])

            if(!index || index.rowCount ===0) 
                  return 0

            const maxIndex = index.rows[0].max
            return maxIndex ===null ? 0 : maxIndex + 1;

        } catch (error) {
                  return 0
        }
}


//validate userID matches found wallet and  wallet type
export async function validateForKeyPair(client: Pool | PoolClient, wallet_id: string, user_id: string, wallet_type: string) {
    const response = await client.query(
        `SELECT derivation_path FROM tb_wallets 
         WHERE wallet_id = $1 AND user_id = $2 AND wallet_type = $3`,
        [wallet_id, user_id, wallet_type]
    )
    return response.rows;
}



export async function bundleGroupSave(client: Pool | PoolClient, user_ID: string, label: string) {

    const result = await client.query<{ group_id: string }>(
        `INSERT INTO tb_bundle_groups (user_id, group_name)
         VALUES ($1, $2)
         RETURNING group_id`,
        [user_ID, label]
    );
    return result.rows[0].group_id;
}


   export async function bundleGroupMemberSave(client: Pool | PoolClient, groupID: string, savedSlaves: savedWallet[]) {

       const result = await client.query<{ member_id: string; wallet_id: string; position: number }>(
           `INSERT INTO tb_bundle_group_members (group_id, wallet_id, position)
            SELECT $1, wid, pos
            FROM unnest($2::uuid[], $3::int[]) AS t(wid, pos)
            RETURNING member_id, wallet_id, position`,
           [
               groupID,
               savedSlaves.map(s => s.wallet_id),
               savedSlaves.map((_, i) => i),
           ]
       );
       return result.rows;
   }