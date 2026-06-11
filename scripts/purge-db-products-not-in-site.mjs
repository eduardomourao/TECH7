import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../server/lib/db.js";

const root = process.cwd();
const auditPath = path.join(root, "_validation", "db-products-vs-site.json");
const outDir = path.join(root, "_validation");

if (!fs.existsSync(auditPath)) {
  throw new Error("Auditoria nao encontrada. Rode: node scripts/audit-db-products-against-site.mjs");
}

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const ids = Array.from(new Set((audit.candidates || []).map((item) => String(item.id || "").trim()).filter(Boolean)));

if (!ids.length) {
  console.log(JSON.stringify({ removed: 0, message: "Nenhum candidato para remover." }, null, 2));
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(outDir, `db-products-removed-backup-${timestamp}.json`);
const summaryPath = path.join(outDir, `db-products-removed-summary-${timestamp}.json`);

async function countRef(client, table) {
  try {
    const result = await client.query(`select count(*)::int as total from ${table} where product_id = any($1::text[])`, [ids]);
    return result.rows[0]?.total || 0;
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

const client = await pool.connect();
try {
  await client.query("begin");

  const cartItems = await countRef(client, "cart_items");
  const orderItems = await countRef(client, "order_items");
  if (typeof cartItems !== "number" || typeof orderItems !== "number") {
    throw new Error(`Falha checando referencias: cart_items=${JSON.stringify(cartItems)} order_items=${JSON.stringify(orderItems)}`);
  }
  if (cartItems > 0 || orderItems > 0) {
    throw new Error(`Abortado: existem referencias em cart_items=${cartItems}, order_items=${orderItems}`);
  }

  const before = await client.query("select count(*)::int as total from products");
  const backup = await client.query(
    `
      select *
      from products
      where id = any($1::text[])
      order by section nulls last, brand nulls last, slug nulls last, id
    `,
    [ids]
  );

  fs.writeFileSync(backupPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_audit: path.relative(root, auditPath).replace(/\\/g, "/"),
    total: backup.rows.length,
    rows: backup.rows
  }, null, 2));

  const deleted = await client.query(
    `
      delete from products
      where id = any($1::text[])
      returning id, slug, name, brand, section, price_cents, active
    `,
    [ids]
  );

  const after = await client.query("select count(*)::int as total from products");
  await client.query("commit");

  const bySection = deleted.rows.reduce((acc, item) => {
    const key = item.section || "(sem section)";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    generated_at: new Date().toISOString(),
    source_audit: path.relative(root, auditPath).replace(/\\/g, "/"),
    backup: path.relative(root, backupPath).replace(/\\/g, "/"),
    products_before: before.rows[0]?.total || 0,
    removed: deleted.rows.length,
    products_after: after.rows[0]?.total || 0,
    cart_items_references: cartItems,
    order_items_references: orderItems,
    by_section: bySection,
    removed_ids: deleted.rows.map((item) => item.id)
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
