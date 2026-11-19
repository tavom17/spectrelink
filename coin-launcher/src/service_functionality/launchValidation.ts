import { LaunchJobData } from "../interfaces";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const U64_MAX = 18_446_744_073_709_551_615n;

//pure — returns every problem at once so the form can show them all
export function validateLaunchInput(data: Omit<LaunchJobData, "imageBuffer">, imageBytes: number): string[] {
    const errors: string[] = [];

    if(imageBytes === 0) errors.push("Image is required");
    if(imageBytes > MAX_IMAGE_BYTES) errors.push(`Image must be ${MAX_IMAGE_BYTES / 1024 / 1024}MB or smaller`);
    if(imageBytes > 0 && !ALLOWED_IMAGE_TYPES.includes(data.mimeType)) errors.push(`Image type must be one of ${ALLOWED_IMAGE_TYPES.join(", ")}`);

    const name = data.name.trim();
    const symbol = data.symbol.trim();
    if(name.length < 1 || name.length > 32) errors.push("Name must be 1–32 characters");
    if(symbol.length < 1 || symbol.length > 10) errors.push("Symbol must be 1–10 characters");

    if(!Number.isInteger(data.decimals) || data.decimals < 0 || data.decimals > 9)
        errors.push("Decimals must be an integer from 0 to 9");

    //supply × 10^decimals must fit the on-chain u64 amount
    if(!Number.isSafeInteger(data.supply) || data.supply <= 0){
        errors.push("Supply must be a positive whole number");
    } else if(Number.isInteger(data.decimals) && data.decimals >= 0 && data.decimals <= 9){
        if(BigInt(data.supply) * 10n ** BigInt(data.decimals) > U64_MAX)
            errors.push("Supply is too large for the chosen decimals");
    }

    if(!(data.poolPercentage > 0 && data.poolPercentage <= 100)) errors.push("Pool percentage must be above 0 and at most 100");
    if(!(data.initialLiquiditySol > 0)) errors.push("Initial liquidity must be above 0 SOL");
    if(!data.configAddress) errors.push("A pool config is required");
    if(!data.fundingWalletId) errors.push("A funding wallet is required");

    if(data.autoBuyEnabled){
        if(!data.slaveWalletId) errors.push("Auto-buy needs a wallet");
        if(!Number.isInteger(data.numberOfBuys) || data.numberOfBuys < 1) errors.push("Auto-buy needs at least 1 buy");
        if(!(data.solPerBuy > 0)) errors.push("Auto-buy SOL per buy must be above 0");
    }

    return errors;
}