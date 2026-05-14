import express from "express";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";

export const router = express.Router();

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function priceToCents(value) {
  if (typeof value === "number") return Math.max(0, Math.round(value * 100));
  const str = String(value || "").trim().replace(/[^\d,.-]/g, "");
  const normalized = str.includes(",") ? str.replace(/\./g, "").replace(",", ".") : str;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

async function ensureProduct(productId, snapshot) {
  const existing = await pool.query(`select id from products where id = $1 and active = true`, [productId]);
  if (existing.rowCount > 0) {
    if (snapshot && typeof snapshot === "object") {
      const imageUrl = String(snapshot.image_url || snapshot.image || snapshot.imagem || "").trim() || null;
      const priceCents = priceToCents(snapshot.price ?? snapshot.preco);
      await pool.query(
        `
          update products
          set
            price_cents = case when $2 > 0 then $2 else price_cents end,
            image_url = coalesce($3, image_url),
            updated_at = now()
          where id = $1
        `,
        [productId, priceCents, imageUrl]
      );
    }
    return true;
  }

  if (!snapshot || typeof snapshot !== "object") return false;

  const name = String(snapshot.name || snapshot.nome || snapshot.title || "Produto TECH 7").trim();
  const slug = normalizeId(snapshot.slug || productId) || normalizeId(productId);
  const brand = normalizeId(snapshot.brand || snapshot.marca || "tech7") || "tech7";
  const section = normalizeId(snapshot.section || snapshot.category || snapshot.categoria || "catalogo") || "catalogo";
  const imageUrl = String(snapshot.image_url || snapshot.image || snapshot.imagem || "").trim() || null;
  const priceCents = priceToCents(snapshot.price ?? snapshot.preco);

  await pool.query(
    `
      insert into products (id, slug, name, brand, section, price_cents, currency, image_url, active)
      values ($1, $2, $3, $4, $5, $6, 'BRL', $7, true)
      on conflict (id) do update set
        slug = excluded.slug,
        name = excluded.name,
        brand = excluded.brand,
        section = excluded.section,
        price_cents = case when excluded.price_cents > 0 then excluded.price_cents else products.price_cents end,
        image_url = coalesce(excluded.image_url, products.image_url),
        active = true,
        updated_at = now()
    `,
    [productId, slug, name, brand, section, priceCents, imageUrl]
  );

  return true;
}

async function getCart(cartId) {
  const cartRes = await pool.query(
    `select id, status, created_at, updated_at from carts where id = $1`,
    [cartId]
  );
  if (cartRes.rowCount === 0) return null;
  const itemsRes = await pool.query(
    `
      select ci.product_id, ci.qty, p.name, p.slug, p.brand, p.section, p.price_cents, p.currency, p.image_url
      from cart_items ci
      join products p on p.id = ci.product_id
      where ci.cart_id = $1
      order by ci.created_at asc
    `,
    [cartId]
  );
  return { ...cartRes.rows[0], items: itemsRes.rows };
}

router.post("/", async (_req, res) => {
  const id = newId("cart");
  await pool.query(`insert into carts (id, status) values ($1, 'open')`, [id]);
  const cart = await getCart(id);
  res.status(201).json(cart);
});

router.get("/:id", async (req, res) => {
  const cart = await getCart(req.params.id);
  if (!cart) return res.status(404).json({ error: "cart_not_found" });
  res.json(cart);
});

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

  const hasProduct = await ensureProduct(productId, product);
  if (!hasProduct) return res.status(404).json({ error: "product_not_found" });

  await pool.query("begin");
  try {
    if (q === 0) {
      await pool.query(`delete from cart_items where cart_id = $1 and product_id = $2`, [cartId, productId]);
    } else {
      await pool.query(
        `
          insert into cart_items (cart_id, product_id, qty)
          values ($1, $2, $3)
          on conflict (cart_id, product_id)
          do update set qty = excluded.qty, updated_at = now()
        `,
        [cartId, productId, q]
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
router.put("/:id/items", upsertCartItem);
router.post("/:id/items", upsertCartItem);
