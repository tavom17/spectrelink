import { FastifyInstance } from "fastify";
import pool from "../../../src_2/db";

async function bundleGroupRoutes(fastify: FastifyInstance) {

    // create a group and auto-assign the next N unassigned slave wallets
    fastify.post("/bundleGroups", async (request, reply) => {
        const { user_id, groupName, amountOfWallets } = request.body as {
            user_id: string; groupName: string; amountOfWallets: number;
        };

        if (!user_id || !groupName?.trim() || !amountOfWallets) {
            return reply.status(400).send({
                error: 'INVALID_REQUEST',
                message: 'user_id, groupName and amountOfWallets are required'
            });
        }
        if (amountOfWallets < 1 || amountOfWallets > 25) {
            return reply.status(400).send({
                error: 'INVALID_GROUP_SIZE',
                message: 'group size must be between 1 and 25'
            });
        }

        try {
            const group = await createBundleGroup(user_id, groupName.trim(), amountOfWallets);
            return reply.status(201).send(group);
        } catch (err: any) {
            if (err.code === '23505') {
                return reply.status(409).send({
                    error: 'GROUP_NAME_TAKEN',
                    message: `a group named "${groupName}" already exists`
                });
            }
            if (err.code === 'NOT_ENOUGH_WALLETS') {
                return reply.status(409).send({ error: err.code, message: err.message });
            }
            request.log.error({ err, user_id }, 'createBundleGroup failed');
            return reply.status(500).send({ error: 'INTERNAL_ERROR' });
        }
    });

    // list groups with member counts
    fastify.get("/bundleGroups", async (request, reply) => {
        const { user_id } = request.query as { user_id: string };
        if (!user_id) {
            return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'user_id required' });
        }
        try {
            return reply.status(200).send({ groups: await listBundleGroups(user_id) });
        } catch (err) {
            request.log.error({ err, user_id }, 'listBundleGroups failed');
            return reply.status(500).send({ error: 'INTERNAL_ERROR' });
        }
    });

    // one group with its member pubkeys in position order
    fastify.get("/bundleGroups/:groupId", async (request, reply) => {
        const { groupId } = request.params as { groupId: string };
        const { user_id } = request.query as { user_id: string };
        if (!user_id) {
            return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'user_id required' });
        }
        try {
            const group = await getBundleGroup(user_id, groupId);
            if (group === null) {
                return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
            }
            return reply.status(200).send(group);
        } catch (err) {
            request.log.error({ err, groupId }, 'getBundleGroup failed');
            return reply.status(500).send({ error: 'INTERNAL_ERROR' });
        }
    });

    // liquidity-manager calls this before planning — are these pubkeys in this group?
    fastify.post("/bundleGroups/:groupId/validate", async (request, reply) => {
        const { groupId } = request.params as { groupId: string };
        const { user_id, pubKeys } = request.body as { user_id: string; pubKeys: string[] };

        if (!user_id || !Array.isArray(pubKeys) || pubKeys.length === 0) {
            return reply.status(400).send({
                error: 'INVALID_REQUEST',
                message: 'user_id and pubKeys[] are required'
            });
        }
        try {
            const missing = await validateGroupMembers(user_id, groupId, pubKeys);
            if (missing.length > 0) {
                return reply.status(403).send({
                    error: 'NOT_GROUP_MEMBERS',
                    message: `not members of this group: ${missing.join(', ')}`,
                    missing
                });
            }
            return reply.status(200).send({ valid: true, count: pubKeys.length });
        } catch (err) {
            request.log.error({ err, groupId }, 'validateGroupMembers failed');
            return reply.status(500).send({ error: 'INTERNAL_ERROR' });
        }
    });

    // deleting a group releases its wallets back to unassigned
    fastify.delete("/bundleGroups/:groupId", async (request, reply) => {
        const { groupId } = request.params as { groupId: string };
        const { user_id } = request.body as { user_id: string };
        if (!user_id) {
            return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'user_id required' });
        }
        try {
            const deleted = await deleteBundleGroup(user_id, groupId);
            if (!deleted) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
            return reply.status(200).send({ deleted: true, groupId });
        } catch (err) {
            request.log.error({ err, groupId }, 'deleteBundleGroup failed');
            return reply.status(500).send({ error: 'INTERNAL_ERROR' });
        }
    });
}


async function createBundleGroup(userId: string, groupName: string, amount: number) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const group = await client.query(
            `INSERT INTO tb_bundle_groups (user_id, group_name)
             VALUES ($1, $2)
             RETURNING group_id, group_name, created_at`,
            [userId, groupName]
        );
        const groupId = group.rows[0].group_id;

        // pull the next N unassigned slave wallets.
        // FOR UPDATE SKIP LOCKED prevents two concurrent creates grabbing the same rows.
        const free = await client.query(
            `SELECT wallet_id, public_key FROM tb_wallets w
              WHERE w.user_id = $1
                AND w.wallet_type = 'slave'
                AND NOT EXISTS (
                    SELECT 1 FROM tb_bundle_group_members m WHERE m.wallet_id = w.wallet_id
                )
              ORDER BY w.wallet_index
              LIMIT $2
              FOR UPDATE SKIP LOCKED`,
            [userId, amount]
        );

        if (free.rowCount !== amount) {
            const err: any = new Error(
                `requested ${amount} wallets, only ${free.rowCount} unassigned slave wallets available`
            );
            err.code = 'NOT_ENOUGH_WALLETS';
            throw err;
        }

        for (let i = 0; i < free.rows.length; i++) {
            await client.query(
                `INSERT INTO tb_bundle_group_members (group_id, wallet_id, position)
                 VALUES ($1, $2, $3)`,
                [groupId, free.rows[i].wallet_id, i]
            );
        }

        await client.query('COMMIT');
        return {
            groupId,
            groupName: group.rows[0].group_name,
            createdAt: group.rows[0].created_at,
            memberCount: free.rowCount,
            members: free.rows.map(r => r.public_key),
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function listBundleGroups(userId: string) {
    const result = await pool.query(
        `SELECT g.group_id, g.group_name, g.created_at,
                COUNT(m.member_id)::int AS member_count
           FROM tb_bundle_groups g
           LEFT JOIN tb_bundle_group_members m ON m.group_id = g.group_id
          WHERE g.user_id = $1
          GROUP BY g.group_id
          ORDER BY g.created_at DESC`,
        [userId]
    );
    return result.rows;
}

async function getBundleGroup(userId: string, groupId: string) {
    const result = await pool.query(
        `SELECT g.group_id, g.group_name, g.created_at,
                w.public_key, m.position
           FROM tb_bundle_groups g
           LEFT JOIN tb_bundle_group_members m ON m.group_id = g.group_id
           LEFT JOIN tb_wallets w ON w.wallet_id = m.wallet_id
          WHERE g.group_id = $1 AND g.user_id = $2
          ORDER BY m.position`,
        [groupId, userId]
    );

    if (result.rowCount === 0) return null;

    return {
        groupId:   result.rows[0].group_id,
        groupName: result.rows[0].group_name,
        createdAt: result.rows[0].created_at,
        members:   result.rows
                     .filter(r => r.public_key !== null)
                     .map(r => ({ publicKey: r.public_key, position: r.position })),
    };
}

/** Returns the pubkeys that are NOT members. Empty array means all valid. */
async function validateGroupMembers(userId: string, groupId: string, pubKeys: string[]) {
    const result = await pool.query(
        `SELECT w.public_key
           FROM tb_bundle_group_members m
           JOIN tb_wallets w        ON w.wallet_id = m.wallet_id
           JOIN tb_bundle_groups g  ON g.group_id  = m.group_id
          WHERE m.group_id = $1
            AND g.user_id  = $2
            AND w.public_key = ANY($3::text[])`,
        [groupId, userId, pubKeys]
    );
    const found = new Set(result.rows.map(r => r.public_key));
    return pubKeys.filter(p => !found.has(p));
}

async function deleteBundleGroup(userId: string, groupId: string) {
    const result = await pool.query(
        `DELETE FROM tb_bundle_groups WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
    );
    return (result.rowCount ?? 0) > 0;
}

export default bundleGroupRoutes;