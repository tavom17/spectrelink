import Fastify from "fastify"
import pool from "./db"
import redis from "./redis"
import { loginRoute } from "./routes/auth/login"
import { register } from "./routes/auth/registration"


const fastify = Fastify({ logger: true })




fastify.get("/health", async () => {
  return { status: "ok" }
})



fastify.register(loginRoute, { prefix: "/auth" })
fastify.register(register, { prefix: "/auth" })

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