import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
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
const SESSION_TOKEN_VERSION = "v1";
const MAX_TEXT = 12000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_TOTAL_BYTES = 24 * 1024 * 1024;
const DEFAULT_PRODUCT_IMAGES_BUCKET = "product-images";
const IMAGE_UPLOAD_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);
const COMPLETED_ORDER_STATUS_SQL = "('paid', 'completed')";
const SERVICE_ORDER_STATUSES = new Set(["aberta", "em_analise", "aguardando_peca", "em_servico", "pronta", "entregue", "cancelada"]);
const SERVICE_ORDER_STATUS_LABELS = {
  aberta: "Aberta",
  em_analise: "Em analise",
  aguardando_peca: "Aguardando peca",
  em_servico: "Em servico",
  pronta: "Pronta",
  entregue: "Entregue",
  cancelada: "Cancelada"
};

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

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function sessionSecret() {
  const configured = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (configured) return configured;
  const admin = resolveAdminCredentials();
  return [admin?.username || "admin", admin?.passwordHash || "tech7-admin-session"].join(":");
}

function signSessionPayload(payload) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`${SESSION_TOKEN_VERSION}.${payload}`)
    .digest("base64url");
}

function createSessionToken(username) {
  const payload = base64UrlEncode(JSON.stringify({
    username,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(12).toString("hex")
  }));
  return `${SESSION_TOKEN_VERSION}.${payload}.${signSessionPayload(payload)}`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySessionToken(token) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_TOKEN_VERSION) return null;
  const expected = signSessionPayload(parts[1]);
  if (!safeEqual(parts[2], expected)) return null;
  let data;
  try {
    data = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (!data.exp || Number(data.exp) < Date.now()) return null;
  const admin = resolveAdminCredentials();
  if (admin?.username && data.username !== admin.username) return null;
  return {
    username: String(data.username || ""),
    expiresAt: Number(data.exp)
  };
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
  const verified = verifySessionToken(sessionToken);
  if (verified) {
    req.adminSessionKey = hashSessionToken(sessionToken);
    req.adminUser = verified.username;
    return next();
  }

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

function parseMoneyCents(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : fallback;
}

function centsToMoney(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

function serviceOrderSelectSql() {
  return `
    id, os_number, order_id, status, customer_name, customer_phone, customer_document,
    customer_address, customer_email, device_brand, device_model, device_color,
    device_serial, device_password, intake_condition, reported_issue, diagnosis,
    services_done, labor_cents, technician, internal_notes, customer_notes,
    product_total_cents, discount_cents, total_cents, payment_method, payment_status,
    warranty_days, warranty_terms, warranty_notes, metadata, created_at, updated_at,
    completed_at
  `;
}

function mapServiceOrder(row, items = []) {
  return {
    id: row.id,
    number: Number(row.os_number || 0),
    code: `OS-${String(row.os_number || 0).padStart(5, "0")}`,
    order_id: row.order_id || "",
    status: row.status || "aberta",
    status_label: SERVICE_ORDER_STATUS_LABELS[row.status] || row.status || "Aberta",
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    customer_document: row.customer_document || "",
    customer_address: row.customer_address || "",
    customer_email: row.customer_email || "",
    device_brand: row.device_brand || "",
    device_model: row.device_model || "",
    device_color: row.device_color || "",
    device_serial: row.device_serial || "",
    device_password: row.device_password || "",
    intake_condition: row.intake_condition || "",
    reported_issue: row.reported_issue || "",
    diagnosis: row.diagnosis || "",
    services_done: row.services_done || "",
    labor: centsToMoney(row.labor_cents),
    technician: row.technician || "",
    internal_notes: row.internal_notes || "",
    customer_notes: row.customer_notes || "",
    product_total: centsToMoney(row.product_total_cents),
    discount: centsToMoney(row.discount_cents),
    total: centsToMoney(row.total_cents),
    payment_method: row.payment_method || "",
    payment_status: row.payment_status || "pendente",
    warranty_days: Number(row.warranty_days || 0),
    warranty_terms: row.warranty_terms || "",
    warranty_notes: row.warranty_notes || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    completed_at: row.completed_at || null,
    items: items.map((it) => ({
      id: it.id,
      product_id: it.product_id || "",
      product_name: it.product_name || "",
      quantity: Number(it.qty || 0),
      unit_price: centsToMoney(it.unit_price_cents),
      total_price: centsToMoney(it.line_total_cents)
    }))
  };
}

async function hydrateServiceOrderCatalogItems(items) {
  const ids = Array.from(new Set((items || []).map((item) => item.product_id).filter(Boolean)));
  if (!ids.length) return items;
  const { rows } = await pool.query(`select ${productSelectSql()} from products where id = any($1::text[])`, [ids]);
  const pricedRows = await applyCatalogPrices(rows);
  const byId = new Map(pricedRows.map((row) => [row.id, row]));
  return items.map((item) => {
    const product = byId.get(item.product_id);
    if (!product) return item;
    const unit = Math.max(0, Number(product.price_cents || 0));
    return {
      ...item,
      product_name: cleanText(product.name || item.product_name || "Produto", 300),
      unit_price_cents: unit,
      line_total_cents: item.qty * unit
    };
  });
}

async function resolveServiceOrderOrderId(input, existing = null) {
  const raw = Object.prototype.hasOwnProperty.call(input || {}, "order_id")
    ? input?.order_id
    : existing?.order_id;
  const orderId = cleanText(raw || "", 160) || null;
  if (!orderId) return null;
  const { rows } = await pool.query("select id from orders where id = $1 limit 1", [orderId]);
  if (!rows.length) {
    const error = new Error("Pedido origem nao encontrado. Deixe o campo vazio para OS manual.");
    error.statusCode = 400;
    error.code = "order_not_found";
    throw error;
  }
  return orderId;
}

async function normalizeServiceOrderPayload(input, existing = null, options = {}) {
  const status = String(input?.status || existing?.status || "aberta").trim();
  if (!SERVICE_ORDER_STATUSES.has(status)) {
    throw Object.assign(new Error("Status de OS invalido"), { statusCode: 400, code: "invalid_service_order_status" });
  }

  let items = Array.isArray(input?.items) ? input.items.map((item) => {
    const qty = Math.max(1, Math.min(999, Math.round(Number(item?.quantity ?? item?.qty ?? 1) || 1)));
    const unit = parseMoneyCents(item?.unit_price ?? item?.unitPrice ?? item?.price, 0);
    return {
      product_id: cleanText(item?.product_id || item?.productId || "", 120) || null,
      product_name: cleanText(item?.product_name || item?.name || "Peca/Produto", 300),
      qty,
      unit_price_cents: unit,
      line_total_cents: qty * unit
    };
  }).filter((item) => item.product_name) : null;

  if (items && options.useCatalogPrices !== false) {
    items = await hydrateServiceOrderCatalogItems(items);
  }

  const productTotal = items
    ? items.reduce((sum, item) => sum + item.line_total_cents, 0)
    : Number(existing?.product_total_cents || 0);
  const labor = parseMoneyCents(input?.labor, Number(existing?.labor_cents || 0));
  const discount = parseMoneyCents(input?.discount, Number(existing?.discount_cents || 0));
  const total = Math.max(0, productTotal + labor - discount);
  const completedStatus = ["pronta", "entregue"].includes(status);
  const orderId = await resolveServiceOrderOrderId(input, existing);

  return {
    values: {
      order_id: orderId,
      status,
      customer_name: cleanText(input?.customer_name || existing?.customer_name || "", 260),
      customer_phone: cleanText(input?.customer_phone || existing?.customer_phone || "", 80),
      customer_document: cleanText(input?.customer_document || existing?.customer_document || "", 80),
      customer_address: cleanText(input?.customer_address || existing?.customer_address || "", 600),
      customer_email: cleanText(input?.customer_email || existing?.customer_email || "", 260),
      device_brand: cleanText(input?.device_brand || existing?.device_brand || "", 120),
      device_model: cleanText(input?.device_model || existing?.device_model || "", 180),
      device_color: cleanText(input?.device_color || existing?.device_color || "", 80),
      device_serial: cleanText(input?.device_serial || existing?.device_serial || "", 160),
      device_password: cleanText(input?.device_password || existing?.device_password || "", 160),
      intake_condition: cleanText(input?.intake_condition || existing?.intake_condition || "", 1800),
      reported_issue: cleanText(input?.reported_issue || existing?.reported_issue || "", 1800),
      diagnosis: cleanText(input?.diagnosis || existing?.diagnosis || "", 1800),
      services_done: cleanText(input?.services_done || existing?.services_done || "", 2400),
      labor_cents: labor,
      technician: cleanText(input?.technician || existing?.technician || "", 160),
      internal_notes: cleanText(input?.internal_notes || existing?.internal_notes || "", 2400),
      customer_notes: cleanText(input?.customer_notes || existing?.customer_notes || "", 2400),
      product_total_cents: productTotal,
      discount_cents: discount,
      total_cents: total,
      payment_method: cleanText(input?.payment_method || existing?.payment_method || "", 120),
      payment_status: cleanText(input?.payment_status || existing?.payment_status || "pendente", 80),
      warranty_days: Math.max(0, Math.min(3650, Math.round(Number(input?.warranty_days ?? existing?.warranty_days ?? 90) || 0))),
      warranty_terms: cleanText(input?.warranty_terms || existing?.warranty_terms || "Garantia sobre o servico executado, sem cobrir mau uso, queda, liquido ou violacao.", 1800),
      warranty_notes: cleanText(input?.warranty_notes || existing?.warranty_notes || "", 1800),
      completed_at: completedStatus ? (existing?.completed_at || new Date()) : null
    },
    items
  };
}

function pdfEscape(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(value, max = 82) {
  const words = String(value || "-").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

const SERVICE_ORDER_LOGO = {
  path: new URL("../../_assets/tech7/os-logo.jpg", import.meta.url),
  width: 520,
  height: 208
};

function loadServiceOrderLogo() {
  try {
    return {
      ...SERVICE_ORDER_LOGO,
      data: fs.readFileSync(SERVICE_ORDER_LOGO.path)
    };
  } catch (_error) {
    return null;
  }
}

function buildServiceOrderPdf(order) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 38;
  let content = [];
  const pages = [content];
  let y = 806;

  const color = {
    black: "0.05 0.06 0.06",
    dark: "0.12 0.14 0.16",
    gray: "0.43 0.46 0.50",
    border: "0.82 0.84 0.86",
    light: "0.97 0.98 0.99",
    warm: "1 0.96 0.92",
    orange: "1 0.37 0",
    white: "1 1 1"
  };

  const pageRight = pageWidth - margin;
  const logoImage = loadServiceOrderLogo();
  const money = (value) => {
    const numeric = Number(value || 0);
    const sign = numeric < 0 ? "-" : "";
    const [whole, cents] = Math.abs(numeric).toFixed(2).split(".");
    return `${sign}R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
  };
  const text = (x, yy, value, size = 9, font = "F1", fill = color.dark) => {
    content.push(`${fill} rg BT /${font} ${size} Tf ${x} ${yy} Td (${pdfEscape(value)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2, stroke = color.light) => content.push(`${stroke} RG ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (x, yy, w, h, stroke = color.border) => content.push(`${stroke} RG ${x} ${yy} ${w} ${h} re S`);
  const fillRect = (x, yy, w, h, fill) => content.push(`${fill} rg ${x} ${yy} ${w} ${h} re f`);

  const section = (title) => {
    y -= 16;
    fillRect(margin, y - 7, 10, 10, color.orange);
    text(margin + 16, y - 4, title, 11, "F2", color.black);
    line(margin, y - 12, pageRight, y - 12, color.border);
    y -= 22;
  };

  const field = (x, top, width, height, label, value, maxChars = 40) => {
    fillRect(x, top - height, width, height, color.light);
    rect(x, top - height, width, height, color.border);
    text(x + 7, top - 12, label, 7, "F2", color.gray);
    const rows = wrapPdfText(value || "-", maxChars).slice(0, Math.max(1, Math.floor((height - 18) / 10)));
    rows.forEach((row, index) => text(x + 7, top - 24 - (index * 10), row, 9, "F1", color.dark));
  };

  const paragraph = (label, value, maxLines = 4, maxChars = 96) => {
    const rows = wrapPdfText(value, maxChars).slice(0, maxLines);
    const boxHeight = 18 + rows.length * 10;
    fillRect(margin, y - boxHeight, pageRight - margin, boxHeight, color.white);
    rect(margin, y - boxHeight, pageRight - margin, boxHeight, color.border);
    text(margin + 7, y - 12, label, 7, "F2", color.gray);
    rows.forEach((row, index) => text(margin + 7, y - 24 - (index * 10), row, 8, "F1", color.dark));
    y -= boxHeight + 8;
  };

  const logo = () => {
    if (logoImage) {
      content.push(`q 164 0 0 65 ${margin} ${y - 65} cm /Logo Do Q`);
      return;
    }
    text(margin, y - 18, "TECH 7", 22, "F2", color.orange);
  };

  logo();
  fillRect(382, y - 58, 175, 58, color.light);
  rect(382, y - 58, 175, 58, color.border);
  text(394, y - 15, "ORDEM DE SERVICO", 8, "F2", color.gray);
  text(394, y - 33, order.code, 16, "F2", color.orange);
  text(394, y - 48, `Emissao: ${new Date(order.created_at || Date.now()).toLocaleDateString("pt-BR")}`, 8, "F1", color.dark);

  y -= 86;
  text(margin, y, "Tech 7 - Shopping Oiapoque Centro, Av. Oiapoque, 156 - Centro - Belo Horizonte/MG", 8, "F1", color.dark);
  text(margin, y - 11, "WhatsApp: (31) 99945-4848 | E-mail: suportehubtech7@gmail.com", 8, "F1", color.dark);
  fillRect(426, y - 19, 131, 22, color.warm);
  rect(426, y - 19, 131, 22, color.orange);
  text(452, y - 12, "VIA DO CLIENTE", 8, "F2", color.orange);
  y -= 28;
  line(margin, y, pageRight, y, color.orange);
  y -= 8;
  text(margin, y, "Documento para envio ao cliente: atendimento, aparelho, servicos, pecas, totais, garantia e assinatura.", 8, "F1", color.gray);

  section("Cliente");
  field(margin, y, 250, 34, "Nome", order.customer_name, 42);
  field(307, y, 250, 34, "WhatsApp", order.customer_phone, 38);
  y -= 42;
  field(margin, y, 250, 34, "CPF/CNPJ", order.customer_document || "Opcional", 42);
  field(307, y, 250, 34, "E-mail", order.customer_email || "Opcional", 42);
  y -= 42;
  field(margin, y, pageRight - margin, 34, "Endereco", order.customer_address || "Opcional", 92);
  y -= 28;

  section("Aparelho");
  field(margin, y, 122, 34, "Marca", order.device_brand, 18);
  field(169, y, 180, 34, "Modelo", order.device_model, 28);
  field(358, y, 82, 34, "Cor", order.device_color || "-", 12);
  field(449, y, 108, 34, "IMEI/Serial", order.device_serial || "Opcional", 18);
  y -= 34;

  section("Servico");
  paragraph("Diagnostico", order.diagnosis, 3, 96);
  paragraph("Servicos feitos", order.services_done, 3, 96);
  field(margin, y, 164, 32, "Tecnico", order.technician || "-", 24);
  field(220, y, 150, 32, "Status", order.status_label, 22);
  field(386, y, 171, 32, "Pagamento", `${order.payment_status || "-"}${order.payment_method ? " - " + order.payment_method : ""}`, 26);
  y -= 38;

  section("Produtos e totais");
  fillRect(margin, y - 16, pageRight - margin, 18, color.black);
  text(margin + 6, y - 11, "Produto/Peca", 8, "F2", color.white);
  text(374, y - 11, "Qtd", 8, "F2", color.white);
  text(424, y - 11, "Unit.", 8, "F2", color.white);
  text(497, y - 11, "Total", 8, "F2", color.white);
  y -= 26;
  const items = (order.items || []).slice(0, 6);
  if (items.length) {
    for (const item of items) {
      text(margin + 6, y, String(item.product_name || "-").slice(0, 62), 8, "F1", color.dark);
      text(378, y, String(item.quantity || 0), 8, "F1", color.dark);
      text(424, y, money(item.unit_price), 8, "F1", color.dark);
      text(497, y, money(item.total_price), 8, "F1", color.dark);
      line(margin, y - 6, pageRight, y - 6, color.border);
      y -= 14;
    }
  } else {
    text(margin + 6, y, "Sem pecas registradas.", 8, "F1", color.gray);
    y -= 14;
  }
  y -= 5;
  field(margin, y, 120, 32, "Produtos", money(order.product_total), 18);
  field(170, y, 120, 32, "Mao de obra", money(order.labor), 18);
  field(300, y, 100, 32, "Desconto", money(order.discount), 16);
  fillRect(412, y - 34, 145, 34, color.warm);
  rect(412, y - 34, 145, 34, color.orange);
  text(422, y - 13, "Total final", 7, "F2", color.orange);
  text(422, y - 27, money(order.total), 13, "F2", color.black);

  y -= 36;
  section("Garantia");
  paragraph("Garantia", `${order.warranty_days || 0} dias. ${order.warranty_terms || ""}`, 3, 96);

  y = 72;
  line(344, y, 553, y);
  text(382, y - 14, "Assinatura Tech 7 / tecnico", 8, "F1", color.gray);
  line(margin, 52, pageRight, 52, color.border);
  text(margin, 36, "Obrigado pela preferencia. Guarde esta OS para retirada, garantia e conferencia do servico.", 7, "F1", color.gray);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const logoId = logoImage ? add(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.data.length} >>\nstream\n`, "binary"),
    logoImage.data,
    Buffer.from("\nendstream", "binary")
  ])) : null;
  const xObjectResource = logoId ? `/XObject << /Logo ${logoId} 0 R >>` : "";
  const pageIds = pages.map((pageContent) => {
    const stream = pageContent.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> ${xObjectResource} >> /Contents ${contentId} 0 R >>`);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const chunks = [Buffer.from("%PDF-1.4\n", "binary")];
  const offsets = [0];
  const length = () => chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  objects.forEach((body, index) => {
    offsets.push(length());
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "binary"));
    chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "binary"));
    chunks.push(Buffer.from("\nendobj\n", "binary"));
  });
  const xref = length();
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, "binary"));
  offsets.slice(1).forEach((offset) => {
    chunks.push(Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`, "binary"));
  });
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`, "binary"));
  return Buffer.concat(chunks);
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

async function assertSlugAvailable({ slug, section, brand, id = "", global = false }) {
  if (global) {
    const { rows } = await pool.query(
      `
        select id
        from products
        where lower(slug) = lower($1)
          and id <> $2
        limit 1
      `,
      [slug, id || ""]
    );
    if (rows.length) {
      const error = new Error("Slug ja existe em outro produto");
      error.statusCode = 409;
      error.code = "slug_duplicate";
      throw error;
    }
    return;
  }

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

async function getCategoryBySlug(slug) {
  const normalized = canonicalSection(slug);
  if (!normalized) return null;
  const { rows } = await pool.query(
    "select id, slug, name from categories where slug = $1 limit 1",
    [normalized]
  );
  return rows[0] || null;
}

async function syncProductRelations(client, productId, productValues, categoryRow = null) {
  const images = normalizeImages(productValues?.metadata?.images || [], productValues?.primary_image_url || productValues?.image_url || "");
  await client.query("delete from product_images where product_id = $1", [productId]);
  for (const [index, url] of images.entries()) {
    await client.query(
      `
        insert into product_images (
          product_id, url, alt, source, source_kind, position, is_primary,
          is_gallery, is_placeholder, metadata, created_at, updated_at
        )
        values ($1,$2,$3,'admin','gallery',$4,$5,true,false,'{}'::jsonb,now(),now())
      `,
      [productId, url, productValues?.name || "Produto TECH 7", index, index === 0]
    );
  }

  if (categoryRow?.id) {
    await client.query("delete from product_categories where product_id = $1", [productId]);
    await client.query(
      "insert into product_categories (product_id, category_id, position, created_at) values ($1,$2,0,now()) on conflict do nothing",
      [productId, categoryRow.id]
    );
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
  const nextBrand = rawBrand != null ? slugify(rawBrand) : (existing?.brand || "");
  if (rawBrand != null) next.brand = nextBrand;

  if (patch.price != null || patch.price_cents != null || requireAll) {
    const cents = patch.price_cents != null ? Math.max(0, Math.round(Number(patch.price_cents))) : priceToCents(patch.price);
    if (!Number.isFinite(cents) || cents < 0 || (requireAll && cents <= 0)) throw Object.assign(new Error("Preço inválido"), { statusCode: 400, code: "invalid_price" });
    next.price_cents = cents;
  }

  const active = parseOptionalBoolean(patch.active, existing ? (existing.active !== false && existing.is_active !== false) : false);
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

  const imagesTouched = patch.images != null || patch.primary_image_url != null || patch.image_url != null || requireAll;
  const existingImages = normalizeImages(currentMeta.images || [], existing?.primary_image_url || existing?.image_url || "");
  const images = imagesTouched
    ? normalizeImages(patch.images, patch.primary_image_url || patch.image_url || existing?.primary_image_url || existing?.image_url || "")
    : existingImages;
  if (imagesTouched) {
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
  const sessionToken = createSessionToken(admin.username);
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
  const alert = String(req.query.alert || "").trim();
  const sort = String(req.query.sort || "updated_desc").trim();

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
  if (alert === "missing_image") {
    filters.push(`coalesce(nullif(primary_image_url, ''), nullif(image_url, ''), '') = ''`);
  } else if (alert === "missing_price") {
    filters.push(`coalesce(price_cents, 0) < 200`);
  } else if (alert === "low_stock") {
    filters.push(`stock is not null and stock <= 2`);
  } else if (alert === "missing_category") {
    filters.push(`coalesce(section, '') = ''`);
  } else if (alert === "duplicate") {
    filters.push(`
      exists (
        select 1
        from products p2
        where lower(coalesce(p2.slug, '')) = lower(coalesce(products.slug, ''))
          and lower(coalesce(p2.section, '')) = lower(coalesce(products.section, ''))
          and lower(coalesce(p2.brand, '')) = lower(coalesce(products.brand, ''))
          and p2.id <> products.id
      )
    `);
  } else if (alert === "ok") {
    filters.push(`coalesce(nullif(primary_image_url, ''), nullif(image_url, ''), '') <> ''`);
    filters.push(`coalesce(price_cents, 0) >= 200`);
    filters.push(`(stock is null or stock > 2)`);
    filters.push(`coalesce(section, '') <> ''`);
  }

  const orderSql = {
    updated_desc: "updated_at desc nulls last, created_at desc",
    name_asc: "lower(coalesce(name, '')) asc, updated_at desc nulls last",
    name_desc: "lower(coalesce(name, '')) desc, updated_at desc nulls last",
    price_asc: "price_cents asc nulls last, lower(coalesce(name, '')) asc",
    price_desc: "price_cents desc nulls last, lower(coalesce(name, '')) asc"
  }[sort] || "updated_at desc nulls last, created_at desc";

  const countRes = await pool.query(`select count(*)::int as total from products where ${filters.join(" and ")}`, params);
  params.push(limit, offset);

  const { rows } = await pool.query(
    `
      select ${productSelectSql()}
      from products
      where ${filters.join(" and ")}
      order by ${orderSql}
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

router.get("/categories", adminAuth, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `
      select slug, name, source_name, sort_order
      from categories
      order by sort_order nulls last, name asc
    `
  );
  res.json({
    items: rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      source_name: row.source_name,
      sort_order: row.sort_order
    }))
  });
}));

router.post("/product-images/upload", adminAuth, asyncRoute(async (req, res) => {
  try {
    const items = await saveUploadedProductImages(req);
    return res.status(201).json({ items });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.code || "image_upload_failed",
      message: error.statusCode ? error.message : "Falha ao enviar imagem"
    });
  }
}));

function normalizeCouponCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parseCouponDiscountCents(input) {
  if (input?.discount_cents != null) {
    const cents = Math.round(Number(input.discount_cents));
    return Number.isFinite(cents) ? cents : 0;
  }
  return priceToCents(input?.discount);
}

function mapCoupon(row) {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  const discountCents = Number(row.discount_cents || 0);
  return {
    id: row.id,
    code: row.code,
    discount_cents: discountCents,
    discount: Number((discountCents / 100).toFixed(2)),
    expires_at: row.expires_at,
    active: Boolean(row.active),
    expired,
    valid: Boolean(row.active) && !expired,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function validateCouponPayload(input, partial = false) {
  const out = {};
  if (!partial || Object.prototype.hasOwnProperty.call(input, "code")) {
    out.code = normalizeCouponCode(input.code);
    if (!out.code) {
      const error = new Error("coupon_code_required");
      error.status = 400;
      throw error;
    }
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "discount") || Object.prototype.hasOwnProperty.call(input, "discount_cents")) {
    out.discount_cents = parseCouponDiscountCents(input);
    if (!Number.isFinite(out.discount_cents) || out.discount_cents <= 0) {
      const error = new Error("invalid_coupon_discount");
      error.status = 400;
      throw error;
    }
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "expires_at")) {
    const expiresAt = new Date(input.expires_at || "");
    if (Number.isNaN(expiresAt.getTime())) {
      const error = new Error("invalid_coupon_expires_at");
      error.status = 400;
      throw error;
    }
    out.expires_at = expiresAt.toISOString();
  }
  if (Object.prototype.hasOwnProperty.call(input, "active")) {
    out.active = input.active === true || input.active === "true" || input.active === 1 || input.active === "1";
  } else if (!partial) {
    out.active = true;
  }
  return out;
}

function parseContentDisposition(value) {
  const out = {};
  String(value || "").split(";").forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key) return;
    let val = rawValue.join("=").trim();
    if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1);
    out[key] = val;
  });
  return out;
}

function readRequestBuffer(req, maxBytes = MAX_UPLOAD_TOTAL_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Upload maior que o limite permitido"), { statusCode: 413, code: "upload_too_large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartForm(buffer, boundary) {
  const text = buffer.toString("latin1");
  const marker = `--${boundary}`;
  const parts = text.split(marker).slice(1, -1);
  const fields = {};
  const files = [];

  for (let part of parts) {
    if (part.startsWith("\r\n")) part = part.slice(2);
    if (part.endsWith("\r\n")) part = part.slice(0, -2);
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headerText = part.slice(0, separator);
    const bodyText = part.slice(separator + 4);
    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx > -1) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
    const disposition = parseContentDisposition(headers["content-disposition"]);
    const name = disposition.name || "";
    const filename = disposition.filename || "";
    const data = Buffer.from(bodyText, "latin1");
    if (filename) {
      files.push({ name, filename, type: headers["content-type"] || "", data });
    } else if (name) {
      fields[name] = data.toString("utf8").trim();
    }
  }

  return { fields, files };
}

function assertImageUpload(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (!IMAGE_UPLOAD_TYPES.has(mime)) {
    throw Object.assign(new Error("Tipo de imagem nao permitido. Use JPG, PNG, WebP ou GIF."), { statusCode: 400, code: "invalid_image_type" });
  }
  if (!file.data?.length) {
    throw Object.assign(new Error("Imagem vazia ou corrompida"), { statusCode: 400, code: "empty_image" });
  }
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("Imagem maior que 5MB"), { statusCode: 413, code: "image_too_large" });
  }
}

function normalizeSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeStorageBucketName(value) {
  const bucket = String(value || DEFAULT_PRODUCT_IMAGES_BUCKET)
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "");
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw Object.assign(new Error("Nome do bucket Supabase Storage invalido. Use product-images em SUPABASE_PRODUCT_IMAGES_BUCKET."), {
      statusCode: 500,
      code: "supabase_storage_bucket_invalid"
    });
  }
  return bucket;
}

function deriveSupabaseUrlFromDatabase() {
  const raw = String(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.SUPABASE_DB_URL || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const hostMatch = parsed.hostname.match(/(?:db\.|pooler\.)?([a-z0-9]{20})\.supabase\.co$/i);
    if (hostMatch?.[1]) return `https://${hostMatch[1]}.supabase.co`;
    const userMatch = decodeURIComponent(parsed.username || "").match(/postgres\.([a-z0-9]{20})/i);
    if (userMatch?.[1]) return `https://${userMatch[1]}.supabase.co`;
  } catch {
    return "";
  }
  return "";
}

function getSupabaseStorageConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL || deriveSupabaseUrlFromDatabase());
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = normalizeStorageBucketName(process.env.SUPABASE_PRODUCT_IMAGES_BUCKET);
  if (!url || !serviceKey) {
    throw Object.assign(new Error("Supabase Storage nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor."), {
      statusCode: 503,
      code: "supabase_storage_not_configured"
    });
  }
  return { url, serviceKey, bucket };
}

function encodeStoragePath(value) {
  return String(value || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function uploadProductImageToStorage(file, objectPath) {
  const config = getSupabaseStorageConfig();
  const encodedPath = encodeStoragePath(objectPath);
  const endpoint = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedPath}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": file.type,
      "Cache-Control": "31536000, immutable",
      "x-upsert": "false"
    },
    body: file.data
  });
  if (!response.ok) {
    let details = "";
    try {
      const payload = await response.json();
      details = payload?.message || payload?.error || "";
    } catch {
      details = await response.text().catch(() => "");
    }
    throw Object.assign(new Error(details || "Falha ao enviar imagem para Supabase Storage"), {
      statusCode: response.status >= 400 && response.status < 500 ? response.status : 502,
      code: "supabase_storage_upload_failed"
    });
  }
  return `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodedPath}`;
}

async function saveUploadedProductImages(req) {
  const contentType = String(req.headers["content-type"] || "");
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!/^multipart\/form-data/i.test(contentType) || !match) {
    throw Object.assign(new Error("Envie imagens usando multipart/form-data"), { statusCode: 400, code: "invalid_upload" });
  }

  const buffer = await readRequestBuffer(req);
  const form = parseMultipartForm(buffer, match[1] || match[2]);
  const uploadFiles = form.files.filter((file) => file.name === "images" || file.name === "files" || file.name === "image");
  if (!uploadFiles.length) {
    throw Object.assign(new Error("Nenhuma imagem enviada"), { statusCode: 400, code: "no_images" });
  }
  if (uploadFiles.length > 10) {
    throw Object.assign(new Error("Envie no maximo 10 imagens por vez"), { statusCode: 400, code: "too_many_images" });
  }

  const productId = cleanText(form.fields.productId || "", 120);
  const draftSlug = slugify(form.fields.slug || "draft") || "draft";
  const folder = productId ? `products/${slugify(productId) || productId}` : `drafts/${draftSlug}`;

  const saved = [];
  for (const file of uploadFiles) {
    assertImageUpload(file);
    const ext = IMAGE_UPLOAD_TYPES.get(String(file.type || "").toLowerCase());
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const objectPath = `${folder}/${filename}`;
    const url = await uploadProductImageToStorage(file, objectPath);
    saved.push({
      url,
      filename,
      originalName: cleanText(file.filename, 180),
      size: file.data.length,
      type: file.type
    });
  }
  return saved;
}

router.get("/coupons", adminAuth, asyncRoute(async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim();
  const filters = ["1=1"];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    filters.push(`code ilike $${params.length}`);
  }
  if (status === "active") filters.push("active = true");
  if (status === "inactive") filters.push("active = false");
  if (status === "expired") filters.push("expires_at < now()");
  if (status === "valid") filters.push("active = true and expires_at >= now()");

  const countRes = await pool.query(`select count(*)::int as total from coupons where ${filters.join(" and ")}`, params);
  params.push(limit, offset);
  const { rows } = await pool.query(
    `
      select id, code, discount_cents, expires_at, active, created_at, updated_at
      from coupons
      where ${filters.join(" and ")}
      order by created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );
  res.json({ total: countRes.rows[0]?.total || 0, limit, offset, items: rows.map(mapCoupon) });
}));

router.post("/coupons", adminAuth, asyncRoute(async (req, res) => {
  const payload = validateCouponPayload(req.body || {});
  try {
    const { rows } = await pool.query(
      `
        insert into coupons (id, code, discount_cents, expires_at, active)
        values ($1, $2, $3, $4, $5)
        returning id, code, discount_cents, expires_at, active, created_at, updated_at
      `,
      [newId("coupon"), payload.code, payload.discount_cents, payload.expires_at, payload.active]
    );
    res.status(201).json(mapCoupon(rows[0]));
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ error: "coupon_code_exists" });
    throw error;
  }
}));

router.put("/coupons/:id", adminAuth, asyncRoute(async (req, res) => {
  const payload = validateCouponPayload(req.body || {});
  try {
    const { rows } = await pool.query(
      `
        update coupons
        set code = $2, discount_cents = $3, expires_at = $4, active = $5, updated_at = now()
        where id = $1
        returning id, code, discount_cents, expires_at, active, created_at, updated_at
      `,
      [String(req.params.id || ""), payload.code, payload.discount_cents, payload.expires_at, payload.active]
    );
    if (!rows.length) return res.status(404).json({ error: "coupon_not_found" });
    res.json(mapCoupon(rows[0]));
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ error: "coupon_code_exists" });
    throw error;
  }
}));

router.patch("/coupons/:id", adminAuth, asyncRoute(async (req, res) => {
  const payload = validateCouponPayload(req.body || {}, true);
  const sets = [];
  const params = [String(req.params.id || "")];
  for (const [key, value] of Object.entries(payload)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: "coupon_update_empty" });
  const { rows } = await pool.query(
    `
      update coupons
      set ${sets.join(", ")}, updated_at = now()
      where id = $1
      returning id, code, discount_cents, expires_at, active, created_at, updated_at
    `,
    params
  );
  if (!rows.length) return res.status(404).json({ error: "coupon_not_found" });
  res.json(mapCoupon(rows[0]));
}));

router.get("/products/:id", adminAuth, async (req, res) => {
  const row = await getProductOr404(String(req.params.id || ""), res);
  if (!row) return;
  res.json(mapAdminProduct(row));
});

router.post("/products", adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const payload = buildProductPayload(req.body || {}, null, true);
    const category = await getCategoryBySlug(payload.identity.section);
    if (!category) {
      return res.status(400).json({
        error: "category_required",
        message: "Categoria obrigatoria ou inexistente no banco"
      });
    }
    await assertSlugAvailable({ ...payload.identity, global: true });
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
    await client.query("begin");
    const { rows } = await client.query(
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
    await syncProductRelations(client, id, payload.values, category);
    await client.query("commit");
    return res.status(201).json(mapAdminProduct(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return res.status(error.statusCode || 500).json({
      error: error.code || "product_create_failed",
      message: error.statusCode ? error.message : "Falha ao criar produto"
    });
  } finally {
    client.release();
  }
});

async function updateProduct(req, res) {
  const id = String(req.params.id || "");
  const existing = await getProductOr404(id, res);
  if (!existing) return;

  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
  const categoryTouched = hasOwn("category") || hasOwn("section");
  const imagesTouched = hasOwn("images") || hasOwn("image_url") || hasOwn("primary_image_url");
  const client = await pool.connect();
  try {
    const payload = buildProductPayload(req.body || {}, existing, false);
    let category = null;
    if (categoryTouched) {
      category = await getCategoryBySlug(payload.identity.section);
      if (!category && payload.identity.section !== existing.section) {
        return res.status(400).json({
          error: "category_required",
          message: "Categoria obrigatoria ou inexistente no banco"
        });
      }
    }

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
    await client.query("begin");
    const { rows } = await client.query(
      `
        update products
        set ${updates.join(", ")}, title = coalesce($${vals.length + 1}, title), updated_at = now()
        where id = $${vals.length}
        returning ${productSelectSql()}
      `,
      [...vals, payload.values.name ?? existing.title ?? existing.name]
    );
    if (imagesTouched || (categoryTouched && category?.id)) {
      await syncProductRelations(client, id, rows[0], category);
    }
    await client.query("commit");
    return res.json(mapAdminProduct(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return res.status(error.statusCode || 500).json({
      error: error.code || "product_update_failed",
      message: error.statusCode ? error.message : "Falha ao salvar produto"
    });
  } finally {
    client.release();
  }
}

router.put("/products/:id", adminAuth, updateProduct);
router.patch("/products/:id", adminAuth, updateProduct);

router.delete("/products/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  await pool.query("begin");
  try {
    const existing = await pool.query(`select ${productSelectSql()} from products where id = $1 limit 1`, [id]);
    if (!existing.rows.length) {
      await pool.query("rollback");
      return res.status(404).json({ error: "product_not_found", message: "Produto nao encontrado" });
    }

    const cartItems = await pool.query(`delete from cart_items where product_id = $1`, [id]);
    const orderItems = await pool.query(`delete from order_items where product_id = $1`, [id]);
    const deleted = await pool.query(`delete from products where id = $1 returning id`, [id]);
    await pool.query("commit");
    return res.json({
      ok: true,
      deleted: true,
      id: deleted.rows[0]?.id || id,
      removed_cart_items: cartItems.rowCount || 0,
      removed_order_items: orderItems.rowCount || 0
    });
  } catch (error) {
    await pool.query("rollback");
    return res.status(500).json({
      error: "product_delete_failed",
      message: "Falha ao excluir produto do banco"
    });
  }
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
    recentOrders,
    productIssueRows,
    duplicateProductRows,
    deliveryRows,
    recurringRows,
    serviceSummaryRows,
    serviceStatusRows,
    topCategorySoldRows
  ] = await Promise.all([
    pool.query(`select id, slug, name, brand, section, price_cents, active, stock, image_url, primary_image_url, metadata from products`),
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
      with sold_items as (
        select oi.product_id, oi.qty, oi.line_total_cents
        from order_items oi
        join orders o on o.id = oi.order_id
        where o.status in ${COMPLETED_ORDER_STATUS_SQL}
        union all
        select soi.product_id, soi.qty, soi.line_total_cents
        from service_order_items soi
        join service_orders so on so.id = soi.service_order_id
        where soi.product_id is not null
          and so.status <> 'cancelada'
      )
      select p.id, p.name, p.brand, coalesce(sum(si.qty), 0)::int as qty, coalesce(sum(si.line_total_cents), 0)::bigint as revenue_cents
      from sold_items si
      join products p on p.id = si.product_id
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
    `),
    pool.query(`
      select
        count(*) filter (where coalesce(stock, 0) <= 2 and coalesce(active, true) = true)::int as low_stock,
        count(*) filter (
          where coalesce(nullif(primary_image_url, ''), nullif(image_url, ''), nullif(metadata->>'images', '[]'), '') = ''
        )::int as no_image,
        count(*) filter (where coalesce(section, '') not in ('display-e-lcd','baterias-celular','pecas-e-componentes','tampas-e-carcacas','touchs-e-visores','maquinas-e-ferramentas'))::int as out_of_category
      from products
    `),
    pool.query(`
      select count(*)::int as duplicated
      from (
        select lower(coalesce(slug, '')) as slug, lower(coalesce(section, '')) as section, lower(coalesce(brand, '')) as brand
        from products
        group by 1, 2, 3
        having count(*) > 1
      ) d
    `),
    pool.query(`
      select coalesce(nullif(shipping_service_label, ''), nullif(shipping_provider, ''), delivery_mode, 'Sem entrega') as label,
             count(*)::int as value,
             coalesce(sum(shipping_total_cents), 0)::bigint as revenue_cents
      from orders
      group by 1
      order by value desc, label asc
      limit 8
    `),
    pool.query(`
      select coalesce(nullif(customer_phone, ''), nullif(customer_email, ''), customer_name, 'Cliente') as label,
             count(*)::int as value,
             coalesce(sum(total_cents), 0)::bigint as revenue_cents
      from orders
      group by 1
      having count(*) > 1
      order by value desc, revenue_cents desc
      limit 8
    `),
    pool.query(`
      select
        count(*)::int as total,
        count(*) filter (where status not in ('entregue', 'cancelada'))::int as open,
        count(*) filter (where status = 'entregue')::int as delivered,
        count(*) filter (where status = 'pronta')::int as ready,
        count(*) filter (where status in ('pronta', 'entregue'))::int as completed,
        coalesce(sum(labor_cents) filter (where status in ('pronta', 'entregue')), 0)::bigint as labor_revenue_cents,
        coalesce(sum(product_total_cents) filter (where status <> 'cancelada'), 0)::bigint as product_revenue_cents,
        coalesce(sum(total_cents) filter (where status in ('pronta', 'entregue')), 0)::bigint as total_revenue_cents
      from service_orders
    `),
    pool.query(`
      select status as label, count(*)::int as value, coalesce(sum(total_cents), 0)::bigint as revenue_cents
      from service_orders
      group by status
      order by value desc, label asc
    `),
    pool.query(`
      with sold_items as (
        select oi.product_id, oi.qty, oi.line_total_cents
        from order_items oi
        join orders o on o.id = oi.order_id
        where o.status in ${COMPLETED_ORDER_STATUS_SQL}
        union all
        select soi.product_id, soi.qty, soi.line_total_cents
        from service_order_items soi
        join service_orders so on so.id = soi.service_order_id
        where soi.product_id is not null
          and so.status <> 'cancelada'
      )
      select coalesce(nullif(p.section, ''), 'Sem categoria') as label,
             coalesce(sum(si.qty), 0)::int as value,
             coalesce(sum(si.line_total_cents), 0)::bigint as revenue_cents
      from sold_items si
      join products p on p.id = si.product_id
      group by 1
      order by revenue_cents desc, value desc
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
    low_stock: Number(productIssueRows.rows[0]?.low_stock || 0),
    no_image: Number(productIssueRows.rows[0]?.no_image || 0),
    duplicated: Number(duplicateProductRows.rows[0]?.duplicated || 0),
    out_of_category: Number(productIssueRows.rows[0]?.out_of_category || 0),
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
      low_stock: Number(product.low_stock || 0),
      no_image: Number(product.no_image || 0),
      duplicated: Number(product.duplicated || 0),
      out_of_category: Number(product.out_of_category || 0),
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
      by_delivery_method: deliveryRows.rows.map((r) => ({
        label: r.label,
        value: Number(r.value || 0),
        revenue: Number((Number(r.revenue_cents || 0) / 100).toFixed(2))
      })),
      recurring_customers: recurringRows.rows.map((r) => ({
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
    service_orders: {
      total: Number(serviceSummaryRows.rows[0]?.total || 0),
      open: Number(serviceSummaryRows.rows[0]?.open || 0),
      ready: Number(serviceSummaryRows.rows[0]?.ready || 0),
      delivered: Number(serviceSummaryRows.rows[0]?.delivered || 0),
      completed: Number(serviceSummaryRows.rows[0]?.completed || 0),
      labor_revenue: Number((Number(serviceSummaryRows.rows[0]?.labor_revenue_cents || 0) / 100).toFixed(2)),
      product_revenue: Number((Number(serviceSummaryRows.rows[0]?.product_revenue_cents || 0) / 100).toFixed(2)),
      total_revenue: Number((Number(serviceSummaryRows.rows[0]?.total_revenue_cents || 0) / 100).toFixed(2)),
      by_status: serviceStatusRows.rows.map((r) => ({
        label: SERVICE_ORDER_STATUS_LABELS[r.label] || r.label,
        value: Number(r.value || 0),
        revenue: Number((Number(r.revenue_cents || 0) / 100).toFixed(2))
      }))
    },
    top_products: topProductRows.rows.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      qty: Number(p.qty || 0),
      revenue: Number((Number(p.revenue_cents || 0) / 100).toFixed(2))
    })),
    top_categories_sold: topCategorySoldRows.rows.map((r) => ({
      label: r.label,
      value: Number(r.value || 0),
      revenue: Number((Number(r.revenue_cents || 0) / 100).toFixed(2))
    }))
  });
}));

router.get("/service-orders", adminAuth, asyncRoute(async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim();

  const params = [];
  const filters = ["1=1"];
  if (status === "open") {
    filters.push(`status not in ('entregue', 'cancelada')`);
  } else if (status === "completed") {
    filters.push(`status in ('pronta', 'entregue')`);
  } else if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(customer_name ilike $${params.length} or customer_phone ilike $${params.length} or device_model ilike $${params.length} or reported_issue ilike $${params.length})`);
  }

  const countRes = await pool.query(`select count(*)::int as total from service_orders where ${filters.join(" and ")}`, params);
  params.push(limit, offset);
  const { rows } = await pool.query(
    `
      select ${serviceOrderSelectSql()}
      from service_orders
      where ${filters.join(" and ")}
      order by updated_at desc, created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );
  res.json({
    total: countRes.rows[0]?.total || 0,
    limit,
    offset,
    items: rows.map((row) => mapServiceOrder(row))
  });
}));

router.get("/service-orders/:id", adminAuth, asyncRoute(async (req, res) => {
  const id = String(req.params.id || "");
  const { rows } = await pool.query(`select ${serviceOrderSelectSql()} from service_orders where id = $1 limit 1`, [id]);
  if (!rows.length) return res.status(404).json({ error: "service_order_not_found", message: "OS nao encontrada" });
  const items = await pool.query(
    `select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`,
    [id]
  );
  return res.json(mapServiceOrder(rows[0], items.rows));
}));

router.delete("/service-orders/:id", adminAuth, asyncRoute(async (req, res) => {
  const id = String(req.params.id || "");
  const { rows } = await pool.query(
    `
      update service_orders
      set status = 'cancelada', updated_at = now()
      where id = $1
      returning ${serviceOrderSelectSql()}
    `,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "service_order_not_found", message: "OS nao encontrada" });
  const items = await pool.query(
    `select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`,
    [id]
  );
  return res.json(mapServiceOrder(rows[0], items.rows));
}));

router.post("/service-orders", adminAuth, asyncRoute(async (req, res) => {
  const payload = await normalizeServiceOrderPayload(req.body || {});
  if (!payload.values.customer_name) return res.status(400).json({ error: "customer_name_required", message: "Nome do cliente obrigatorio" });

  const id = newId("os");
  await pool.query("begin");
  try {
    const { rows } = await pool.query(
      `
        insert into service_orders (
          id, order_id, status, customer_name, customer_phone, customer_document,
          customer_address, customer_email, device_brand, device_model, device_color,
          device_serial, device_password, intake_condition, reported_issue, diagnosis,
          services_done, labor_cents, technician, internal_notes, customer_notes,
          product_total_cents, discount_cents, total_cents, payment_method, payment_status,
          warranty_days, warranty_terms, warranty_notes, completed_at, created_at, updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,now(),now()
        )
        returning ${serviceOrderSelectSql()}
      `,
      [
        id,
        payload.values.order_id,
        payload.values.status,
        payload.values.customer_name,
        payload.values.customer_phone,
        payload.values.customer_document,
        payload.values.customer_address,
        payload.values.customer_email,
        payload.values.device_brand,
        payload.values.device_model,
        payload.values.device_color,
        payload.values.device_serial,
        payload.values.device_password,
        payload.values.intake_condition,
        payload.values.reported_issue,
        payload.values.diagnosis,
        payload.values.services_done,
        payload.values.labor_cents,
        payload.values.technician,
        payload.values.internal_notes,
        payload.values.customer_notes,
        payload.values.product_total_cents,
        payload.values.discount_cents,
        payload.values.total_cents,
        payload.values.payment_method,
        payload.values.payment_status,
        payload.values.warranty_days,
        payload.values.warranty_terms,
        payload.values.warranty_notes,
        payload.values.completed_at
      ]
    );
    for (const item of payload.items || []) {
      await pool.query(
        `
          insert into service_order_items (service_order_id, product_id, product_name, qty, unit_price_cents, line_total_cents)
          values ($1,$2,$3,$4,$5,$6)
        `,
        [id, item.product_id, item.product_name, item.qty, item.unit_price_cents, item.line_total_cents]
      );
    }
    const itemRows = await pool.query(`select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`, [id]);
    await pool.query("commit");
    return res.status(201).json(mapServiceOrder(rows[0], itemRows.rows));
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}));

router.post("/service-orders/from-order/:orderId", adminAuth, asyncRoute(async (req, res) => {
  const orderId = String(req.params.orderId || "");
  const ordRes = await pool.query(
    `
      select id, customer_name, customer_email, customer_phone, customer_document,
             shipping_address, shipping_number, shipping_complement, shipping_neighborhood,
             shipping_city, shipping_state
      from orders
      where id = $1
      limit 1
    `,
    [orderId]
  );
  if (!ordRes.rows.length) return res.status(404).json({ error: "order_not_found", message: "Pedido nao encontrado" });
  const existing = await pool.query(`select id from service_orders where order_id = $1 order by created_at desc limit 1`, [orderId]);
  if (existing.rows.length) {
    const current = await pool.query(`select ${serviceOrderSelectSql()} from service_orders where id = $1`, [existing.rows[0].id]);
    const currentItems = await pool.query(`select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`, [existing.rows[0].id]);
    return res.json(mapServiceOrder(current.rows[0], currentItems.rows));
  }

  const order = ordRes.rows[0];
  const itemRes = await pool.query(
    `
      select oi.product_id, p.name as product_name, oi.qty, oi.unit_price_cents, oi.line_total_cents
      from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = $1
      order by oi.created_at asc
    `,
    [orderId]
  );
  const address = [
    order.shipping_address,
    order.shipping_number,
    order.shipping_complement,
    order.shipping_neighborhood,
    order.shipping_city,
    order.shipping_state
  ].filter(Boolean).join(", ");

  const seed = {
    order_id: order.id,
    status: "aberta",
    customer_name: order.customer_name || "Cliente",
    customer_phone: order.customer_phone || "",
    customer_document: order.customer_document || "",
    customer_email: order.customer_email || "",
    customer_address: address,
    reported_issue: "OS criada a partir do pedido. Completar defeito relatado no atendimento.",
    intake_condition: "Aguardando entrada/conferencia do aparelho.",
    warranty_days: 90,
    items: itemRes.rows.map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: Number(it.qty || 1),
      unit_price: centsToMoney(it.unit_price_cents)
    }))
  };
  const payload = await normalizeServiceOrderPayload(seed, null, { useCatalogPrices: false });
  const id = newId("os");
  await pool.query("begin");
  try {
    const { rows } = await pool.query(
      `
        insert into service_orders (
          id, order_id, status, customer_name, customer_phone, customer_document,
          customer_address, customer_email, device_brand, device_model, device_color,
          device_serial, device_password, intake_condition, reported_issue, diagnosis,
          services_done, labor_cents, technician, internal_notes, customer_notes,
          product_total_cents, discount_cents, total_cents, payment_method, payment_status,
          warranty_days, warranty_terms, warranty_notes, completed_at, created_at, updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,now(),now()
        )
        returning ${serviceOrderSelectSql()}
      `,
      [
        id,
        payload.values.order_id,
        payload.values.status,
        payload.values.customer_name,
        payload.values.customer_phone,
        payload.values.customer_document,
        payload.values.customer_address,
        payload.values.customer_email,
        payload.values.device_brand,
        payload.values.device_model,
        payload.values.device_color,
        payload.values.device_serial,
        payload.values.device_password,
        payload.values.intake_condition,
        payload.values.reported_issue,
        payload.values.diagnosis,
        payload.values.services_done,
        payload.values.labor_cents,
        payload.values.technician,
        payload.values.internal_notes,
        payload.values.customer_notes,
        payload.values.product_total_cents,
        payload.values.discount_cents,
        payload.values.total_cents,
        payload.values.payment_method,
        payload.values.payment_status,
        payload.values.warranty_days,
        payload.values.warranty_terms,
        payload.values.warranty_notes,
        payload.values.completed_at
      ]
    );
    for (const item of payload.items || []) {
      await pool.query(
        `
          insert into service_order_items (service_order_id, product_id, product_name, qty, unit_price_cents, line_total_cents)
          values ($1,$2,$3,$4,$5,$6)
        `,
        [id, item.product_id, item.product_name, item.qty, item.unit_price_cents, item.line_total_cents]
      );
    }
    const itemRows = await pool.query(`select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`, [id]);
    await pool.query("commit");
    return res.status(201).json(mapServiceOrder(rows[0], itemRows.rows));
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}));

router.put("/service-orders/:id", adminAuth, asyncRoute(async (req, res) => {
  const id = String(req.params.id || "");
  const current = await pool.query(`select ${serviceOrderSelectSql()} from service_orders where id = $1 limit 1`, [id]);
  if (!current.rows.length) return res.status(404).json({ error: "service_order_not_found", message: "OS nao encontrada" });
  const payload = await normalizeServiceOrderPayload(req.body || {}, current.rows[0]);
  if (!payload.values.customer_name) return res.status(400).json({ error: "customer_name_required", message: "Nome do cliente obrigatorio" });

  await pool.query("begin");
  try {
    const columns = Object.keys(payload.values);
    const values = Object.values(payload.values);
    values.push(id);
    const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
    const { rows } = await pool.query(
      `
        update service_orders
        set ${assignments.join(", ")}, updated_at = now()
        where id = $${values.length}
        returning ${serviceOrderSelectSql()}
      `,
      values
    );
    if (payload.items) {
      await pool.query(`delete from service_order_items where service_order_id = $1`, [id]);
      for (const item of payload.items) {
        await pool.query(
          `
            insert into service_order_items (service_order_id, product_id, product_name, qty, unit_price_cents, line_total_cents)
            values ($1,$2,$3,$4,$5,$6)
          `,
          [id, item.product_id, item.product_name, item.qty, item.unit_price_cents, item.line_total_cents]
        );
      }
    }
    const items = await pool.query(`select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`, [id]);
    await pool.query("commit");
    return res.json(mapServiceOrder(rows[0], items.rows));
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}));

router.get("/service-orders/:id/pdf", adminAuth, asyncRoute(async (req, res) => {
  const id = String(req.params.id || "");
  const { rows } = await pool.query(`select ${serviceOrderSelectSql()} from service_orders where id = $1 limit 1`, [id]);
  if (!rows.length) return res.status(404).json({ error: "service_order_not_found", message: "OS nao encontrada" });
  const items = await pool.query(`select id, product_id, product_name, qty, unit_price_cents, line_total_cents from service_order_items where service_order_id = $1 order by id asc`, [id]);
  const order = mapServiceOrder(rows[0], items.rows);
  const pdf = buildServiceOrderPdf(order);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${order.code}.pdf"`);
  return res.send(pdf);
}));

router.get("/orders/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const ordRes = await pool.query(
    `
      select id, status, total_cents, subtotal_cents, shipping_total_cents,
             discount_cents, coupon_code, coupon_discount_cents,
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
    discount: Number((Number(o.discount_cents || o.coupon_discount_cents || 0) / 100).toFixed(2)),
    coupon_code: o.coupon_code || "",
    coupon_discount: Number((Number(o.coupon_discount_cents || o.discount_cents || 0) / 100).toFixed(2)),
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

router.delete("/orders/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  const r = await pool.query(
    `update orders set status = 'cancelled', updated_at = now() where id = $1 returning id, status, updated_at`,
    [id]
  );
  if (!r.rowCount) return res.status(404).json({ error: "order_not_found", message: "Pedido nao encontrado" });
  return res.json({ ok: true, id: r.rows[0].id, status: r.rows[0].status, updated_at: r.rows[0].updated_at });
});
