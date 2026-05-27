import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";
import { corsMiddleware } from "./src/middleware/cors.js";
import { errorHandler, notFound } from "./src/middleware/errorHandler.js";
import { isSupabaseConfigured } from "./src/services/supabase.js";
import { isMercadoPagoConfigured } from "./src/services/mercadopago.js";
import { router as productsRouter } from "./src/routes/products.js";
import { router as cartRouter } from "./src/routes/cart.js";
import { router as ordersRouter } from "./src/routes/orders.js";
import { router as checkoutRouter } from "./src/routes/checkout.js";
import { router as adminRouter } from "./src/routes/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_DIR = path.resolve(__dirname, "..");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.set("trust proxy", true);

app.use(corsMiddleware);

// Webhook must use raw body (MP sends JSON)
app.use("/api/checkout/webhook", express.raw({ type: "*/*", limit: "2mb" }));
app.use(express.json({ limit: "1mb" }));

// Serve static files (frontend, admin.html, assets/)
app.use(express.static(STATIC_DIR, { extensions: ["html"] }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    store: process.env.STORE_NAME || "TECH 7",
    database: isSupabaseConfigured ? "supabase" : "mock",
    mercadoPago: isMercadoPagoConfigured() ? "configured" : "mock",
  });
});

// Routes
app.use("/api/products", productsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/admin", adminRouter);

app.use("/api/*", notFound);
app.use(errorHandler);

if (!isSupabaseConfigured) {
  console.warn("\n  ⚠️  Supabase not configured — running with in-memory mock data");
  console.warn("     Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to use PostgreSQL\n");
}
if (!isMercadoPagoConfigured()) {
  console.warn("  ⚠️  Mercado Pago not configured — checkout will use mock mode");
  console.warn("     Set MERCADOPAGO_ACCESS_TOKEN in .env for real payments\n");
}
if (!process.env.ADMIN_TOKEN) {
  console.warn("  ⚠️  ADMIN_TOKEN not set — admin routes will reject all requests\n");
}

app.listen(PORT, () => {
  console.log(JSON.stringify({
    msg: "server listening",
    port: PORT,
    env: process.env.NODE_ENV || "development",
    database: isSupabaseConfigured ? "supabase (postgresql)" : "mock (in-memory)",
    mpConfigured: isMercadoPagoConfigured(),
  }));
});
