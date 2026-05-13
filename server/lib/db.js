import pg from "pg";

const { Pool } = pg;

const DATABASE_ENV_CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL"
];

function resolveDatabaseConfig() {
  for (const name of DATABASE_ENV_CANDIDATES) {
    const value = String(process.env[name] || "").trim();
    if (value) return { name, url: value };
  }
  return { name: "", url: "" };
}

export const databaseConfig = resolveDatabaseConfig();
export const databaseUrl = databaseConfig.url;
export const databaseEnvName = databaseConfig.name;

function shouldRejectUnauthorized(url) {
  if (process.env.PGSSL_REJECT_UNAUTHORIZED) {
    return process.env.PGSSL_REJECT_UNAUTHORIZED !== "false";
  }

  // Supabase pooler can present a CA chain that Node does not trust in some
  // serverless environments. Keep the connection working unless explicitly
  // overridden with PGSSL_REJECT_UNAUTHORIZED=true.
  return !/supabase\.com/i.test(String(url || ""));
}

export const pool = new Pool({
  connectionString: databaseUrl || undefined,
  ssl: databaseUrl
    ? { rejectUnauthorized: shouldRejectUnauthorized(databaseUrl) }
    : undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 5000),
  allowExitOnIdle: true
});
