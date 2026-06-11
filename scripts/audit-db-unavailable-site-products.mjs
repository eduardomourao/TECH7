import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../server/lib/db.js";
import { normalizeProductSegment } from "../server/lib/product-url.js";

const root = process.cwd();
const outputPath = path.join(root, "_validation", "db-unavailable-site-products.json");

const roots = new Set([
  "baterias-celular", "baterias", "bateria-celular", "bateria",
  "display-e-lcd", "display", "tela-display-lcd", "display-lcd", "telas-display-lcd",
  "pecas-e-componentes", "pecas-componentes", "pecas", "componentes",
  "tampas-e-carcacas", "tampas-carcacas", "tampas", "carcacas"
]);

const rootToCanonical = new Map([
  ["baterias-celular", "baterias-celular"], ["baterias", "baterias-celular"], ["bateria-celular", "baterias-celular"], ["bateria", "baterias-celular"],
  ["display-e-lcd", "display-e-lcd"], ["display", "display-e-lcd"], ["tela-display-lcd", "display-e-lcd"], ["display-lcd", "display-e-lcd"], ["telas-display-lcd", "display-e-lcd"],
  ["pecas-e-componentes", "pecas-e-componentes"], ["pecas-componentes", "pecas-e-componentes"], ["pecas", "pecas-e-componentes"], ["componentes", "pecas-e-componentes"],
  ["tampas-e-carcacas", "tampas-e-carcacas"], ["tampas-carcacas", "tampas-e-carcacas"], ["tampas", "tampas-e-carcacas"], ["carcacas", "tampas-e-carcacas"]
]);

const sectionToCanonical = new Map([
  ["baterias-celular", "baterias-celular"], ["baterias", "baterias-celular"],
  ["display-e-lcd", "display-e-lcd"], ["display", "display-e-lcd"],
  ["pecas-e-componentes", "pecas-e-componentes"],
  ["tampas-e-carcacas", "tampas-e-carcacas"]
]);

function cleanRoute(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findMatchingBracket(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseDataLayer(html) {
  const marker = "dataLayer = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const arrayStart = html.indexOf("[", start + marker.length);
  if (arrayStart === -1) return null;
  const arrayEnd = findMatchingBracket(html, arrayStart, "[", "]");
  if (arrayEnd === -1) return null;
  try {
    const parsed = JSON.parse(html.slice(arrayStart, arrayEnd + 1));
    return Array.isArray(parsed) ? parsed[0] || null : null;
  } catch {
    return null;
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (![".git", "node_modules", "_validation", "backup", "artifacts"].includes(entry.name)) {
        walk(path.join(dir, entry.name), out);
      }
    } else if (entry.isFile() && entry.name.toLowerCase() === "index.html") {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function keysForProduct(item, routeFallback = "") {
  const route = cleanRoute(item.urlProduct || item.url || routeFallback);
  const parts = route.split("/").filter(Boolean);
  const rootName = parts[0] || "";
  const canonical = rootToCanonical.get(rootName) || "";
  const brand = normalizeProductSegment(parts.length >= 3 ? parts[1] : item.brand || "");
  const slug = normalizeProductSegment(item.slug || parts.at(-1) || slugify(item.nameProduct || item.name || ""));
  const id = String(item.idProduct || item.id || "").trim();
  const name = slugify(item.nameProduct || item.name || "");
  return [
    id ? `${canonical}|id|${id}` : "",
    `${canonical}|${brand}|${slug}`,
    `${canonical}||${slug}`,
    `${canonical}|name|${name}`
  ].filter(Boolean);
}

function availabilityFrom(data, html) {
  const explicit = String(data.availability || data.available || "").toUpperCase();
  if (explicit === "NO" || explicit === "N" || explicit === "FALSE") return "NO";
  if (explicit === "YES" || explicit === "Y" || explicit === "TRUE") return "YES";
  if (/Produto Indispon[íi]vel/i.test(html)) return "NO";
  if (/Adicionar ao carrinho|Comprar/i.test(html)) return "YES";
  return "UNKNOWN";
}

const statusByKey = new Map();
const evidence = new Map();
let productPages = 0;
let listItems = 0;

for (const file of walk(root)) {
  const route = cleanRoute(path.relative(root, file));
  const parts = route.split("/").filter(Boolean);
  if (!roots.has(parts[0] || "")) continue;
  const html = fs.readFileSync(file, "utf8");
  const data = parseDataLayer(html);
  if (!data) continue;

  if (data.idProduct && data.nameProduct) {
    productPages += 1;
    const availability = availabilityFrom(data, html);
    for (const key of keysForProduct(data, route)) {
      const old = statusByKey.get(key);
      if (old !== "YES") statusByKey.set(key, availability);
      evidence.set(key, { file: path.relative(root, file).replace(/\\/g, "/"), availability });
    }
  }

  if (Array.isArray(data.listProducts)) {
    for (const item of data.listProducts) {
      listItems += 1;
      const availability = availabilityFrom(item, "");
      for (const key of keysForProduct(item)) {
        const old = statusByKey.get(key);
        if (old !== "YES") statusByKey.set(key, availability);
        evidence.set(key, { file: path.relative(root, file).replace(/\\/g, "/"), availability });
      }
    }
  }
}

function rowKeys(row) {
  const canonical = sectionToCanonical.get(normalizeProductSegment(row.section)) || "";
  const brand = normalizeProductSegment(row.brand);
  const slug = normalizeProductSegment(row.slug);
  const name = slugify(row.name);
  return [
    `${canonical}|id|${row.id}`,
    `${canonical}|${brand}|${slug}`,
    `${canonical}||${slug}`,
    `${canonical}|name|${name}`
  ].filter(Boolean);
}

const { rows } = await pool.query(`
  select id, slug, name, brand, section, price_cents, active
  from products
  order by section nulls last, brand nulls last, slug nulls last, id
`);

const available = [];
const unavailable = [];
const unknown = [];

for (const row of rows) {
  const keys = rowKeys(row);
  const statuses = keys.map((key) => statusByKey.get(key)).filter(Boolean);
  const status = statuses.includes("YES") ? "YES" : statuses.includes("NO") ? "NO" : "UNKNOWN";
  const item = {
    id: row.id,
    section: row.section,
    brand: row.brand,
    slug: row.slug,
    name: row.name,
    active: row.active,
    price_cents: row.price_cents,
    evidence: keys.map((key) => evidence.get(key)).find(Boolean) || null
  };
  if (status === "YES") available.push(item);
  else if (status === "NO") unavailable.push(item);
  else unknown.push(item);
}

function by(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || "";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

const output = {
  generated_at: new Date().toISOString(),
  note: "Read-only. Products with availability NO may still have physical pages but appear unavailable/removed from sale.",
  scan: { productPages, listItems, statusKeys: statusByKey.size },
  db_total: rows.length,
  available_count: available.length,
  unavailable_count: unavailable.length,
  unknown_count: unknown.length,
  unavailable_by_section: by(unavailable, "section"),
  unknown_by_section: by(unknown, "section"),
  unavailable,
  unknown
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  output: path.relative(root, outputPath).replace(/\\/g, "/"),
  db_total: output.db_total,
  available_count: output.available_count,
  unavailable_count: output.unavailable_count,
  unknown_count: output.unknown_count,
  unavailable_by_section: output.unavailable_by_section,
  unknown_by_section: output.unknown_by_section
}, null, 2));

await pool.end();
