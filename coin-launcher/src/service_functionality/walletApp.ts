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

//read as text first — a non-JSON reply becomes a readable error, not "Unexpected token"
async function readBody(response: Response): Promise<any> {
    const text = await response.text();
    try { return JSON.parse(text); } catch { return { error: "NON_JSON_RESPONSE", message: text }; }
}

export async function getWalletPublicKey(wallet_ID: string): Promise<string> {
    const params = new URLSearchParams({ wallet_ID });
    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/listPublicKey?${params}`);
    const body = await readBody(response);

    if(!response.ok)
        throw new Error(`wallet-app /listPublicKey failed (${response.status}) for wallet ${wallet_ID}: ${body.error} ${body.message ?? ""}`);

    const rows = body as { public_key: string }[];
    if(!Array.isArray(rows) || rows.length === 0)
        throw new Error(`Wallet ${wallet_ID} not found`);
    return rows[0].public_key;
}

//upload happens inside wallet-app — coin-launcher never touches the funding key for this
export async function uploadTokenAssets(
    user_ID: string,
    fundingWalletId: string,
    imageBase64: string,
    mimeType: string,
    metadata: { name: string; symbol: string; description: string; website: string; twitter: string; telegram: string }
): Promise<{ imageUri: string; metadataUri: string }> {

    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/uploadTokenAssets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, fundingWalletId, imageBase64, mimeType, metadata }),
    });

    const body = await response.json() as { imageUri?: string; metadataUri?: string; error?: string; message?: string };
    if(!response.ok || !body.imageUri || !body.metadataUri)
        throw new Error(`wallet-app upload failed (${response.status}): ${body.error} ${body.message ?? ""}`);

    return { imageUri: body.imageUri, metadataUri: body.metadataUri };
}

//wallet-app adds the funding signature — the key never leaves wallet-app
export async function signWithWalletApp(user_ID: string, pubKeys: string[], transaction: string): Promise<string> {
    const response = await fetch(`${process.env.WALLET_APP_URL}/internal/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ID, pubKeys, transaction }),
    });

    const body = await response.json() as { transaction?: string; error?: string; message?: string };
    if(!response.ok || !body.transaction)
        throw new Error(`Signing failed (${response.status}): ${body.error} ${body.message ?? ""}`);

    return body.transaction;
}