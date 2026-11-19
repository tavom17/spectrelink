import { Connection } from "@solana/web3.js";

//used inorder to only have one connection instance for any instruction that needs it
//in coin-launcher


export const connection = new Connection(
    process.env.HELIUS_RPC_URL!,'confirmed'
)