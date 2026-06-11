import express from "express";
import { router as products } from "./products.js";
import { router as search } from "./search.js";
import { router as cart } from "./cart.js";
import { router as orders } from "./orders.js";
import { router as payments } from "./payments.js";
import { router as shipping } from "./shipping.js";
import { router as webhooks } from "./webhooks.js";
import { router as admin } from "./admin.js";
import { rateLimit } from "../middleware/rate_limit.js";

export const router = express.Router();

function wantsJson(req) {
  return req.is("application/json") || String(req.headers.accept || "").includes("application/json");
}

router.post("/cart/add", (req, res) => {
  const productId = String(req.body?.IdProd || req.body?.id || req.body?.productId || req.query?.IdProd || "").trim();
  if (wantsJson(req)) return res.json({ ok: true, cart: "compatible", productId: productId || null });
  return res.redirect(303, "/carrinho");
});

router.post("/comments", (_req, res) => {
  res.status(204).end();
});

router.post("/contact", (req, res) => {
  if (wantsJson(req)) return res.json({ ok: true });
  return res.redirect(303, "/contato");
});

router.post("/testimonials", (req, res) => {
  if (wantsJson(req)) return res.json({ ok: true });
  return res.redirect(303, "/depoimentos-de-clientes");
});

router.use("/products", products);
router.use("/search", search);
router.use("/cart", rateLimit({ keyPrefix: "cart", windowMs: 60_000, limit: 120 }), cart);
router.use("/shipping", rateLimit({ keyPrefix: "shipping", windowMs: 60_000, limit: 40 }), shipping);
router.post("/newsletter", (_req, res) => {
  res.status(204).end();
});
router.use("/orders", rateLimit({ keyPrefix: "orders", windowMs: 60_000, limit: 50 }), orders);
router.use("/payments", rateLimit({ keyPrefix: "payments", windowMs: 60_000, limit: 30 }), payments);
router.use("/webhooks", rateLimit({ keyPrefix: "webhooks", windowMs: 60_000, limit: 120 }), webhooks);
router.use("/admin", rateLimit({ keyPrefix: "admin", windowMs: 60_000, limit: 80 }), admin);
