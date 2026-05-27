import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "_validation", "outros-menu-poco-reclass-report.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
const menuTargets = [
  "/pecas-e-componentes/outros/index.html",
  "/tampas-e-carcacas/outros/index.html"
];
const pocoProducts = [
  {
    id: "4972",
    slug: "lente-da-camera-poco-x3",
    title: "Lente Da Camera Poco X3 X3 Pro",
    oldUrl: "/pecas-e-componentes/outros/lente-da-camera-poco-x3",
    newUrl: "/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-x3"
  },
  {
    id: "4970",
    slug: "lente-da-camera-poco-m3",
    title: "Lente Da Camera Xiaomi Poco M3",
    oldUrl: "/pecas-e-componentes/outros/lente-da-camera-poco-m3",
    newUrl: "/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-m3"
  }
];

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function safePath(relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path fora do workspace: ${resolved}`);
  }
  return resolved;
}

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walkHtml(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) out.push(full);
  }
  return out;
}

function findMatchingTag(html, start, tag) {
  const openRe = new RegExp(`<${tag}\\b`, "gi");
  const closeRe = new RegExp(`</${tag}>`, "gi");
  openRe.lastIndex = start;
  closeRe.lastIndex = start;
  let depth = 0;
  let open = openRe.exec(html);
  let close = closeRe.exec(html);
  while (open || close) {
    if (open && (!close || open.index < close.index)) {
      depth += 1;
      open = openRe.exec(html);
      continue;
    }
    depth -= 1;
    const end = close.index + close[0].length;
    if (depth === 0) return end;
    close = closeRe.exec(html);
  }
  return -1;
}

function removeMenuTargets(html) {
  let next = html;
  let removed = 0;
  const hrefRe = /\bhref=(["'])(.*?)\1/gi;
  let match;
  while ((match = hrefRe.exec(next))) {
    const href = match[2];
    if (!menuTargets.some((target) => href === target || href.endsWith(target) || href === target.replace(/^\//, ""))) continue;
    const liStart = next.lastIndexOf("<li", match.index);
    const liEnd = liStart === -1 ? -1 : findMatchingTag(next, liStart, "li");
    if (liStart === -1 || liEnd === -1) continue;
    next = next.slice(0, liStart) + next.slice(liEnd);
    removed += 1;
    hrefRe.lastIndex = liStart;
  }
  return { html: next, removed };
}

function replaceProductRouteContent(html, product) {
  let next = html;
  const oldNoLead = product.oldUrl.replace(/^\//, "");
  const newNoLead = product.newUrl.replace(/^\//, "");
  next = next
    .replaceAll(product.oldUrl, product.newUrl)
    .replaceAll(`${product.oldUrl}/`, `${product.newUrl}/`)
    .replaceAll(`${oldNoLead}/index.html`, `${newNoLead}/index.html`)
    .replaceAll(oldNoLead, newNoLead)
    .replace(/"category":"OUTROS"/g, '"category":"XIAOMI REDMI"')
    .replace(/"idCategory":"103"/g, '"idCategory":"99"')
    .replace(/"category":"outros"/g, '"category":"xiaomi-redmi"')
    .replace(/Categoria<\/td><td>OUTROS/g, "Categoria</td><td>XIAOMI REDMI")
    .replace(/P[áa]gina Inicial &gt; PEÇAS e COMPONENTES &gt; OUTROS/g, "Página Inicial &gt; PEÇAS e COMPONENTES &gt; XIAOMI REDMI")
    .replace(/P\\u00e1gina Inicial > PE\\u00c7AS e COMPONENTES > OUTROS/g, "P\\u00e1gina Inicial > PE\\u00c7AS e COMPONENTES > XIAOMI REDMI");
  return next;
}

function dataLayerSlice(html) {
  const start = html.indexOf("dataLayer = ");
  if (start === -1) return null;
  const arrayStart = html.indexOf("[", start);
  if (arrayStart === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = arrayStart; i < html.length; i += 1) {
    const char = html[i];
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
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return { start: arrayStart, end: i + 1, json: html.slice(arrayStart, i + 1) };
    }
  }
  return null;
}

function extractCatalogProducts(html) {
  const slice = dataLayerSlice(html);
  if (!slice) return [];
  const payload = JSON.parse(slice.json)[0] || {};
  return Array.isArray(payload.listProducts) ? payload.listProducts : [];
}

function updateCatalogDataLayer(html, products) {
  const slice = dataLayerSlice(html);
  if (!slice) return html;
  const data = JSON.parse(slice.json);
  const payload = data[0] || {};
  payload.listProducts = Array.isArray(payload.listProducts) ? payload.listProducts : [];
  const seen = new Set(payload.listProducts.map((item) => String(item.idProduct || item.urlProduct || "")));
  for (const product of products) {
    if (seen.has(String(product.idProduct))) continue;
    payload.listProducts.unshift(product);
    seen.add(String(product.idProduct));
  }
  if (typeof payload.quantity === "number") payload.quantity = payload.listProducts.length;
  data[0] = payload;
  return html.slice(0, slice.start) + JSON.stringify(data) + html.slice(slice.end);
}

function extractProductCard(catalogHtml, product) {
  const marker = `href="${product.oldUrl}"`;
  let index = catalogHtml.indexOf(marker);
  if (index === -1) index = catalogHtml.indexOf(`href="${product.oldUrl}/"`);
  if (index === -1) return "";
  const liStart = catalogHtml.lastIndexOf("<li", index);
  const liEnd = liStart === -1 ? -1 : findMatchingTag(catalogHtml, liStart, "li");
  if (liStart === -1 || liEnd === -1) return "";
  return replaceProductRouteContent(catalogHtml.slice(liStart, liEnd), product);
}

function insertCatalogCards(html, cards) {
  const listStart = html.indexOf('<ul class="list flex f-wrap row">');
  if (listStart === -1) return html;
  const insertAt = html.indexOf(">", listStart) + 1;
  const existing = cards.filter((card) => {
    const match = card.match(/href="([^"]+)"/);
    return match ? !html.includes(match[1]) : true;
  });
  if (!existing.length) return html;
  return html.slice(0, insertAt) + existing.join("") + html.slice(insertAt);
}

function upsertRedirects(fileRel, mapper = (rule) => rule) {
  const file = safePath(fileRel);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const current = Array.isArray(payload.redirects) ? payload.redirects : [];
  const rules = [
    { source: "/pecas-e-componentes/outros", destination: "/pecas-e-componentes/xiaomi-redmi", permanent: false },
    ...pocoProducts.map((product) => ({ source: product.oldUrl, destination: product.newUrl, permanent: true }))
  ];
  const sources = new Set(current.map((rule) => rule?.source).filter(Boolean));
  const additions = rules.filter((rule) => !sources.has(rule.source)).map(mapper);
  payload.redirects = [...additions, ...current];
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return additions.length;
}

const report = {
  generatedAt: new Date().toISOString(),
  menuLinksRemoved: 0,
  htmlFilesModified: 0,
  productsMoved: [],
  catalogCardsInserted: 0,
  searchIndexUpdated: 0,
  priceEntriesMoved: 0,
  redirectsAdded: {},
  files: []
};

for (const file of walkHtml(root)) {
  const before = fs.readFileSync(file, "utf8");
  const result = removeMenuTargets(before);
  if (result.html !== before) {
    fs.writeFileSync(file, result.html, "utf8");
    report.menuLinksRemoved += result.removed;
    report.htmlFilesModified += 1;
    report.files.push({ arquivo: rel(file), alteracao: `links OUTROS removidos: ${result.removed}` });
  }
}

const oldCatalogPath = safePath("pecas-e-componentes/outros/index.html");
const xiaomiCatalogPath = safePath("pecas-e-componentes/xiaomi-redmi/index.html");
const oldCatalogHtml = fs.existsSync(oldCatalogPath) ? fs.readFileSync(oldCatalogPath, "utf8") : "";
const oldCatalogProducts = extractCatalogProducts(oldCatalogHtml)
  .filter((item) => pocoProducts.some((product) => String(item.idProduct) === product.id))
  .map((item) => {
    const product = pocoProducts.find((candidate) => candidate.id === String(item.idProduct));
    return {
      ...item,
      idCategory: "99",
      category: "XIAOMI REDMI",
      urlProduct: product.newUrl
    };
  });
const cards = pocoProducts.map((product) => extractProductCard(oldCatalogHtml, product)).filter(Boolean);

for (const product of pocoProducts) {
  const oldDir = safePath(`pecas-e-componentes/outros/${product.slug}`);
  const newDir = safePath(`pecas-e-componentes/xiaomi-redmi/${product.slug}`);
  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    fs.mkdirSync(path.dirname(newDir), { recursive: true });
    fs.renameSync(oldDir, newDir);
    report.productsMoved.push({ id: product.id, de: rel(oldDir), para: rel(newDir) });
  }
  const file = path.join(newDir, "index.html");
  if (fs.existsSync(file)) {
    const before = fs.readFileSync(file, "utf8");
    const after = replaceProductRouteContent(before, product);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      report.files.push({ arquivo: rel(file), alteracao: "produto reclassificado para XIAOMI REDMI" });
    }
  }
}

if (fs.existsSync(xiaomiCatalogPath)) {
  const before = fs.readFileSync(xiaomiCatalogPath, "utf8");
  let after = updateCatalogDataLayer(before, oldCatalogProducts);
  after = insertCatalogCards(after, cards);
  if (after !== before) {
    fs.writeFileSync(xiaomiCatalogPath, after, "utf8");
    report.catalogCardsInserted = cards.length;
    report.files.push({ arquivo: rel(xiaomiCatalogPath), alteracao: `produtos Poco inseridos na listagem Xiaomi: ${oldCatalogProducts.length}` });
  }
}

if (fs.existsSync(oldCatalogPath)) {
  const before = fs.readFileSync(oldCatalogPath, "utf8");
  let after = before;
  for (const product of pocoProducts) after = replaceProductRouteContent(after, product);
  after = updateCatalogDataLayer(after, []);
  if (after !== before) {
    fs.writeFileSync(oldCatalogPath, after, "utf8");
    report.files.push({ arquivo: rel(oldCatalogPath), alteracao: "referencias Poco antigas atualizadas para Xiaomi" });
  }
}

const searchIndexPath = safePath("_assets/tech7/search-index.json");
if (fs.existsSync(searchIndexPath)) {
  const parsed = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  for (const item of parsed.items || []) {
    const product = pocoProducts.find((candidate) => item.url === `${candidate.oldUrl.replace(/^\//, "")}/index.html`);
    if (!product) continue;
    item.url = `${product.newUrl.replace(/^\//, "")}/index.html`;
    item.category = "pecas-e-componentes";
    item.brand = "xiaomi-redmi";
    item.keywords = String(item.keywords || "").replace(/\boutros\b/gi, "xiaomi-redmi");
    report.searchIndexUpdated += 1;
  }
  fs.writeFileSync(searchIndexPath, JSON.stringify(parsed, null, 2), "utf8");
}

const pricesPath = safePath("precos.json");
if (fs.existsSync(pricesPath)) {
  const prices = JSON.parse(fs.readFileSync(pricesPath, "utf8"));
  const section = prices["pecas-e-componentes"] || {};
  section["outros"] = section["outros"] || {};
  section["xiaomi-redmi"] = section["xiaomi-redmi"] || {};
  for (const product of pocoProducts) {
    if (section["outros"][product.slug] == null) continue;
    section["xiaomi-redmi"][product.slug] = section["outros"][product.slug];
    delete section["outros"][product.slug];
    report.priceEntriesMoved += 1;
  }
  prices["pecas-e-componentes"] = section;
  fs.writeFileSync(pricesPath, JSON.stringify(prices, null, 2), "utf8");
}

report.redirectsAdded["_custom/redirects.json"] = upsertRedirects("_custom/redirects.json", (rule) => ({
  ...rule,
  type: "category",
  method: "GET",
  strategy: "vercel-redirect",
  proof: "outros-menu-reclassify-poco"
}));
report.redirectsAdded["vercel.json"] = upsertRedirects("vercel.json", (rule) => ({
  source: rule.source,
  destination: rule.destination,
  permanent: rule.permanent
}));

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
