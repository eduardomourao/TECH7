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

  const slugs = Array.from(
    new Set(
      normalized
        .map((entry) => entry.slug)
        .filter(Boolean)
    )
  );
  if (!slugs.length) return res.json({ items: normalized.map(() => ({ found: false })) });

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, active, updated_at
      from products
      where active = true
        and lower(slug) = any($1::text[])
      order by updated_at desc nulls last, created_at desc
    `,
    [slugs]
  );

  const bySlug = new Map();
  for (const row of rows) {
    const slug = normalizeSegment(row.slug);
    const bucket = bySlug.get(slug) || [];
    bucket.push(row);
    bySlug.set(slug, bucket);
  }

  const items = normalized.map((item) => {
    const options = bySlug.get(item.slug) || [];
    let found = null;
    let bestScore = -1;
    for (const candidate of options) {
      const section = normalizeSegment(candidate.section);
      const brand = normalizeSegment(candidate.brand);
      let score = 0;
      if (item.section && section === item.section) score += 4;
      if (item.brand && brand === item.brand) score += 2;
      if (!item.section) score += 1;
      if (!item.brand) score += 1;
      if (score > bestScore) {
        bestScore = score;
        found = candidate;
      }
    }

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

