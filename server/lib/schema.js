import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl, pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "../db/migrations");

let schemaPromise = null;

async function ensureMigrationsTable() {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function applyMigrations() {
  if (!databaseUrl) return;

  await ensureMigrationsTable();
  const applied = await pool.query(`select id from schema_migrations`);
  const appliedIds = new Set(applied.rows.map((row) => row.id));

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedIds.has(file)) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query(`insert into schema_migrations (id) values ($1)`, [file]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
}

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = applyMigrations().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
