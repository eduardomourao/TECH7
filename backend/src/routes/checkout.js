import { Router } from "express";
import { supabase, isSupabaseConfigured, mockDb, mockInsert, mockFilter } from "../services/supabase.js";
import {
  isMercadoPagoConfigured,
  createMercadoPagoPreference,
  createMockCheckout,
  getPaymentInfo,
  mapStatus,
} from "../services/mercadopago.js";
import { sanitizeString, validateEmail } from "../services/validators.js";

export const router = Router();

// ================================================================
// POST /api/checkout/create
// ================================================================
router.post("/create", async (req, res, next) => {
  try {
    const { items, customer, shipping } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "items array is required" });
    if (!customer || !customer.name || !customer.email)
      return res.status(400).json({ error: "customer name and email are required" });
    if (!validateEmail(customer.email))
      return res.status(400).json({ error: "invalid email" });

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const qty = Math.max(1, Math.min(99, Number(item.qty) || 1));
      const unitPrice = Math.max(0, Number(item.price || 0));
      const totalPrice = +(unitPrice * qty).toFixed(2);
      subtotal += totalPrice;
      orderItems.push({
        order_id: orderId,
        product_id: item.productId,
        product_name: String(item.name || "Produto").slice(0, 300),
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice,
        created_at: now,
      });
    }

    const shippingTotal = Math.max(0, Number(shipping?.cost || 0));
    const total = +(subtotal + shippingTotal).toFixed(2);

    const orderRow = {
      id: orderId,
      customer_id: null,
      customer_name: sanitizeString(customer.name, 200),
      customer_email: sanitizeString(customer.email, 200).toLowerCase(),
      customer_phone: customer.phone ? sanitizeString(customer.phone, 20) : null,
      customer_document: customer.document ? sanitizeString(customer.document, 18) : null,
      shipping_zipcode: shipping?.zipcode || null,
      shipping_address: shipping?.address || null,
      shipping_number: shipping?.number ? String(shipping.number) : null,
      shipping_complement: shipping?.complement || null,
      shipping_neighborhood: shipping?.neighborhood || null,
      shipping_city: shipping?.city || null,
      shipping_state: shipping?.state || null,
      subtotal: +subtotal.toFixed(2),
      shipping_total: shippingTotal,
      discount_total: 0,
      total,
      status: "pending",
      payment_status: "pending",
      created_at: now,
      updated_at: now,
    };

    // --- Persist order ---
    if (isSupabaseConfigured) {
      const { data: existing } = await supabase
        .from("customers").select("id")
        .eq("email", orderRow.customer_email)
        .maybeSingle();

      let customerId = existing?.id;
      if (!customerId) {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({
            id: crypto.randomUUID(),
            name: orderRow.customer_name,
            email: orderRow.customer_email,
            phone: orderRow.customer_phone,
            document: orderRow.customer_document,
          })
          .select()
          .single();
        customerId = newCust?.id;
      }
      orderRow.customer_id = customerId || null;

      const { error: ordErr } = await supabase.from("orders").insert(orderRow);
      if (ordErr) throw ordErr;

      if (orderItems.length > 0) {
        const { error: itemErr } = await supabase.from("order_items").insert(orderItems);
        if (itemErr) throw itemErr;
      }
    } else {
      let cust = mockDb.customers.find((c) => c.email === orderRow.customer_email);
      if (!cust) {
        const { data } = mockInsert("customers", {
          id: crypto.randomUUID(),
          name: orderRow.customer_name,
          email: orderRow.customer_email,
          phone: orderRow.customer_phone,
          document: orderRow.customer_document,
        });
        cust = data;
      }
      orderRow.customer_id = cust.id;
      mockInsert("orders", orderRow);
      for (const oi of orderItems) mockInsert("order_items", oi);
    }

    // --- Payment ---
    const orderPayload = {
      id: orderId,
      items: orderItems,
      currency: "BRL",
      customer: { name: orderRow.customer_name, email: orderRow.customer_email },
    };

    let payment;
    if (isMercadoPagoConfigured()) {
      try {
        payment = await createMercadoPagoPreference(orderPayload);
        await updatePayment(orderId, { provider: "mercadopago", id: payment.preferenceId, status: "pending" });
      } catch (mpErr) {
        console.warn("[checkout] MP failed, falling back to mock:", mpErr.message);
        payment = await createMockCheckout(orderId);
        await updatePayment(orderId, { provider: "mock", id: null, status: "pending" });
      }
    } else {
      payment = await createMockCheckout(orderId);
      await updatePayment(orderId, { provider: "mock", id: null, status: "pending" });
    }

    res.status(201).json({
      orderId,
      total,
      totalFormatted: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      payment,
    });
  } catch (e) {
    next(e);
  }
});

async function updatePayment(orderId, { provider, id, status }) {
  const updates = {
    payment_provider: provider,
    payment_id: id,
    payment_status: status,
    updated_at: new Date().toISOString(),
  };
  if (isSupabaseConfigured) {
    await supabase.from("orders").update(updates).eq("id", orderId);
  } else {
    const idx = mockDb.orders.findIndex((o) => o.id === orderId);
    if (idx !== -1) Object.assign(mockDb.orders[idx], updates);
  }
}

// ================================================================
// POST /api/checkout/webhook  — Mercado Pago notification
// ================================================================
// Uses express.raw() middleware (registered in server.js), so
// req.body is a Buffer. We parse it here.
router.post("/webhook", async (req, res) => {
  try {
    // Parse raw body (MP sends JSON)
    let payload = {};
    if (Buffer.isBuffer(req.body)) {
      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch {
        // Try form-encoded
        const text = req.body.toString("utf8");
        const params = new URLSearchParams(text);
        payload = Object.fromEntries(params.entries());
        // MP sometimes sends: data_id=123&type=payment
        if (payload.data_id) payload.data = { id: payload.data_id };
      }
    } else if (typeof req.body === "object") {
      payload = req.body;
    }

    const paymentId = payload?.data?.id || payload?.data_id || null;
    const topic = payload?.type || payload?.topic || "payment";

    // Acknowledge immediately so MP doesn't retry
    if (!paymentId || topic !== "payment") {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Fetch payment details via SDK
    const payment = await getPaymentInfo(paymentId);
    const orderId = payment.externalReference;

    if (!orderId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const newStatus = payment.status; // "paid", "pending", etc.

    if (isSupabaseConfigured) {
      await supabase
        .from("orders")
        .update({
          payment_status: newStatus,
          status: newStatus,
          payment_id: String(paymentId),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
    } else {
      const idx = mockDb.orders.findIndex((o) => o.id === orderId);
      if (idx !== -1) {
        mockDb.orders[idx].payment_status = newStatus;
        mockDb.orders[idx].status = newStatus;
        mockDb.orders[idx].payment_id = String(paymentId);
      }
    }

    res.status(200).json({ ok: true, orderId, status: newStatus });
  } catch (e) {
    console.error("[webhook] Error:", e.message);
    res.status(200).json({ ok: true, error: e.message });
  }
});
