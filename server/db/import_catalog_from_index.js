import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl, pool } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.resolve(__dirname, "../../_assets/tech7/search-index.json");

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function toSlugFromUrl(url) {
  const clean = String(url || "").replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);
  const tail = parts[parts.length - 1] || "";
  return tail === "index.html" ? (parts[parts.length - 2] || "") : tail;
}

function toSectionFromUrl(url, fallback) {
  const clean = String(url || "").replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);
  return parts[0] || fallback || "catalogo";
}

async function run() {
  if (!databaseUrl) throw new Error("A database URL is required for catalog import");

  const raw = await fs.readFile(INDEX_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  const rows = [];
  let skipped = 0;
  for (const item of items) {
    const name = String(item?.title || "").trim();
    if (!name || name === "[nome_produto]") {
      skipped += 1;
      continue;
    }
    const slug = normalizeId(item.slug || toSlugFromUrl(item.url));
    const section = normalizeId(toSectionFromUrl(item.url, item.category));
    const brand = normalizeId(item.brand || "tech7");
    if (!slug) {
      skipped += 1;
      continue;
    }
    const id = normalizeId(`${section}-${brand}-${slug}`) || normalizeId(`prod-${rows.length + 1}`);
    rows.push({
      id,
      slug,
      name,
      brand: brand || "tech7",
      section: section || "catalogo",
      price_cents: 0,
      image_url: String(item.image || "").trim() || null
    });
  }

  const chunkSize = 50;
  let imported = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const placeholders = chunk.map((r, idx) => {
      const base = idx * 7;
      values.push(r.id, r.slug, r.name, r.brand, r.section, r.price_cents, r.image_url);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'BRL', $${base + 7}, true)`;
    });

    await pool.query(
      `
      insert into products (id, slug, name, brand, section, price_cents, currency, image_url, active)
      values ${placeholders.join(",")}
      on conflict (id) do update set
        slug = excluded.slug,
        name = excluded.name,
        brand = excluded.brand,
        section = excluded.section,
        image_url = excluded.image_url,
        active = true,
        updated_at = now()
      `,
      values
    );

    imported += chunk.length;
    if (imported % 1000 === 0) console.log(JSON.stringify({ progress: imported }));
  }

  await pool.end();

  console.log(JSON.stringify({ ok: true, imported, skipped, total: items.length }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
