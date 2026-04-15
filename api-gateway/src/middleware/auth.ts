import { FastifyRequest, FastifyReply } from "fastify"
import * as jwt from "jsonwebtoken"

//fastify needs to "augment" the request type to add custom properties
//which is why we need this module and interface
declare module "fastify" {
    interface FastifyRequest {
        user: {
            user_id: string
            user_email: string
        }
    }
}

export default async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    const authToken = request.headers.authorization;  
    if(!authToken){
        return reply.status(401).send({ error: "No valid token" })
    }   
    //this is sick, authtoken is "bearer <token>" so split and take index 1 = token only
    const token = authToken.split(" ")[1];
    if (!token) {
        return reply.status(401).send({ error: "Invalid authorization format" })
    }

    try {
        //jwt.verify, if valid returns decoded jwt, which contains full token
        //if valid, then we can send back the user field, which peep the module
        // and interface at the top, user_id and user_email for the routes to use
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as { user_id: string, user_email: string }
        request.user = decoded
    } catch (error) {
        return reply.status(401).send({ error: "Invalid or expired token" })
    }
}