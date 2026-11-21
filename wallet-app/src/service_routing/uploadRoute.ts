import { FastifyInstance } from "fastify";
import pool from "../service_dataOperations/databaseConnectivity";
import { getSeedPhrase, validateForKeyPair } from "../service_dataOperations/databaseCalls";
import { decrypt } from "../service_functionality/crypto";
import { deriveKeyPair } from "../service_functionality/wallet";
import { uploadTokenAssets } from "../service_functionality/irys";
import { uploadAssetsRequest } from "../interfaces";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadEndpoints(fastify: FastifyInstance){

//image + metadata → Arweave, paid by the user's funding wallet; the key never leaves this service
//bodyLimit raised for THIS route only — a 5MB image is ~6.7MB as base64
fastify.post("/uploadTokenAssets", { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const { user_ID, fundingWalletId, imageBase64, mimeType, metadata } = request.body as uploadAssetsRequest

    if(!user_ID || !fundingWalletId || !imageBase64 || !metadata?.name || !metadata?.symbol)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "user_ID, fundingWalletId, imageBase64 and metadata name/symbol are required" });

    if(!ALLOWED_IMAGE_TYPES.includes(mimeType))
        return reply.status(400).send({ error: "BAD_REQUEST", message: `mimeType must be one of ${ALLOWED_IMAGE_TYPES.join(", ")}` });

    const image = Buffer.from(imageBase64, "base64");
    if(image.length === 0 || image.length > MAX_IMAGE_BYTES)
        return reply.status(400).send({ error: "BAD_REQUEST", message: "Image must be between 1 byte and 5MB" });

    //---------- ownership + key: wallet-app's own DB, our failure → 500 ----------
    let secretKey: Uint8Array;
    try {
        const rows = await validateForKeyPair(pool, fundingWalletId, user_ID, "funding");
        if(rows.length === 0)
            return reply.status(404).send({ error: "FUNDING_WALLET_NOT_FOUND", message: "Funding wallet not found" });

        const encryptedMnemonic = await getSeedPhrase(pool, user_ID);
        const mnemonic = decrypt(encryptedMnemonic, process.env.ENCRYPTION_KEY!, user_ID);
        secretKey = (await deriveKeyPair(mnemonic, rows[0].derivation_path)).secretKey;
    } catch (error) {
        request.log.error({ err: error, fundingWalletId }, "Could not load funding wallet for upload");
        return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Upload failed" });
    }

    //---------- Irys: an upstream failure → 502 ----------
    try {
        const { imageUri, metadataUri } = await uploadTokenAssets(secretKey, image, mimeType, metadata);
        return reply.status(200).send({ imageUri, metadataUri });
    } catch (error) {
        //never log the key — the error and the wallet id only
        request.log.error({ err: error, fundingWalletId }, "Irys upload failed");
        return reply.status(502).send({ error: "UPLOAD_FAILED", message: "Arweave upload failed — check the funding wallet's SOL balance" });
    }
})

}