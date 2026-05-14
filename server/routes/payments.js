import express from "express";
import { requireEnv } from "../lib/env.js";
import { pool } from "../lib/db.js";
import { fromCents } from "../lib/money.js";
import { normalizeWooviPhone, wooviFetch } from "../lib/woovi.js";

export const router = express.Router();

async function mpFetch(path, opts = {}) {
  const token = requireEnv("MP_ACCESS_TOKEN");
  const url = `https://api.mercadopago.com${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`mercadopago_error:${res.status}`);
    err.details = json;
    throw err;
  }
  return json;
}

router.post("/mercadopago", async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId || typeof orderId !== "string") return res.status(400).json({ error: "invalid_orderId" });

  const orderRes = await pool.query(
    `select id, status, currency, total_cents, mp_preference_id from orders where id = $1`,
    [orderId]
  );
  if (orderRes.rowCount === 0) return res.status(404).json({ error: "order_not_found" });
  const order = orderRes.rows[0];
  if (order.status !== "pending") return res.status(409).json({ error: "order_not_pending" });

  const itemsRes = await pool.query(
    `
      select oi.qty, oi.unit_price_cents, p.name
      from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = $1
      order by oi.created_at asc
    `,
    [orderId]
  );

  const baseUrl = process.env.BASE_URL || "";
  const notificationUrl = baseUrl ? `${baseUrl}/api/webhooks/mercadopago` : undefined;
  const successUrl = baseUrl ? `${baseUrl}/checkout/sucesso/?order=${encodeURIComponent(orderId)}` : undefined;
  const failureUrl = baseUrl ? `${baseUrl}/checkout/erro/?order=${encodeURIComponent(orderId)}` : undefined;
  const pendingUrl = baseUrl ? `${baseUrl}/checkout/pendente/?order=${encodeURIComponent(orderId)}` : undefined;

  const preference = await mpFetch("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      external_reference: orderId,
      notification_url: notificationUrl,
      items: itemsRes.rows.map((it) => ({
        title: it.name,
        quantity: Number(it.qty),
        currency_id: order.currency || "BRL",
        unit_price: fromCents(it.unit_price_cents)
      })),
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl
      },
      auto_return: "approved"
    })
  });

  await pool.query(`update orders set mp_preference_id = $2, updated_at = now() where id = $1`, [
    orderId,
    preference.id
  ]);

  res.json({
    orderId,
    preferenceId: preference.id,
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point
  });
});

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function buildWooviCustomer(input = {}) {
  const name = cleanText(input.nome || input.name, 80);
  const email = cleanText(input.email, 120);
  const phone = normalizeWooviPhone(input.telefone || input.phone);

  if (!name) return null;
  if (!email && !phone) return null;

  const customer = { name };
  if (email) customer.email = email;
  if (phone) customer.phone = phone;
  return customer;
}

router.post("/woovi", async (req, res) => {
  const { orderId, customer } = req.body || {};
  if (!orderId || typeof orderId !== "string") return res.status(400).json({ error: "invalid_orderId" });

  const orderRes = await pool.query(
    `select id, status, currency, total_cents from orders where id = $1`,
    [orderId]
  );
  if (orderRes.rowCount === 0) return res.status(404).json({ error: "order_not_found" });
  const order = orderRes.rows[0];
  if (order.status !== "pending") return res.status(409).json({ error: "order_not_pending" });
  if ((order.currency || "BRL") !== "BRL") return res.status(400).json({ error: "unsupported_currency" });
  if (Number(order.total_cents) <= 0) return res.status(400).json({ error: "invalid_order_total" });

  const itemsRes = await pool.query(
    `
      select oi.qty, oi.unit_price_cents, p.name
      from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = $1
      order by oi.created_at asc
    `,
    [orderId]
  );

  const wooviCustomer = buildWooviCustomer(customer);
  const payload = {
    correlationID: orderId,
    value: Number(order.total_cents),
    comment: `Pedido TECH 7 ${orderId}`,
    expiresIn: Number(process.env.WOOVI_PIX_EXPIRES_IN || 1800),
    additionalInfo: [
      { key: "Order", value: orderId },
      { key: "Store", value: "TECH 7" },
      {
        key: "Items",
        value: itemsRes.rows
          .map((item) => `${item.qty}x ${cleanText(item.name, 40)}`)
          .join("; ")
          .slice(0, 255)
      }
    ].filter((item) => item.value)
  };
  if (wooviCustomer) payload.customer = wooviCustomer;

  const result = await wooviFetch("/api/v1/charge", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const charge = result.charge || {};
  const pix = charge.paymentMethods?.pix || {};
  const brCode = result.brCode || charge.brCode || pix.brCode || "";
  const qrCodeImage = charge.qrCodeImage || pix.qrCodeImage || "";
  const providerPaymentId = String(charge.correlationID || result.correlationID || orderId);

  await pool.query(
    `
      insert into payments (provider, provider_payment_id, order_id, status, amount_cents, currency, raw_json)
      values ('woovi', $1, $2, $3, $4, 'BRL', $5)
      on conflict (provider, provider_payment_id)
      do update set status = excluded.status, amount_cents = excluded.amount_cents, raw_json = excluded.raw_json
    `,
    [providerPaymentId, orderId, charge.status || "ACTIVE", Number(order.total_cents), result]
  );

  res.json({
    orderId,
    provider: "woovi",
    correlationID: providerPaymentId,
    status: charge.status || "ACTIVE",
    brCode,
    qrCodeImage,
    paymentLinkUrl: charge.paymentLinkUrl || null,
    expiresIn: charge.expiresIn || payload.expiresIn,
    expiresDate: charge.expiresDate || null
  });
});

