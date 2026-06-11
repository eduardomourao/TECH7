import express from "express";
import crypto from "node:crypto";
import { pool } from "../lib/db.js";
import { requireEnv } from "../lib/env.js";
import { createLoggiShipmentForOrder } from "../lib/loggi_fulfillment.js";

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
  if (!appSecret) return false;
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(raw, "utf8")
    .digest("hex")}`;

  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function expectedBasicAuthorization(username, password) {
  if (!username || !password) return "";
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function expectedLoggiAuthorization() {
  const explicit = String(process.env.LOGGI_WEBHOOK_AUTHORIZATION || "").trim();
  if (explicit) return explicit;
  return expectedBasicAuthorization(process.env.LOGGI_WEBHOOK_USERNAME, process.env.LOGGI_WEBHOOK_PASSWORD);
}

async function triggerLoggiShipment(orderId) {
  try {
    await createLoggiShipmentForOrder(orderId);
  } catch {
    // Payment webhooks must be acknowledged even if fulfillment is temporarily unavailable.
  }
}

function parseSignatureHeader(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf("=");
      if (idx > -1) acc[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      return acc;
    }, {});
}

function verifyMercadoPagoSignature({ raw, payload, requestId, signature, secret }) {
  if (!secret) return { ok: false, status: 503, error: "webhook_secret_not_configured" };
  const parsedSignature = parseSignatureHeader(signature);
  const ts = parsedSignature.ts;
  const v1 = parsedSignature.v1;
  const paymentId = payload?.data?.id || payload?.id || null;
  if (!requestId || !ts || !v1 || !paymentId) return { ok: false, status: 401, error: "invalid_signature" };

  const timestampMs = Number(ts) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false, status: 401, error: "stale_signature" };
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest, "utf8").digest("hex");
  if (!timingSafeStringEqual(v1, expected)) return { ok: false, status: 401, error: "invalid_signature" };
  return { ok: true };
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
      const phoneNumberId = value?.metadata?.phone_number_id || getWhatsAppPhoneNumberId();
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

function getWhatsAppAccessToken() {
  return (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.TOKEN_DE_ACESSO_DO_WHATSAPP ||
    ""
  );
}

function getWhatsAppPhoneNumberId() {
  return (
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.ID_DO_NUMERO_DE_TELEFONE_DO_WHATSAPP ||
    process.env["ID_DO_NÚMERO_DE_TELEFONE_DO_WHATSAPP"] ||
    ""
  );
}

async function sendWhatsAppText({ phoneNumberId, to, body }) {
  const token = getWhatsAppAccessToken();
  const resolvedPhoneNumberId = phoneNumberId || getWhatsAppPhoneNumberId();
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

  const payload = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  })();

  const signatureCheck = verifyMercadoPagoSignature({
    raw,
    payload,
    requestId,
    signature,
    secret: process.env.MP_WEBHOOK_SECRET || ""
  });
  if (!signatureCheck.ok) return res.status(signatureCheck.status).json({ error: signatureCheck.error });

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
          await triggerLoggiShipment(orderId);
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
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(503).send("webhook_not_configured");
  }

  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge || ""));
  }

  return res.status(403).send("forbidden");
});

router.post("/loggi", async (req, res) => {
  const raw = rawBodyToString(req);
  const authorization = req.header("authorization") || "";
  const expectedAuthorization = expectedLoggiAuthorization();

  if (!expectedAuthorization) return res.status(503).json({ error: "webhook_secret_not_configured" });
  if (!timingSafeStringEqual(authorization, expectedAuthorization)) {
    return res.status(401).json({ error: "invalid_authorization" });
  }

  const payload = parseWebhookJson(raw);
  const packages = Array.isArray(payload?.packages) ? payload.packages : [];
  const eventId = payload?.id || payload?.eventId || payload?.requestId || null;
  const packageKeys = packages
    .map((pkg) => [pkg.loggiKey, pkg.trackingCode, pkg.status?.code, pkg.status?.updatedTime].filter(Boolean).join(":"))
    .filter(Boolean)
    .join("|");
  const dedupeKey = String(eventId || packageKeys || rawBodyDedupeKey(raw));

  const existing = await pool.query(`select id from webhook_events where provider = 'loggi' and dedupe_key = $1`, [
    dedupeKey
  ]);
  if (existing.rowCount > 0) return res.status(200).json({ ok: true, deduped: true });

  await pool.query(
    `
      insert into webhook_events (provider, dedupe_key, request_id, signature, raw_body, parsed_json)
      values ('loggi', $1, $2, 'basic', $3, $4)
    `,
    [dedupeKey, eventId ? String(eventId) : null, raw, JSON.stringify(payload)]
  );

  for (const pkg of packages) {
    const loggiKey = pkg?.loggiKey || null;
    const trackingCode = pkg?.trackingCode || null;
    const status = pkg?.status || {};
    const statusCode = status?.code != null ? String(status.code) : null;
    const statusLabel = status?.highLevelStatus || null;
    const statusDescription = status?.description || null;
    const updatedTime = status?.updatedTime || pkg?.requestTime || "";

    const shipmentRes = await pool.query(
      `
        select order_id
        from shipments
        where provider = 'loggi'
          and (($1::text is not null and loggi_key = $1) or ($2::text is not null and tracking_code = $2))
        order by updated_at desc, id desc
        limit 1
      `,
      [loggiKey, trackingCode]
    );
    const orderId = shipmentRes.rows[0]?.order_id || null;
    const packageDedupeKey = [loggiKey, trackingCode, statusCode, updatedTime].filter(Boolean).join(":") || dedupeKey;

    await pool.query(
      `
        insert into shipment_events (
          provider, dedupe_key, order_id, loggi_key, tracking_code, status_code,
          status_label, status_description, action_required, raw_json
        )
        values ('loggi', $1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (provider, dedupe_key) do nothing
      `,
      [
        packageDedupeKey,
        orderId,
        loggiKey,
        trackingCode,
        statusCode,
        statusLabel,
        statusDescription,
        status?.actionRequired ? JSON.stringify(status.actionRequired) : null,
        JSON.stringify(pkg)
      ]
    );

    await pool.query(
      `
        update shipments
        set status = coalesce($3, status),
            tracking_code = coalesce($2, tracking_code),
            raw_json = $4,
            updated_at = now()
        where provider = 'loggi'
          and (($1::text is not null and loggi_key = $1) or ($2::text is not null and tracking_code = $2))
      `,
      [loggiKey, trackingCode, statusLabel || statusCode || null, JSON.stringify(pkg)]
    );
  }

  res.status(200).json({ ok: true });
});

router.post("/whatsapp", async (req, res) => {
  const raw = rawBodyToString(req);
  const signature = req.header("x-hub-signature-256") || "";
  const appSecret = process.env.WHATSAPP_APP_SECRET || "";

  if (!appSecret) return res.status(503).json({ error: "webhook_secret_not_configured" });
  if (!verifyMetaSignature(raw, signature, appSecret)) {
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

  if (!configuredAuthorization) return res.status(503).json({ error: "webhook_secret_not_configured" });
  if (!timingSafeStringEqual(authorization, configuredAuthorization)) {
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
        await triggerLoggiShipment(orderId);
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
