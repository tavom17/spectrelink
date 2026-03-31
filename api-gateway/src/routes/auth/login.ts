import { FastifyInstance } from "fastify"
import bcrypt from "bcrypt"

let MOCK_USER: { username: string, password_hash: string }

bcrypt.hash("examplePassword", 12).then((hash) => {
  MOCK_USER = {
    username: "exampleUser",
    password_hash: hash
  }
})

export async function loginRoute(fastify: FastifyInstance) {
  fastify.post("/auth/login", async (request, reply) => {
    const { username, password } = request.body as { username: string, password: string }

    if (username !== MOCK_USER.username) {
      return reply.status(401).send({ error: "Invalid credentials" })
    }

    const valid = await bcrypt.compare(password, MOCK_USER.password_hash)

    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" })
    }

    return reply.send({ accessToken: "mock-token-for-now" })
  })
}