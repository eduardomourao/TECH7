import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "relatorio-auditoria-marcas.json");

const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);

const rootToCategory = new Map([
  ["baterias-celular", "baterias"],
  ["baterias", "baterias"],
  ["bateria-celular", "baterias"],
  ["bateria", "baterias"],
  ["display-e-lcd", "display"],
  ["tela-display-lcd", "display"],
  ["display", "display"],
  ["display-lcd", "display"],
  ["telas-display-lcd", "display"],
  ["pecas-e-componentes", "pecas_componentes"],
  ["pecas-componentes", "pecas_componentes"],
  ["pecas", "pecas_componentes"],
  ["componentes", "pecas_componentes"],
  ["tampas-e-carcacas", "tampas_carcacas"],
  ["tampas-carcacas", "tampas_carcacas"],
  ["tampas", "tampas_carcacas"],
  ["carcacas", "tampas_carcacas"]
]);

const categoryOrder = ["baterias", "display", "pecas_componentes", "tampas_carcacas"];
const canonicalRootPriority = new Map([
  ["baterias-celular", 100],
  ["display-e-lcd", 100],
  ["tela-display-lcd", 95],
  ["pecas-e-componentes", 100],
  ["tampas-e-carcacas", 100],
  ["baterias", 70],
  ["bateria-celular", 65],
  ["bateria", 60],
  ["display", 80],
  ["display-lcd", 65],
  ["telas-display-lcd", 65],
  ["pecas-componentes", 70],
  ["pecas", 65],
  ["componentes", 60],
  ["tampas-carcacas", 70],
  ["tampas", 65],
  ["carcacas", 60]
]);

const allowedMatchers = [
  ["APPLE", /\b(apple|iphone|iph)\b/i],
  ["SAMSUNG", /\b(samsung|sam)\b/i],
  ["REALME", /\brealme\b/i],
  ["MOTOROLA", /\b(motorola|moto)\b/i],
  ["LG", /\blg\b/i],
  ["XIAOMI", /\b(xiaomi|redmi|poco|pocophone)\b/i]
];

const removeMatchers = [
  ["ZENFONE", /\b(asus|zenfone|zen)\b/i],
  ["INFINIX", /\binfinix\b/i],
  ["LENOVO", /\b(lenovo|len)\b/i],
  ["NOKIA", /\bnokia\b/i],
  ["ALCATEL", /\b(alcatel|alc)\b/i],
  ["CCE", /\bcce\b/i],
  ["IMPORTADOS", /\b(importados?|import)\b/i],
  ["MULTILASER", /\bmultilaser\b/i],
  ["POSITIVO", /\bpositivo\b/i],
  ["SONY", /\b(sony|sony-experia|xperia)\b/i]
];

const categoryLikeBrands = new Set([
  "",
  "catalogo",
  "tech7",
  "display",
  "display-e-lcd",
  "tela-display-lcd",
  "baterias",
  "baterias-celular",
  "bateria-celular",
  "pecas",
  "pecas-e-componentes",
  "componentes",
  "tampas",
  "tampas-e-carcacas",
  "outros",
  "outras",
  "zz-outras"
]);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase() === "index.html") out.push(path.join(dir, entry.name));
  }
  return out;
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

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function routeFromFile(filePath) {
  return rel(filePath).replace(/\/index\.html$/i, "");
}

function categoryFromRoute(route) {
  const rootName = String(route || "").split("/").filter(Boolean)[0] || "";
  return rootToCategory.get(rootName) || null;
}

function rootPriority(route) {
  const rootName = String(route || "").split("/").filter(Boolean)[0] || "";
  return canonicalRootPriority.get(rootName) || 0;
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

function toProductRecord(item, context) {
  const url = String(item.urlProduct || item.url || context.route || "").replace(/^\/+/, "").replace(/\/index\.html$/i, "");
  const parts = url.split("/").filter(Boolean);
  const fallbackSlug = parts[parts.length - 1] || "";
  const category = categoryFromRoute(url) || context.category || categoryFromRoute(context.route);
  if (!category) return null;
  const name = cleanText(item.nameProduct || item.title || item.name || item.description || "");
  if (!name || name === "[nome_produto]") return null;
  const brandField = cleanText(item.brand || item.marca || "");
  const categoryField = cleanText(item.category || item.item_category || context.rawCategory || "");
  const id = String(item.idProduct || item.id || item.product_id || "").trim()
    || slugify(`${category}-${brandField || parts[1] || "sem-marca"}-${item.slug || fallbackSlug || name}`);
  const slug = slugify(item.slug || fallbackSlug || name);
  return {
    id,
    nome: name,
    marca_original: brandField,
    categoria: category,
    categoria_original: categoryField,
    slug,
    url: url ? `/${url}` : "",
    fonte: context.source,
    arquivo: context.file || "",
    prioridade: context.priority || 0
  };
}

function detectFrom(value) {
  const text = stripAccents(String(value || "").replace(/[-_/]+/g, " "));
  if (!text.trim()) return null;
  for (const [brand, re] of allowedMatchers) {
    if (re.test(text)) return { marca: brand, acao: "MANTER", fonte: value };
  }
  for (const [brand, re] of removeMatchers) {
    if (re.test(text)) return { marca: brand, acao: "REMOVER", fonte: value };
  }
  return null;
}

function classify(record) {
  const brandToken = slugify(record.marca_original);
  const sources = [];
  if (!categoryLikeBrands.has(brandToken)) sources.push(record.marca_original);
  sources.push(record.categoria_original);
  sources.push(record.url);
  sources.push(record.slug);
  sources.push(record.nome);

  for (const source of sources) {
    const found = detectFrom(source);
    if (found) return { ...found, marca_original: record.marca_original };
  }

  const inferred = brandToken && !categoryLikeBrands.has(brandToken)
    ? slugify(record.marca_original).toUpperCase()
    : "INCERTO";
  if (inferred !== "INCERTO") {
    return { marca: inferred, acao: "REMOVER", fonte: record.marca_original, marca_original: record.marca_original };
  }
  return { marca: "INCERTO", acao: "INCERTO", fonte: "", marca_original: record.marca_original };
}

const files = [];
for (const rootName of rootToCategory.keys()) {
  walk(path.join(root, rootName), files);
}

const recordsById = new Map();
const seenProductKeys = new Set();
const sourceStats = { htmlFilesScanned: 0, dataLayerPages: 0, productPageRecords: 0, listProductRecords: 0, searchIndexRecords: 0 };

function addRecord(record) {
  if (!record?.id) return;
  const keys = [
    `${record.categoria}|slug|${record.slug}`,
    `${record.categoria}|nome|${slugify(record.nome)}`
  ];
  if (record.fonte === "search-index" && keys.some((key) => seenProductKeys.has(key))) return;
  const classified = classify(record);
  const full = { ...record, marca: classified.marca, acao: classified.acao, evidencia_marca: classified.fonte };
  const previous = recordsById.get(full.id);
  if (!previous || full.prioridade > previous.prioridade || (full.prioridade === previous.prioridade && full.url.length < previous.url.length)) {
    recordsById.set(full.id, full);
  }
  for (const key of keys) seenProductKeys.add(key);
}

for (const file of files) {
  sourceStats.htmlFilesScanned += 1;
  const route = routeFromFile(file);
  const category = categoryFromRoute(route);
  if (!category) continue;
  const html = fs.readFileSync(file, "utf8");
  const data = parseDataLayer(html);
  if (!data) continue;
  sourceStats.dataLayerPages += 1;
  const context = {
    source: "html-datalayer",
    file: rel(file),
    route,
    category,
    rawCategory: data.category || "",
    priority: rootPriority(route) + (/\bpage-product\b/.test(html) ? 10 : 0)
  };
  if (data.idProduct && data.nameProduct) {
    addRecord(toProductRecord(data, context));
    sourceStats.productPageRecords += 1;
  }
  if (Array.isArray(data.listProducts)) {
    for (const item of data.listProducts) {
      addRecord(toProductRecord(item, { ...context, source: "category-listProducts", priority: rootPriority(route) + 5 }));
      sourceStats.listProductRecords += 1;
    }
  }
}

const searchIndexPath = path.join(root, "_assets", "tech7", "search-index.json");
if (fs.existsSync(searchIndexPath)) {
  const parsed = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  for (const item of items) {
    const record = toProductRecord(item, {
      source: "search-index",
      route: String(item.url || ""),
      category: categoryFromRoute(item.url),
      rawCategory: item.category || "",
      file: "_assets/tech7/search-index.json",
      priority: rootPriority(item.url)
    });
    if (record) {
      addRecord(record);
      sourceStats.searchIndexRecords += 1;
    }
  }
}

const products = [...recordsById.values()].sort((a, b) => {
  const categoryDiff = categoryOrder.indexOf(a.categoria) - categoryOrder.indexOf(b.categoria);
  if (categoryDiff) return categoryDiff;
  const brandDiff = a.marca.localeCompare(b.marca);
  if (brandDiff) return brandDiff;
  return a.nome.localeCompare(b.nome);
});

const report = {
  data_auditoria: new Date().toISOString(),
  resumo: {
    total_produtos: products.length,
    total_remover: products.filter((p) => p.acao === "REMOVER").length,
    total_manter: products.filter((p) => p.acao === "MANTER").length
  },
  por_marca: {},
  por_categoria: Object.fromEntries(categoryOrder.map((key) => [key, { remover: 0, manter: 0 }])),
  incertos: [],
  produtos: products.map((p) => ({
    id: p.id,
    nome: p.nome,
    marca: p.marca,
    marca_original: p.marca_original,
    acao: p.acao,
    categoria: p.categoria,
    slug: p.slug,
    url: p.url,
    fonte: p.fonte,
    arquivo: p.arquivo,
    evidencia_marca: p.evidencia_marca
  })),
  fontes: sourceStats
};

for (const product of products) {
  if (!report.por_marca[product.marca]) {
    report.por_marca[product.marca] = { acao: product.acao === "INCERTO" ? "INCERTO" : product.acao, quantidade: 0, ids: [] };
  }
  report.por_marca[product.marca].quantidade += 1;
  report.por_marca[product.marca].ids.push(product.id);
  if (product.acao === "REMOVER") report.por_categoria[product.categoria].remover += 1;
  else if (product.acao === "MANTER") report.por_categoria[product.categoria].manter += 1;
  else {
    report.incertos.push({
      id: product.id,
      nome: product.nome,
      marca_original: product.marca_original,
      categoria: product.categoria,
      slug: product.slug,
      url: product.url,
      motivo: "Marca nao identificada com seguranca pelas fontes disponiveis"
    });
  }
}

for (const brand of Object.keys(report.por_marca)) {
  report.por_marca[brand].ids = [...new Set(report.por_marca[brand].ids)].sort();
}
report.por_marca = Object.fromEntries(Object.entries(report.por_marca).sort(([a], [b]) => a.localeCompare(b)));

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

const rows = Object.entries(report.por_marca).map(([marca, info]) => ({ marca, acao: info.acao, quantidade: info.quantidade }));
const widths = {
  marca: Math.max("marca".length, ...rows.map((r) => r.marca.length)),
  acao: Math.max("acao".length, ...rows.map((r) => r.acao.length)),
  quantidade: Math.max("quantidade".length, ...rows.map((r) => String(r.quantidade).length))
};
console.log(`${"marca".padEnd(widths.marca)} | ${"acao".padEnd(widths.acao)} | ${"quantidade".padStart(widths.quantidade)}`);
console.log(`${"-".repeat(widths.marca)}-+-${"-".repeat(widths.acao)}-+-${"-".repeat(widths.quantidade)}`);
for (const row of rows) {
  console.log(`${row.marca.padEnd(widths.marca)} | ${row.acao.padEnd(widths.acao)} | ${String(row.quantidade).padStart(widths.quantidade)}`);
}
console.log("");
console.log(`relatorio: ${rel(outputPath)}`);
console.log(`total_produtos=${report.resumo.total_produtos} total_manter=${report.resumo.total_manter} total_remover=${report.resumo.total_remover} incertos=${report.incertos.length}`);
