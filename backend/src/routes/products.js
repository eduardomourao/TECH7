import { Router } from "express";
import { supabase, isSupabaseConfigured, mockDb, mockFilter, mockInsert, mockUpdate } from "../services/supabase.js";
import { mockProductMatchesSection, resolveSectionFilterValues } from "../utils/product-filters.js";

export const router = Router();

const TABLE = "products";

function applyProductFilters(query, { sections, brand, search, minPrice, maxPrice }) {
  let filtered = query.eq("active", true);
  if (sections.length) filtered = filtered.in("section", sections);
  if (brand) filtered = filtered.eq("brand", brand);
  const priceFilterActive = (Number.isFinite(minPrice) && minPrice >= 0) || (Number.isFinite(maxPrice) && maxPrice >= 0);
  if (priceFilterActive) filtered = filtered.gte("price_cents", 200);
  if (Number.isFinite(minPrice) && minPrice >= 0) filtered = filtered.gte("price_cents", Math.round(minPrice * 100));
  if (Number.isFinite(maxPrice) && maxPrice >= 0) filtered = filtered.lte("price_cents", Math.round(maxPrice * 100));
  if (search) {
    const term = String(search).replace(/[%*,]/g, " ").trim();
    if (term) filtered = filtered.or(`name.ilike.%${term}%,brand.ilike.%${term}%,section.ilike.%${term}%,slug.ilike.%${term}%`);
  }
  return filtered;
}

function aggregateBrandFacets(rows) {
  const byBrand = new Map();
  for (const row of rows || []) {
    const value = String(row?.brand || "").trim().toLowerCase();
    if (!value) continue;
    const current = byBrand.get(value) || { value, label: row.brand, total: 0 };
    current.total += 1;
    byBrand.set(value, current);
  }
  return Array.from(byBrand.values()).sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label)));
}

function aggregatePriceFacet(rows) {
  let min = null;
  let max = null;
  for (const row of rows || []) {
    const cents = Number(row?.price_cents);
    if (!Number.isFinite(cents) || cents < 200) continue;
    min = min == null ? cents : Math.min(min, cents);
    max = max == null ? cents : Math.max(max, cents);
  }
  return { min_price_cents: min, max_price_cents: max };
}

// GET /api/products
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const cat = req.query.category;
    const brand = req.query.brand;
    const search = req.query.q;
    const minPrice = Number(req.query.minPrice || req.query.min_price || req.query.preco_min || "");
    const maxPrice = Number(req.query.maxPrice || req.query.max_price || req.query.preco_max || "");
    const sections = resolveSectionFilterValues(cat);
    const filterState = { sections, brand, search, minPrice, maxPrice };

    if (isSupabaseConfigured) {
      let query = applyProductFilters(
        supabase.from(TABLE).select("*", { count: "exact" }),
        filterState
      );

      const facetsQuery = applyProductFilters(
        supabase.from(TABLE).select("brand,price_cents"),
        filterState
      ).limit(1000);

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      const { data: facetRows, error: facetError } = await facetsQuery;
      if (facetError) throw facetError;
      return res.json({
        items: data,
        total: count ?? data.length,
        limit,
        offset,
        sections,
        facets: { brands: aggregateBrandFacets(facetRows), price: aggregatePriceFacet(facetRows) }
      });
    }

    // --- mock ---
    const filters = { eq: { active: true } };
    if (brand) filters.eq.brand = brand;
    if (search) filters.ilike = { name: `%${search}%` };

    let source = mockDb.products;
    if (sections.length) source = source.filter((product) => mockProductMatchesSection(product, cat));

    const { data, total } = mockFilter(source, {
      ...filters,
      gte: Number.isFinite(minPrice) && minPrice >= 0 ? { price_cents: Math.round(minPrice * 100) } : undefined,
      lte: Number.isFinite(maxPrice) && maxPrice >= 0 ? { price_cents: Math.round(maxPrice * 100) } : undefined,
      order: ["created_at", "desc"],
      limit,
      offset,
    });
    res.json({
      items: data,
      total,
      limit,
      offset,
      sections,
      facets: { brands: aggregateBrandFacets(source), price: aggregatePriceFacet(source) }
    });
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
