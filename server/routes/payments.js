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

function normalizeWooviStatus(value) {
  const status = String(value || "").toUpperCase();
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "EXPIRED") return "EXPIRED";
  return "ACTIVE";
}

function extractWooviEnvelope(payload = {}) {
  const charge = payload?.charge || payload?.pixQrCode || payload?.payment || payload?.data?.charge || payload?.data || {};
  const pix = charge?.paymentMethods?.pix || payload?.paymentMethods?.pix || {};
  const brCode = payload?.brCode || charge?.brCode || pix?.brCode || "";
  const qrCodeImage = charge?.qrCodeImage || pix?.qrCodeImage || payload?.qrCodeImage || "";
  const correlationID = String(
    charge?.correlationID ||
    charge?.correlationId ||
    payload?.correlationID ||
    payload?.correlationId ||
    ""
  ).trim();
  const status = normalizeWooviStatus(charge?.status || payload?.status);
  const expiresInRaw = charge?.expiresIn ?? payload?.expiresIn;
  const expiresIn = Number.isFinite(Number(expiresInRaw)) ? Number(expiresInRaw) : null;
  return {
    correlationID,
    status,
    brCode,
    qrCodeImage,
    paymentLinkUrl: charge?.paymentLinkUrl || payload?.paymentLinkUrl || null,
    expiresIn,
    expiresDate: charge?.expiresDate || payload?.expiresDate || null
  };
}

function wooviResponseFromPaymentRow(orderId, row, fallbackExpiresIn) {
  const raw = row?.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  const envelope = extractWooviEnvelope(raw);
  return {
    orderId,
    provider: "woovi",
    correlationID: String(row?.provider_payment_id || envelope.correlationID || ""),
    status: normalizeWooviStatus(row?.status || envelope.status),
    brCode: envelope.brCode || "",
    qrCodeImage: envelope.qrCodeImage || "",
    paymentLinkUrl: envelope.paymentLinkUrl || null,
    expiresIn: envelope.expiresIn || Number(fallbackExpiresIn || 0) || null,
    expiresDate: envelope.expiresDate || null
  };
}

function newWooviCorrelationId(orderId, regenerate) {
  if (!regenerate) return orderId;
  return `${orderId}-${Date.now().toString(36)}`;
}

async function findReusableActiveWooviPayment(orderId) {
  const rowRes = await pool.query(
    `
      select provider_payment_id, status, raw_json
      from payments
      where provider = 'woovi' and order_id = $1 and status = 'ACTIVE'
      order by created_at desc, id desc
      limit 1
    `,
    [orderId]
  );
  if (!rowRes.rowCount) return null;
  const candidate = rowRes.rows[0];
  const mapped = wooviResponseFromPaymentRow(orderId, candidate);
  if (!mapped.brCode && !mapped.qrCodeImage) return null;
  return mapped;
}

async function findLatestWooviPayment(orderId) {
  const rowRes = await pool.query(
    `
      select provider_payment_id, status, raw_json
      from payments
      where provider = 'woovi' and order_id = $1
      order by created_at desc, id desc
      limit 1
    `,
    [orderId]
  );
  if (!rowRes.rowCount) return null;
  return rowRes.rows[0];
}

router.post("/woovi", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { orderId, customer, regenerate } = req.body || {};
  const shouldRegenerate = !!regenerate;
  if (!orderId || typeof orderId !== "string") return res.status(400).json({ error: "invalid_orderId" });

  const orderRes = await pool.query(
    `select id, status, currency, total_cents from orders where id = $1`,
    [orderId]
  );
  if (orderRes.rowCount === 0) return res.status(404).json({ error: "order_not_found" });
  const order = orderRes.rows[0];
  if (order.status === "paid") return res.status(409).json({ error: "order_already_paid" });
  if (order.status !== "pending" && !(shouldRegenerate && order.status === "failed")) {
    return res.status(409).json({ error: "order_not_eligible" });
  }
  if ((order.currency || "BRL") !== "BRL") return res.status(400).json({ error: "unsupported_currency" });
  if (Number(order.total_cents) <= 0) return res.status(400).json({ error: "invalid_order_total" });

  if (!shouldRegenerate) {
    const active = await findReusableActiveWooviPayment(orderId);
    if (active) return res.json(active);
  }

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
  const correlationID = newWooviCorrelationId(orderId, shouldRegenerate);
  const payload = {
    correlationID,
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

  const envelope = extractWooviEnvelope(result);
  const providerPaymentId = String(envelope.correlationID || correlationID || orderId);
  const paymentStatus = normalizeWooviStatus(envelope.status);

  await pool.query(
    `
      insert into payments (provider, provider_payment_id, order_id, status, amount_cents, currency, raw_json)
      values ('woovi', $1, $2, $3, $4, 'BRL', $5)
      on conflict (provider, provider_payment_id)
      do update set status = excluded.status, amount_cents = excluded.amount_cents, raw_json = excluded.raw_json
    `,
    [providerPaymentId, orderId, paymentStatus, Number(order.total_cents), result]
  );

  await pool.query(`update orders set status = 'pending', updated_at = now() where id = $1 and status <> 'paid'`, [orderId]);

  res.json({
    orderId,
    provider: "woovi",
    correlationID: providerPaymentId,
    status: paymentStatus,
    brCode: envelope.brCode || "",
    qrCodeImage: envelope.qrCodeImage || "",
    paymentLinkUrl: envelope.paymentLinkUrl || null,
    expiresIn: envelope.expiresIn || payload.expiresIn,
    expiresDate: envelope.expiresDate || null
  });
});

router.get("/woovi/:orderId/status", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) return res.status(400).json({ error: "invalid_orderId" });

  const orderRes = await pool.query(
    `select id, status from orders where id = $1 limit 1`,
    [orderId]
  );
  if (!orderRes.rowCount) return res.status(404).json({ error: "order_not_found" });

  const orderStatus = String(orderRes.rows[0].status || "pending");
  const latest = await findLatestWooviPayment(orderId);
  if (!latest) {
    return res.json({
      orderId,
      orderStatus,
      paymentStatus: null,
      correlationID: null,
      brCode: "",
      qrCodeImage: "",
      expiresDate: null,
      canRegenerate: orderStatus !== "paid" && orderStatus === "failed"
    });
  }

  const mapped = wooviResponseFromPaymentRow(orderId, latest, process.env.WOOVI_PIX_EXPIRES_IN || 1800);
  const canRegenerate = orderStatus !== "paid" && (mapped.status === "EXPIRED" || orderStatus === "failed");

  res.json({
    orderId,
    orderStatus,
    paymentStatus: mapped.status,
    correlationID: mapped.correlationID || null,
    brCode: mapped.brCode || "",
    qrCodeImage: mapped.qrCodeImage || "",
    expiresDate: mapped.expiresDate || null,
    canRegenerate
  });
});

