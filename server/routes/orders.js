import express from "express";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { applyCatalogPrices, isValidPriceCents } from "../lib/prices.js";

export const router = express.Router();

async function getOrder(orderId) {
  const orderRes = await pool.query(
    `
    select id, status, currency, total_cents, subtotal_cents, shipping_total_cents,
           discount_cents, coupon_id, coupon_code, coupon_discount_cents,
           delivery_mode, shipping_provider, shipping_quote_id, shipping_service_id,
           shipping_service_label, shipping_slo_days, shipping_zipcode, shipping_address,
           shipping_number, shipping_complement, shipping_neighborhood, shipping_city,
           shipping_state, customer_name, customer_email, customer_phone, customer_document,
           created_at, updated_at, mp_preference_id
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

  const shipmentRes = await pool.query(
    `
      select status, loggi_key, tracking_code, barcode, label_url, updated_at
      from shipments
      where provider = 'loggi' and order_id = $1
      order by updated_at desc
      limit 1
    `,
    [orderId]
  ).catch(() => ({ rows: [] }));

  return { ...orderRes.rows[0], shipment: shipmentRes.rows[0] || null, items: itemsRes.rows };
}

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeShipping(input = {}) {
  const raw = input || {};
  const method = String(raw.deliveryMode || raw.metodo || raw.method || raw.carrier || "").toLowerCase();
  const deliveryMode = method === "retirada"
    ? "pickup"
    : method === "pickup"
      ? "pickup"
      : method === "uber"
        ? "uber"
        : "shipping";
  return {
    deliveryMode,
    quoteId: cleanText(raw.quoteId || raw.shippingQuoteId || raw.quote_id, 80),
    selectedServiceId: cleanText(raw.selectedServiceId || raw.serviceId || raw.shipping_service_id, 120),
    zipcode: cleanText(raw.cep || raw.zipcode, 16).replace(/\D/g, ""),
    address: cleanText(raw.logradouro || raw.address),
    number: cleanText(raw.numero || raw.number, 20),
    complement: cleanText(raw.complemento || raw.complement),
    neighborhood: cleanText(raw.bairro || raw.neighborhood, 80),
    city: cleanText(raw.cidade || raw.city, 80),
    state: cleanText(raw.estado || raw.state, 2).toUpperCase()
  };
}

function normalizeCustomer(input = {}) {
  return {
    name: cleanText(input.nome || input.name, 120),
    email: cleanText(input.email, 160),
    phone: cleanText(input.telefone || input.phone, 40),
    document: cleanText(input.documento || input.document || input.cpf || input.cnpj, 32).replace(/\D/g, "")
  };
}

function normalizeCoupon(input = {}) {
  const raw = input || {};
  return {
    code: cleanText(raw.code || raw.couponCode || raw.coupon_code, 80).toUpperCase().replace(/\s+/g, "")
  };
}

async function resolveCoupon({ coupon, subtotalCents }) {
  if (!coupon.code) {
    return {
      discountCents: 0,
      couponId: null,
      couponCode: null
    };
  }

  const couponRes = await pool.query(
    `select id, code, discount_cents, expires_at, active from coupons where lower(code) = lower($1) limit 1`,
    [coupon.code]
  );
  if (!couponRes.rowCount) {
    const error = new Error("coupon_not_found");
    error.status = 404;
    throw error;
  }
  const row = couponRes.rows[0];
  if (!row.active) {
    const error = new Error("coupon_inactive");
    error.status = 409;
    throw error;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const error = new Error("coupon_expired");
    error.status = 409;
    throw error;
  }
  const discountCents = Number(row.discount_cents || 0);
  if (!Number.isFinite(discountCents) || discountCents <= 0) {
    const error = new Error("invalid_coupon_discount");
    error.status = 409;
    throw error;
  }
  if (discountCents > subtotalCents) {
    const error = new Error("coupon_discount_exceeds_subtotal");
    error.status = 422;
    throw error;
  }
  return {
    discountCents,
    couponId: row.id,
    couponCode: row.code
  };
}

async function resolveShipping({ shipping, subtotalCents, currency }) {
  if (shipping.deliveryMode === "pickup") {
    return {
      shippingTotalCents: 0,
      provider: "pickup",
      quoteId: null,
      serviceId: null,
      label: "Retirada na loja",
      sloDays: null
    };
  }
  if (shipping.deliveryMode === "uber") {
    return {
      shippingTotalCents: 0,
      provider: "uber",
      quoteId: null,
      serviceId: null,
      label: "Entrega por Uber",
      sloDays: null
    };
  }
  if (!shipping.quoteId) {
    const error = new Error("shipping_quote_required");
    error.status = 400;
    throw error;
  }
  const quoteRes = await pool.query(
    `
      select id, provider, currency, subtotal_cents, destination_json, options_json,
             selected_service_id, selected_price_cents, selected_label, expires_at
      from shipping_quotes
      where id = $1 and status = 'active'
      limit 1
    `,
    [shipping.quoteId]
  );
  if (!quoteRes.rowCount) {
    const error = new Error("shipping_quote_not_found");
    error.status = 404;
    throw error;
  }
  const quote = quoteRes.rows[0];
  if (new Date(quote.expires_at).getTime() <= Date.now()) {
    const error = new Error("shipping_quote_expired");
    error.status = 409;
    throw error;
  }
  if ((quote.currency || "BRL") !== (currency || "BRL") || Number(quote.subtotal_cents || 0) !== subtotalCents) {
    const error = new Error("shipping_quote_mismatch");
    error.status = 409;
    throw error;
  }
  const options = Array.isArray(quote.options_json) ? quote.options_json : [];
  const selectedServiceId = shipping.selectedServiceId || quote.selected_service_id;
  const selected = options.find((option) => String(option.serviceId || "") === selectedServiceId) || options[0];
  if (!selected) {
    const error = new Error("shipping_option_not_found");
    error.status = 409;
    throw error;
  }
  const priceCents = Number(selected.priceCents ?? quote.selected_price_cents ?? 0);
  await pool.query(
    `
      update shipping_quotes
      set selected_service_id = $2, selected_price_cents = $3, selected_label = $4
      where id = $1
    `,
    [quote.id, selected.serviceId, priceCents, selected.label || quote.selected_label || "Melhor Envio"]
  );
  return {
    shippingTotalCents: priceCents,
    provider: quote.provider || "melhor_envio",
    quoteId: quote.id,
    serviceId: selected.serviceId,
    label: selected.label || quote.selected_label || "Melhor Envio",
    sloDays: Number.isFinite(Number(selected.sloInDays)) ? Number(selected.sloInDays) : null
  };
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
  const shipping = normalizeShipping(req.body?.shipping || {});
  const customer = normalizeCustomer(req.body?.customer || {});
  const coupon = normalizeCoupon(req.body?.coupon || req.body || {});

  await pool.query("begin");
  try {
    let subtotal = 0;
    for (const r of pricedItems) subtotal += Number(r.price_cents) * Number(r.qty);
    const couponInfo = await resolveCoupon({ coupon, subtotalCents: subtotal });
    const shippingInfo = await resolveShipping({ shipping, subtotalCents: subtotal, currency });
    const discount = Number(couponInfo.discountCents || 0);
    const total = Math.max(0, subtotal - discount) + Number(shippingInfo.shippingTotalCents || 0);

    await pool.query(
      `
        insert into orders (
          id, status, currency, subtotal_cents, shipping_total_cents, discount_cents,
          coupon_id, coupon_code, coupon_discount_cents, total_cents,
          cart_id, customer_name, customer_email, customer_phone, customer_document, delivery_mode,
          shipping_provider, shipping_quote_id, shipping_service_id, shipping_service_label,
          shipping_slo_days, shipping_zipcode, shipping_address, shipping_number,
          shipping_complement, shipping_neighborhood, shipping_city, shipping_state
        )
        values (
          $1, 'pending', $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27
        )
      `,
      [
        orderId,
        currency,
        subtotal,
        shippingInfo.shippingTotalCents,
        discount,
        couponInfo.couponId,
        couponInfo.couponCode,
        discount,
        total,
        cartId,
        customer.name || "Cliente",
        customer.email || null,
        customer.phone || null,
        customer.document || null,
        shipping.deliveryMode,
        shippingInfo.provider,
        shippingInfo.quoteId,
        shippingInfo.serviceId,
        shippingInfo.label,
        shippingInfo.sloDays,
        shipping.zipcode || null,
        shipping.address || null,
        shipping.number || null,
        shipping.complement || null,
        shipping.neighborhood || null,
        shipping.city || null,
        shipping.state || null
      ]
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
    if (e?.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const full = await getOrder(orderId);
  res.status(201).json(full);
});
