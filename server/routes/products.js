import express from "express";
import { pool } from "../lib/db.js";

export const router = express.Router();

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, active
      from products
      where id = $1 and active = true
      limit 1
    `,
    [String(req.params.id || "")]
  );
  if (!rows.length) return res.status(404).json({ error: "product_not_found" });
  res.json(rows[0]);
});

router.get("/", async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 24)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const search = String(req.query.q || "").trim();

  const params = [];
  const filters = ["active = true"];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(name ilike $${params.length} or brand ilike $${params.length} or section ilike $${params.length} or slug ilike $${params.length})`);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `
      select id, slug, name, brand, section, price_cents, currency, image_url, active
      from products
      where ${filters.join(" and ")}
      order by created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );

  res.json({ items: rows, limit, offset });
});

