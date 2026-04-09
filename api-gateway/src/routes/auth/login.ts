import { FastifyInstance } from "fastify"
import pool from "../../db"
import bcrypt from "bcrypt"
import * as jwt from "jsonwebtoken"
//maintain user structure, especially for querying db
interface user {
  user_id: string
  user_email: string
  user_password_hash: string
}

export async function loginRoute(fastify: FastifyInstance) {
  fastify.post("/login", async (request, reply) => {
    const { user_email, password } = request.body as { user_email: string, password: string }

    try {
      const dbQuery = await pool.query<user>('select user_id,user_email, user_password_hash from tb_users where user_email = $1', [user_email])

      if (!dbQuery.rowCount || dbQuery.rowCount === 0) {
        return reply.status(401).send({ error: "Invalid credentials" })
      }

      const passwordHash = dbQuery.rows[0]?.user_password_hash

      const valid = await bcrypt.compare(password, passwordHash || 'nope')

      if (!valid) {
        return reply.status(401).send({ error: "Invalid credentials" })
      }

      //extract info for jwt token now that password hash is valid
      //already have user_email from request body
      const user_id = dbQuery.rows[0]?.user_id;      
    
      // access token — short lived, used for API requests
const accessToken = jwt.sign(
    { user_id, user_email },      // payload
    process.env.JWT_ACCESS_SECRET!,  // secret
    { expiresIn: '15m' }    // options
)

// refresh token — long lived, used to get new access tokens
const refreshToken = jwt.sign(
    { user_id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
)
      return reply.send({ accessToken, refreshToken })
    } catch (err) {
      fastify.log.error(err)
      return reply.status(500).send({ error: "Internal server error" })
    }
  })
}