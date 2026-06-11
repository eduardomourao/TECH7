import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../server/lib/db.js";

const root = process.cwd();
const sourcePath = path.join(root, "_validation", "db-unavailable-site-products.json");
const outputDir = path.join(root, "_validation");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(outputDir, `db-unavailable-products-backup-${stamp}.json`);
const summaryPath = path.join(outputDir, `db-unavailable-products-purge-summary-${stamp}.json`);

if (!fs.existsSync(sourcePath)) {
  throw new Error("Relatorio _validation/db-unavailable-site-products.json nao encontrado. Rode scripts/audit-db-unavailable-site-products.mjs primeiro.");
}

const report = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const candidates = Array.isArray(report.unavailable) ? report.unavailable : [];
const ids = [...new Set(candidates.map((item) => String(item.id || "").trim()).filter(Boolean))];

if (!ids.length) {
  console.log(JSON.stringify({ removed: 0, reason: "sem candidatos indisponiveis" }, null, 2));
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  const { rows: cartRefs } = await client.query(
    `select product_id, count(*)::int total from cart_items where product_id = any($1::text[]) group by product_id`,
    [ids]
  );
  const { rows: orderRefs } = await client.query(
    `select product_id, count(*)::int total from order_items where product_id = any($1::text[]) group by product_id`,
    [ids]
  );
  if (cartRefs.length || orderRefs.length) {
    throw new Error(`Abortado: candidatos referenciados por cart/order. cart=${cartRefs.length} order=${orderRefs.length}`);
  }

  const { rows: backupRows } = await client.query(
    `select * from products where id = any($1::text[]) order by section nulls last, brand nulls last, slug nulls last, id`,
    [ids]
  );
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_report: path.relative(root, sourcePath).replace(/\\/g, "/"),
    count: backupRows.length,
    rows: backupRows
  }, null, 2));

  await client.query("begin");
  const before = await client.query(`select count(*)::int total from products`);
  const deleted = await client.query(`delete from products where id = any($1::text[]) returning id, section, brand, slug, name`, [ids]);
  const after = await client.query(`select count(*)::int total from products`);
  await client.query("commit");

  const bySection = {};
  const byBrand = {};
  for (const row of deleted.rows) {
    bySection[row.section || ""] = (bySection[row.section || ""] || 0) + 1;
    const brandKey = `${row.section || ""}|${row.brand || ""}`;
    byBrand[brandKey] = (byBrand[brandKey] || 0) + 1;
  }

  const summary = {
    generated_at: new Date().toISOString(),
    source_report: path.relative(root, sourcePath).replace(/\\/g, "/"),
    backup: path.relative(root, backupPath).replace(/\\/g, "/"),
    products_before: before.rows[0].total,
    removed: deleted.rowCount,
    products_after: after.rows[0].total,
    cart_items_references: cartRefs.length,
    order_items_references: orderRefs.length,
    bySection,
    byBrand
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
