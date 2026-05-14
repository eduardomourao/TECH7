import express from "express";
import { pool } from "../lib/db.js";
import { requireEnv } from "../lib/env.js";

export const router = express.Router();

function rawBodyToString(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  try {
    return JSON.stringify(req.body || {});
  } catch {
    return "";
  }
}

async function mpFetch(path) {
  const token = requireEnv("MP_ACCESS_TOKEN");
  const url = `https://api.mercadopago.com${path}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`mercadopago_error:${res.status}`);
    err.details = json;
    throw err;
  }
  return json;
}

router.post("/mercadopago", async (req, res) => {
  // Mercado Pago sends multiple event shapes. We'll store raw + process idempotently.
  const raw = rawBodyToString(req);
  const requestId = req.header("x-request-id") || null;
  const signature = req.header("x-signature") || null;

  const mpSecret = process.env.MP_WEBHOOK_SECRET || null;
  if (mpSecret && !signature) {
    return res.status(401).json({ error: "missing_signature" });
  }
  // NOTE: Signature verification varies by MP configuration; implement strict verification
  // once the exact header format/secret scheme is confirmed for this account.

  const payload = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  })();

  // Event dedupe key: requestId if present; else fall back to a hash of the raw payload.
  const dedupeKey =
    requestId ||
    `raw:${Buffer.from(raw, "utf8").toString("base64").slice(0, 128)}`;

  const existing = await pool.query(`select id from webhook_events where provider = 'mercadopago' and dedupe_key = $1`, [
    dedupeKey
  ]);
  if (existing.rowCount > 0) return res.status(200).json({ ok: true, deduped: true });

  await pool.query(
    `
      insert into webhook_events (provider, dedupe_key, request_id, signature, raw_body, parsed_json)
      values ('mercadopago', $1, $2, $3, $4, $5)
    `,
    [dedupeKey, requestId, signature, raw, payload]
  );

  // Try to resolve payment info and update the order.
  // Most reliable path: payment ID -> payment.details -> external_reference = orderId
  const paymentId =
    payload?.data?.id ||
    payload?.id ||
    null;

  if (paymentId) {
    try {
      const payment = await mpFetch(`/v1/payments/${paymentId}`);
      const orderId = payment?.external_reference;
      const status = payment?.status;

      if (orderId && typeof orderId === "string") {
        if (status === "approved") {
          await pool.query(`update orders set status = 'paid', updated_at = now() where id = $1`, [orderId]);
        } else if (status === "cancelled" || status === "rejected") {
          await pool.query(`update orders set status = 'failed', updated_at = now() where id = $1 and status = 'pending'`, [
            orderId
          ]);
        }

        await pool.query(
          `insert into payments (provider, provider_payment_id, order_id, status, amount_cents, currency, raw_json)
           values ('mercadopago', $1, $2, $3, $4, $5, $6)
           on conflict (provider, provider_payment_id) do nothing`,
          [
            String(paymentId),
            orderId,
            status || "unknown",
            Math.round(Number(payment?.transaction_amount || 0) * 100),
            payment?.currency_id || "BRL",
            payment
          ]
        );
      }
    } catch {
      // Swallow: webhook should ack even if processing fails (we have raw stored for replay).
    }
  }

  res.status(200).json({ ok: true });
});

function extractWooviCharge(payload) {
  return payload?.charge || payload?.pixQrCode || payload?.payment || payload?.data?.charge || payload?.data || {};
}

function extractWooviCorrelationId(payload) {
  const charge = extractWooviCharge(payload);
  return (
    charge?.correlationID ||
    charge?.correlationId ||
    payload?.correlationID ||
    payload?.correlationId ||
    payload?.transaction?.correlationID ||
    null
  );
}

function isWooviCompleted(payload) {
  const event = String(payload?.event || payload?.type || "").toUpperCase();
  const charge = extractWooviCharge(payload);
  const status = String(charge?.status || payload?.status || "").toUpperCase();
  return event.includes("CHARGE_COMPLETED") || status === "COMPLETED";
}

router.get("/woovi", (_req, res) => {
  res.status(200).json({ ok: true, provider: "woovi" });
});

router.post("/woovi", async (req, res) => {
  const raw = rawBodyToString(req);
  const authorization = req.header("authorization") || null;
  const configuredAuthorization = process.env.WOOVI_WEBHOOK_AUTHORIZATION || null;

  if (configuredAuthorization && authorization !== configuredAuthorization) {
    return res.status(401).json({ error: "invalid_authorization" });
  }

  const payload = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  })();

  const correlationID = extractWooviCorrelationId(payload);
  const event = String(payload?.event || payload?.type || "unknown");
  const dedupeKey =
    payload?.id ||
    payload?.eventId ||
    `${event}:${correlationID || Buffer.from(raw, "utf8").toString("base64").slice(0, 128)}`;

  const existing = await pool.query(`select id from webhook_events where provider = 'woovi' and dedupe_key = $1`, [
    dedupeKey
  ]);
  if (existing.rowCount > 0) return res.status(200).json({ ok: true, deduped: true });

  await pool.query(
    `
      insert into webhook_events (provider, dedupe_key, request_id, signature, raw_body, parsed_json)
      values ('woovi', $1, $2, $3, $4, $5)
    `,
    [String(dedupeKey), correlationID || null, authorization, raw, payload]
  );

  if (correlationID && isWooviCompleted(payload)) {
    await pool.query(`update orders set status = 'paid', updated_at = now() where id = $1`, [correlationID]);
    await pool.query(
      `
        update payments
        set status = 'COMPLETED', raw_json = $2
        where provider = 'woovi' and provider_payment_id = $1
      `,
      [correlationID, payload]
    );
  }

  res.status(200).json({ ok: true });
});
