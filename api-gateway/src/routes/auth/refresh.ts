import { FastifyInstance } from "fastify";
import * as jwt from "jsonwebtoken"


export async function refreshToken(fastify: FastifyInstance){
  fastify.post("/refreshToken", async (request, reply) => {

    const token = request.cookies.refreshToken;

    if (!token) 
    return reply.status(401).send({ error: "No refresh token" })

try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as { user_id: string,user_email: string }
    const accessToken = jwt.sign(
        { user_id: decoded.user_id },
        process.env.JWT_ACCESS_SECRET!,
        { expiresIn: '15m' }
    )
    return reply.status(200).send({ accessToken })
} catch (err) {
    return reply.status(401).send({ error: "Invalid or expired refresh token" })
}
})

}