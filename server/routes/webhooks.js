import express from "express";
import crypto from "node:crypto";
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

function parseWebhookJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function rawBodyDedupeKey(raw) {
  return `raw:${Buffer.from(raw, "utf8").toString("base64").slice(0, 128)}`;
}

function verifyMetaSignature(raw, signature, appSecret) {
  if (!appSecret) return true;
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(raw, "utf8")
    .digest("hex")}`;

  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function extractWhatsAppEventId(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const message = Array.isArray(value.messages) ? value.messages[0] : null;
      const status = Array.isArray(value.statuses) ? value.statuses[0] : null;
      const phoneNumberId = value?.metadata?.phone_number_id || "unknown_phone";
      if (message?.id) return `message:${phoneNumberId}:${message.id}`;
      if (status?.id) return `status:${phoneNumberId}:${status.id}:${status.status || "unknown"}`;
    }
  }
  return null;
}

function extractWhatsAppIncomingMessages(payload) {
  const messages = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
      const incomingMessages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of incomingMessages) {
        if (message?.from && message?.type !== "unsupported") {
          messages.push({ phoneNumberId, from: message.from, id: message.id || null });
        }
      }
    }
  }
  return messages;
}

async function sendWhatsAppText({ phoneNumberId, to, body }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const resolvedPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (!token || !resolvedPhoneNumberId || !to) return { sent: false, reason: "not_configured" };

  const response = await fetch(`https://graph.facebook.com/v25.0/${resolvedPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body
      }
    })
  });

  const json = await response.json().catch(() => ({}));
  return { sent: response.ok, status: response.status, json };
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

router.get("/whatsapp", (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge || ""));
  }

  return res.status(403).send("forbidden");
});

router.post("/whatsapp", async (req, res) => {
  const raw = rawBodyToString(req);
  const signature = req.header("x-hub-signature-256") || "";

  if (!verifyMetaSignature(raw, signature, process.env.WHATSAPP_APP_SECRET || "")) {
    return res.status(401).json({ error: "invalid_signature" });
  }

  const payload = parseWebhookJson(raw);
  const dedupeKey = extractWhatsAppEventId(payload) || rawBodyDedupeKey(raw);

  try {
    const existing = await pool.query(`select id from webhook_events where provider = 'whatsapp' and dedupe_key = $1`, [
      dedupeKey
    ]);
    if (existing.rowCount > 0) return res.status(200).json({ ok: true, deduped: true });

    await pool.query(
      `
        insert into webhook_events (provider, dedupe_key, request_id, signature, raw_body, parsed_json)
        values ('whatsapp', $1, $2, $3, $4, $5)
      `,
      [dedupeKey, null, signature || null, raw, payload]
    );
  } catch {
    // Keep WhatsApp webhook responsive even if persistence is temporarily unavailable.
  }

  const incomingMessages = extractWhatsAppIncomingMessages(payload);
  for (const message of incomingMessages) {
    try {
      await sendWhatsAppText({
        phoneNumberId: message.phoneNumberId,
        to: message.from,
        body: "Olá! Recebemos sua mensagem na Tech 7. Em breve vamos te atender."
      });
    } catch {
      // Keep webhook ACK stable; event is stored and can be replayed/debugged later.
    }
  }

  res.status(200).json({ ok: true });
});

function extractWooviCharge(payload) {
  return payload?.charge || payload?.pixQrCode || payload?.payment || payload?.data?.charge || payload?.data || {};
}

function normalizeWooviStatus(payload) {
  const event = String(payload?.event || payload?.type || "").toUpperCase();
  const charge = extractWooviCharge(payload);
  const status = String(charge?.status || payload?.status || "").toUpperCase();
  if (event.includes("CHARGE_COMPLETED") || status === "COMPLETED") return "COMPLETED";
  if (event.includes("CHARGE_EXPIRED") || status === "EXPIRED") return "EXPIRED";
  if (status === "ACTIVE") return "ACTIVE";
  return null;
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
  return normalizeWooviStatus(payload) === "COMPLETED";
}

function isWooviExpired(payload) {
  return normalizeWooviStatus(payload) === "EXPIRED";
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

  try {
    const wooviStatus = normalizeWooviStatus(payload);

    if (correlationID) {
      const paymentRes = await pool.query(
        `
          select order_id
          from payments
          where provider = 'woovi' and provider_payment_id = $1
          order by created_at desc, id desc
          limit 1
        `,
        [correlationID]
      );

      let orderId = paymentRes.rows[0]?.order_id || null;
      if (!orderId) {
        const orderFallback = await pool.query(
          `select id, total_cents from orders where id = $1 limit 1`,
          [correlationID]
        );
        if (orderFallback.rowCount) {
          orderId = orderFallback.rows[0].id;
          await pool.query(
            `
              insert into payments (provider, provider_payment_id, order_id, status, amount_cents, currency, raw_json)
              values ('woovi', $1, $2, $3, $4, 'BRL', $5)
              on conflict (provider, provider_payment_id)
              do update set status = excluded.status, raw_json = excluded.raw_json
            `,
            [correlationID, orderId, wooviStatus || "ACTIVE", Number(orderFallback.rows[0].total_cents || 0), payload]
          );
        }
      } else {
        await pool.query(
          `
            update payments
            set status = $2, raw_json = $3
            where provider = 'woovi' and provider_payment_id = $1
          `,
          [correlationID, wooviStatus || "ACTIVE", payload]
        );
      }

      if (orderId && isWooviCompleted(payload)) {
        await pool.query(`update orders set status = 'paid', updated_at = now() where id = $1`, [orderId]);
      } else if (orderId && isWooviExpired(payload)) {
        await pool.query(`update orders set status = 'failed', updated_at = now() where id = $1 and status <> 'paid'`, [orderId]);
      } else if (orderId && wooviStatus === "ACTIVE") {
        await pool.query(`update orders set status = 'pending', updated_at = now() where id = $1 and status <> 'paid'`, [orderId]);
      }
    }
  } catch {
    // Keep 200 response after dedupe/persist to avoid unnecessary webhook retries.
  }

  res.status(200).json({ ok: true });
});
