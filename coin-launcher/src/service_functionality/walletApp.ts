//wallet-app client — every call checks the status, failures throw with context

//TEMPORARY: removed in P4 when everything signs through /sign
export async function deriveWallet(user_ID: string, wallet_id: string, wallet_type: string){
    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/derive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_id, user_ID, wallet_type }),
    });
    if(!response.ok)
        throw new Error(`wallet-app /derive failed (${response.status}) for ${wallet_type} wallet ${wallet_id}`);
    return await response.json() as { publicKey: string; secretKey: number[] };
}

export async function getWalletPublicKey(wallet_id: string): Promise<string> {
    const params = new URLSearchParams({ wallet_id });
    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/listPublicKey?${params}`);
    if(!response.ok)
        throw new Error(`wallet-app /listPublicKey failed (${response.status}) for wallet ${wallet_id}`);
    const rows = await response.json() as { public_key: string }[];
    if(rows.length === 0)
        throw new Error(`Wallet ${wallet_id} not found`);
    return rows[0].public_key;
}