import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isSupabaseConfigured = !!supabase;

// ---------------------------------------------------------------
// In-memory mock store (used when Supabase env vars are missing)
// ---------------------------------------------------------------
const now = () => new Date().toISOString();

export const mockDb = {
  products: [
    {
      id: "7077",
      slug: "tela-display-lcd-realme-c55-rmx3710-com-aro",
      name: "Tela Display Lcd Realme C55 RMX3710 Com Aro",
      description: "Tela original de alta qualidade para Realme C55",
      price: 95.0,
      old_price: null,
      stock: 10,
      image_url: "",
      category: "DISPLAY",
      brand: "Realme",
      active: true,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: "7078",
      slug: "bateria-samsung-galaxy-a51",
      name: "Bateria Samsung Galaxy A51",
      description: "Bateria 4000mAh para Samsung A51",
      price: 89.9,
      old_price: 99.9,
      stock: 25,
      image_url: "",
      category: "BATERIA",
      brand: "Samsung",
      active: true,
      created_at: now(),
      updated_at: now(),
    },
    {
      id: "7079",
      slug: "tela-iphone-11-original",
      name: "Tela iPhone 11 Original",
      description: "Tela LCD 6.1 polegadas para iPhone 11",
      price: 149.9,
      old_price: null,
      stock: 5,
      image_url: "",
      category: "DISPLAY",
      brand: "Apple",
      active: true,
      created_at: now(),
      updated_at: now(),
    },
  ],
  customers: [],
  orders: [],
  order_items: [],
  admin_users: [
    {
      id: "admin-001",
      email: "admin@tech7.com.br",
      password_hash: "",
      name: "Admin TECH 7",
      created_at: now(),
    },
  ],
};

// ---------------------------------------------------------------
// Mock helpers — filter/sort/paginate a mock array
// ---------------------------------------------------------------
export function mockFilter(items, opts = {}) {
  let result = [...items];

  // eq: { col: val }
  if (opts.eq) {
    for (const [col, val] of Object.entries(opts.eq)) {
      result = result.filter((r) => r[col] === val);
    }
  }

  // neq: { col: val }
  if (opts.neq) {
    for (const [col, val] of Object.entries(opts.neq)) {
      result = result.filter((r) => r[col] !== val);
    }
  }

  // in: { col: [vals] }
  if (opts.in) {
    for (const [col, vals] of Object.entries(opts.in)) {
      result = result.filter((r) => vals.includes(r[col]));
    }
  }

  // ilike: { col: "%pattern%" }
  if (opts.ilike) {
    for (const [col, pattern] of Object.entries(opts.ilike)) {
      const regex = new RegExp(
        "^" + pattern.replace(/%/g, ".*").replace(/_/g, ".") + "$",
        "i"
      );
      result = result.filter((r) => regex.test(String(r[col])));
    }
  }

  // gte: { col: val }
  if (opts.gte) {
    for (const [col, val] of Object.entries(opts.gte)) {
      result = result.filter((r) => Number(r[col]) >= Number(val));
    }
  }

  // lte: { col: val }
  if (opts.lte) {
    for (const [col, val] of Object.entries(opts.lte)) {
      result = result.filter((r) => Number(r[col]) <= Number(val));
    }
  }

  const total = result.length;

  if (opts.order) {
    const [col, dir] = Array.isArray(opts.order)
      ? opts.order
      : [opts.order, "asc"];
    result.sort((a, b) => {
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
  }

  if (opts.offset) result = result.slice(opts.offset);
  if (opts.limit) result = result.slice(0, opts.limit);

  return { data: result, total, error: null };
}

export function mockInsert(table, row) {
  const id =
    row.id || `${table.slice(0, 3)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = { ...row, id, created_at: now(), updated_at: now() };
  mockDb[table].push(entry);
  return { data: entry, error: null };
}

export function mockUpdate(table, idField, idVal, changes) {
  const idx = mockDb[table].findIndex((r) => r[idField] === idVal);
  if (idx === -1) return { data: null, error: "not_found" };
  mockDb[table][idx] = { ...mockDb[table][idx], ...changes, updated_at: now() };
  return { data: mockDb[table][idx], error: null };
}
