import express from "express";
import { databaseUrl, pool } from "../lib/db.js";
import { applyCatalogPrice, applyCatalogPrices, resolveCatalogPrice } from "../lib/prices.js";
import { normalizeProductSegment, productUrlFromRow } from "../lib/product-url.js";
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

function mapProduct(row) {
  if (!row) return row;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const images = Array.isArray(metadata.images)
    ? metadata.images.map((url) => normalizePublicImageUrl(url)).filter(Boolean)
    : [];
  const primary = normalizePublicImageUrl(row.primary_image_url || row.image_url);
  const imageList = primary ? [primary, ...images.filter((url) => url !== primary)] : images;
  return {
    ...row,
    image_url: imageList[0] || "",
    primary_image_url: imageList[0] || "",
    image: imageList[0] || "",
    images: imageList,
    description: row.description_text || null,
    description_text: row.description_text || null,
    description_html: row.description_html || null,
    stock: row.stock ?? null,
    url: productUrlFromRow(row),
    updated_at: row.updated_at || null
  };
}

function parseOptionalPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(sql, params, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await wait(150 * attempt);
    }
  }
  throw lastError;
}

async function mapProductWithCatalogPrice(row) {
  return mapProduct(await applyCatalogPrice(row));
}

router.get([
  "/shipping",
  "/payment-options",
  "/payment-options-details",
  "/variant-price",
  "/variant-reference",
  "/variant-form",
  "/load-next-variant-dropdown",
  "/question",
  "/unavailable-let-me-know",
  "/add-comment"
], (_req, res) => {
  res.type("html").send("");
});

router.get("/variant-gallery", (_req, res) => {
  res.json([]);
});

router.post("/resolve-prices", asyncRoute(async (req, res) => {
  if (!requireDatabase(res)) return;

  const payload = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!payload.length) return res.status(400).json({ error: "items_required" });

  const maxItems = Math.min(payload.length, 200);
  const normalized = payload.slice(0, maxItems).map((item) => {
    const id = String(item?.id || item?.productId || item?.IdProd || "").trim();
    const section = normalizeProductSegment(item?.section || item?.secao);
    const brand = normalizeProductSegment(item?.brand || item?.marca);
    const slug = normalizeProductSegment(item?.slug);
    return { id, section, brand, slug };
  });

  const ids = Array.from(new Set(normalized.map((entry) => entry.id).filter(Boolean)));
  const slugs = Array.from(
    new Set(
      normalized
        .map((entry) => entry.slug)
        .filter(Boolean)
    )
  );
  if (!ids.length && !slugs.length) return res.json({ items: normalized.map(() => ({ found: false })) });

  const { rows } = await queryWithRetry(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
             active, is_active, description_text, description_html, stock, metadata, updated_at
      from products
      where active = true
        and coalesce(is_active, true) = true
        and (
          id = any($1::text[])
          or lower(slug) = any($2::text[])
        )
      order by updated_at desc nulls last, created_at desc
    `,
    [ids, slugs]
  );

  const byId = new Map();
  const bySlug = new Map();
  for (const row of rows) {
    byId.set(String(row.id || ""), row);
    const slug = normalizeProductSegment(row.slug);
    const bucket = bySlug.get(slug) || [];
    bucket.push(row);
    bySlug.set(slug, bucket);
  }

  const items = normalized.map(async (item) => {
    const direct = item.id ? byId.get(item.id) : null;
    const options = direct ? [direct] : (bySlug.get(item.slug) || []);
    let found = null;
    let bestScore = -1;
    for (const candidate of options) {
      const section = normalizeProductSegment(candidate.section);
      const brand = normalizeProductSegment(candidate.brand);
      let score = 0;
      if (item.id && String(candidate.id || "") === item.id) score += 8;
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
        price_available: false,
        price_status: "consult",
        found: false
      };
    }

    const price = await resolveCatalogPrice(found);
    return {
      id: found.id,
      section: found.section,
      brand: found.brand,
      slug: found.slug,
      price_cents: price.price_cents,
      price_available: price.price_available,
      price_status: price.price_status,
      image_url: normalizePublicImageUrl(found.primary_image_url || found.image_url),
      url: productUrlFromRow(found),
      updated_at: found.updated_at || null,
      found: true
    };
  });

  res.json({ items: await Promise.all(items) });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  if (!requireDatabase(res)) return;

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
             active, is_active, description_text, description_html, stock, metadata, updated_at
      from products
      where id = $1 and active = true and coalesce(is_active, true) = true
      limit 1
    `,
    [String(req.params.id || "")]
  );
  if (!rows.length) return res.status(404).json({ error: "product_not_found" });
  res.json(await mapProductWithCatalogPrice(rows[0]));
}));

router.get("/", asyncRoute(async (req, res) => {
  if (!requireDatabase(res)) return;

  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 24)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const search = String(req.query.q || "").trim();
  const brand = String(req.query.brand || req.query.marca || req.query.filtrar_marca || "").trim();
  const category = String(req.query.category || req.query.categoria || req.query.filtrar_departamento || "").trim();
  const minPrice = parseOptionalPrice(req.query.minPrice ?? req.query.min_price ?? req.query.preco_min);
  const maxPrice = parseOptionalPrice(req.query.maxPrice ?? req.query.max_price ?? req.query.preco_max);
  const sort = String(req.query.sort || req.query.order || "").trim();
  const priceFilterActive = (minPrice !== null && minPrice >= 0) || (maxPrice !== null && maxPrice >= 0);

  const params = [];
  const filters = ["active = true", "coalesce(is_active, true) = true"];

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

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(name ilike $${params.length} or brand ilike $${params.length} or section ilike $${params.length} or slug ilike $${params.length})`);
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
      where ${whereSql} and price_cents >= 200
    `,
    params
  );

  params.push(limit, offset);

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
             active, is_active, description_text, description_html, stock, metadata, updated_at
      from products
      where ${whereSql}
      order by ${orderSqlForSort(sort)}
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );

  const pricedRows = await applyCatalogPrices(rows);
  res.json({
    items: pricedRows.map(mapProduct),
    total: countRes.rows[0]?.total || 0,
    count: countRes.rows[0]?.total || 0,
    limit,
    offset,
    brand: brand || null,
    category: category || null,
    sections: category ? (sectionValues.length ? sectionValues : resolveSectionFilterValues(category)) : [],
    facets: {
      brands: facetsRes.rows,
      price: priceRangeRes.rows[0] || { min_price_cents: null, max_price_cents: null }
    }
  });
}));
