import { Router } from "express";
import { supabase, isSupabaseConfigured, mockDb, mockFilter, mockInsert } from "../services/supabase.js";
import { sanitizeString, validateEmail } from "../services/validators.js";

export const router = Router();

function formatOrder(row) {
  if (!row) return null;
  const r = typeof row === "object" && !Array.isArray(row) ? row : {};
  return {
    id: r.id,
    customer: {
      id: r.customer_id,
      name: r.customer_name,
      email: r.customer_email,
      phone: r.customer_phone,
      document: r.customer_document,
    },
    shipping: {
      zipcode: r.shipping_zipcode,
      address: r.shipping_address,
      number: r.shipping_number,
      complement: r.shipping_complement,
      neighborhood: r.shipping_neighborhood,
      city: r.shipping_city,
      state: r.shipping_state,
    },
    subtotal: Number(r.subtotal || 0),
    shippingTotal: Number(r.shipping_total || 0),
    discountTotal: Number(r.discount_total || 0),
    total: Number(r.total || 0),
    status: r.status,
    payment: {
      status: r.payment_status,
      provider: r.payment_provider,
      id: r.payment_id,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// POST /api/orders — create order
router.post("/", async (req, res, next) => {
  try {
    const { items, customer, shipping } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "items array is required" });
    if (!customer || !customer.name || !customer.email)
      return res.status(400).json({ error: "customer name and email required" });
    if (!validateEmail(customer.email))
      return res.status(400).json({ error: "invalid email" });

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const qty = Math.max(1, Math.min(99, Number(item.qty) || 1));
      const unitPrice = Math.max(0, Number(item.price || item.unitPrice || 0));
      const totalPrice = +(unitPrice * qty).toFixed(2);
      subtotal += totalPrice;
      orderItems.push({
        order_id: orderId,
        product_id: item.productId,
        product_name: String(item.name || item.productName || "Produto").slice(0, 300),
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice,
        created_at: now,
      });
    }

    const shippingTotal = Math.max(0, Number(shipping?.cost || shipping?.shippingTotal || 0));
    const discountTotal = Math.max(0, Number(shipping?.discount || 0));
    const total = +(subtotal + shippingTotal - discountTotal).toFixed(2);

    const orderRow = {
      id: orderId,
      customer_id: customer.id || null,
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
      discount_total: discountTotal,
      total,
      status: "pending",
      payment_status: "pending",
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured) {
      // Upsert customer by email
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("email", orderRow.customer_email)
        .maybeSingle();

      let customerId = existing?.id;
      if (!customerId && customer.name) {
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

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .insert(orderRow)
        .select()
        .single();
      if (ordErr) throw ordErr;

      if (orderItems.length > 0) {
        const { error: itemErr } = await supabase.from("order_items").insert(orderItems);
        if (itemErr) throw itemErr;
      }

      const { data: itemsData } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("id");

      return res.status(201).json({ ...formatOrder(ord), items: itemsData || [] });
    }

    // --- mock ---
    const { data: ord } = mockInsert("orders", orderRow);
    for (const oi of orderItems) mockInsert("order_items", oi);

    const mockItems = mockFilter(mockDb.order_items, { eq: { order_id: orderId } }).data;
    res.status(201).json({ ...formatOrder(ord), items: mockItems });
  } catch (e) {
    next(e);
  }
});

// GET /api/orders — list
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    if (isSupabaseConfigured) {
      const { data, error, count } = await supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;

      const result = [];
      for (const row of data || []) {
        const { data: items } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", row.id)
          .order("id");
        result.push({ ...formatOrder(row), items: items || [] });
      }
      return res.json({ items: result, total: count ?? result.length, limit, offset });
    }

    const { data: orders } = mockFilter(mockDb.orders, { order: ["created_at", "desc"], limit, offset });
    const result = orders.map((o) => ({
      ...formatOrder(o),
      items: mockFilter(mockDb.order_items, { eq: { order_id: o.id } }).data,
    }));
    res.json({ items: result, total: mockDb.orders.length, limit, offset });
  } catch (e) {
    next(e);
  }
});

// GET /api/orders/:id
router.get("/:id", async (req, res, next) => {
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (!data) return res.status(404).json({ error: "order_not_found" });
      if (error) throw error;

      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", req.params.id)
        .order("id");

      return res.json({ ...formatOrder(data), items: items || [] });
    }

    const order = mockDb.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "order_not_found" });
    const items = mockDb.order_items.filter((i) => i.order_id === req.params.id);
    res.json({ ...formatOrder(order), items });
  } catch (e) {
    next(e);
  }
});
