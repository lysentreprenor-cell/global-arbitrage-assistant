import { Pool } from "pg";

let pool: Pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Prevent idle connections from crashing the process
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
} else {
  console.warn("[pool] DATABASE_URL not set — database features disabled");
  pool = new Pool();
}

// CRITICAL: must attach error handler to prevent uncaught exception crashes.
// pg emits 'error' on idle clients when the DB drops/resets the connection —
// without this listener Node.js treats it as an uncaught exception and exits.
pool.on("error", (err) => {
  console.error("[pool] Idle client error (non-fatal):", err.message);
});

export { pool };
