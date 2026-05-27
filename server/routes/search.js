import express from "express";
import { databaseUrl, pool } from "../lib/db.js";
import { applyCatalogPrices } from "../lib/prices.js";
import { productUrlFromRow } from "../lib/product-url.js";
import { addSectionWhere, orderSqlForSort, resolveSectionFilterValues } from "../lib/product-filters.js";
import { normalizePublicImageUrl } from "../lib/images.js";

export const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireDatabase(res) {
  if (databaseUrl) return true;
  res.status(503).json({ error: "database_not_configured" });
  return false;
}

function parseOptionalPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

router.get("/", asyncRoute(async (req, res) => {
  if (!requireDatabase(res)) return;

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
  const minPrice = parseOptionalPrice(req.query.minPrice ?? req.query.min_price ?? req.query.preco_min);
  const maxPrice = parseOptionalPrice(req.query.maxPrice ?? req.query.max_price ?? req.query.preco_max);
  const sort = String(req.query.sort || req.query.order || "").trim();
  const words = q.split(/\s+/).filter(Boolean).slice(0, 10);
  const priceFilterActive = (minPrice !== null && minPrice >= 0) || (maxPrice !== null && maxPrice >= 0);

  const filters = ["active = true"];
  const params = [];

  if (brand) {
    params.push(brand);
    filters.push(`lower(brand) = lower($${params.length})`);
  }

  const sectionValues = addSectionWhere(filters, params, category);

  if (priceFilterActive) {
    filters.push("price_cents >= 200");
  }

  if (minPrice !== null && minPrice >= 0) {
    params.push(Math.round(minPrice * 100));
    filters.push(`price_cents >= $${params.length}`);
  }

  if (maxPrice !== null && maxPrice >= 0) {
    params.push(Math.round(maxPrice * 100));
    filters.push(`price_cents <= $${params.length}`);
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

  const facetsRes = await pool.query(
    `
      select lower(brand) as value, min(brand) as label, count(*)::int as total
      from products
      where ${whereSql} and coalesce(brand, '') <> ''
      group by lower(brand)
      order by total desc, label asc
      limit 100
    `,
    params
  );

  const priceRangeRes = await pool.query(
    `
      select min(price_cents)::int as min_price_cents, max(price_cents)::int as max_price_cents
      from products
      where ${whereSql} and price_cents > 0
    `,
    params
  );

  params.push(limit, offset);
  const rowsRes = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, updated_at
      from products
      where ${whereSql}
      order by ${orderSqlForSort(sort)}
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
    image: normalizePublicImageUrl(row.image_url),
    image_url: normalizePublicImageUrl(row.image_url),
    url: productUrlFromRow(row),
    updated_at: row.updated_at || null
  }));

  res.json({
    q,
    brand: brand || null,
    category: category || null,
    sections: category ? (sectionValues.length ? sectionValues : resolveSectionFilterValues(category)) : [],
    count: countRes.rows[0]?.total || 0,
    limit,
    offset,
    facets: {
      brands: facetsRes.rows,
      price: priceRangeRes.rows[0] || { min_price_cents: null, max_price_cents: null }
    },
    items
  });
}));
