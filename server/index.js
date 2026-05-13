import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";

import { requireEnv, safeJson } from "./lib/env.js";
import { pool } from "./lib/db.js";
import { router as apiRouter } from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

// Static root: keep serving the existing mirror from repo root by default.
// You can later set STATIC_DIR=web after migrating the files into /web.
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, "..");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);

// Webhooks need raw body; keep it scoped to webhook route.
app.use("/api/webhooks", express.raw({ type: "*/*", limit: "2mb" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    // Lightweight DB check (optional if DATABASE_URL isn't set yet).
    if (process.env.DATABASE_URL) {
      await pool.query("select 1 as ok");
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.use("/api", apiRouter);

app.get("/loja/busca.php", (req, res) => {
  const term = String(req.query.palavra_busca || req.query.q || "").trim();
  const params = new URLSearchParams();
  if (term) params.set("q", term);
  res.redirect(302, `/busca/index.html${params.toString() ? `?${params}` : ""}`);
});

// Serve static site.
app.use(express.static(STATIC_DIR, { extensions: ["html"] }));

// Fallback to the homepage for unknown paths (basic SPA-like behavior).
app.get("*", (req, res) => {
  // If the request looks like a file, let it 404.
  if (path.extname(req.path)) return res.status(404).send("Not found");
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// Startup checks (don’t crash if not configured yet, so the user can iterate).
try {
  if (process.env.DATABASE_URL) requireEnv("DATABASE_URL");
  if (process.env.MP_ACCESS_TOKEN) requireEnv("MP_ACCESS_TOKEN");
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn("[startup] config warning:", safeJson({ error: String(e?.message || e) }));
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    safeJson({
      msg: "server listening",
      port: PORT,
      staticDir: STATIC_DIR
    })
  );
});
