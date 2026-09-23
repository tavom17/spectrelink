import pool from "./databaseConnectivity";
import { walletList } from "../interfaces";


//list wallets 
export async function listWallets(user_ID: string){

  const result =  await pool.query<walletList>(
                `select public_key,wallet_type,wallet_id from tb_wallets
                where user_id = $1`,[user_ID]);
                
  return result;               
}


//list public key

export async function listPublicKey(wallet_ID: string){

   const result = await pool.query<walletList>(
            `select public_key from tb_wallets
            where wallet_id = $1`,[wallet_ID]);
            
    return result;        
}


//only the saving, all other steps isolated to exact create slaves function
export async function slaveWalletSave(slave: string[], user_ID: string, oneIndexPastMax: number){
  const client = await pool.connect()
    try {
        await client.query('BEGIN')

        for (let i = 0; i < slave.length; i++) {

            await client.query(
                `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user_ID, oneIndexPastMax + i, `m/44'/501'/2'/${oneIndexPastMax + i}'`, slave[i], 'slave']
            )
        }

        await client.query('COMMIT')
        return "successful"

    } catch (error) {
        await client.query('ROLLBACK')
        return "failure"
    } finally {
        client.release()
    }
}


export async function fundingWalletSave(wallet: string, user_ID: string, index: number ){
   const client = await pool.connect()
    try {
        await client.query('BEGIN')


            await client.query(
                `INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user_ID, index, `m/44'/501'/1'/${index}'`, wallet, 'funding']
            )
        

        await client.query('COMMIT')
        return "successful"

    } catch (error) {
        await client.query('ROLLBACK')
        return "failure"
    } finally {
        client.release()
    }
}


export async function registrationWalletSave(user_ID: string, publicKey: string, derivationPath: string, walletType: string, encryptedMnemonic: string){
     
    const response = await pool.query(
            
          `INSERT INTO tb_wallets (user_id, wallet_index,derivation_path,public_key, encrypted_mnemonic, wallet_type, label) 
           VALUES ($1, $2,$3, $4,$5, $6, $7)`,
          [user_ID, 0, derivationPath, publicKey, encryptedMnemonic, 'master', 'first registration']
            );

        return response;
}



//helper function for all other routes that require a secret key from a public key selected
//derive uses this function as well. This was a last minute change as a new route required and it was silly for derive to handle
//abstracted the validation from derive and the retrieval into this function, derive and other routes can now use this one
// the problem was derive is a post endpoint and not an actual exportable function
// export async function getKeypairForWallet(wallet_id: string, user_id: string, wallet_type: string) {
//     const response = await pool.query(
//         `SELECT derivation_path FROM tb_wallets 
//          WHERE wallet_id = $1 AND user_id = $2 AND wallet_type = $3`,
//         [wallet_id, user_id, wallet_type]
//     )

//     if (!response || response.rowCount === 0) 
//         throw new Error("Wallet validation failed")

//     const encryptedMnemonic = await getSeedPhrase(user_id)
//     const decryptedMnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_id)
//     return await wallet.deriveKeyPair(decryptedMnemonic, response.rows[0].derivation_path)
// }





//this function is only ever used when retrieving a keypair, as we take derivation path and seed phrase which needs to be decrypted
export async function getSeedPhrase(user_id: string): Promise<string>{
            try {
            const encryptedSeedPhrase = await pool.query(
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
//can't reuse derivation paths, so this pulls lates wallet_index and increments by one when creating new wallets
export async function getLatestIndex(user_id: string, wallet_type: string):Promise<number>{
                  try {
            const index = await pool.query(
                  `select MAX(wallet_index) from tb_wallets
                  where user_id = $1 and wallet_type = $2`,[user_id, wallet_type])

            if(!index || index.rowCount ===0) 
                  return 0
            const maxIndex = index.rows[0].max
            return maxIndex ===null ? 0 : maxIndex + 1;

            } catch (error) {
                  return -1
            }
}