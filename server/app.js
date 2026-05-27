import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";

import { requireEnv, safeJson } from "./lib/env.js";
import { databaseEnvName, databaseUrl, pool } from "./lib/db.js";
import { ensureSchema } from "./lib/schema.js";
import { resolveProductRoutePath } from "./lib/product-url.js";
import { rowMatchesSection } from "./lib/product-filters.js";
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

  app.get("*", (req, res, next) => {
    const apiStrippedPath = req.path.replace(/^\/api(?=\/)/, "");
    const resolved = resolveProductRoutePath(req.path) || resolveProductRoutePath(apiStrippedPath);
    if (!resolved) return next();
    res.set("Cache-Control", "public, max-age=0, s-maxage=86400");
    return res.sendFile(path.join(STATIC_DIR, ...resolved.split("/")));
  });

  for (const prefix of apiPrefixes) {
    app.use(prefix || "/", (_req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    });

    app.get(joinRoute(prefix, "/health"), async (_req, res) => {
      try {
        // Lightweight DB check (optional if DATABASE_URL isn't set yet).
        if (databaseUrl) {
          await ensureSchema();
          await pool.query("select 1 as ok");
        }
        res.json({ ok: true, database: databaseUrl ? "connected" : "not_configured", source: databaseEnvName || null });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err?.message || err) });
      }
    });

    registerLocalCompatibilityRoutes(app, prefix);

    app.use(prefix || "/", async (_req, _res, next) => {
      try {
        await ensureSchema();
        next();
      } catch (error) {
        next(error);
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
    // eslint-disable-next-line no-console
    console.error("[api] unhandled error:", safeJson({ error: String(err?.message || err) }));
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
      if (process.env.ENABLE_MP_WEBHOOKS === "true" || process.env.MP_ACCESS_TOKEN) requireEnv("MP_WEBHOOK_SECRET");
      if (process.env.ENABLE_WOOVI_WEBHOOKS === "true" || process.env.WOOVI_APP_ID) requireEnv("WOOVI_WEBHOOK_AUTHORIZATION");
      if (process.env.ENABLE_WHATSAPP_WEBHOOKS === "true" || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN) {
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
