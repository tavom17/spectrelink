import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt"
import pool from "../../db";

export async function register(fastify: FastifyInstance) {
  fastify.post("/register", async (request, reply) => {
    //fastify requires interface for request body, using typescript type assertion for now
    //later we can update to fastify preferred, leads to json schema validation before it even touches this function...pretty cool
    const { user_email, user_pass, registration_secret } = request.body as { user_email: string, user_pass: string, registration_secret: string }
    
    if (registration_secret !== process.env.REGISTRATION_SECRET) {
    return reply.status(403).send({ error: "Invalid registration secret" })
      }    

try {
      const dbResponse = await pool.query(
        `SELECT user_email FROM tb_users WHERE user_email = $1`, 
        [user_email]
      )

      if (!dbResponse || dbResponse.rowCount === 0) {
        const passwordHash = await bcrypt.hash(user_pass, 12)

        const insertData = await pool.query(
          `INSERT INTO tb_users (user_email, user_password_hash) 
           VALUES ($1, $2) RETURNING user_id`,
          [user_email, passwordHash]
        )

        const userID = insertData.rows[0].user_id

        const response = await fetch("http://wallet-app:3003/internal/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userID })
        })

        if (!response.ok) throw new Error("Wallet service failed")

        const walletData = await response.json() as { seedPhrase: string }
        return reply.status(201).send({ message: "User registered", seedPhrase: walletData.seedPhrase })

      } else {
        return reply.status(409).send({ error: "Email already exists" })
      }

    } catch (err) {
      fastify.log.error(err)
      return reply.status(500).send({ error: "Internal server error" })
    }
  })
}