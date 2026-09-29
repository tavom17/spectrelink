import { FastifyInstance } from "fastify";

// bundleRoute.ts — orchestration only, no logic

async function bundleRoutes(fastify: FastifyInstance) {

    fastify.post("/distribute", async (request, reply) => {
        const { user_id, group_id, fundingPubKey, totalSol, skewPct } = 
        request.body as {user_id: string, group_id: string, fundingPubKey: string, totalSol: number, skewPct: BigInt}

        // 1. validate targets are members of this group
        // 2. fetch on-chain state for targets (one getMultipleAccounts)
        // 3. plan
        // 4. persist plan
        // 5. build → sign → send
        // 6. return legs
    });

    fastify.post("/buy", async (request, reply) => {
        // same shape, buy path
    });
}