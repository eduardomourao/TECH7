import { Router } from "express";
import { supabase, isSupabaseConfigured, mockDb, mockFilter } from "../services/supabase.js";

export const router = Router();

// POST /api/cart/validate
// Body: { items: [{ productId, qty, price }] }
router.post("/validate", async (req, res, next) => {
  try {
    const { items } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required", valid: false });
    }

    let products;
    const ids = items.map((i) => i.productId).filter(Boolean);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, price, stock, active")
        .in("id", ids);
      if (error) throw error;
      products = data || [];
    } else {
      products = mockFilter(mockDb.products, { in: { id: ids } }).data;
    }

    const productMap = {};
    for (const p of products) productMap[p.id] = p;

    const errors = [];
    let subtotal = 0;

    for (const item of items) {
      const db = productMap[item.productId];

      if (!db) {
        errors.push({ productId: item.productId, error: "not_found" });
        continue;
      }
      if (!db.active) {
        errors.push({ productId: item.productId, name: db.name, error: "inactive" });
        continue;
      }
      if (db.stock < 1) {
        errors.push({ productId: item.productId, name: db.name, error: "out_of_stock" });
        continue;
      }
      if (db.stock < Number(item.qty || 0)) {
        errors.push({ productId: item.productId, name: db.name, error: "insufficient_stock", available: db.stock });
        continue;
      }
      if (item.price !== undefined) {
        const sent = Number(item.price);
        const dbPrice = Number(db.price);
        if (Math.abs(sent - dbPrice) > 0.01) {
          errors.push({ productId: item.productId, name: db.name, error: "price_mismatch", expected: dbPrice, received: sent });
          continue;
        }
      }

      subtotal += Number(db.price) * Number(item.qty || 1);
    }

    if (errors.length > 0) {
      return res.json({ valid: false, errors, subtotal: +subtotal.toFixed(2) });
    }

    res.json({
      valid: true,
      subtotal: +subtotal.toFixed(2),
      subtotalFormatted: subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      items: items.map((item) => {
        const db = productMap[item.productId];
        return {
          productId: db.id,
          name: db.name,
          slug: db.slug,
          price: Number(db.price),
          qty: Number(item.qty) || 1,
          lineTotal: +(Number(db.price) * (Number(item.qty) || 1)).toFixed(2),
          inStock: db.stock,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});
