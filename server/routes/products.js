import express from "express";
import { pool } from "../lib/db.js";

export const router = express.Router();

function normalizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

function productUrlFromRow(row) {
  const section = normalizeSegment(row?.section);
  const brand = normalizeSegment(row?.brand);
  const slug = normalizeSegment(row?.slug);
  const parts = [];

  if (section) parts.push(section);
  if (brand && brand !== "tech7" && brand !== "catalogo") parts.push(brand);
  if (slug) parts.push(slug);

  if (!parts.length) return "";
  return `${parts.join("/")}/index.html`;
}

function mapProduct(row) {
  if (!row) return row;
  return {
    ...row,
    url: productUrlFromRow(row),
    updated_at: row.updated_at || null
  };
}

router.post("/resolve-prices", async (req, res) => {
  const payload = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!payload.length) return res.status(400).json({ error: "items_required" });

  const maxItems = Math.min(payload.length, 200);
  const normalized = payload.slice(0, maxItems).map((item) => {
    const section = normalizeSegment(item?.section || item?.secao);
    const brand = normalizeSegment(item?.brand || item?.marca);
    const slug = normalizeSegment(item?.slug);
    return { section, brand, slug };
  });

  const keys = new Map();
  for (const entry of normalized) {
    if (!entry.slug) continue;
    const key = `${entry.section}|${entry.brand}|${entry.slug}`;
    keys.set(key, entry);
  }

  const candidates = Array.from(keys.values());
  if (!candidates.length) return res.json({ items: normalized.map(() => ({ found: false })) });

  const params = [];
  const clauses = [];
  for (const item of candidates) {
    params.push(item.section, item.brand, item.slug);
    const idx = params.length;
    clauses.push(`(lower(section) = lower($${idx - 2}) and lower(brand) = lower($${idx - 1}) and lower(slug) = lower($${idx}))`);
  }

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, active, updated_at
      from products
      where active = true
        and (${clauses.join(" or ")})
    `,
    params
  );

  const byKey = new Map();
  for (const row of rows) {
    const key = `${normalizeSegment(row.section)}|${normalizeSegment(row.brand)}|${normalizeSegment(row.slug)}`;
    byKey.set(key, row);
  }

  const items = normalized.map((item) => {
    const key = `${item.section}|${item.brand}|${item.slug}`;
    const found = byKey.get(key);
    if (!found) {
      return {
        id: "",
        section: item.section,
        brand: item.brand,
        slug: item.slug,
        price_cents: 0,
        found: false
      };
    }

    return {
      id: found.id,
      section: found.section,
      brand: found.brand,
      slug: found.slug,
      price_cents: Number(found.price_cents || 0),
      image_url: found.image_url || "",
      url: productUrlFromRow(found),
      updated_at: found.updated_at || null,
      found: true
    };
  });

  res.json({ items });
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, active, updated_at
      from products
      where id = $1 and active = true
      limit 1
    `,
    [String(req.params.id || "")]
  );
  if (!rows.length) return res.status(404).json({ error: "product_not_found" });
  res.json(mapProduct(rows[0]));
});

router.get("/", async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 24)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const search = String(req.query.q || "").trim();

  const params = [];
  const filters = ["active = true"];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(name ilike $${params.length} or brand ilike $${params.length} or section ilike $${params.length} or slug ilike $${params.length})`);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, active, updated_at
      from products
      where ${filters.join(" and ")}
      order by updated_at desc nulls last, created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );

  res.json({ items: rows.map(mapProduct), limit, offset });
});

