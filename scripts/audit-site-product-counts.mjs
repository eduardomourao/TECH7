import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../server/lib/db.js";

const root = process.cwd();
const outputDir = path.join(root, "_validation");
const outputPath = path.join(outputDir, "site-product-counts.json");

const canonicalRoots = new Set([
  "baterias-celular",
  "display-e-lcd",
  "pecas-e-componentes",
  "tampas-e-carcacas"
]);

const allCatalogRoots = new Set([
  "bateria",
  "bateria-celular",
  "baterias",
  "baterias-celular",
  "display",
  "display-e-lcd",
  "display-lcd",
  "tela-display-lcd",
  "telas-display-lcd",
  "pecas",
  "pecas-componentes",
  "pecas-e-componentes",
  "componentes",
  "tampas",
  "tampas-carcacas",
  "tampas-e-carcacas",
  "carcacas"
]);

const aliasToCanonical = new Map([
  ["bateria", "baterias-celular"],
  ["bateria-celular", "baterias-celular"],
  ["baterias", "baterias-celular"],
  ["baterias-celular", "baterias-celular"],
  ["display", "display-e-lcd"],
  ["display-e-lcd", "display-e-lcd"],
  ["display-lcd", "display-e-lcd"],
  ["tela-display-lcd", "display-e-lcd"],
  ["telas-display-lcd", "display-e-lcd"],
  ["pecas", "pecas-e-componentes"],
  ["pecas-componentes", "pecas-e-componentes"],
  ["pecas-e-componentes", "pecas-e-componentes"],
  ["componentes", "pecas-e-componentes"],
  ["tampas", "tampas-e-carcacas"],
  ["tampas-carcacas", "tampas-e-carcacas"],
  ["tampas-e-carcacas", "tampas-e-carcacas"],
  ["carcacas", "tampas-e-carcacas"]
]);

const skipDirs = new Set([
  ".git",
  "node_modules",
  ".vercel",
  "_validation",
  "validation-screenshots",
  "artifacts",
  "backup"
]);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name), out);
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

function cleanRoute(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productKeyFromItem(item) {
  const url = cleanRoute(item.urlProduct || item.url || "");
  const id = String(item.idProduct || item.id || "").trim();
  const name = slugify(item.nameProduct || item.name || item.title || "");
  const slug = slugify(item.slug || url.split("/").filter(Boolean).at(-1) || name);
  return id || slug || name || url;
}

function routeParts(filePath) {
  const route = cleanRoute(rel(filePath));
  const parts = route.split("/").filter(Boolean);
  return { route, parts, rootName: parts[0] || "" };
}

function isProbablyProductPage(data, html, parts) {
  return Boolean(data?.idProduct && data?.nameProduct) || /\bpage-product\b/i.test(html) || parts.length >= 3;
}

function isListPage(parts, data) {
  return Array.isArray(data?.listProducts) && parts.length <= 2;
}

function countCards(html) {
  const productLinks = new Set();
  const re = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    const route = cleanRoute(match[1]);
    const parts = route.split("/").filter(Boolean);
    if (parts.length >= 3 && allCatalogRoots.has(parts[0])) productLinks.add(route);
  }
  return productLinks.size;
}

const htmlFiles = [];
for (const rootName of allCatalogRoots) walk(path.join(root, rootName), htmlFiles);

const counts = {
  htmlFiles: htmlFiles.length,
  canonicalListPages: 0,
  aliasListPages: 0,
  canonicalProductPages: 0,
  aliasProductPages: 0,
  canonicalListProductsUnique: new Set(),
  allListProductsUnique: new Set(),
  canonicalProductPageUnique: new Set(),
  allProductPageUnique: new Set(),
  canonicalCardLinksUnique: new Set(),
  allCardLinksUnique: new Set()
};

const byListPage = [];
const byProductRoot = {};

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const data = parseDataLayer(html);
  const { route, parts, rootName } = routeParts(file);
  if (!allCatalogRoots.has(rootName)) continue;
  const canonicalRoot = aliasToCanonical.get(rootName) || rootName;
  const isCanonicalRoot = canonicalRoots.has(rootName);

  if (data && isListPage(parts, data)) {
    if (isCanonicalRoot) counts.canonicalListPages += 1;
    else counts.aliasListPages += 1;

    const listKeys = new Set();
    for (const item of data.listProducts) {
      const key = productKeyFromItem(item);
      if (!key) continue;
      listKeys.add(key);
      counts.allListProductsUnique.add(key);
      if (isCanonicalRoot) counts.canonicalListProductsUnique.add(key);
    }
    byListPage.push({
      file: rel(file),
      route: `/${route}`,
      canonicalRoot,
      isCanonicalRoot,
      listProducts: data.listProducts.length,
      uniqueInPage: listKeys.size,
      cardLinks: countCards(html)
    });
  }

  if (data && isProbablyProductPage(data, html, parts)) {
    const key = productKeyFromItem(data) || route;
    counts.allProductPageUnique.add(key);
    if (isCanonicalRoot) counts.canonicalProductPageUnique.add(key);
    if (isCanonicalRoot) counts.canonicalProductPages += 1;
    else counts.aliasProductPages += 1;
    byProductRoot[canonicalRoot] ||= { canonical: 0, alias: 0 };
    byProductRoot[canonicalRoot][isCanonicalRoot ? "canonical" : "alias"] += 1;
  }

  const cardCount = countCards(html);
  if (cardCount) {
    const re = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = re.exec(html))) {
      const linkRoute = cleanRoute(match[1]);
      const linkParts = linkRoute.split("/").filter(Boolean);
      if (linkParts.length < 3 || !allCatalogRoots.has(linkParts[0])) continue;
      counts.allCardLinksUnique.add(linkRoute);
      if (isCanonicalRoot && parts.length <= 2) counts.canonicalCardLinksUnique.add(linkRoute);
    }
  }
}

const { rows: dbSections } = await pool.query(`
  select coalesce(section, '') as section, count(*)::int as total
  from products
  group by coalesce(section, '')
  order by total desc, section
`);

const { rows: dbBrands } = await pool.query(`
  select coalesce(section, '') as section, coalesce(brand, '') as brand, count(*)::int as total
  from products
  group by coalesce(section, ''), coalesce(brand, '')
  order by section, total desc, brand
`);

const output = {
  generated_at: new Date().toISOString(),
  summary: {
    htmlFiles: counts.htmlFiles,
    canonicalListPages: counts.canonicalListPages,
    aliasListPages: counts.aliasListPages,
    canonicalProductPages: counts.canonicalProductPages,
    aliasProductPages: counts.aliasProductPages,
    canonicalListProductsUnique: counts.canonicalListProductsUnique.size,
    allListProductsUnique: counts.allListProductsUnique.size,
    canonicalProductPageUnique: counts.canonicalProductPageUnique.size,
    allProductPageUnique: counts.allProductPageUnique.size,
    canonicalCardLinksUnique: counts.canonicalCardLinksUnique.size,
    allCardLinksUnique: counts.allCardLinksUnique.size
  },
  byProductRoot,
  byListPage,
  database: {
    total: dbSections.reduce((sum, row) => sum + row.total, 0),
    bySection: dbSections,
    bySectionBrand: dbBrands
  }
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(JSON.stringify({
  output: path.relative(root, outputPath).replace(/\\/g, "/"),
  summary: output.summary,
  databaseTotal: output.database.total,
  databaseSections: output.database.bySection
}, null, 2));

await pool.end();
