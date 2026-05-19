import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";

import { requireEnv, safeJson } from "./lib/env.js";
import { databaseEnvName, databaseUrl, pool } from "./lib/db.js";
import { ensureSchema } from "./lib/schema.js";
import { CATALOG_ROUTE_SECTIONS, resolveShortCatalogRoute } from "./lib/catalog_routes.js";
import { router as apiRouter } from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static root: keep serving the existing mirror from repo root by default.
// You can later set STATIC_DIR=web after migrating the files into /web.
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, "..");

const CATEGORY_ROUTE_REDIRECTS = new Map([
  ["/bateria", "/baterias-celular/"],
  ["/bateria-celular", "/baterias-celular/"],
  ["/baterias", "/baterias-celular/"],
  ["/display", "/tela-display-lcd/"],
  ["/display-e-lcd", "/tela-display-lcd/"],
  ["/display-lcd", "/tela-display-lcd/"],
  ["/telas", "/tela-display-lcd/"],
  ["/telas-display-lcd", "/tela-display-lcd/"],
  ["/touch-visor", "/touch-e-visor/"],
  ["/touchs-e-visores", "/touch-e-visor/"],
  ["/touchs-visores", "/touch-e-visor/"],
  ["/pecas-componentes", "/pecas-e-componentes/"],
  ["/tampas-carcacas", "/tampas-e-carcacas/"],
  ["/maquinas-ferramentas", "/maquinas-e-ferramentas/"]
]);

function joinRoute(prefix, route) {
  const cleanPrefix = prefix === "/" ? "" : String(prefix || "").replace(/\/+$/, "");
  return `${cleanPrefix}${route}`;
}

function normalizeRedirectPath(requestPath) {
  const normalized = String(requestPath || "/").replace(/\/+$/, "") || "/";
  return CATEGORY_ROUTE_REDIRECTS.get(normalized.toLowerCase()) || null;
}

function registerApi(app, prefix) {
  app.use(joinRoute(prefix, "/webhooks"), express.raw({ type: "*/*", limit: "2mb" }));
}

function shortCatalogRoutePatterns() {
  return CATALOG_ROUTE_SECTIONS.flatMap((section) => [
    `/${section}/:slug`,
    `/${section}/:slug/index.html`
  ]);
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

    app.get(["/loja", "/loja/"], (_req, res) => {
      res.redirect(302, "/");
    });

    app.get(shortCatalogRoutePatterns(), (req, res, next) => {
      const section = req.path.split("/").filter(Boolean)[0];
      const destination = resolveShortCatalogRoute({
        staticDir: STATIC_DIR,
        section,
        slug: req.params.slug
      });
      if (!destination) return next();
      const currentPath = req.path.endsWith("/") ? req.path : `${req.path}/`;
      if (currentPath === destination) return next();
      res.redirect(302, destination);
    });

    app.get(Array.from(CATEGORY_ROUTE_REDIRECTS.keys()).flatMap((route) => [route, `${route}/`]), (req, res) => {
      const destination = normalizeRedirectPath(req.path);
      if (!destination) return res.status(404).send("Not found");
      res.redirect(302, destination);
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
