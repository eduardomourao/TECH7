import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "relatorio-qa-final.json");
const logPath = path.join(root, "log-remocao.json");
const auditPath = path.join(root, "relatorio-auditoria-marcas.json");

const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
const roots = [
  "baterias-celular", "baterias", "bateria-celular", "bateria",
  "display-e-lcd", "tela-display-lcd", "display", "display-lcd", "telas-display-lcd",
  "pecas-e-componentes", "pecas-componentes", "pecas", "componentes",
  "tampas-e-carcacas", "tampas-carcacas", "tampas", "carcacas"
];
const mainRoutes = [
  "baterias-celular",
  "display-e-lcd",
  "pecas-e-componentes",
  "tampas-e-carcacas"
];
const rootToCategory = new Map([
  ["baterias-celular", "baterias"], ["baterias", "baterias"], ["bateria-celular", "baterias"], ["bateria", "baterias"],
  ["display-e-lcd", "display"], ["tela-display-lcd", "display"], ["display", "display"], ["display-lcd", "display"], ["telas-display-lcd", "display"],
  ["pecas-e-componentes", "pecas_componentes"], ["pecas-componentes", "pecas_componentes"], ["pecas", "pecas_componentes"], ["componentes", "pecas_componentes"],
  ["tampas-e-carcacas", "tampas_carcacas"], ["tampas-carcacas", "tampas_carcacas"], ["tampas", "tampas_carcacas"], ["carcacas", "tampas_carcacas"]
]);
const removedBrandSlugs = new Set(["zenfone", "asus", "infinix", "lenovo", "nokia", "alcatel", "cce", "importados", "importado", "multilaser", "positivo", "sony", "sony-experia", "blu", "zz-outras"]);
const removedRe = /\b(zenfone|asus|infinix|lenovo|nokia|alcatel|multilaser|positivo|sony|importados?|cce)\b/i;
const allowedMatchers = [
  ["APPLE", /\b(apple|iphone|iph)\b/i],
  ["SAMSUNG", /\b(samsung|sam)\b/i],
  ["REALME", /\brealme\b/i],
  ["MOTOROLA", /\b(motorola|moto)\b/i],
  ["LG", /\blg\b/i],
  ["XIAOMI", /\b(xiaomi|redmi|poco|pocophone)\b/i]
];
const expectedMinimums = {
  APPLE: { baterias: 25, display: 50, pecas_componentes: 260, tampas_carcacas: 35 },
  SAMSUNG: { baterias: 50, display: 340, pecas_componentes: 720, tampas_carcacas: 95 },
  MOTOROLA: { baterias: 40, display: 130, pecas_componentes: 520, tampas_carcacas: 75 },
  LG: { baterias: 12, display: 32, pecas_componentes: 45, tampas_carcacas: 8 },
  REALME: { display: 25, pecas_componentes: 10 },
  XIAOMI: { baterias: 38, display: 105, pecas_componentes: 330, tampas_carcacas: 34 }
};

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeRoute(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/g, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && /\.(html|json)$/i.test(entry.name)) {
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

function dataLayerSlice(html) {
  const marker = "dataLayer = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const arrayStart = html.indexOf("[", start + marker.length);
  if (arrayStart === -1) return null;
  const arrayEnd = findMatchingBracket(html, arrayStart, "[", "]");
  if (arrayEnd === -1) return null;
  try {
    return JSON.parse(html.slice(arrayStart, arrayEnd + 1));
  } catch {
    return null;
  }
}

function categoryFromRoute(route) {
  const first = normalizeRoute(route).split("/")[0] || "";
  return rootToCategory.get(first) || null;
}

function evidence(item) {
  return [
    item?.nameProduct,
    item?.title,
    item?.description,
    item?.brand,
    item?.category,
    item?.slug,
    item?.urlProduct,
    item?.url,
    item?.keywords
  ].filter(Boolean).join(" ");
}

function classifyBrand(item) {
  const text = evidence(item);
  const brand = item?.brand || item?.category || "";
  for (const [name, re] of allowedMatchers) {
    if (re.test(String(brand)) || re.test(text)) return name;
  }
  return "INCERTO";
}

function routeHasRemovedBrand(value) {
  const route = normalizeRoute(value);
  if (!route) return false;
  const parts = route.split("/");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if ((rootToCategory.has(parts[i]) || roots.includes(parts[i])) && removedBrandSlugs.has(parts[i + 1])) return true;
  }
  return false;
}

const files = roots.flatMap((dir) => walk(path.join(root, dir)));
for (const file of ["index.html", "precos.json", "vercel.json", "_assets/tech7/search-index.json", "_custom/routes.json", "_custom/redirects.json", "_custom/product-redirects.json"]) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) files.push(full);
}

const products = new Map();
const residuals = [];
const removedLinks = [];
const categoryPages = [];
let searchIndexContent = "";

for (const file of [...new Set(files)]) {
  if (!fs.existsSync(file)) continue;
  const relative = rel(file);
  const ext = path.extname(file).toLowerCase();
  const content = fs.readFileSync(file, "utf8");

  if (ext === ".html") {
    const data = dataLayerSlice(content);
    const payload = Array.isArray(data) ? data[0] : null;
    const route = relative.replace(/\/index\.html$/i, "");
    if (payload?.idProduct) {
      const item = { ...payload, url: route };
      const productEvidence = evidence(item);
      if (removedRe.test(productEvidence)) residuals.push({ arquivo: relative, tipo: "produto", evidencia: productEvidence.slice(0, 220) });
      const category = categoryFromRoute(route);
      if (category) {
        const id = String(payload.idProduct);
        products.set(id, { id, brand: classifyBrand(item), category, route, name: cleanText(payload.nameProduct || payload.pageTitle || "") });
      }
    }
    if (Array.isArray(payload?.listProducts)) {
      categoryPages.push({ arquivo: relative, quantidade: payload.listProducts.length });
      for (const item of payload.listProducts) {
        const productEvidence = evidence(item);
        if (removedRe.test(productEvidence)) residuals.push({ arquivo: relative, tipo: "listProducts", evidencia: productEvidence.slice(0, 220) });
        const id = String(item.idProduct || `${relative}:${item.urlProduct || item.nameProduct}`);
        const category = categoryFromRoute(item.urlProduct || route);
        if (category) products.set(id, { id, brand: classifyBrand(item), category, route: normalizeRoute(item.urlProduct), name: cleanText(item.nameProduct || "") });
      }
    }
    for (const match of content.matchAll(/href=["']([^"']+)["']/gi)) {
      if (routeHasRemovedBrand(match[1])) removedLinks.push({ arquivo: relative, href: match[1] });
    }
    for (const match of content.matchAll(/filter__input--brand[\s\S]{0,260}/gi)) {
      if (removedRe.test(match[0])) residuals.push({ arquivo: relative, tipo: "filtro_marca", evidencia: cleanText(match[0]).slice(0, 180) });
    }
  } else if (relative === "_assets/tech7/search-index.json") {
    searchIndexContent = content;
    const parsed = JSON.parse(content);
    for (const item of parsed.items || []) {
      const productEvidence = evidence(item);
      if (removedRe.test(productEvidence)) residuals.push({ arquivo: relative, tipo: "search-index", evidencia: productEvidence.slice(0, 220) });
    }
  } else if (relative === "precos.json") {
    const parsed = JSON.parse(content);
    for (const [section, brands] of Object.entries(parsed)) {
      for (const brand of Object.keys(brands || {})) {
        if (removedBrandSlugs.has(slugify(brand))) residuals.push({ arquivo: relative, tipo: "precos_marca", evidencia: `${section}/${brand}` });
      }
    }
  } else if (relative.startsWith("_custom/") || relative === "vercel.json") {
    try {
      const parsed = JSON.parse(content);
      for (const rule of parsed.redirects || []) {
        if (routeHasRemovedBrand(rule?.source) && normalizeRoute(rule?.destination) === "404.html") continue;
        if (routeHasRemovedBrand(rule?.source) || routeHasRemovedBrand(rule?.destination)) {
          residuals.push({ arquivo: relative, tipo: "rota_json", evidencia: `${rule?.source || ""} -> ${rule?.destination || ""}` });
        }
      }
    } catch {
      const strings = content.match(/"([^"]+)"/g) || [];
      for (const raw of strings) {
        const value = raw.slice(1, -1);
        if (routeHasRemovedBrand(value)) residuals.push({ arquivo: relative, tipo: "rota_json", evidencia: value });
      }
    }
  }
}

if (fs.existsSync(auditPath)) {
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  for (const item of audit.produtos || []) {
    if (item.acao !== "MANTER") continue;
    if (!expectedMinimums[item.marca]) continue;
    const route = normalizeRoute(item.url);
    if (!route || routeHasRemovedBrand(route)) continue;
    const htmlPath = path.join(root, route, "index.html");
    const existsInHtml = fs.existsSync(htmlPath);
    const existsInSearchIndex = searchIndexContent && searchIndexContent.includes(route);
    if (!existsInHtml && !existsInSearchIndex) continue;
    const id = String(item.id || route);
    products.set(id, {
      id,
      brand: item.marca,
      category: item.categoria,
      route,
      name: item.nome
    });
  }
}

const counts = {};
for (const brand of Object.keys(expectedMinimums)) counts[brand] = {};
for (const product of products.values()) {
  if (!counts[product.brand]) counts[product.brand] = {};
  counts[product.brand][product.category] = (counts[product.brand][product.category] || 0) + 1;
}

const countFailures = [];
for (const [brand, expectedByCat] of Object.entries(expectedMinimums)) {
  for (const [category, minimum] of Object.entries(expectedByCat)) {
    const actual = counts[brand]?.[category] || 0;
    if (actual < minimum) countFailures.push({ brand, category, minimum, actual });
  }
}

const routeResults = mainRoutes.map((route) => {
  const file = path.join(root, route, "index.html");
  if (!fs.existsSync(file)) return { rota: `/${route}/`, status: "REPROVADO", motivo: "index.html ausente" };
  const html = fs.readFileSync(file, "utf8");
  const hasContent = /page-catalog|listProducts|list-product|product-name/i.test(html);
  return { rota: `/${route}/`, status: hasContent ? "APROVADO" : "REPROVADO", motivo: hasContent ? "" : "sem conteudo de catalogo detectado" };
});

const checks = [
  { nome: "busca_residual_contextual", status: residuals.length ? "REPROVADO" : "APROVADO", detalhes: residuals.slice(0, 100) },
  { nome: "contagem_marcas_mantidas", status: countFailures.length ? "REPROVADO" : "APROVADO", detalhes: { contagens: counts, falhas: countFailures } },
  { nome: "rotas_principais", status: routeResults.every((item) => item.status === "APROVADO") ? "APROVADO" : "REPROVADO", detalhes: routeResults },
  { nome: "links_para_marcas_removidas", status: removedLinks.length ? "REPROVADO" : "APROVADO", detalhes: removedLinks.slice(0, 100) },
  { nome: "paginacao_sem_links_removidos", status: removedLinks.length ? "REPROVADO" : "APROVADO", detalhes: { paginas_catalogo_com_listProducts: categoryPages.length } }
];

const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
const approved = checks.filter((check) => check.status === "APROVADO").length;
const qa = {
  data_qa: new Date().toISOString(),
  status_geral: approved === checks.length ? "APROVADO" : "REPROVADO",
  produtos_removidos: log.filter((entry) => entry.status === "sucesso").length,
  produtos_mantidos: products.size,
  verificacoes_aprovadas: `${approved}/${checks.length}`,
  checks,
  sugestoes: approved === checks.length ? [] : ["Reexecutar limpeza nos detalhes REPROVADO e repetir QA."]
};

fs.writeFileSync(outputPath, JSON.stringify(qa, null, 2), "utf8");
console.log("=== QA FINAL ===");
console.log(`Produtos removidos: ${qa.produtos_removidos}`);
console.log(`Produtos mantidos: ${qa.produtos_mantidos}`);
console.log(`Verificações aprovadas: ${qa.verificacoes_aprovadas}`);
console.log(`Status geral: ${qa.status_geral}`);
console.log("=================");
