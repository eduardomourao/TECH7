import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { databaseEnvName, databaseUrl, pool } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedSet() {
  const { rows } = await pool.query(`select id from schema_migrations`);
  return new Set(rows.map((r) => r.id));
}

async function run() {
  if (!databaseUrl) {
    throw new Error("A database URL is required for db:migrate");
  }

  await ensureMigrationsTable();
  const applied = await appliedSet();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const id = f;
    if (applied.has(id)) continue;
    const full = path.join(MIGRATIONS_DIR, f);
    const sql = fs.readFileSync(full, "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query(`insert into schema_migrations (id) values ($1)`, [id]);
      await pool.query("commit");
      // eslint-disable-next-line no-console
      console.log("[migrate] applied", id);
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }
  }

  await pool.end();
  // eslint-disable-next-line no-console
  console.log("[migrate] complete", { source: databaseEnvName });
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[migrate] failed", e);
  process.exit(1);
});
