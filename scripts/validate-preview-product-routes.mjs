import fs from "node:fs";

const baseUrl = String(process.argv[2] || "").replace(/\/+$/g, "");
const sampleCount = Number.parseInt(process.argv[3] || "100", 10);
const sectionFilter = process.argv[4] || "pecas-e-componentes";

const categoryAliases = {
  "baterias": ["baterias", "baterias-celular", "bateria", "bateria-celular"],
  "baterias-celular": ["baterias-celular", "baterias", "bateria", "bateria-celular"],
  "display-e-lcd": ["display-e-lcd", "tela-display-lcd", "display", "display-lcd", "telas", "telas-display-lcd"],
  "tela-display-lcd": ["tela-display-lcd", "display-e-lcd", "display", "display-lcd", "telas", "telas-display-lcd"],
  "touchs-e-visores": ["touchs-e-visores", "touch-e-visor", "touchs-visores", "touch-visor", "touch"],
  "touch-e-visor": ["touch-e-visor", "touchs-e-visores", "touchs-visores", "touch-visor", "touch"],
  "pecas-e-componentes": ["pecas-e-componentes", "pecas-componentes", "componentes", "pecas"],
  "tampas-e-carcacas": ["tampas-e-carcacas", "tampas-carcacas", "carcacas", "tampas"],
  "maquinas-e-ferramentas": ["maquinas-e-ferramentas", "maquinas-ferramentas", "ferramentas"],
  "suprimentos": ["suprimentos"]
};

if (!baseUrl) {
  console.error("Usage: node scripts/validate-preview-product-routes.mjs <preview-url> [sample-count] [section]");
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync("_assets/tech7/search-index.json", "utf8"));

function cleanRoute(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .toLowerCase();
}

function titleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>(.*?)<\/title>/is);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function canonicalFromAlias(html) {
  if (!String(html || "").includes("TECH7_PRODUCT_ALIAS_PAGE")) return "";
  const match = String(html).match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

function is404Response(status, html) {
  return status === 404 || /pagina nao encontrada|erro 404|not_found/i.test(html);
}

const products = (index.items || [])
  .map((item) => {
    const canonical = cleanRoute(item.url);
    const parts = canonical.split("/").filter(Boolean);
    return {
      title: item.title || item.name || item.slug || canonical,
      canonical,
      section: parts[0],
      brand: parts.length >= 3 ? parts[1] : "",
      slug: cleanRoute(item.slug || parts.at(-1))
    };
  })
  .filter((item) => item.section === sectionFilter)
  .slice(0, sampleCount);

const checks = [];
for (const product of products) {
  const variants = new Map();
  variants.set(product.canonical, "canonical");
  variants.set(`${product.section}/${product.slug}`, "short-alias");
  for (const sectionAlias of categoryAliases[product.section] || [product.section]) {
    variants.set(`${sectionAlias}/${product.slug}`, "category-short-alias");
    if (product.brand) variants.set(`${sectionAlias}/${product.brand}/${product.slug}`, "category-brand-alias");
  }
  for (const [route, kind] of variants) {
    checks.push({ product, kind, route });
  }
}

async function checkRoute(check) {
  const url = `${baseUrl}/${check.route}/`;
  const response = await fetch(url, { redirect: "follow" });
  const html = await response.text();
  const title = titleFromHtml(html);
  const canonical = canonicalFromAlias(html);
  let canonicalStatus = null;
  let canonicalTitle = "";
  let canonicalOk = true;
  if (canonical) {
    const canonicalResponse = await fetch(`${baseUrl}${canonical}`, { redirect: "follow" });
    const canonicalHtml = await canonicalResponse.text();
    canonicalStatus = canonicalResponse.status;
    canonicalTitle = titleFromHtml(canonicalHtml);
    canonicalOk = canonicalResponse.status === 200 && !is404Response(canonicalResponse.status, canonicalHtml);
  }
  return {
    product: check.product.title,
    kind: check.kind,
    route: check.route,
    status: response.status,
    finalUrl: response.url,
    title,
    canonical,
    canonicalStatus,
    canonicalTitle,
    ok: response.status === 200 && !is404Response(response.status, html) && canonicalOk
  };
}

const results = [];
for (let i = 0; i < checks.length; i += 10) {
  const batch = checks.slice(i, i + 10);
  results.push(...await Promise.all(batch.map(checkRoute)));
}

const failed = results.filter((result) => !result.ok);
const productNames = new Set(results.filter((result) => result.ok).map((result) => result.product));

console.log(JSON.stringify({
  baseUrl,
  section: sectionFilter,
  requestedProducts: sampleCount,
  productsTested: products.length,
  okProducts: productNames.size,
  routeChecks: results.length,
  failedCount: failed.length,
  failed: failed.slice(0, 50),
  sampleOk: results.filter((result) => result.ok).slice(0, 10)
}, null, 2));

if (products.length < sampleCount || failed.length) {
  process.exit(1);
}
