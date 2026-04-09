import { FastifyInstance } from "fastify"
import pool from "../../db"
import bcrypt from "bcrypt"

interface user {
  user_email: string
  user_password_hash: string
}

export async function loginRoute(fastify: FastifyInstance) {
  fastify.post("/login", async (request, reply) => {
    const { username, password } = request.body as { username: string, password: string }

    try {
      const dbQuery = await pool.query<user>('select user_email, user_password_hash from tb_users where user_email = $1', [username])

      if (!dbQuery.rowCount || dbQuery.rowCount === 0) {
        return reply.status(401).send({ error: "Invalid credentials" })
      }

      const passwordHash = dbQuery.rows[0]?.user_password_hash

      const valid = await bcrypt.compare(password, passwordHash || 'nope')

      if (!valid) {
        return reply.status(401).send({ error: "Invalid credentials" })
      }

      return reply.send({ accessToken: "mock-token-for-now" })
    } catch (err) {
      fastify.log.error(err)
      return reply.status(500).send({ error: "Internal server error" })
    }
  })
}