import { Pool } from "pg"
import fs from "fs"

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync(process.env.DB_SSL_CA_PATH as string, "utf8"),
    rejectUnauthorized: true,
  },
})

pool.on("error", (err) => {
  console.error("Postgres pool error:", err)
  process.exit(1)
})

// Retries the initial connection with exponential backoff. Covers the case
// where this container starts before the DB is reachable (network blip, DNS
// not yet resolved, DO maintenance window) rather than failing immediately.
async function connectWithRetry(maxAttempts = 5, baseDelayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect()
      client.release()
      console.log("Postgres connected")
      return
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`Postgres connection failed after ${maxAttempts} attempts:`, err)
        throw err
      }
      const delay = baseDelayMs * 2 ** (attempt - 1)
      console.warn(`Postgres connection attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

connectWithRetry().catch(() => process.exit(1))

export default pool