import { Connection } from "@solana/web3.js";

//one shared RPC connection for the whole service — never construct inside functions
export const connection = new Connection(process.env.HELIUS_RPC_URL!, "confirmed");