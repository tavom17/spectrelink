import { FastifyInstance } from "fastify";
import * as wallet from "./../../wallet";

//function to list wallets, request should contain user_id
//will have been validated through middleware as well
export async function listWallets(fastify: FastifyInstance){
      fastify.get("/listWallets", async (request, reply) => {
        const user_id = request.body as {user_id: string}
        
})

}

//function to create slave wallets, request should contain how many slaves required
export async function slaveWallets(fastify: FastifyInstance){
      fastify.post("/slaveWallets", async (request, reply) => {

})

}

export async function fundingWallets(fastify: FastifyInstance){
      fastify.post("/fundingWallets", async (request, reply) => {

})

}

export async function feeWallets(fastify: FastifyInstance){
      fastify.post("/feeWallets", async (request, reply) => {

})

}