import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../server/lib/db.js";
import { normalizeProductSegment } from "../server/lib/product-url.js";

const root = process.cwd();
const reportPath = path.join(root, "relatorio-auditoria-marcas.json");
const outputDir = path.join(root, "_validation");
const outputPath = path.join(outputDir, "db-products-vs-site.json");

const sectionToAuditCategory = new Map([
  ["baterias", "baterias"],
  ["baterias-celular", "baterias"],
  ["bateria", "baterias"],
  ["bateria-celular", "baterias"],
  ["display", "display"],
  ["display-e-lcd", "display"],
  ["tela-display-lcd", "display"],
  ["display-lcd", "display"],
  ["telas-display-lcd", "display"],
  ["pecas", "pecas_componentes"],
  ["pecas-componentes", "pecas_componentes"],
  ["pecas-e-componentes", "pecas_componentes"],
  ["componentes", "pecas_componentes"],
  ["tampas", "tampas_carcacas"],
  ["tampas-carcacas", "tampas_carcacas"],
  ["tampas-e-carcacas", "tampas_carcacas"],
  ["carcacas", "tampas_carcacas"]
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

function productKeys(product) {
  const category = product.categoria;
  const slug = normalizeProductSegment(product.slug);
  const name = normalizeProductSegment(product.nome);
  const route = cleanRoute(product.url);
  const parts = route.split("/").filter(Boolean);
  const brand = normalizeProductSegment(parts.length > 2 ? parts[1] : product.marca_original || product.marca);
  return [
    `${category}|${brand}|${slug}`,
    `${category}||${slug}`,
    `${category}|name|${name}`,
    route ? `route|${route}` : ""
  ].filter(Boolean);
}

function rowKeys(row) {
  const category = sectionToAuditCategory.get(normalizeProductSegment(row.section)) || "";
  const brand = normalizeProductSegment(row.brand);
  const slug = normalizeProductSegment(row.slug);
  const name = normalizeProductSegment(row.name);
  const url = cleanRoute(row.url);
  return [
    `${category}|${brand}|${slug}`,
    `${category}||${slug}`,
    `${category}|name|${name}`,
    url ? `route|${url}` : ""
  ].filter(Boolean);
}

function candidateReason(row, siteKeyHit) {
  if (siteKeyHit) return "";
  const section = normalizeProductSegment(row.section);
  const category = sectionToAuditCategory.get(section);
  if (!category) return `section fora do menu/site atual: ${row.section || ""}`;
  return "produto sem correspondencia no HTML/dataLayer atual do site";
}

if (!fs.existsSync(reportPath)) {
  throw new Error("relatorio-auditoria-marcas.json nao encontrado. Rode scripts/audit-catalog-brands.mjs primeiro.");
}

fs.mkdirSync(outputDir, { recursive: true });

const siteReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const siteProducts = Array.isArray(siteReport.produtos) ? siteReport.produtos : [];
const siteKeys = new Set();
for (const product of siteProducts) {
  if (product.acao !== "MANTER") continue;
  for (const key of productKeys(product)) siteKeys.add(key);
}

const { rows } = await pool.query(`
  select id, slug, name, brand, section, price_cents, currency, image_url, active, updated_at,
    case
      when coalesce(section, '') <> '' and coalesce(brand, '') <> '' and coalesce(slug, '') <> ''
        then concat(section, '/', brand, '/', slug)
      when coalesce(section, '') <> '' and coalesce(slug, '') <> ''
        then concat(section, '/', slug)
      else coalesce(slug, '')
    end as url
  from products
  order by section nulls last, brand nulls last, slug nulls last, id
`);

const keep = [];
const removeCandidates = [];
for (const row of rows) {
  const keys = rowKeys(row);
  const siteKeyHit = keys.some((key) => siteKeys.has(key));
  const reason = candidateReason(row, siteKeyHit);
  if (!reason) {
    keep.push(row);
  } else {
    removeCandidates.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      section: row.section,
      active: row.active,
      price_cents: row.price_cents,
      reason
    });
  }
}

const byReason = removeCandidates.reduce((acc, item) => {
  acc[item.reason] = (acc[item.reason] || 0) + 1;
  return acc;
}, {});

const bySection = removeCandidates.reduce((acc, item) => {
  const key = item.section || "(sem section)";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const output = {
  generated_at: new Date().toISOString(),
  site_products: siteProducts.filter((p) => p.acao === "MANTER").length,
  db_products: rows.length,
  keep: keep.length,
  remove_candidates: removeCandidates.length,
  by_reason: byReason,
  by_section: bySection,
  candidates: removeCandidates
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  output: path.relative(root, outputPath).replace(/\\/g, "/"),
  site_products: output.site_products,
  db_products: output.db_products,
  keep: output.keep,
  remove_candidates: output.remove_candidates,
  by_reason: output.by_reason,
  by_section: output.by_section
}, null, 2));

await pool.end();
