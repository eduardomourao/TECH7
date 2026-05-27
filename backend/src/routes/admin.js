import { Router } from "express";
import { supabase, isSupabaseConfigured, mockDb, mockFilter, mockUpdate } from "../services/supabase.js";

export const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// --- Auth middleware ---
function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }
  const token = header.slice(7);
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "invalid_token" });
  }
  req.admin = { token: true };
  next();
}

// ---------------------------------------------------------------
// POST /api/admin/login
// ---------------------------------------------------------------
router.post("/login", (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "invalid_token" });
  }
  res.json({ ok: true, admin: { name: "Admin" } });
});

// ---------------------------------------------------------------
// GET /api/admin/products
// ---------------------------------------------------------------
router.get("/products", adminAuth, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    if (isSupabaseConfigured) {
      const { data, error, count } = await supabase
        .from("products")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return res.json({ items: data || [], total: count ?? 0, limit, offset });
    }

    const total = mockDb.products.length;
    const items = [...mockDb.products]
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(offset, offset + limit);
    res.json({ items, total, limit, offset });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------
// PUT /api/admin/products/:id
// ---------------------------------------------------------------
router.put("/products/:id", adminAuth, async (req, res, next) => {
  try {
    const allowed = ["slug", "name", "description", "price", "old_price", "stock", "image_url", "category", "brand", "active"];
    const changes = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) changes[key] = req.body[key];
    }
    if (changes.price !== undefined) changes.price = Math.max(0, Number(changes.price));
    if (changes.old_price !== undefined) changes.old_price = Math.max(0, Number(changes.old_price));
    if (changes.stock !== undefined) changes.stock = Math.max(0, Number(changes.stock));
    if (Object.keys(changes).length === 0) return res.status(400).json({ error: "no_fields_to_update" });

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from("products")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error?.code === "PGRST116") return res.status(404).json({ error: "product_not_found" });
      if (error) throw error;
      return res.json(data);
    }

    const { data } = mockUpdate("products", "id", req.params.id, changes);
    if (!data) return res.status(404).json({ error: "product_not_found" });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------
// GET /api/admin/orders
// ---------------------------------------------------------------
router.get("/orders", adminAuth, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = req.query.status;

    if (isSupabaseConfigured) {
      let q = supabase.from("orders").select("*", { count: "exact" });
      if (status) q = q.eq("status", status);
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;

      const result = [];
      for (const row of data || []) {
        const { data: items } = await supabase.from("order_items").select("*").eq("order_id", row.id).order("id");
        result.push({ ...row, items: items || [] });
      }
      return res.json({ items: result, total: count ?? result.length, limit, offset });
    }

    let orders = mockDb.orders;
    if (status) orders = orders.filter((o) => o.status === status);
    const total = orders.length;
    const sliced = orders.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(offset, offset + limit);
    const result = sliced.map((o) => ({ ...o, items: mockDb.order_items.filter((i) => i.order_id === o.id) }));
    res.json({ items: result, total, limit, offset });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------
// GET /api/admin/orders/:id
// ---------------------------------------------------------------
router.get("/orders/:id", adminAuth, async (req, res, next) => {
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from("orders").select("*").eq("id", req.params.id).maybeSingle();
      if (!data) return res.status(404).json({ error: "order_not_found" });
      if (error) throw error;

      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", req.params.id).order("id");
      return res.json({ ...data, items: items || [] });
    }

    const order = mockDb.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "order_not_found" });
    const items = mockDb.order_items.filter((i) => i.order_id === req.params.id);
    res.json({ ...order, items });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------
// PUT /api/admin/orders/:id/status
// ---------------------------------------------------------------
router.put("/orders/:id/status", adminAuth, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const validStatuses = ["pending", "paid", "cancelled", "failed", "refunded"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `invalid status. valid: ${validStatuses.join(", ")}` });
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from("orders")
        .update({ status, payment_status: status, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (!data) return res.status(404).json({ error: "order_not_found" });
      if (error) throw error;
      return res.json({ ...data, status });
    }

    const idx = mockDb.orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "order_not_found" });
    mockDb.orders[idx].status = status;
    mockDb.orders[idx].payment_status = status;
    res.json({ ...mockDb.orders[idx], status });
  } catch (e) {
    next(e);
  }
});
