import { Router } from "express";
import { supabase, isSupabaseConfigured, mockDb, mockFilter, mockInsert, mockUpdate } from "../services/supabase.js";

export const router = Router();

const TABLE = "products";

// GET /api/products
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const cat = req.query.category;
    const brand = req.query.brand;
    const search = req.query.q;

    if (isSupabaseConfigured) {
      let query = supabase
        .from(TABLE)
        .select("*", { count: "exact" })
        .eq("active", true);

      if (cat) query = query.eq("category", cat);
      if (brand) query = query.eq("brand", brand);
      if (search) query = query.ilike("name", `%${search}%`);

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return res.json({ items: data, total: count ?? data.length, limit, offset });
    }

    // --- mock ---
    const filters = { eq: { active: true } };
    if (cat) filters.eq.category = cat;
    if (brand) filters.eq.brand = brand;
    if (search) filters.ilike = { name: `%${search}%` };

    const { data, total } = mockFilter(mockDb.products, {
      ...filters,
      order: ["created_at", "desc"],
      limit,
      offset,
    });
    res.json({ items: data, total, limit, offset });
  } catch (e) {
    next(e);
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res, next) => {
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("id", req.params.id)
        .single();
      if (error?.code === "PGRST116") return res.status(404).json({ error: "product_not_found" });
      if (error) throw error;
      return res.json(data);
    }

    const product = mockDb.products.find((p) => p.id === req.params.id && p.active);
    if (!product) return res.status(404).json({ error: "product_not_found" });
    res.json(product);
  } catch (e) {
    next(e);
  }
});

// POST /api/products
router.post("/", async (req, res, next) => {
  try {
    const { slug, name, description, price, old_price, stock, image_url, category, brand } = req.body || {};

    if (!slug || !name || price == null) {
      return res.status(400).json({ error: "slug, name, and price are required" });
    }

    const row = {
      id: crypto.randomUUID(),
      slug,
      name: String(name).slice(0, 300),
      description: description || null,
      price: Math.max(0, Number(price)),
      old_price: old_price != null ? Math.max(0, Number(old_price)) : null,
      stock: Math.max(0, Number(stock) || 0),
      image_url: image_url || null,
      category: category || null,
      brand: brand || null,
      active: true,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from(TABLE).insert(row).select().single();
      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "slug already exists" });
        throw error;
      }
      return res.status(201).json(data);
    }

    const { data } = mockInsert(TABLE, row);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

// PUT /api/products/:id
router.put("/:id", async (req, res, next) => {
  try {
    const allowed = ["slug", "name", "description", "price", "old_price", "stock", "image_url", "category", "brand", "active"];
    const changes = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) changes[key] = req.body[key];
    }
    if (changes.price !== undefined) changes.price = Math.max(0, Number(changes.price));
    if (changes.old_price !== undefined) changes.old_price = Math.max(0, Number(changes.old_price));
    if (changes.stock !== undefined) changes.stock = Math.max(0, Number(changes.stock));
    if (Object.keys(changes).length === 0) return res.status(400).json({ error: "no_fields_to_update" });

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error?.code === "PGRST116") return res.status(404).json({ error: "product_not_found" });
      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "slug already exists" });
        throw error;
      }
      return res.json(data);
    }

    const { data } = mockUpdate(TABLE, "id", req.params.id, changes);
    if (!data) return res.status(404).json({ error: "product_not_found" });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/products/:id — soft delete
router.delete("/:id", async (req, res, next) => {
  try {
    if (isSupabaseConfigured) {
      const { error, count } = await supabase
        .from(TABLE)
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (count === 0) return res.status(404).json({ error: "product_not_found" });
      if (error) throw error;
      return res.json({ ok: true });
    }

    const idx = mockDb.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "product_not_found" });
    mockDb.products[idx].active = false;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
