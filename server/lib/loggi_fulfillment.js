import { pool } from "./db.js";
import { loggiCompanyId, loggiFetch, loggiOriginAddress, missingLoggiRuntimeEnv } from "./loggi.js";

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function buildRecipient(order) {
  const federalTaxId = cleanText(order.customer_document || process.env.LOGGI_DEFAULT_RECIPIENT_TAX_ID || "", 32).replace(/\D/g, "");
  return {
    name: cleanText(order.customer_name || "Cliente TECH 7", 80),
    phone: cleanText(order.customer_phone || "", 32),
    email: cleanText(order.customer_email || "", 120),
    federalTaxId
  };
}

function buildDestination(order) {
  return {
    correios: {
      logradouro: cleanText(order.shipping_address, 120),
      numero: cleanText(order.shipping_number, 20),
      complemento: cleanText(order.shipping_complement, 120),
      bairro: cleanText(order.shipping_neighborhood, 80),
      cep: String(order.shipping_zipcode || "").replace(/\D/g, ""),
      cidade: cleanText(order.shipping_city, 80),
      uf: cleanText(order.shipping_state, 2).toUpperCase()
    }
  };
}

function packageDefaults(order) {
  return {
    weightG: Number(process.env.LOGGI_DEFAULT_WEIGHT_G || 500),
    lengthCm: Number(process.env.LOGGI_DEFAULT_LENGTH_CM || 20),
    widthCm: Number(process.env.LOGGI_DEFAULT_WIDTH_CM || 15),
    heightCm: Number(process.env.LOGGI_DEFAULT_HEIGHT_CM || 8),
    goodsValue: {
      currencyCode: order.currency || "BRL",
      units: String(Math.max(0, Math.floor(Number(order.subtotal_cents || order.total_cents || 0) / 100))),
      nanos: Math.max(0, Number(order.subtotal_cents || order.total_cents || 0) % 100) * 10_000_000
    }
  };
}

async function generateLabel(orderId, loggiKey) {
  if (!loggiKey) return {};
  const responseType = process.env.LOGGI_LABEL_RESPONSE_TYPE || "LABEL_RESPONSE_TYPE_URL";
  try {
    const label = await loggiFetch(`/v1/companies/${encodeURIComponent(loggiCompanyId())}/labels`, {
      method: "POST",
      body: JSON.stringify({ loggiKeys: [loggiKey], responseType })
    });
    const content = Array.isArray(label?.content) ? label.content[0] : label?.content;
    const url = label?.url || content?.url || null;
    const base64 = content?.base64 || content?.content || (responseType.includes("BASE_64") ? label?.content : null);
    await pool.query(
      `
        update shipments
        set label_url = coalesce($2, label_url),
            label_base64 = coalesce($3, label_base64),
            updated_at = now()
        where provider = 'loggi' and order_id = $1
      `,
      [orderId, url, base64]
    );
    return { label_url: url, label_base64: base64 };
  } catch (error) {
    await pool.query(
      `update shipments set status = 'label_pending', updated_at = now() where provider = 'loggi' and order_id = $1`,
      [orderId]
    );
    return { label_error: String(error?.message || error) };
  }
}

export async function createLoggiShipmentForOrder(orderId) {
  if (process.env.LOGGI_AUTO_CREATE_SHIPMENT === "false") return { skipped: true, reason: "disabled" };
  const missingConfig = missingLoggiRuntimeEnv({ includeServices: false });
  if (missingConfig.length) return { skipped: true, reason: "config_missing", missingConfig };

  const existing = await pool.query(`select id, status from shipments where provider = 'loggi' and order_id = $1`, [orderId]);
  if (existing.rowCount) return { skipped: true, reason: "already_exists", shipmentId: existing.rows[0].id };

  const orderRes = await pool.query(
    `
      select id, status, currency, total_cents, subtotal_cents, delivery_mode,
             shipping_provider, shipping_service_id, shipping_address, shipping_number,
             shipping_complement, shipping_neighborhood, shipping_city, shipping_state,
             shipping_zipcode, customer_name, customer_email, customer_phone, customer_document
      from orders
      where id = $1
      limit 1
    `,
    [orderId]
  );
  if (!orderRes.rowCount) return { skipped: true, reason: "order_not_found" };
  const order = orderRes.rows[0];
  if (order.status !== "paid") return { skipped: true, reason: "order_not_paid" };
  if (order.delivery_mode === "pickup") return { skipped: true, reason: "pickup" };
  if (order.shipping_provider !== "loggi") return { skipped: true, reason: "provider_not_loggi" };
  const recipient = buildRecipient(order);
  if (![11, 14].includes(recipient.federalTaxId.length)) {
    return { skipped: true, reason: "recipient_tax_id_missing" };
  }

  const payload = {
    shipFrom: {
      name: process.env.LOGGI_ORIGIN_NAME || "TECH 7",
      federalTaxId: process.env.LOGGI_ORIGIN_TAX_ID || "00000000000000",
      address: loggiOriginAddress()
    },
    shipTo: {
      ...recipient,
      address: buildDestination(order)
    },
    packages: [packageDefaults(order)],
    externalServiceId: order.shipping_service_id
  };

  const result = await loggiFetch(`/v1/companies/${encodeURIComponent(loggiCompanyId())}/async-shipments`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const pkg = Array.isArray(result?.packages) ? result.packages[0] || {} : {};

  await pool.query(
    `
      insert into shipments (
        order_id, provider, status, external_service_id, loggi_key,
        tracking_code, barcode, sequence, raw_json
      )
      values ($1, 'loggi', 'created', $2, $3, $4, $5, $6, $7)
      on conflict (provider, order_id)
      do update set
        status = excluded.status,
        external_service_id = excluded.external_service_id,
        loggi_key = excluded.loggi_key,
        tracking_code = excluded.tracking_code,
        barcode = excluded.barcode,
        sequence = excluded.sequence,
        raw_json = excluded.raw_json,
        updated_at = now()
    `,
    [
      orderId,
      order.shipping_service_id,
      pkg.loggiKey || null,
      pkg.trackingCode || null,
      pkg.barcode || null,
      pkg.sequence || null,
      JSON.stringify(result)
    ]
  );

  const label = await generateLabel(orderId, pkg.loggiKey || null);
  return { ok: true, package: pkg, label };
}
