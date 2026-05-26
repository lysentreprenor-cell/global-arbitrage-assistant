import { Pool } from "pg";

let pool: Pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  console.warn("[pool] DATABASE_URL not set — database features disabled");
  pool = new Pool(); // will fail on first query, caught by callers
}

export { pool };
