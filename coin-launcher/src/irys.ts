import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";


async function getIrys(secretKey: number[]) {
  return await Uploader(Solana).withWallet(secretKey).withRpc(process.env.HELIUS_RPC_URL!)
}


export async function uploadImage(imageBuffer: Buffer, mimeType: string, secretKey: number[]): Promise<string> {


const irys =await getIrys(secretKey);



// Add a custom tag that tells the gateway how to serve this file to a browser
const tags = [{ name: "Content-Type", value: `${mimeType}`}];

try {
  const response = await irys.upload(imageBuffer, {tags});
  console.log(`File uploaded ==> https://gateway.irys.xyz/${response.id}`);
return `https://gateway.irys.xyz/${response.id}`
} catch (e) {
  console.log("Error uploading file ", e);
  return ""
}
}

export async function uploadMetadata(metadata: object, secretKey: number[]): Promise<string>{

const irys = await getIrys(secretKey);



// Add a custom tag that tells the gateway how to serve this file to a browser
const tags = [{ name: "Content-Type", value: "application/json"}];

try {
  const response = await irys.upload(JSON.stringify(metadata), {tags});
  console.log(`File uploaded ==> https://gateway.irys.xyz/${response.id}`);
return `https://gateway.irys.xyz/${response.id}`
} catch (e) {
  console.log("Error uploading file ", e);
  return ""
}
}