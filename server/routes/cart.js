import express from "express";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { applyCatalogPrices, isValidPriceCents } from "../lib/prices.js";
import { productUrlFromRow } from "../lib/product-url.js";

export const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function snapshotHints(productId, snapshot) {
  const hints = {
    productId: String(productId || "").trim(),
    slug: "",
    brand: "",
    section: ""
  };
  if (snapshot && typeof snapshot === "object") {
    hints.slug = normalizeId(snapshot.slug || snapshot.id || snapshot.productId || "");
    hints.brand = normalizeId(snapshot.brand || snapshot.marca || "");
    hints.section = normalizeId(snapshot.section || snapshot.category || snapshot.categoria || "");
  }
  if (!hints.slug) hints.slug = normalizeId(productId);
  return hints;
}

async function resolveCartProduct(productId, snapshot) {
  const direct = await pool.query(
    `select id, slug, brand, section, price_cents from products where id = $1 and active = true and coalesce(is_active, true) = true limit 1`,
    [productId]
  );
  if (direct.rowCount > 0) return direct.rows[0];

  const hints = snapshotHints(productId, snapshot);
  if (!hints.slug) return null;

  const params = [hints.slug];
  const filters = ["slug = $1", "active = true", "coalesce(is_active, true) = true"];
  if (hints.brand) {
    params.push(hints.brand);
    filters.push(`coalesce(brand, '') = $${params.length}`);
  }
  if (hints.section) {
    params.push(hints.section);
    filters.push(`coalesce(section, '') = $${params.length}`);
  }

  const bySlug = await pool.query(
    `
      select id, slug, brand, section, price_cents
      from products
      where ${filters.join(" and ")}
      order by updated_at desc nulls last, created_at desc
      limit 1
    `,
    params
  );
  return bySlug.rows[0] || null;
}

async function getCart(cartId) {
  const cartRes = await pool.query(
    `select id, status, created_at, updated_at from carts where id = $1`,
    [cartId]
  );
  if (cartRes.rowCount === 0) return null;
  const itemsRes = await pool.query(
    `
      select ci.product_id, ci.qty, p.name, p.slug, p.brand, p.section, p.price_cents, p.currency,
             coalesce(p.primary_image_url, p.image_url) as image_url
      from cart_items ci
      join products p on p.id = ci.product_id
      where ci.cart_id = $1
      order by ci.created_at asc
    `,
    [cartId]
  );
  const items = (await applyCatalogPrices(itemsRes.rows)).map((item) => ({
    ...item,
    url: productUrlFromRow(item)
  }));
  return { ...cartRes.rows[0], items };
}

router.post("/", asyncRoute(async (_req, res) => {
  const id = newId("cart");
  await pool.query(`insert into carts (id, status) values ($1, 'open')`, [id]);
  const cart = await getCart(id);
  res.status(201).json(cart);
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const cart = await getCart(req.params.id);
  if (!cart) return res.status(404).json({ error: "cart_not_found" });
  res.json(cart);
}));

async function upsertCartItem(req, res) {
  const cartId = req.params.id;
  const { productId, qty, product } = req.body || {};

  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ error: "invalid_productId" });
  }
  const q = Number(qty);
  if (!Number.isInteger(q) || q < 0 || q > 99) {
    return res.status(400).json({ error: "invalid_qty" });
  }

  const cart = await pool.query(`select id, status from carts where id = $1`, [cartId]);
  if (cart.rowCount === 0) return res.status(404).json({ error: "cart_not_found" });
  if (cart.rows[0].status !== "open") return res.status(409).json({ error: "cart_closed" });

  const resolvedProduct = await resolveCartProduct(productId, product);
  if (!resolvedProduct && q > 0) return res.status(404).json({ error: "product_not_found" });
  const resolvedProductId = resolvedProduct?.id || productId;

  const pricedProduct = resolvedProduct ? (await applyCatalogPrices([resolvedProduct]))[0] : null;
  if (q > 0 && (!pricedProduct || !isValidPriceCents(pricedProduct.price_cents))) {
    return res.status(400).json({ error: "invalid_product_price" });
  }

  await pool.query("begin");
  try {
    if (q === 0) {
      await pool.query(`delete from cart_items where cart_id = $1 and product_id = $2`, [cartId, resolvedProductId]);
    } else {
      await pool.query(
        `
          insert into cart_items (cart_id, product_id, qty)
          values ($1, $2, $3)
          on conflict (cart_id, product_id)
          do update set qty = excluded.qty, updated_at = now()
        `,
        [cartId, resolvedProductId, q]
      );
    }
    await pool.query(`update carts set updated_at = now() where id = $1`, [cartId]);
    await pool.query("commit");
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }

  const full = await getCart(cartId);
  res.json(full);
}

// Accept both PUT and POST for compatibility with older frontends.
router.put("/:id/items", asyncRoute(upsertCartItem));
router.post("/:id/items", asyncRoute(upsertCartItem));
