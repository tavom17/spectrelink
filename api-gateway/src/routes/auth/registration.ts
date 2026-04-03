import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt"
import pool from "../../db";



export async function register(fastify: FastifyInstance){
  fastify.post("/register", async (request, reply) => {
    //fastify requires interface for request body, using typescript type assertion for now
    //later we can update to fastify preferred, leads to json schema validation before it even touches this function...pretty cool
    const { user_email, user_pass } = request.body as { user_email: string, user_pass: string }

try{
    let dbResponse = await pool.query(
        `SELECT user_email FROM tb_users 
        WHERE user_email = $1`, [user_email]
    )

    if(dbResponse.rowCount === 0){
        //need to register, email doesnt exist
        let passwordHash = await bcrypt.hash(user_pass, 12);

        //let default values get inserted into db
        await pool.query( `
        INSERT INTO tb_users (user_email, user_password_hash) 
        VALUES ($1, $2)`, [user_email, passwordHash])

        return reply.status(201).send({Success: "User registered"})
    }
    else{
        return reply.status(409).send({ error: "Email already exists"}) 
        }}catch(err){
            fastify.log.error(err)
            reply.status(500).send({Error: "Internal server error"})
        }
  })
}