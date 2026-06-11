import express from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { applyCatalogPrices, isValidPriceCents, priceToCents } from "../lib/prices.js";
import { normalizeProductSegment, productUrlFromRow } from "../lib/product-url.js";
import { normalizePublicImageUrl } from "../lib/images.js";
import { rateLimit } from "../middleware/rate_limit.js";
import { createLoggiShipmentForOrder } from "../lib/loggi_fulfillment.js";

export const router = express.Router();
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SESSION_COOKIE = "tech7_admin_session";
const MAX_TEXT = 12000;
const COMPLETED_ORDER_STATUS_SQL = "('paid', 'completed')";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const SECTION_ALIASES = new Map(Object.entries({
  display: "display-e-lcd",
  "display-lcd": "display-e-lcd",
  "display-e-lcd": "display-e-lcd",
  "tela-display-lcd": "display-e-lcd",
  "telas-display-lcd": "display-e-lcd",
  bateria: "baterias-celular",
  baterias: "baterias-celular",
  "bateria-celular": "baterias-celular",
  "baterias-celular": "baterias-celular",
  peca: "pecas-e-componentes",
  pecas: "pecas-e-componentes",
  componente: "pecas-e-componentes",
  componentes: "pecas-e-componentes",
  "pecas-componentes": "pecas-e-componentes",
  "pecas-e-componentes": "pecas-e-componentes",
  tampa: "tampas-e-carcacas",
  tampas: "tampas-e-carcacas",
  carcaca: "tampas-e-carcacas",
  carcacas: "tampas-e-carcacas",
  "tampas-carcacas": "tampas-e-carcacas",
  "tampas-e-carcacas": "tampas-e-carcacas",
  touch: "touchs-e-visores",
  touchs: "touchs-e-visores",
  "touch-visor": "touchs-e-visores",
  "touch-e-visor": "touchs-e-visores",
  "touchs-visores": "touchs-e-visores",
  "touchs-e-visores": "touchs-e-visores",
  ferramenta: "maquinas-e-ferramentas",
  ferramentas: "maquinas-e-ferramentas",
  "maquinas-ferramentas": "maquinas-e-ferramentas",
  "maquinas-e-ferramentas": "maquinas-e-ferramentas"
}));

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

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function canonicalSection(value) {
  const normalized = slugify(value);
  return SECTION_ALIASES.get(normalized) || normalized;
}

function cleanText(value, max = MAX_TEXT) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function htmlToText(value) {
  return cleanText(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "), MAX_TEXT);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeDescriptionHtml(value) {
  const text = cleanText(value, MAX_TEXT);
  if (!text) return "";
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function parseMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeImages(input, primaryInput = "") {
  const raw = [];
  if (primaryInput) raw.push(primaryInput);
  if (Array.isArray(input)) {
    raw.push(...input);
  } else if (typeof input === "string") {
    raw.push(...input.split(/\r?\n|,/));
  }

  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const url = normalizePublicImageUrl(String(item || "").trim());
    if (!url || /^javascript:/i.test(url) || /[\s"'<>]/.test(url)) continue;
    if (!/^https?:\/\//i.test(url) && !/^\/[a-z0-9._~/%-]+$/i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out.slice(0, 12);
}

function parseOptionalBoolean(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "sim", "ativo"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não", "inativo"].includes(normalized)) return false;
  return fallback;
}

function parseStock(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 999999) : fallback;
}

function productSelectSql() {
  return `
    id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
    active, is_active, title, description_text, description_html, stock, availability,
    specifications, metadata, created_at, updated_at
  `;
}

function imagesFromRow(row) {
  const meta = parseMetadata(row?.metadata);
  return normalizeImages(meta.images || meta.gallery || [], row?.primary_image_url || row?.image_url || "");
}

function mapAdminProduct(row) {
  const images = imagesFromRow(row);
  const descriptionFull = htmlToText(row.description_html) || row.description_text || "";
  const active = row.active !== false && row.is_active !== false;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand || "",
    category: row.section || "",
    section: row.section || "",
    stock: row.stock ?? null,
    active,
    price: Number((Number(row.price_cents || 0) / 100).toFixed(2)),
    price_cents: Number(row.price_cents || 0),
    description_short: parseMetadata(row.metadata).description_short || row.description_text || "",
    description_text: row.description_text || "",
    description_full: descriptionFull,
    description_html: row.description_html || "",
    image_url: images[0] || "",
    primary_image_url: images[0] || "",
    images,
    featured: !!parseMetadata(row.metadata).featured,
    launch: !!parseMetadata(row.metadata).launch,
    availability: row.availability || (active ? "YES" : "NO"),
    price_available: Number(row.price_cents || 0) >= 200,
    price_status: Number(row.price_cents || 0) >= 200 ? "available" : "consult",
    url: productUrlFromRow(row),
    updated_at: row.updated_at || null,
    created_at: row.created_at || null
  };
}

async function assertSlugAvailable({ slug, section, brand, id = "" }) {
  const { rows } = await pool.query(
    `
      select id
      from products
      where lower(slug) = lower($1)
        and lower(coalesce(section, '')) = lower($2)
        and lower(coalesce(brand, '')) = lower($3)
        and id <> $4
      limit 1
    `,
    [slug, section || "", brand || "", id || ""]
  );
  if (rows.length) {
    const error = new Error("Slug duplicado nesta categoria/marca");
    error.statusCode = 409;
    error.code = "slug_duplicate";
    throw error;
  }
}

function buildProductPayload(input, existing = null, requireAll = false) {
  const patch = input || {};
  const currentMeta = parseMetadata(existing?.metadata);
  const next = {};

  const nextName = patch.name != null ? cleanText(patch.name, 220) : existing?.name;
  if (requireAll && !nextName) throw Object.assign(new Error("Nome obrigatório"), { statusCode: 400, code: "name_required" });
  if (patch.name != null) next.name = nextName;

  const rawSlug = patch.slug != null ? patch.slug : (requireAll ? nextName : null);
  const nextSlug = rawSlug != null ? slugify(rawSlug || nextName) : existing?.slug;
  if (requireAll && !nextSlug) throw Object.assign(new Error("Slug obrigatório"), { statusCode: 400, code: "slug_required" });
  if (rawSlug != null) next.slug = nextSlug;

  const rawSection = patch.section ?? patch.category;
  const nextSection = rawSection != null ? canonicalSection(rawSection) : existing?.section;
  if (requireAll && !nextSection) throw Object.assign(new Error("Categoria obrigatória"), { statusCode: 400, code: "category_required" });
  if (rawSection != null) next.section = nextSection;

  const rawBrand = patch.brand;
  const nextBrand = rawBrand != null ? slugify(rawBrand) : existing?.brand;
  if (requireAll && !nextBrand) throw Object.assign(new Error("Marca obrigatória"), { statusCode: 400, code: "brand_required" });
  if (rawBrand != null) next.brand = nextBrand;

  if (patch.price != null || patch.price_cents != null || requireAll) {
    const cents = patch.price_cents != null ? Math.max(0, Math.round(Number(patch.price_cents))) : priceToCents(patch.price);
    if (!Number.isFinite(cents) || cents < 0) throw Object.assign(new Error("Preço inválido"), { statusCode: 400, code: "invalid_price" });
    next.price_cents = cents;
  }

  const active = parseOptionalBoolean(patch.active, existing ? (existing.active !== false && existing.is_active !== false) : true);
  if (patch.active != null || requireAll) {
    next.active = active;
    next.is_active = active;
    next.availability = active ? "YES" : "NO";
  }

  if (patch.stock != null || requireAll) next.stock = parseStock(patch.stock, existing?.stock ?? 0);

  const short = patch.description_short ?? patch.description_text;
  if (short != null || requireAll) next.description_text = cleanText(short || existing?.description_text || "", 1600);

  const full = patch.description_full ?? patch.description_html;
  if (full != null || requireAll) next.description_html = sanitizeDescriptionHtml(full || next.description_text || existing?.description_html || "");

  const images = normalizeImages(patch.images, patch.primary_image_url || patch.image_url || existing?.primary_image_url || existing?.image_url || "");
  if (patch.images != null || patch.primary_image_url != null || patch.image_url != null || requireAll) {
    next.image_url = images[0] || "";
    next.primary_image_url = images[0] || "";
  }

  const metadata = {
    ...currentMeta,
    description_short: next.description_text ?? currentMeta.description_short ?? existing?.description_text ?? "",
    images,
    featured: parseOptionalBoolean(patch.featured, !!currentMeta.featured),
    launch: parseOptionalBoolean(patch.launch, !!currentMeta.launch)
  };
  next.metadata = metadata;

  return {
    values: next,
    identity: {
      slug: next.slug ?? existing?.slug,
      section: next.section ?? existing?.section,
      brand: next.brand ?? existing?.brand
    }
  };
}

async function getProductOr404(id, res) {
  const { rows } = await pool.query(`select ${productSelectSql()} from products where id = $1 limit 1`, [id]);
  if (!rows.length) {
    res.status(404).json({ error: "product_not_found", message: "Produto não encontrado" });
    return null;
  }
  return rows[0];
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
  if (!admin) {
    return res.status(503).json({
      error: "admin_not_configured",
      message: "Administrador não configurado"
    });
  }
  if (username !== admin.username) {
    return res.status(401).json({
      error: "username_incorrect",
      message: "Usuário incorreto"
    });
  }
  const passwordOk = await bcrypt.compare(password, admin.passwordHash).catch(() => false);
  if (!passwordOk) {
    return res.status(401).json({
      error: "password_incorrect",
      message: "Senha incorreta"
    });
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
      select ${productSelectSql()}
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
    items: pricedRows.map(mapAdminProduct)
  });
});

router.get("/products/:id", adminAuth, async (req, res) => {
  const row = await getProductOr404(String(req.params.id || ""), res);
  if (!row) return;
  res.json(mapAdminProduct(row));
});

router.post("/products", adminAuth, async (req, res) => {
  try {
    const payload = buildProductPayload(req.body || {}, null, true);
    await assertSlugAvailable(payload.identity);
    const id = cleanText(req.body?.id, 120) || newId("prod");
    const vals = [
      id,
      payload.values.slug,
      payload.values.name,
      payload.values.brand,
      payload.values.section,
      payload.values.price_cents,
      "BRL",
      payload.values.image_url || "",
      payload.values.primary_image_url || "",
      payload.values.active !== false,
      payload.values.is_active !== false,
      payload.values.name,
      payload.values.description_text || "",
      payload.values.description_html || "",
      payload.values.stock ?? 0,
      payload.values.availability || "YES",
      {},
      payload.values.metadata || {}
    ];
    const { rows } = await pool.query(
      `
        insert into products (
          id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
          active, is_active, title, description_text, description_html, stock, availability,
          specifications, metadata, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,now(),now())
        returning ${productSelectSql()}
      `,
      vals
    );
    return res.status(201).json(mapAdminProduct(rows[0]));
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.code || "product_create_failed",
      message: error.statusCode ? error.message : "Falha ao criar produto"
    });
  }
});

async function updateProduct(req, res) {
  const id = String(req.params.id || "");
  const existing = await getProductOr404(id, res);
  if (!existing) return;

  try {
    const payload = buildProductPayload(req.body || {}, existing, false);
    if (
      payload.identity.slug !== existing.slug
      || payload.identity.section !== existing.section
      || payload.identity.brand !== existing.brand
    ) {
      await assertSlugAvailable({ ...payload.identity, id });
    }

    const updates = [];
    const vals = [];
    for (const [column, value] of Object.entries(payload.values)) {
      vals.push(value);
      const cast = column === "metadata" || column === "specifications" ? "::jsonb" : "";
      updates.push(`${column} = $${vals.length}${cast}`);
    }
    if (!updates.length) return res.status(400).json({ error: "no_changes", message: "Nenhuma alteração enviada" });

    vals.push(id);
    const { rows } = await pool.query(
      `
        update products
        set ${updates.join(", ")}, title = coalesce($${vals.length + 1}, title), updated_at = now()
        where id = $${vals.length}
        returning ${productSelectSql()}
      `,
      [...vals, payload.values.name ?? existing.title ?? existing.name]
    );
    return res.json(mapAdminProduct(rows[0]));
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.code || "product_update_failed",
      message: error.statusCode ? error.message : "Falha ao salvar produto"
    });
  }
}

router.put("/products/:id", adminAuth, updateProduct);
router.patch("/products/:id", adminAuth, updateProduct);

router.delete("/products/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const { rows } = await pool.query(
    `
      update products
      set active = false, is_active = false, availability = 'NO', updated_at = now()
      where id = $1
      returning ${productSelectSql()}
    `,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "product_not_found", message: "Produto não encontrado" });
  return res.json(mapAdminProduct(rows[0]));
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
      select o.id, o.status, o.total_cents, o.shipping_provider, o.shipping_service_label,
             s.status as shipping_status, s.tracking_code, s.label_url, o.created_at,
             p.provider as payment_provider
      from orders o
      left join lateral (
        select provider from payments where order_id = o.id order by created_at desc limit 1
      ) p on true
      left join lateral (
        select status, tracking_code, label_url
        from shipments
        where provider = 'loggi' and order_id = o.id
        order by updated_at desc, id desc
        limit 1
      ) s on true
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
      shipping_provider: o.shipping_provider || "-",
      shipping_service_label: o.shipping_service_label || "-",
      shipping_status: o.shipping_status || "-",
      tracking_code: o.tracking_code || "",
      label_url: o.label_url || "",
      created_at: o.created_at
    }))
  });
});

router.get("/metrics", adminAuth, asyncRoute(async (_req, res) => {
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
        coalesce(sum(total_cents) filter (where status in ${COMPLETED_ORDER_STATUS_SQL}), 0)::bigint as revenue_cents,
        coalesce(avg(nullif(total_cents, 0)) filter (where status in ${COMPLETED_ORDER_STATUS_SQL}), 0)::int as avg_ticket_cents,
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status in ${COMPLETED_ORDER_STATUS_SQL})::int as paid,
        count(*) filter (where status in ('cancelled', 'failed', 'refunded'))::int as problem,
        count(*) filter (where created_at >= current_date and status in ${COMPLETED_ORDER_STATUS_SQL})::int as today,
        coalesce(sum(total_cents) filter (where created_at >= current_date and status in ${COMPLETED_ORDER_STATUS_SQL}), 0)::bigint as today_revenue_cents,
        count(*) filter (where created_at >= now() - interval '7 days' and status in ${COMPLETED_ORDER_STATUS_SQL})::int as last_7_days,
        coalesce(sum(total_cents) filter (where created_at >= now() - interval '7 days' and status in ${COMPLETED_ORDER_STATUS_SQL}), 0)::bigint as last_7_days_revenue_cents
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
      select status as label, count(*)::int as value,
             coalesce(sum(total_cents) filter (where status in ${COMPLETED_ORDER_STATUS_SQL}), 0)::bigint as revenue_cents
      from orders
      group by status
      order by value desc, label asc
    `),
    pool.query(`
      select coalesce(nullif(p.provider, ''), 'Sem provedor') as label,
             count(*)::int as value,
             coalesce(sum(p.amount_cents), 0)::bigint as revenue_cents
      from payments p
      join orders o on o.id = p.order_id
      where o.status in ${COMPLETED_ORDER_STATUS_SQL}
      group by 1
      order by value desc, label asc
      limit 8
    `),
    pool.query(`
      select p.id, p.name, p.brand, coalesce(sum(oi.qty), 0)::int as qty, coalesce(sum(oi.line_total_cents), 0)::bigint as revenue_cents
      from order_items oi
      join products p on p.id = oi.product_id
      join orders o on o.id = oi.order_id
      where o.status in ${COMPLETED_ORDER_STATUS_SQL}
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
}));

router.get("/orders/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const ordRes = await pool.query(
    `
      select id, status, total_cents, subtotal_cents, shipping_total_cents,
             customer_name, customer_email, customer_phone, customer_document, delivery_mode,
             shipping_provider, shipping_service_label, shipping_slo_days,
             shipping_zipcode, shipping_address, shipping_number, shipping_complement,
             shipping_neighborhood, shipping_city, shipping_state, created_at
      from orders
      where id = $1
      limit 1
    `,
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

  const shipmentRes = await pool.query(
    `
      select status, loggi_key, tracking_code, barcode, label_url, updated_at
      from shipments
      where provider = 'loggi' and order_id = $1
      order by updated_at desc, id desc
      limit 1
    `,
    [id]
  ).catch(() => ({ rows: [] }));
  const shipment = shipmentRes.rows[0] || null;

  res.json({
    id: o.id,
    customer_name: o.customer_name || "Cliente",
    customer_email: o.customer_email || "-",
    customer_phone: o.customer_phone || "-",
    customer_document: o.customer_document || "-",
    delivery_mode: o.delivery_mode || "shipping",
    shipping_address: o.shipping_address || "",
    shipping_number: o.shipping_number || "",
    shipping_complement: o.shipping_complement || "",
    shipping_neighborhood: o.shipping_neighborhood || "",
    shipping_city: o.shipping_city || "",
    shipping_state: o.shipping_state || "",
    shipping_zipcode: o.shipping_zipcode || "",
    shipping_provider: o.shipping_provider || "-",
    shipping_service_label: o.shipping_service_label || "-",
    shipping_slo_days: o.shipping_slo_days,
    subtotal: Number((Number(o.subtotal_cents || o.total_cents || 0) / 100).toFixed(2)),
    shipping_total: Number((Number(o.shipping_total_cents || 0) / 100).toFixed(2)),
    total: Number((Number(o.total_cents || 0) / 100).toFixed(2)),
    payment_provider: "-",
    shipment,
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
  if (status === "paid") {
    createLoggiShipmentForOrder(id).catch(() => {});
  }
  res.json({ ok: true });
});
