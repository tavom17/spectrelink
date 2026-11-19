import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

//to create and retrieve the irys instance attached to the funding keypair secret key, should not fund
//leaving funding to upload segments, as they must use the appropriate price compared to data size for upload
async function getIrys(secretKey: number[]) {
  const irys =  await Uploader(Solana).withWallet(secretKey).withRpc(process.env.HELIUS_RPC_URL!)
  const balance = await irys.getBalance()   
  
  return {instance: irys, balance: balance}
}

export async function uploadImage(imageBuffer: Buffer, mimeType: string, secretKey: number[]): Promise<string> {

const resultGetIrys = (await getIrys(secretKey));
const irys = resultGetIrys.instance;
const balance =resultGetIrys.balance;



// Add a custom tag that tells the gateway how to serve this file to a browser
const tags = [{ name: "Content-Type", value: `${mimeType}`}];

try {
  const cost = await irys.getPrice(imageBuffer.byteLength) //lets get the cost to upload first
  console.log(`Cost to upload image : ${cost}`)

  // user may be using the same funding wallet on launch and has sol leftover
    if(balance < cost){
    console.log(`balance in irys_uploadImage : ${balance}`)
    await irys.fund(cost) //where the blockhash error might comeback from irys's side
    }

  const response = await irys.upload(imageBuffer, {tags});
  console.log(`Image uploaded ==> https://gateway.irys.xyz/${response.id}`);
return `https://gateway.irys.xyz/${response.id}`
} catch (e) {
  console.log("Error uploading file ", e);
  throw new Error(`Irys image upload failed: ${e}`)
}
}

export async function uploadMetadata(metadata: object, secretKey: number[]): Promise<string>{

const resultGetIrys = (await getIrys(secretKey));
const irys = resultGetIrys.instance;
const balance =resultGetIrys.balance;



// Add a custom tag that tells the gateway how to serve this file to a browser
const tags = [{ name: "Content-Type", value: "application/json"}];

try {
  //buffer usage to ensure byte count and not character count
  //can get away with image.bytelength due to it already being a buffer
  const cost = await irys.getPrice(Buffer.byteLength(JSON.stringify(metadata)))
  console.log(`Cost to upload metadata : ${cost}`)

    if(balance < cost){
      console.log(`balance in irys_uploadMetadata : ${balance}`)
      await irys.fund(cost) //where the blockhash error might comeback from irys's side
    }


  const response = await irys.upload(JSON.stringify(metadata), {tags});
  console.log(`File uploaded ==> https://gateway.irys.xyz/${response.id}`);
return `https://gateway.irys.xyz/${response.id}`
} catch (e) {
  console.log("Error uploading file ", e);
  throw new Error(`Irys metadata upload failed: ${e}`)
}
}