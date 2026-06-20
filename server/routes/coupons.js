import express from "express";
import { pool } from "../lib/db.js";

export const router = express.Router();

function cleanCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function couponPayload(row, subtotalCents) {
  const discountCents = Number(row.discount_cents || 0);
  return {
    id: row.id,
    code: row.code,
    discount_cents: discountCents,
    discount: Number((discountCents / 100).toFixed(2)),
    expires_at: row.expires_at,
    active: Boolean(row.active),
    applied_discount_cents: discountCents,
    applied_discount: Number((discountCents / 100).toFixed(2)),
    subtotal_cents: Number(subtotalCents || 0)
  };
}

router.post("/validate", async (req, res) => {
  const code = cleanCode(req.body?.code);
  const subtotalCents = Number.isFinite(Number(req.body?.subtotal_cents))
    ? Math.round(Number(req.body.subtotal_cents))
    : toCents(req.body?.subtotal);

  if (!code) return res.status(400).json({ error: "coupon_code_required" });
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) {
    return res.status(400).json({ error: "invalid_subtotal" });
  }

  const { rows } = await pool.query(
    `select id, code, discount_cents, expires_at, active from coupons where lower(code) = lower($1) limit 1`,
    [code]
  );
  if (!rows.length) return res.status(404).json({ error: "coupon_not_found" });

  const coupon = rows[0];
  if (!coupon.active) return res.status(409).json({ error: "coupon_inactive" });
  if (new Date(coupon.expires_at).getTime() < Date.now()) {
    return res.status(409).json({ error: "coupon_expired" });
  }
  if (Number(coupon.discount_cents || 0) > subtotalCents) {
    return res.status(422).json({ error: "coupon_discount_exceeds_subtotal" });
  }

  const payload = couponPayload(coupon, subtotalCents);
  res.json({
    ok: true,
    coupon: payload,
    discount_cents: payload.discount_cents,
    discount: payload.discount,
    applied_discount_cents: payload.applied_discount_cents,
    applied_discount: payload.applied_discount,
    subtotal_cents: payload.subtotal_cents
  });
});
