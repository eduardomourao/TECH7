import pg from "pg";

const { Pool } = pg;

function shouldRejectUnauthorized() {
  if (process.env.PGSSL_REJECT_UNAUTHORIZED) {
    return process.env.PGSSL_REJECT_UNAUTHORIZED !== "false";
  }

  // Supabase pooler can present a CA chain that Node does not trust in some
  // serverless environments. Keep the connection working unless explicitly
  // overridden with PGSSL_REJECT_UNAUTHORIZED=true.
  return !/supabase\.com/i.test(String(process.env.DATABASE_URL || ""));
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: shouldRejectUnauthorized() }
    : undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 5000),
  allowExitOnIdle: true
});
