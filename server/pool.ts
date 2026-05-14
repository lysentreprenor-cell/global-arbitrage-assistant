import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Missing env: DATABASE_URL");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
