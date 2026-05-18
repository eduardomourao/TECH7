import express from "express";
import { pool } from "../lib/db.js";
import { applyCatalogPrices } from "../lib/prices.js";

export const router = express.Router();

function normalizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

function productUrlFromDb(product) {
  const section = normalizeSegment(product?.section);
  const brand = normalizeSegment(product?.brand);
  const slug = normalizeSegment(product?.slug);
  const parts = [];

  if (section) parts.push(section);
  if (brand && brand !== "tech7" && brand !== "catalogo") parts.push(brand);
  if (slug) parts.push(slug);

  if (!parts.length) return "";
  return `${parts.join("/")}/index.html`;
}

router.get("/", async (req, res) => {
  const q = String(req.query.q || req.query.palavra_busca || req.query.t || "").trim();
  const brand = String(req.query.brand || req.query.marca || req.query.filtrar_marca || "").trim();
  const category = String(
    req.query.category
      || req.query.categoria
      || req.query.filtrar_departamento
      || req.query.departamento
      || ""
  ).trim();
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 48)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const words = q.split(/\s+/).filter(Boolean).slice(0, 10);

  const filters = ["active = true"];
  const params = [];

  if (brand) {
    params.push(brand);
    filters.push(`lower(brand) = lower($${params.length})`);
  }

  if (category) {
    params.push(category);
    filters.push(`lower(section) = lower($${params.length})`);
  }

  for (const word of words) {
    params.push(`%${word}%`);
    const idx = params.length;
    filters.push(
      `(name ilike $${idx} or brand ilike $${idx} or section ilike $${idx} or slug ilike $${idx})`
    );
  }

  const whereSql = filters.join(" and ");
  const countRes = await pool.query(
    `select count(*)::int as total from products where ${whereSql}`,
    params
  );

  params.push(limit, offset);
  const rowsRes = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, updated_at
      from products
      where ${whereSql}
      order by updated_at desc nulls last, created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );

  const pricedRows = await applyCatalogPrices(rowsRes.rows);
  const items = pricedRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.name,
    name: row.name,
    description: null,
    brand: row.brand,
    category: row.section,
    section: row.section,
    price_cents: Number(row.price_cents || 0),
    price_available: !!row.price_available,
    price_status: row.price_status || "consult",
    image: row.image_url || "",
    image_url: row.image_url || "",
    url: productUrlFromDb(row),
    updated_at: row.updated_at || null
  }));

  res.json({
    q,
    brand: brand || null,
    category: category || null,
    count: countRes.rows[0]?.total || 0,
    limit,
    offset,
    items
  });
});
