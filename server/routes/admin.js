import express from "express";
import crypto from "node:crypto";
import { pool } from "../lib/db.js";

export const router = express.Router();
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function normalizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

function productUrlFromRow(row) {
  const section = normalizeSegment(row?.section);
  const brand = normalizeSegment(row?.brand);
  const slug = normalizeSegment(row?.slug);
  const parts = [];

  if (section) parts.push(section);
  if (brand && brand !== "tech7" && brand !== "catalogo") parts.push(brand);
  if (slug) parts.push(slug);

  if (!parts.length) return "";
  return `${parts.join("/")}/index.html`;
}

function adminAuth(req, res, next) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "missing_session" });
  const sessionToken = header.slice(7).trim();
  const found = sessions.get(sessionToken);
  if (!found || found.expiresAt < Date.now()) {
    sessions.delete(sessionToken);
    return res.status(401).json({ error: "invalid_session" });
  }
  if (found.expiresAt - Date.now() < SESSION_TTL_MS / 2) {
    found.expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionToken, found);
  }
  return next();
}

function resolveAdminCredentials() {
  const username = String(process.env.ADMIN_USERNAME || "eduardomourao").trim();
  const password = String(process.env.ADMIN_PASSWORD || "32361417").trim();
  return { username, password };
}

router.post("/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();
  const admin = resolveAdminCredentials();
  if (username !== admin.username || password !== admin.password) {
    return res.status(401).json({ error: "invalid_token" });
  }
  const sessionToken = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionToken, {
    username: admin.username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return res.json({ ok: true, sessionToken, username: admin.username });
});

router.get("/products", adminAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const q = String(req.query.q || "").trim();

  const params = [];
  const filters = ["1=1"];
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(name ilike $${params.length} or brand ilike $${params.length} or section ilike $${params.length} or slug ilike $${params.length})`);
  }

  const countRes = await pool.query(`select count(*)::int as total from products where ${filters.join(" and ")}`, params);
  params.push(limit, offset);

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, active
      from products
      where ${filters.join(" and ")}
      order by updated_at desc nulls last, created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );

  res.json({
    total: countRes.rows[0]?.total || 0,
    limit,
    offset,
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      brand: r.brand,
      category: r.section,
      stock: 0,
      active: !!r.active,
      price: Number((Number(r.price_cents || 0) / 100).toFixed(2)),
      url: productUrlFromRow(r)
    }))
  });
});

router.put("/products/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const patch = req.body || {};

  const updates = [];
  const vals = [];

  if (patch.name != null) {
    vals.push(String(patch.name).trim());
    updates.push(`name = $${vals.length}`);
  }
  if (patch.brand != null) {
    vals.push(String(patch.brand).trim());
    updates.push(`brand = $${vals.length}`);
  }
  if (patch.category != null) {
    vals.push(String(patch.category).trim());
    updates.push(`section = $${vals.length}`);
  }
  if (patch.section != null) {
    vals.push(String(patch.section).trim());
    updates.push(`section = $${vals.length}`);
  }
  if (patch.active != null) {
    vals.push(!!patch.active);
    updates.push(`active = $${vals.length}`);
  }
  if (patch.price != null) {
    const cents = Math.max(0, Math.round(Number(patch.price) * 100));
    vals.push(cents);
    updates.push(`price_cents = $${vals.length}`);
  }

  if (!updates.length) return res.status(400).json({ error: "no_changes" });

  vals.push(id);
  const { rows } = await pool.query(
    `
      update products
      set ${updates.join(", ")}, updated_at = now()
      where id = $${vals.length}
      returning id, slug, name, brand, section, price_cents, active
    `,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: "product_not_found" });

  const p = rows[0];
  res.json({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.section,
    active: !!p.active,
    price: Number((Number(p.price_cents || 0) / 100).toFixed(2)),
    url: productUrlFromRow(p)
  });
});

router.post("/prices/bulk", adminAuth, async (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!updates.length) return res.status(400).json({ error: "updates_required" });

  await pool.query("begin");
  try {
    let changed = 0;
    for (const u of updates) {
      const id = String(u?.id || "");
      const price = Number(u?.price);
      if (!id || !Number.isFinite(price) || price < 0) continue;
      const cents = Math.round(price * 100);
      const r = await pool.query(
        `update products set price_cents = $2, updated_at = now() where id = $1`,
        [id, cents]
      );
      changed += r.rowCount || 0;
    }
    await pool.query("commit");
    return res.json({ ok: true, changed });
  } catch (e) {
    await pool.query("rollback");
    return res.status(500).json({ error: "bulk_update_failed" });
  }
});

router.get("/orders", adminAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const countRes = await pool.query(`select count(*)::int as total from orders`);
  const { rows } = await pool.query(
    `
      select o.id, o.status, o.total_cents, o.created_at,
             p.provider as payment_provider
      from orders o
      left join lateral (
        select provider from payments where order_id = o.id order by created_at desc limit 1
      ) p on true
      order by o.created_at desc
      limit $1 offset $2
    `,
    [limit, offset]
  );
  res.json({
    total: countRes.rows[0]?.total || 0,
    limit,
    offset,
    items: rows.map((o) => ({
      id: o.id,
      customer_name: "Cliente",
      customer_email: "-",
      total: Number((Number(o.total_cents || 0) / 100).toFixed(2)),
      status: o.status,
      payment_provider: o.payment_provider || "-",
      created_at: o.created_at
    }))
  });
});

router.get("/orders/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const ordRes = await pool.query(
    `select id, status, total_cents, created_at from orders where id = $1 limit 1`,
    [id]
  );
  if (!ordRes.rows.length) return res.status(404).json({ error: "order_not_found" });
  const o = ordRes.rows[0];

  const itemsRes = await pool.query(
    `
      select oi.qty, oi.unit_price_cents, oi.line_total_cents, p.name
      from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = $1
      order by oi.created_at asc
    `,
    [id]
  );

  res.json({
    id: o.id,
    customer_name: "Cliente",
    customer_email: "-",
    customer_phone: "-",
    customer_document: "-",
    shipping_address: "",
    shipping_number: "",
    shipping_neighborhood: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zipcode: "",
    subtotal: Number((Number(o.total_cents || 0) / 100).toFixed(2)),
    shipping_total: 0,
    total: Number((Number(o.total_cents || 0) / 100).toFixed(2)),
    payment_provider: "-",
    status: o.status,
    created_at: o.created_at,
    items: itemsRes.rows.map((it) => ({
      product_name: it.name,
      quantity: Number(it.qty),
      unit_price: Number((Number(it.unit_price_cents || 0) / 100).toFixed(2)),
      total_price: Number((Number(it.line_total_cents || 0) / 100).toFixed(2))
    }))
  });
});

router.put("/orders/:id/status", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const allowed = new Set(["pending", "paid", "cancelled", "failed", "refunded"]);
  const status = String(req.body?.status || "");
  if (!allowed.has(status)) return res.status(400).json({ error: "invalid_status" });
  const r = await pool.query(`update orders set status = $2, updated_at = now() where id = $1`, [id, status]);
  if (!r.rowCount) return res.status(404).json({ error: "order_not_found" });
  res.json({ ok: true });
});
