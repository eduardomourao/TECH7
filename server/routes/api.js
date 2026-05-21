import express from "express";
import { router as products } from "./products.js";
import { router as search } from "./search.js";
import { router as cart } from "./cart.js";
import { router as orders } from "./orders.js";
import { router as payments } from "./payments.js";
import { router as webhooks } from "./webhooks.js";
import { router as admin } from "./admin.js";
import { rateLimit } from "../middleware/rate_limit.js";

export const router = express.Router();

router.use("/products", products);
router.use("/search", search);
router.use("/cart", cart);
router.post("/newsletter", (_req, res) => {
  res.status(204).end();
});
router.use("/orders", rateLimit({ keyPrefix: "orders", windowMs: 60_000, limit: 50 }), orders);
router.use("/payments", rateLimit({ keyPrefix: "payments", windowMs: 60_000, limit: 30 }), payments);
router.use("/webhooks", rateLimit({ keyPrefix: "webhooks", windowMs: 60_000, limit: 120 }), webhooks);
router.use("/admin", rateLimit({ keyPrefix: "admin", windowMs: 60_000, limit: 80 }), admin);

