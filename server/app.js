import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";

import { requireEnv, safeJson } from "./lib/env.js";
import { databaseEnvName, databaseUrl, pool } from "./lib/db.js";
import { ensureSchema } from "./lib/schema.js";
import { normalizeProductSegment, resolveProductRoutePath } from "./lib/product-url.js";
import { rowMatchesSection } from "./lib/product-filters.js";
import { normalizePublicImageUrl } from "./lib/images.js";
import { router as apiRouter } from "./routes/api.js";
import { validateAdminConfig } from "./routes/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static root: keep serving the existing mirror from repo root by default.
// You can later set STATIC_DIR=web after migrating the files into /web.
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, "..");

const SEARCH_INDEX_PATH = path.join(STATIC_DIR, "_assets", "tech7", "search-index.json");
const STATIC_REDIRECTS_PATH = path.join(STATIC_DIR, "_custom", "redirects.json");
let searchIndexCache = null;
let staticRedirectCache = null;

function joinRoute(prefix, route) {
  const cleanPrefix = prefix === "/" ? "" : String(prefix || "").replace(/\/+$/, "");
  return `${cleanPrefix}${route}`;
}

function registerApi(app, prefix) {
  app.use(joinRoute(prefix, "/webhooks"), express.raw({ type: "*/*", limit: "2mb" }));
}

function normalizePublicPath(value) {
  let clean = String(value || "/").split("#")[0].split("?")[0].replace(/\/+$/, "") || "/";
  clean = clean.replace(/\/index\.html$/i, "") || "/";
  return clean;
}

function loadStaticRedirects() {
  if (staticRedirectCache) return staticRedirectCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(STATIC_REDIRECTS_PATH, "utf8"));
    staticRedirectCache = Array.isArray(parsed?.redirects) ? parsed.redirects : [];
  } catch (_error) {
    staticRedirectCache = [];
  }
  return staticRedirectCache;
}

function matchRedirectRule(requestPath, rule) {
  const source = normalizePublicPath(rule?.source);
  const requested = normalizePublicPath(requestPath);
  if (!source || !requested) return null;
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    if (requested === base) return "";
    if (requested.startsWith(`${base}/`)) return requested.slice(base.length + 1);
    return null;
  }
  return requested === source ? "" : null;
}

function redirectDestination(rule, tail, requestPath) {
  const wantsIndex = /\/index\.html$/i.test(String(requestPath || ""));
  let destination = String(rule?.destination || "/");
  if (destination.includes(":path*")) destination = destination.replace(":path*", tail || "");
  destination = destination.replace(/\/+$/, "") || "/";
  return wantsIndex && !path.extname(destination) ? `${destination}/index.html` : destination;
}

const DEFAULT_CORS_ORIGINS = [
  "https://tech-7.vercel.app",
  "https://stiflerwfl1-oss.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

function allowedCorsOrigins() {
  return String(process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function applyApiCors(req, res, next) {
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  if (origin && allowedCorsOrigins().includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  }

  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
}

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function isAdminLoginRequest(req, prefix) {
  return req.method === "POST" && req.path === joinRoute(prefix, "/admin/login");
}

function isDatabaseConnectionError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "").toLowerCase();
  return Boolean(code) || /database|postgres|connection|connect|timeout|terminated|econn|enotfound|pool|ssl|schema/.test(message);
}

function sendDatabaseConnectionError(res) {
  return res.status(503).json({
    error: "database_connection_error",
    message: "Falha de conexão com o banco"
  });
}

function databaseLogContext(error) {
  let host = "";
  let port = "";
  try {
    const parsed = new URL(databaseUrl || "");
    host = parsed.hostname;
    port = parsed.port || "";
  } catch {
    host = "";
    port = "";
  }
  return {
    env: databaseEnvName || null,
    host: host || null,
    port: port || null,
    code: error?.code || null,
    message: String(error?.message || error || "").slice(0, 240)
  };
}

function applySecurityHeaders(req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.set("X-Frame-Options", "DENY");
  res.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:; connect-src 'self' https:; font-src 'self' https: data:; frame-ancestors 'none'"
  );
  if (isProduction() || req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https")) {
    res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return next();
}

function loadLocalSearchIndex() {
  if (searchIndexCache) return searchIndexCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, "utf8"));
    searchIndexCache = Array.isArray(parsed?.items) ? parsed.items.map((item) => {
      const title = String(item?.title || "").trim();
      const description = String(item?.description || "").trim();
      const name = String(item?.name || "").trim();
      return {
        ...item,
        title: /^\[[^\]]+\]$/.test(title) ? (name || description || String(item?.slug || "").replace(/-/g, " ")) : title,
        keywords: String(item?.keywords || "").replace(/\[[^\]]+\]\s*/g, "").trim()
      };
    }).filter((item) => String(item.title || item.name || item.description || "").trim()) : [];
  } catch (_error) {
    searchIndexCache = [];
  }
  return searchIndexCache;
}

function resolveLocalSearch(req, res) {
  const q = String(req.query.q || req.query.palavra_busca || req.query.t || "").trim().toLowerCase();
  const brand = String(req.query.brand || req.query.marca || req.query.filtrar_marca || "").trim().toLowerCase();
  const category = String(req.query.category || req.query.categoria || req.query.filtrar_departamento || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 48)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const words = q.split(/\s+/).filter(Boolean);
  const rows = loadLocalSearchIndex().filter((item) => {
    const haystack = `${item.title || ""} ${item.name || ""} ${item.brand || ""} ${item.category || ""} ${item.slug || ""}`.toLowerCase();
    if (brand && String(item.brand || "").toLowerCase() !== brand) return false;
    if (category && !rowMatchesSection(item.section || item.category, category)) return false;
    return words.every((word) => haystack.includes(word));
  });
  const brandCounts = new Map();
  for (const item of rows) {
    const value = String(item.brand || "").trim().toLowerCase();
    if (!value) continue;
    const current = brandCounts.get(value) || { value, label: item.brand, total: 0 };
    current.total += 1;
    brandCounts.set(value, current);
  }
  res.json({
    q,
    brand: brand || null,
    category: category || null,
    count: rows.length,
    limit,
    offset,
    facets: {
      brands: Array.from(brandCounts.values()).sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label))),
      price: { min_price_cents: null, max_price_cents: null }
    },
    items: rows.slice(offset, offset + limit)
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function moneyFromCents(value) {
  return (Number(value || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textFromHtml(value) {
  return String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function imagesFromProductRow(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const images = Array.isArray(metadata.images) ? metadata.images : [];
  const normalized = [row?.primary_image_url || row?.image_url, ...images]
    .map((url) => normalizePublicImageUrl(url))
    .filter(Boolean);
  return Array.from(new Set(normalized.map((url) => [url.toLowerCase(), url]).map((entry) => entry[1])));
}

function dynamicProductParts(requestPath) {
  if (path.extname(requestPath) && !/\/index\.html$/i.test(requestPath)) return null;
  const parts = String(requestPath || "").split(/[?#]/)[0].split("/").filter(Boolean);
  if (parts[parts.length - 1] === "index.html") parts.pop();
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (["api", "_assets", "assets", "_custom", "admin", "busca", "carrinho", "checkout", "loja"].includes(parts[0])) return null;
  const section = normalizeProductSegment(parts[0]);
  const brand = parts.length === 3 ? normalizeProductSegment(parts[1]) : "";
  const slug = normalizeProductSegment(parts[parts.length - 1]);
  if (!section || !slug) return null;
  return { section, brand, slug };
}

function renderDynamicProductHtml(row, requestPath) {
  const images = imagesFromProductRow(row);
  const image = images[0] || "/_assets/tech7/product-placeholder.svg";
  const title = row.name || row.title || row.slug;
  const description = row.description_text || textFromHtml(row.description_html) || `Produto TECH 7 na categoria ${row.section || ""}.`;
  const price = moneyFromCents(row.price_cents);
  const canonical = `/${String(requestPath || "").replace(/^\/+/, "").replace(/\/index\.html$/i, "")}`;
  const galleryThumbs = images.map((url, index) => (
    `<button class="produto-imagem-miniatura${index === 0 ? " selected" : ""}" type="button" data-t7-thumb="${index}" aria-label="Imagem ${index + 1}"><img src="${escapeHtml(url)}" alt="${escapeHtml(title)} ${index + 1}" loading="lazy"></button>`
  )).join("");
  const galleryImages = images.map((url, index) => (
    `<div class="image-show${index === 0 ? " selected" : ""}" data-t7-image="${index}"${index === 0 ? "" : " style=\"display:none\""}><img src="${escapeHtml(url)}" data-src="${escapeHtml(url)}" alt="${escapeHtml(title)}" width="700" height="700" loading="${index === 0 ? "eager" : "lazy"}"></div>`
  )).join("");

  return `<!doctype html>
<html class="page-product" lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - TECH 7</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="stylesheet" href="/_assets/images.tcdn.com.br/files/996644/themes/46/css/style.min__e4660e26.css">
  <style>
    *{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{background:#fff;color:#111;font-family:Roboto,Arial,sans-serif}.container{width:min(100%,1200px);margin:0 auto;padding:0 20px}
    .t7-dynamic-header{border-bottom:1px solid #eee;background:#fff}.t7-dynamic-header .container{min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:20px}.t7-dynamic-logo img{max-width:142px;height:auto}.t7-dynamic-main{padding:34px 0 52px}.t7-dynamic-product{display:grid;grid-template-columns:minmax(280px,1fr) minmax(280px,480px);gap:42px;align-items:start}.box-gallery{display:grid;grid-template-columns:82px minmax(0,1fr);gap:18px;min-width:0}.nav-images{display:flex;flex-direction:column;gap:10px}.produto-imagem-miniatura{border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:4px;cursor:pointer}.produto-imagem-miniatura.selected{border-color:#ff6a00;box-shadow:0 0 0 3px rgba(255,106,0,.16)}.produto-imagem-miniatura img{display:block;width:68px;height:68px;object-fit:cover}.image-show{border:1px solid #eee;border-radius:8px;min-height:360px;display:flex;align-items:center;justify-content:center;background:#fff}.image-show img{display:block;max-width:100%;height:auto;max-height:680px;object-fit:contain}.product-colum-right{min-width:0}.product-colum-right h1{font-size:30px;line-height:1.18;margin:0 0 12px;color:#111}.t7-product-meta{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}.t7-product-meta span{font-size:12px;text-transform:uppercase;border:1px solid #e5e7eb;border-radius:999px;padding:5px 9px;color:#555}.t7-price-static{font-size:30px;line-height:1.1;font-weight:900;color:#ff6a00;margin:14px 0}.t7-buy-button{width:100%;min-height:52px;border:0;border-radius:8px;background:#ff6a00;color:#111;font-weight:900;text-transform:uppercase;cursor:pointer}.box-frete{margin-top:18px;padding:16px;border:1px solid #eee;border-radius:8px;background:#fafafa}.box-frete label{display:block;margin-bottom:8px;font-size:13px;font-weight:900;color:#333}.new-frete{display:flex;gap:8px}.new-frete input{min-width:0;flex:1;min-height:42px;border:1px solid #ddd;border-radius:6px;padding:0 12px}.new-frete button{min-height:42px;border:0;border-radius:6px;background:#111;color:#fff;font-weight:900;padding:0 14px}.t7-description{margin-top:28px;line-height:1.65;color:#333}.t7-description h2{font-size:18px;margin:0 0 10px;color:#111}.t7-stock{font-size:13px;color:#555;margin-top:10px}@media(max-width:780px){.container{padding:0 14px}.t7-dynamic-product{grid-template-columns:1fr}.box-gallery{grid-template-columns:1fr}.nav-images{order:2;flex-direction:row;overflow:auto}.product-colum-right h1{font-size:24px}.new-frete{flex-direction:column}}
  </style>
</head>
<body>
  <header class="t7-dynamic-header"><div class="container"><a class="t7-dynamic-logo" href="/"><img src="/logo.png" alt="TECH 7"></a><a href="/carrinho/">Carrinho</a></div></header>
  <main class="t7-dynamic-main"><div class="container">
    <nav class="breadcrumb" aria-label="breadcrumb"><a href="/">Home</a><span> &gt; </span><a href="/${escapeHtml(row.section || "")}">${escapeHtml(row.section || "")}</a><span> &gt; </span><span>${escapeHtml(title)}</span></nav>
    <article class="t7-dynamic-product" data-product-id="${escapeHtml(row.id)}">
      <section class="box-gallery">${galleryThumbs ? `<div class="nav-images">${galleryThumbs}</div>` : ""}<div class="t7-gallery-main">${galleryImages || `<div class="image-show selected"><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}"></div>`}</div></section>
      <section class="product-colum-right">
        <h1 class="product-name">${escapeHtml(title)}</h1>
        <div class="t7-product-meta"><span>${escapeHtml(row.section || "catalogo")}</span>${row.brand ? `<span>${escapeHtml(row.brand)}</span>` : ""}<span>SKU ${escapeHtml(row.id)}</span></div>
        <div class="t7-price-static">${escapeHtml(price)}</div>
        <form id="form_comprar" class="t7-buy-wrapper"><input type="hidden" name="produto_id" value="${escapeHtml(row.id)}"><button id="bt_comprar" class="t7-buy-button" type="button">Comprar</button></form>
        <div class="box-frete"><label for="t7FreightCep">Calcular frete</label><form class="new-frete"><input id="t7FreightCep" class="crazy_cep" name="number-frete" inputmode="numeric" placeholder="Digite seu CEP"><button class="submit-frete" type="submit">Calcular</button></form><div class="result" aria-live="polite"></div></div>
        <div id="button-buy"></div>
        ${row.stock != null ? `<div class="t7-stock">Estoque: ${escapeHtml(row.stock)}</div>` : ""}
      </section>
    </article>
    <section class="t7-description"><h2>Descrição</h2><div>${row.description_html || escapeHtml(description)}</div></section>
  </div></main>
  <script>
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ listProducts: [{ idProduct: ${JSON.stringify(row.id)}, nameProduct: ${JSON.stringify(title)}, urlProduct: ${JSON.stringify(canonical)}, urlImage: ${JSON.stringify(image)}, sellPrice: ${JSON.stringify(price)}, category: ${JSON.stringify(row.section || "")}, brand: ${JSON.stringify(row.brand || "")}, slug: ${JSON.stringify(row.slug || "")} }] });
    document.addEventListener('click', function (event) {
      var thumb = event.target.closest('[data-t7-thumb]');
      if (!thumb) return;
      var idx = thumb.getAttribute('data-t7-thumb');
      document.querySelectorAll('[data-t7-thumb]').forEach(function (el) { el.classList.toggle('selected', el === thumb); });
      document.querySelectorAll('[data-t7-image]').forEach(function (el) { el.style.display = el.getAttribute('data-t7-image') === idx ? '' : 'none'; el.classList.toggle('selected', el.getAttribute('data-t7-image') === idx); });
    });
  </script>
  <script src="/preco-loader.js"></script>
</body>
</html>`;
}

async function tryServeDynamicProductPage(req, res, next) {
  if (!["GET", "HEAD"].includes(req.method)) return next();
  const parts = dynamicProductParts(req.path);
  if (!parts || !databaseUrl) return next();

  const filters = ["lower(slug) = lower($1)", "lower(coalesce(section, '')) = lower($2)", "active = true", "coalesce(is_active, true) = true"];
  const params = [parts.slug, parts.section];
  if (parts.brand) {
    params.push(parts.brand);
    filters.push(`lower(coalesce(brand, '')) = lower($${params.length})`);
  }

  try {
    const { rows } = await pool.query(
      `
        select id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
               active, is_active, title, description_text, description_html, stock, metadata, updated_at
        from products
        where ${filters.join(" and ")}
        order by updated_at desc nulls last, created_at desc
        limit 1
      `,
      params
    );
    if (!rows.length) return next();
    res.set("Cache-Control", "public, max-age=0, s-maxage=300");
    return res.type("html").send(renderDynamicProductHtml(rows[0], req.path));
  } catch (error) {
    return next(error);
  }
}

function registerLocalCompatibilityRoutes(app, prefix) {
  const emptyHtml = (_req, res) => res.type("html").send("");
  const emptyJson = (_req, res) => res.json({});
  const noContent = (_req, res) => res.status(204).end();
  const okJson = (_req, res) => res.json({ ok: true });

  app.all(joinRoute(prefix, "/newsletter"), noContent);
  app.all(joinRoute(prefix, "/comments"), noContent);
  app.all(joinRoute(prefix, "/contact"), noContent);
  app.all(joinRoute(prefix, "/testimonials"), noContent);
  app.post(joinRoute(prefix, "/cart/add"), (_req, res) => {
    res.json({ ok: true, cart: { count: 0, items: [] } });
  });
  app.get(joinRoute(prefix, "/greeting"), emptyHtml);
  app.get(joinRoute(prefix, "/local-cache/:name"), noContent);
  app.get(joinRoute(prefix, "/cart/count-local"), (_req, res) => {
    res.json({ count: 0, total: 0, amount: 0 });
  });
  app.get(joinRoute(prefix, "/cart/preview"), emptyHtml);

  app.get(joinRoute(prefix, "/products/variant-gallery"), (_req, res) => res.json([]));
  app.get(joinRoute(prefix, "/products/variant-price"), noContent);
  app.get(joinRoute(prefix, "/products/variant-reference"), noContent);
  app.get(joinRoute(prefix, "/products/variant-form"), emptyHtml);
  app.get(joinRoute(prefix, "/products/load-next-variant-dropdown"), emptyHtml);
  app.get(joinRoute(prefix, "/products/payment-options"), emptyHtml);
  app.get(joinRoute(prefix, "/products/payment-options-details"), emptyHtml);
  app.get(joinRoute(prefix, "/products/shipping"), emptyHtml);
  app.get(joinRoute(prefix, "/products/question"), emptyHtml);
  app.all(joinRoute(prefix, "/products/add-comment"), noContent);
  app.all(joinRoute(prefix, "/products/unavailable-let-me-know"), emptyJson);

  app.all("/loja/cartService.php", (_req, res) => res.json({ ok: true, cart: { count: 0, items: [] } }));
  app.all("/loja/login_layout.php", (_req, res) => res.redirect(302, "/my-account/login"));
  app.all("/loja/catalogo.php", resolveLocalSearch);
  app.all("/loja/busca.php", resolveLocalSearch);
  app.all("/loja/logout.php", (_req, res) => res.redirect(302, "/"));
  app.all("/loja/redirect_cart_service.php", (_req, res) => res.redirect(302, "/carrinho/"));
  app.all("/mvc/store/newsletter/", noContent);
  app.all("/contato/contato.php", noContent);
  app.all("/depoimentos-de-clientes/funcoes/envia_depoimento.php", noContent);
  app.all("/cep.php", okJson);
  app.all("/nocache/info.php", okJson);
  app.all("/web_api/cart/", (_req, res) => res.json([]));
  app.all("/_assets/images.tcdn.com.br/commerce/assets/store/js/dist/busca.php", resolveLocalSearch);
  app.all("/_assets/images.tcdn.com.br/commerce/assets/store/js/dist/pronta_entrega.php", okJson);
  app.all("/_assets/images.tcdn.com.br/commerce/assets/store/js/dist/depoimentos.php", noContent);
}

export function createApp(options = {}) {
  const {
    serveStatic = true,
    apiPrefixes = ["/api"]
  } = options;

  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(applySecurityHeaders);

  // Webhooks need raw body; keep it scoped to webhook routes.
  for (const prefix of apiPrefixes) registerApi(app, prefix);

  for (const prefix of apiPrefixes) {
    app.use(prefix || "/", applyApiCors);
  }

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.post("/loja/cartService.php", (_req, res) => {
    res.redirect(303, "/carrinho");
  });
  app.post("/mvc/store/newsletter/", (_req, res) => {
    res.status(204).end();
  });
  app.post("/contato/contato.php", (_req, res) => {
    res.redirect(303, "/contato");
  });
  app.post("/depoimentos-de-clientes/funcoes/envia_depoimento.php", (_req, res) => {
    res.redirect(303, "/depoimentos-de-clientes");
  });

  app.get("/loja/login_layout.php", (_req, res) => {
    res.redirect(308, "/my-account/login");
  });
  app.get("/loja/logout.php", (_req, res) => {
    res.redirect(308, "/");
  });
  app.get("/loja/redirect_cart_service.php", (_req, res) => {
    res.redirect(308, "/carrinho");
  });
  app.get("/loja/catalogo.php", (_req, res) => {
    res.redirect(308, "/busca");
  });
  app.get("/loja/busca.php", (req, res) => {
    const term = String(req.query.palavra_busca || req.query.q || req.query.t || "").trim();
    const brand = String(req.query.filtrar_marca || req.query.marca || "").trim();
    const category = String(req.query.filtrar_departamento || req.query.departamento || req.query.filtrar_categoria || req.query.categoria || "").trim();
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (brand) params.set("brand", brand);
    if (category) params.set("category", category);
    res.redirect(308, `/busca${params.toString() ? `?${params}` : ""}`);
  });

  app.get(/^\/.+\/_assets\/(.+)$/, (req, res) => {
    const assetPath = String(req.params[0] || "");
    res.sendFile(path.join(STATIC_DIR, "_assets", ...assetPath.split("/")));
  });

  app.get(/^\/.+\/preco-loader\.js$/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "preco-loader.js"));
  });

  app.get(/^\/.+\/logo\.png$/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "logo.png"));
  });

  app.get(["/admin", "/admin/"], (_req, res) => {
    res.redirect(302, "/admin.html");
  });

  app.get("/admin.html", (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "admin.html"));
  });

  app.get("*", async (req, res, next) => {
    const apiStrippedPath = req.path.replace(/^\/api(?=\/)/, "");
    const resolved = resolveProductRoutePath(req.path) || resolveProductRoutePath(apiStrippedPath);
    if (!resolved) return tryServeDynamicProductPage(req, res, next);
    res.set("Cache-Control", "public, max-age=0, s-maxage=86400");
    return res.sendFile(path.join(STATIC_DIR, ...resolved.split("/")));
  });

  for (const prefix of apiPrefixes) {
    app.use(prefix || "/", (_req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    });

    app.get(joinRoute(prefix, "/health"), async (req, res) => {
      try {
        // Lightweight DB check (optional if DATABASE_URL isn't set yet).
        if (databaseUrl) {
          await ensureSchema();
          await pool.query("select 1 as ok");
        }
        res.json({ ok: true, database: databaseUrl ? "connected" : "not_configured", source: databaseEnvName || null });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[api] database health failed:", safeJson(databaseLogContext(err)));
        res.status(503).json({
          ok: false,
          error: "database_connection_error",
          message: "Falha de conexão com o banco"
        });
      }
    });

    registerLocalCompatibilityRoutes(app, prefix);

    app.use(prefix || "/", async (req, res, next) => {
      if (isAdminLoginRequest(req, prefix)) return next();
      try {
        await ensureSchema();
        next();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[api] database schema gate failed:", safeJson(databaseLogContext(error)));
        sendDatabaseConnectionError(res);
      }
    });
    app.use(prefix || "/", apiRouter);
    app.use(joinRoute(prefix, "/*"), (_req, res) => {
      res.status(404).json({ error: "api_not_found" });
    });
  }

  if (serveStatic) {
    app.get(["/loja", "/loja/"], (_req, res) => {
      res.redirect(302, "/");
    });

    app.use((req, res, next) => {
      if (!["GET", "HEAD"].includes(req.method)) return next();
      for (const rule of loadStaticRedirects()) {
        const tail = matchRedirectRule(req.path, rule);
        if (tail === null) continue;
        const destination = redirectDestination(rule, tail, req.path);
        if (normalizePublicPath(destination) === normalizePublicPath(req.path)) continue;
        return res.redirect(rule.permanent === false ? 302 : 308, destination);
      }
      return next();
    });

    app.use((req, res, next) => {
      if (
        req.path === "/assets/js/tech7-local-runtime.js" ||
        req.path === "/_assets/images.tcdn.com.br/files/996644/themes/46/css/style.min__e4660e26.css"
      ) {
        res.set("Cache-Control", "no-store, max-age=0");
      }
      next();
    });

    // Serve static site.
    app.use(express.static(STATIC_DIR, { extensions: ["html"] }));

    // Fallback to the homepage for unknown paths (basic SPA-like behavior).
    app.get("*", (req, res) => {
      // If the request looks like a file, let it 404.
      if (path.extname(req.path)) return res.status(404).send("Not found");
      res.sendFile(path.join(STATIC_DIR, "index.html"));
    });
  }

  app.use((err, _req, res, _next) => {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        error: err.code || "request_failed",
        message: err.message || "Falha na requisicao"
      });
    }
    // eslint-disable-next-line no-console
    console.error("[api] unhandled error:", safeJson({ error: String(err?.message || err) }));
    if (isDatabaseConnectionError(err)) return sendDatabaseConnectionError(res);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

export function runStartupChecks() {
  try {
    validateAdminConfig();
    if (databaseUrl) requireEnv(databaseEnvName || "DATABASE_URL");
    if (process.env.MP_ACCESS_TOKEN) requireEnv("MP_ACCESS_TOKEN");
    if (process.env.WOOVI_APP_ID) requireEnv("WOOVI_APP_ID");
    if (isProduction()) {
      requireEnv(databaseEnvName || "DATABASE_URL");
      requireEnv("CORS_ORIGINS");
      if (process.env.ENABLE_MP_WEBHOOKS === "true") requireEnv("MP_WEBHOOK_SECRET");
      if (process.env.ENABLE_WOOVI_WEBHOOKS === "true") requireEnv("WOOVI_WEBHOOK_AUTHORIZATION");
      if (process.env.ENABLE_LOGGI_WEBHOOKS === "true") {
        if (process.env.LOGGI_WEBHOOK_AUTHORIZATION) requireEnv("LOGGI_WEBHOOK_AUTHORIZATION");
        else {
          requireEnv("LOGGI_WEBHOOK_USERNAME");
          requireEnv("LOGGI_WEBHOOK_PASSWORD");
        }
      }
    if (process.env.LOGGI_AUTO_CREATE_SHIPMENT === "true") {
      requireEnv("LOGGI_CLIENT_ID");
      requireEnv("LOGGI_CLIENT_SECRET");
      requireEnv("LOGGI_COMPANY_ID");
      requireEnv("LOGGI_EXTERNAL_SERVICE_IDS");
      requireEnv("LOGGI_ORIGIN_ADDRESS");
      requireEnv("LOGGI_ORIGIN_NUMBER");
      requireEnv("LOGGI_ORIGIN_NEIGHBORHOOD");
      requireEnv("LOGGI_ORIGIN_ZIPCODE");
      requireEnv("LOGGI_ORIGIN_CITY");
      requireEnv("LOGGI_ORIGIN_STATE");
    }
    if (process.env.ENABLE_MELHOR_ENVIO_SHIPPING === "true") {
      requireEnv("MELHOR_ENVIO_ORIGIN_ZIPCODE");
      if (!process.env.MELHOR_ENVIO_TOKEN) {
        requireEnv("MELHOR_ENVIO_CLIENT_ID");
        requireEnv("MELHOR_ENVIO_CLIENT_SECRET");
        requireEnv("MELHOR_ENVIO_REDIRECT_URI");
      }
    }
      if (process.env.ENABLE_WHATSAPP_WEBHOOKS === "true") {
        requireEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
        requireEnv("WHATSAPP_APP_SECRET");
      }
    }
  } catch (e) {
    if (isProduction()) throw e;
    // eslint-disable-next-line no-console
    console.warn("[startup] config warning:", safeJson({ error: String(e?.message || e) }));
  }
}

export const app = createApp();
export { STATIC_DIR };
