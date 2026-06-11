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

function sanitizeConnectionString(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Let pg SSL be controlled by the explicit ssl object below.
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("supa");
    parsed.searchParams.delete("pgbouncer");
    return parsed.toString();
  } catch {
    return url;
  }
}

function shouldRejectUnauthorized(url) {
  const explicit = String(process.env.PGSSL_REJECT_UNAUTHORIZED || "").trim().toLowerCase();
  if (explicit) {
    return !["false", "0", "no", "off"].includes(explicit);
  }

  // Supabase pooler can present a CA chain that Node does not trust in some
  // serverless environments. Keep the connection working unless explicitly
  // overridden with PGSSL_REJECT_UNAUTHORIZED=true.
  return !/supabase\.com/i.test(String(url || ""));
}

const normalizedDatabaseUrl = sanitizeConnectionString(databaseUrl);

export const pool = new Pool({
  connectionString: normalizedDatabaseUrl || undefined,
  ssl: normalizedDatabaseUrl
    ? { rejectUnauthorized: shouldRejectUnauthorized(normalizedDatabaseUrl) }
    : undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 5000),
  allowExitOnIdle: true
});
