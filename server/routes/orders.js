import express from "express";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { applyCatalogPrices, isValidPriceCents } from "../lib/prices.js";

export const router = express.Router();

async function getOrder(orderId) {
  const orderRes = await pool.query(
    `
    select id, status, currency, total_cents, created_at, updated_at, mp_preference_id
    from orders
    where id = $1
  `,
    [orderId]
  );
  if (orderRes.rowCount === 0) return null;

  const itemsRes = await pool.query(
    `
    select oi.product_id, oi.qty, oi.unit_price_cents, oi.line_total_cents, p.name, p.slug, p.image_url
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = $1
    order by oi.created_at asc
  `,
    [orderId]
  );

  return { ...orderRes.rows[0], items: itemsRes.rows };
}

router.get("/:id", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "order_not_found" });
  res.json(order);
});

router.post("/", async (req, res) => {
  const { cartId } = req.body || {};
  if (!cartId || typeof cartId !== "string") return res.status(400).json({ error: "invalid_cartId" });

  const cartRes = await pool.query(`select id, status from carts where id = $1`, [cartId]);
  if (cartRes.rowCount === 0) return res.status(404).json({ error: "cart_not_found" });
  if (cartRes.rows[0].status !== "open") return res.status(409).json({ error: "cart_closed" });

  const itemsRes = await pool.query(
    `
    select ci.product_id, ci.qty, p.slug, p.brand, p.section, p.price_cents, p.currency
    from cart_items ci
    join products p on p.id = ci.product_id
    where ci.cart_id = $1
  `,
    [cartId]
  );
  if (itemsRes.rowCount === 0) return res.status(400).json({ error: "cart_empty" });
  const pricedItems = await applyCatalogPrices(itemsRes.rows);
  if (pricedItems.some((item) => !isValidPriceCents(item.price_cents))) {
    return res.status(400).json({ error: "invalid_product_price" });
  }

  const currency = pricedItems[0].currency || "BRL";
  for (const r of pricedItems) {
    if ((r.currency || "BRL") !== currency) return res.status(400).json({ error: "mixed_currency" });
  }

  const orderId = newId("order");

  await pool.query("begin");
  try {
    let total = 0;
    for (const r of pricedItems) total += Number(r.price_cents) * Number(r.qty);

    await pool.query(
      `insert into orders (id, status, currency, total_cents, cart_id) values ($1, 'pending', $2, $3, $4)`,
      [orderId, currency, total, cartId]
    );

    for (const r of pricedItems) {
      const unit = Number(r.price_cents);
      const qty = Number(r.qty);
      await pool.query(
        `
        insert into order_items (order_id, product_id, qty, unit_price_cents, line_total_cents)
        values ($1, $2, $3, $4, $5)
      `,
        [orderId, r.product_id, qty, unit, unit * qty]
      );
    }

    await pool.query(`update carts set status = 'ordered', updated_at = now() where id = $1`, [cartId]);
    await pool.query("commit");
  } catch (e) {
    await pool.query("rollback");
    throw e;
  }

  const full = await getOrder(orderId);
  res.status(201).json(full);
});
