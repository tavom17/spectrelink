import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import { tokenMetadataInput } from "../interfaces";

const GATEWAY = "https://gateway.irys.xyz/";
//an upload URL is GATEWAY + a 43-char id — same length as this placeholder,
//so the metadata can be priced before the image URL exists
const PLACEHOLDER_IMAGE_URL = GATEWAY + "x".repeat(44);

async function getIrys(secretKey: Uint8Array){
    return await Uploader(Solana)
        .withWallet(Array.from(secretKey))   //same key format coin-launcher passes today
        .withRpc(process.env.HELIUS_RPC_URL!);
}

//the off-chain JSON the token's on-chain URI points to — socials + description live here
export function buildMetadataJson(meta: tokenMetadataInput, imageUri: string): string {
    return JSON.stringify({
        name: meta.name,
        symbol: meta.symbol,
        description: meta.description,
        image: imageUri,
        external_url: meta.website,
        extensions: {
            twitter: meta.twitter,
            telegram: meta.telegram,
            website: meta.website,
        },
    });
}

//price both → fund ONCE if needed → upload image → upload metadata pointing at it
//EXCEPTION: funding Irys is the one on-chain tx wallet-app sends — confined to this function
export async function uploadTokenAssets(
    secretKey: Uint8Array,
    image: Buffer,
    mimeType: string,
    meta: tokenMetadataInput
): Promise<{ imageUri: string; metadataUri: string }> {

    const irys = await getIrys(secretKey);

    const metadataBytes = Buffer.byteLength(buildMetadataJson(meta, PLACEHOLDER_IMAGE_URL), "utf8");
    const [imagePrice, metadataPrice, balance] = await Promise.all([
        irys.getPrice(image.length),
        irys.getPrice(metadataBytes),
        irys.getBalance(),
    ]);

    //leftover balance from earlier launches is reused — fund only the shortfall
    const totalCost = imagePrice.plus(metadataPrice);
    if(balance.lt(totalCost))
        await irys.fund(totalCost.minus(balance));

    const imageReceipt = await irys.upload(image, { tags: [{ name: "Content-Type", value: mimeType }] });
    const imageUri = GATEWAY + imageReceipt.id;

    const metadataReceipt = await irys.upload(buildMetadataJson(meta, imageUri), {
        tags: [{ name: "Content-Type", value: "application/json" }],
    });

    return { imageUri, metadataUri: GATEWAY + metadataReceipt.id };
}