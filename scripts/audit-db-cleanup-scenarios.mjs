import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../server/lib/db.js";
import { normalizeProductSegment } from "../server/lib/product-url.js";

const root = process.cwd();
const countsPath = path.join(root, "_validation", "site-product-counts.json");
const outputPath = path.join(root, "_validation", "db-cleanup-scenarios.json");

const canonicalSectionByDb = new Map([
  ["baterias-celular", "baterias-celular"],
  ["baterias", "baterias-celular"],
  ["display-e-lcd", "display-e-lcd"],
  ["display", "display-e-lcd"],
  ["pecas-e-componentes", "pecas-e-componentes"],
  ["tampas-e-carcacas", "tampas-e-carcacas"]
]);

const aliasRoots = new Map([
  ["baterias-celular", ["baterias-celular", "baterias", "bateria-celular", "bateria"]],
  ["display-e-lcd", ["display-e-lcd", "display", "tela-display-lcd", "display-lcd", "telas-display-lcd"]],
  ["pecas-e-componentes", ["pecas-e-componentes", "pecas-componentes", "pecas", "componentes"]],
  ["tampas-e-carcacas", ["tampas-e-carcacas", "tampas-carcacas", "tampas", "carcacas"]]
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

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function htmlProductRouteKeys(filePath) {
  const route = cleanRoute(path.relative(root, filePath));
  const parts = route.split("/").filter(Boolean);
  if (parts.at(-1) === "index") parts.pop();
  if (parts.length < 3) return [];
  const rootName = parts[0];
  const brand = normalizeProductSegment(parts[1]);
  const slug = normalizeProductSegment(parts.at(-1));
  const keys = [];
  for (const [canonical, roots] of aliasRoots) {
    if (!roots.includes(rootName)) continue;
    keys.push(`${canonical}|${brand}|${slug}`);
    keys.push(`${canonical}||${slug}`);
  }
  return keys;
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

function productKeyFromListItem(item, canonical) {
  const url = cleanRoute(item.urlProduct || item.url || "");
  const parts = url.split("/").filter(Boolean);
  const brand = normalizeProductSegment(parts.length >= 3 ? parts[1] : item.brand || "");
  const slug = normalizeProductSegment(item.slug || parts.at(-1) || slugify(item.nameProduct || item.name || ""));
  const id = String(item.idProduct || item.id || "").trim();
  return [
    id ? `${canonical}|id|${id}` : "",
    `${canonical}|${brand}|${slug}`,
    `${canonical}||${slug}`,
    `${canonical}|name|${slugify(item.nameProduct || item.name || "")}`
  ].filter(Boolean);
}

function rowKeys(row) {
  const canonical = canonicalSectionByDb.get(normalizeProductSegment(row.section)) || "";
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

const canonicalRoots = new Set(["baterias-celular", "display-e-lcd", "pecas-e-componentes", "tampas-e-carcacas"]);
const allProductPageKeys = new Set();
const canonicalProductPageKeys = new Set();
const canonicalListKeys = new Set();

for (const file of walk(root)) {
  const route = cleanRoute(path.relative(root, file));
  const parts = route.split("/").filter(Boolean);
  const rootName = parts[0] || "";
  if (![...aliasRoots.values()].flat().includes(rootName)) continue;

  const pageKeys = htmlProductRouteKeys(file);
  for (const key of pageKeys) {
    allProductPageKeys.add(key);
    if (canonicalRoots.has(rootName)) canonicalProductPageKeys.add(key);
  }

  if (!canonicalRoots.has(rootName) || parts.length > 2) continue;
  const html = fs.readFileSync(file, "utf8");
  const data = parseDataLayer(html);
  if (!Array.isArray(data?.listProducts)) continue;
  const canonical = rootName;
  for (const item of data.listProducts) {
    for (const key of productKeyFromListItem(item, canonical)) canonicalListKeys.add(key);
  }
}

const { rows } = await pool.query(`
  select id, slug, name, brand, section, price_cents, active
  from products
  order by section nulls last, brand nulls last, slug nulls last, id
`);

function scenarioMissingRows(keys) {
  return rows.filter((row) => !rowKeys(row).some((key) => keys.has(key)));
}

const scenarios = {
  conservative_any_product_page_or_alias: scenarioMissingRows(allProductPageKeys),
  canonical_product_pages_only: scenarioMissingRows(canonicalProductPageKeys),
  canonical_menu_listings_only: scenarioMissingRows(canonicalListKeys)
};

function summarize(items) {
  const bySection = {};
  const byBrand = {};
  for (const item of items) {
    bySection[item.section || ""] = (bySection[item.section || ""] || 0) + 1;
    byBrand[`${item.section || ""}|${item.brand || ""}`] = (byBrand[`${item.section || ""}|${item.brand || ""}`] || 0) + 1;
  }
  return { count: items.length, bySection, byBrand, sample: items.slice(0, 30) };
}

const output = {
  generated_at: new Date().toISOString(),
  note: "Read-only scenarios. No DB deletion performed.",
  db_total: rows.length,
  key_counts: {
    allProductPageKeys: allProductPageKeys.size,
    canonicalProductPageKeys: canonicalProductPageKeys.size,
    canonicalListKeys: canonicalListKeys.size
  },
  scenarios: Object.fromEntries(Object.entries(scenarios).map(([name, items]) => [name, summarize(items)]))
};

if (fs.existsSync(countsPath)) {
  output.site_count_summary = JSON.parse(fs.readFileSync(countsPath, "utf8")).summary;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  output: path.relative(root, outputPath).replace(/\\/g, "/"),
  db_total: output.db_total,
  key_counts: output.key_counts,
  scenarios: Object.fromEntries(Object.entries(output.scenarios).map(([k, v]) => [k, { count: v.count, bySection: v.bySection }]))
}, null, 2));

await pool.end();
