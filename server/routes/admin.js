import express from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../lib/db.js";
import { applyCatalogPrices, isValidPriceCents } from "../lib/prices.js";
import { normalizeProductSegment, productUrlFromRow } from "../lib/product-url.js";
import { rateLimit } from "../middleware/rate_limit.js";

export const router = express.Router();
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SESSION_COOKIE = "tech7_admin_session";

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf("=");
      if (idx > -1) acc[decodeURIComponent(part.slice(0, idx))] = decodeURIComponent(part.slice(idx + 1));
      return acc;
    }, {});
}

function readSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  if (cookies[SESSION_COOKIE]) return cookies[SESSION_COOKIE];
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function sessionCookieOptions(req, maxAgeSeconds) {
  const secure = isProduction() || req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https");
  return [
    `${SESSION_COOKIE}=`,
    "Path=/api/admin",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds || 0))}`,
    secure ? "Secure" : ""
  ].filter(Boolean);
}

function setSessionCookie(req, res, token) {
  const parts = sessionCookieOptions(req, Math.floor(SESSION_TTL_MS / 1000));
  parts[0] = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", sessionCookieOptions(req, 0).join("; "));
}

function adminAuth(req, res, next) {
  const sessionToken = readSessionToken(req);
  if (!sessionToken) return res.status(401).json({ error: "missing_session" });
  const sessionKey = hashSessionToken(sessionToken);
  const found = sessions.get(sessionKey);
  if (!found || found.expiresAt < Date.now()) {
    sessions.delete(sessionKey);
    return res.status(401).json({ error: "invalid_session" });
  }
  if (found.expiresAt - Date.now() < SESSION_TTL_MS / 2) {
    found.expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionKey, found);
  }
  req.adminSessionKey = sessionKey;
  req.adminUser = found.username;
  return next();
}

function resolveAdminCredentials() {
  const username = String(process.env.ADMIN_USERNAME || "").trim();
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (!username || !passwordHash) return null;
  return { username, passwordHash };
}

export function validateAdminConfig() {
  if (!resolveAdminCredentials()) {
    const message = "Missing admin env vars: ADMIN_USERNAME and ADMIN_PASSWORD_HASH";
    if (isProduction()) throw new Error(message);
    return { ok: false, error: message };
  }
  return { ok: true };
}

router.post("/login", rateLimit({
  keyPrefix: "admin-login",
  windowMs: 15 * 60 * 1000,
  limit: 5,
  key: (req, ip) => `${ip}:${String(req.body?.username || "").trim().toLowerCase()}`
}), async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();
  const admin = resolveAdminCredentials();
  if (!admin) return res.status(503).json({ error: "admin_not_configured" });
  const passwordOk = await bcrypt.compare(password, admin.passwordHash).catch(() => false);
  if (username !== admin.username || !passwordOk) {
    return res.status(401).json({ error: "invalid_token" });
  }
  const sessionToken = crypto.randomBytes(32).toString("hex");
  sessions.set(hashSessionToken(sessionToken), {
    username: admin.username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  setSessionCookie(req, res, sessionToken);
  return res.json({ ok: true, username: admin.username });
});

router.post("/logout", adminAuth, (req, res) => {
  if (req.adminSessionKey) sessions.delete(req.adminSessionKey);
  clearSessionCookie(req, res);
  return res.json({ ok: true });
});

router.get("/session", adminAuth, (req, res) => {
  return res.json({ ok: true, username: req.adminUser || null });
});

router.get("/products", adminAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const q = String(req.query.q || "").trim();
  const brand = String(req.query.brand || "").trim();
  const category = String(req.query.category || "").trim();
  const active = String(req.query.active || "").trim();

  const params = [];
  const filters = ["1=1"];
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(name ilike $${params.length} or brand ilike $${params.length} or section ilike $${params.length} or slug ilike $${params.length})`);
  }
  if (brand) {
    params.push(brand);
    filters.push(`coalesce(brand, '') = $${params.length}`);
  }
  if (category) {
    params.push(category);
    filters.push(`coalesce(section, '') = $${params.length}`);
  }
  if (active === "true" || active === "false") {
    params.push(active === "true");
    filters.push(`active = $${params.length}`);
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

  const pricedRows = await applyCatalogPrices(rows);
  res.json({
    total: countRes.rows[0]?.total || 0,
    limit,
    offset,
    items: pricedRows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      brand: r.brand,
      category: r.section,
      stock: 0,
      active: !!r.active,
      price: Number((Number(r.price_cents || 0) / 100).toFixed(2)),
      price_available: !!r.price_available,
      price_status: r.price_status || "consult",
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
  const status = String(req.query.status || "").trim();

  const params = [];
  const filters = ["1=1"];
  if (status) {
    params.push(status);
    filters.push(`o.status = $${params.length}`);
  }

  const countRes = await pool.query(`select count(*)::int as total from orders o where ${filters.join(" and ")}`, params);
  params.push(limit, offset);
  const { rows } = await pool.query(
    `
      select o.id, o.status, o.total_cents, o.created_at,
             p.provider as payment_provider
      from orders o
      left join lateral (
        select provider from payments where order_id = o.id order by created_at desc limit 1
      ) p on true
      where ${filters.join(" and ")}
      order by o.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
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

router.get("/metrics", adminAuth, async (_req, res) => {
  const [
    productsRows,
    ordersSummary,
    brandRows,
    categoryRows,
    statusRows,
    paymentRows,
    topProductRows,
    recentOrders
  ] = await Promise.all([
    pool.query(`select id, slug, name, brand, section, price_cents, active from products`),
    pool.query(`
      select
        count(*)::int as total,
        coalesce(sum(total_cents), 0)::bigint as revenue_cents,
        coalesce(avg(nullif(total_cents, 0)), 0)::int as avg_ticket_cents,
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'paid')::int as paid,
        count(*) filter (where status in ('cancelled', 'failed', 'refunded'))::int as problem,
        count(*) filter (where created_at >= current_date)::int as today,
        coalesce(sum(total_cents) filter (where created_at >= current_date), 0)::bigint as today_revenue_cents,
        count(*) filter (where created_at >= now() - interval '7 days')::int as last_7_days,
        coalesce(sum(total_cents) filter (where created_at >= now() - interval '7 days'), 0)::bigint as last_7_days_revenue_cents
      from orders
    `),
    pool.query(`
      select coalesce(nullif(brand, ''), 'Sem marca') as label, count(*)::int as value
      from products
      group by 1
      order by value desc, label asc
      limit 10
    `),
    pool.query(`
      select coalesce(nullif(section, ''), 'Sem categoria') as label, count(*)::int as value
      from products
      group by 1
      order by value desc, label asc
      limit 10
    `),
    pool.query(`
      select status as label, count(*)::int as value, coalesce(sum(total_cents), 0)::bigint as revenue_cents
      from orders
      group by status
      order by value desc, label asc
    `),
    pool.query(`
      select coalesce(nullif(provider, ''), 'Sem provedor') as label, count(*)::int as value, coalesce(sum(amount_cents), 0)::bigint as revenue_cents
      from payments
      group by 1
      order by value desc, label asc
      limit 8
    `),
    pool.query(`
      select p.id, p.name, p.brand, coalesce(sum(oi.qty), 0)::int as qty, coalesce(sum(oi.line_total_cents), 0)::bigint as revenue_cents
      from order_items oi
      join products p on p.id = oi.product_id
      group by p.id, p.name, p.brand
      order by revenue_cents desc, qty desc
      limit 8
    `),
    pool.query(`
      select o.id, o.status, o.total_cents, o.created_at,
             p.provider as payment_provider
      from orders o
      left join lateral (
        select provider from payments where order_id = o.id order by created_at desc limit 1
      ) p on true
      order by o.created_at desc
      limit 8
    `)
  ]);

  const pricedProducts = await applyCatalogPrices(productsRows.rows);
  const validPrices = pricedProducts
    .map((p) => Number(p.price_cents || 0))
    .filter((price) => isValidPriceCents(price));
  const avgPriceCents = validPrices.length
    ? Math.round(validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length)
    : 0;
  const product = {
    total: pricedProducts.length,
    active: pricedProducts.filter((p) => !!p.active).length,
    inactive: pricedProducts.filter((p) => !p.active).length,
    zero_price: pricedProducts.filter((p) => !isValidPriceCents(p.price_cents)).length,
    avg_price_cents: avgPriceCents,
    min_price_cents: validPrices.length ? Math.min(...validPrices) : 0,
    max_price_cents: validPrices.length ? Math.max(...validPrices) : 0
  };
  const order = ordersSummary.rows[0] || {};
  res.json({
    generated_at: new Date().toISOString(),
    products: {
      total: Number(product.total || 0),
      active: Number(product.active || 0),
      inactive: Number(product.inactive || 0),
      zero_price: Number(product.zero_price || 0),
      avg_price: Number((Number(product.avg_price_cents || 0) / 100).toFixed(2)),
      min_price: Number((Number(product.min_price_cents || 0) / 100).toFixed(2)),
      max_price: Number((Number(product.max_price_cents || 0) / 100).toFixed(2)),
      by_brand: brandRows.rows.map((r) => ({ label: r.label, value: Number(r.value || 0) })),
      by_category: categoryRows.rows.map((r) => ({ label: r.label, value: Number(r.value || 0) }))
    },
    orders: {
      total: Number(order.total || 0),
      revenue: Number((Number(order.revenue_cents || 0) / 100).toFixed(2)),
      avg_ticket: Number((Number(order.avg_ticket_cents || 0) / 100).toFixed(2)),
      pending: Number(order.pending || 0),
      paid: Number(order.paid || 0),
      problem: Number(order.problem || 0),
      today: Number(order.today || 0),
      today_revenue: Number((Number(order.today_revenue_cents || 0) / 100).toFixed(2)),
      last_7_days: Number(order.last_7_days || 0),
      last_7_days_revenue: Number((Number(order.last_7_days_revenue_cents || 0) / 100).toFixed(2)),
      by_status: statusRows.rows.map((r) => ({
        label: r.label,
        value: Number(r.value || 0),
        revenue: Number((Number(r.revenue_cents || 0) / 100).toFixed(2))
      })),
      by_payment_provider: paymentRows.rows.map((r) => ({
        label: r.label,
        value: Number(r.value || 0),
        revenue: Number((Number(r.revenue_cents || 0) / 100).toFixed(2))
      })),
      recent: recentOrders.rows.map((o) => ({
        id: o.id,
        status: o.status,
        total: Number((Number(o.total_cents || 0) / 100).toFixed(2)),
        payment_provider: o.payment_provider || "-",
        created_at: o.created_at
      }))
    },
    top_products: topProductRows.rows.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      qty: Number(p.qty || 0),
      revenue: Number((Number(p.revenue_cents || 0) / 100).toFixed(2))
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
