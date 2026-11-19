import pino from "pino";

//same JSON log format as Fastify's — worker lines sit next to request lines in docker logs
export const logger = pino({ name: "coin-launcher" });