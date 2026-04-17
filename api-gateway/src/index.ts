import Fastify from "fastify"
import pool from "./db"
import redis from "./redis"
import { loginRoute } from "./routes/auth/login"
import { register } from "./routes/auth/registration"
import authenticate from "./middleware/auth"
import { walletForward } from "./routes/api/walletRouter"
import cookie from "@fastify/cookie"
import { refreshToken } from "./routes/auth/refresh"

const fastify = Fastify({ logger: true })




fastify.get("/health", async () => {
  return { status: "ok" }
})


fastify.register(cookie)
fastify.register(loginRoute, { prefix: "/auth" })
fastify.register(register, { prefix: "/auth" })
fastify.register(refreshToken, { prefix: "/auth" })
// protected routes — auth required
fastify.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authenticate)
    protectedApp.register(walletForward, {prefix: "/wallets"})
}, { prefix: "/api" })

const start = async () => {

  try{
//test connection to db container
  await pool.query("SELECT 1")
  fastify.log.info("Postgres connected")
//test connection to redis container
  await redis.ping()
  fastify.log.info("Redis connected")
//start listening if above are all good
  await fastify.listen({ port: 3001, host: "0.0.0.0" })
  }
  catch(err){
    fastify.log.error(err)
    process.exit(1)
  }
}

start()