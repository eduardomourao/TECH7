import express from "express";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";

export const router = express.Router();

async function getCart(cartId) {
  const cartRes = await pool.query(
    `select id, status, created_at, updated_at from carts where id = $1`,
    [cartId]
  );
  if (cartRes.rowCount === 0) return null;
  const itemsRes = await pool.query(
    `
      select ci.product_id, ci.qty, p.name, p.slug, p.price_cents, p.currency, p.image_url
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

router.put("/:id/items", async (req, res) => {
  const cartId = req.params.id;
  const { productId, qty } = req.body || {};

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

  const prod = await pool.query(`select id from products where id = $1 and active = true`, [productId]);
  if (prod.rowCount === 0) return res.status(404).json({ error: "product_not_found" });

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
});
