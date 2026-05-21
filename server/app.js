import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";

import { requireEnv, safeJson } from "./lib/env.js";
import { databaseEnvName, databaseUrl, pool } from "./lib/db.js";
import { ensureSchema } from "./lib/schema.js";
import { normalizeProductSegment, resolveProductRoutePath } from "./lib/product-url.js";
import { router as apiRouter } from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static root: keep serving the existing mirror from repo root by default.
// You can later set STATIC_DIR=web after migrating the files into /web.
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, "..");

const PRICE_CATALOG_PATH = path.join(STATIC_DIR, "precos.json");
let priceCatalogCache = null;

function joinRoute(prefix, route) {
  const cleanPrefix = prefix === "/" ? "" : String(prefix || "").replace(/\/+$/, "");
  return `${cleanPrefix}${route}`;
}

function registerApi(app, prefix) {
  app.use(joinRoute(prefix, "/webhooks"), express.raw({ type: "*/*", limit: "2mb" }));
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

function loadLocalPriceCatalog() {
  if (priceCatalogCache) return priceCatalogCache;
  try {
    priceCatalogCache = JSON.parse(fs.readFileSync(PRICE_CATALOG_PATH, "utf8"));
  } catch (_error) {
    priceCatalogCache = {};
  }
  return priceCatalogCache;
}

function resolveLocalCatalogPrice(item) {
  const section = normalizeProductSegment(item?.section || item?.secao);
  const brand = normalizeProductSegment(item?.brand || item?.marca);
  const slug = normalizeProductSegment(item?.slug);
  const catalog = loadLocalPriceCatalog();

  const sectionBucket = catalog[section] || {};
  const brandBucket = sectionBucket[brand] || {};
  let price = brandBucket[slug];

  if (price == null) {
    for (const possibleBrands of Object.values(sectionBucket)) {
      if (possibleBrands && typeof possibleBrands === "object" && possibleBrands[slug] != null) {
        price = possibleBrands[slug];
        break;
      }
    }
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return {
      id: "",
      section,
      brand,
      slug,
      price_cents: 0,
      price_available: false,
      price_status: "consult",
      found: false
    };
  }

  return {
    id: slug,
    section,
    brand,
    slug,
    price_cents: Math.round(numericPrice * 100),
    price_available: true,
    price_status: "available",
    found: true
  };
}

function resolveLocalPrices(req, res) {
  const payload = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!payload.length) return res.status(400).json({ error: "items_required" });
  res.json({ items: payload.slice(0, 200).map(resolveLocalCatalogPrice) });
}

function registerLocalCompatibilityRoutes(app, prefix) {
  const emptyHtml = (_req, res) => res.type("html").send("");
  const emptyJson = (_req, res) => res.json({});
  const noContent = (_req, res) => res.status(204).end();

  app.all(joinRoute(prefix, "/newsletter"), noContent);
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
  app.post(joinRoute(prefix, "/products/resolve-prices"), resolveLocalPrices);
  app.all(joinRoute(prefix, "/products/add-comment"), noContent);
  app.all(joinRoute(prefix, "/products/unavailable-let-me-know"), emptyJson);
}

export function createApp(options = {}) {
  const {
    serveStatic = true,
    apiPrefixes = ["/api"]
  } = options;

  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  // Webhooks need raw body; keep it scoped to webhook routes.
  for (const prefix of apiPrefixes) registerApi(app, prefix);

  for (const prefix of apiPrefixes) {
    app.use(prefix || "/", applyApiCors);
  }

  app.use(express.json({ limit: "1mb" }));

  app.get("/loja/busca.php", (req, res) => {
    const term = String(req.query.palavra_busca || req.query.q || req.query.t || "").trim();
    const brand = String(req.query.filtrar_marca || req.query.marca || "").trim();
    const category = String(req.query.filtrar_departamento || req.query.departamento || req.query.filtrar_categoria || req.query.categoria || "").trim();
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (brand) params.set("brand", brand);
    if (category) params.set("category", category);
    res.redirect(302, `/busca/index.html${params.toString() ? `?${params}` : ""}`);
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
  // Startup checks (do not crash if not configured yet, so the user can iterate).
  try {
    if (databaseUrl) requireEnv(databaseEnvName || "DATABASE_URL");
    if (process.env.MP_ACCESS_TOKEN) requireEnv("MP_ACCESS_TOKEN");
    if (process.env.WOOVI_APP_ID) requireEnv("WOOVI_APP_ID");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[startup] config warning:", safeJson({ error: String(e?.message || e) }));
  }
}

export { STATIC_DIR };
export const app = createApp();
