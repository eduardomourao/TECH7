import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "relatorio-auditoria-marcas.json");
const logPath = path.join(root, "log-remocao.json");
const backupDir = path.join(root, "backup");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `produtos-backup-${timestamp}.json`);

const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
const categoryRoots = [
  "baterias-celular",
  "baterias",
  "bateria-celular",
  "bateria",
  "display-e-lcd",
  "tela-display-lcd",
  "display",
  "display-lcd",
  "telas-display-lcd",
  "pecas-e-componentes",
  "pecas-componentes",
  "pecas",
  "componentes",
  "tampas-e-carcacas",
  "tampas-carcacas",
  "tampas",
  "carcacas"
];

const removedBrandSlugs = new Set([
  "zenfone",
  "asus",
  "infinix",
  "lenovo",
  "nokia",
  "alcatel",
  "cce",
  "importados",
  "importado",
  "multilaser",
  "positivo",
  "sony",
  "sony-experia"
]);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function safeResolve(...parts) {
  const resolved = path.resolve(root, ...parts);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path fora do workspace: ${resolved}`);
  }
  return resolved;
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

function normalizeRoute(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/g, "");
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function walkIndexFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walkIndexFiles(path.join(dir, entry.name), out);
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

function dataLayerSlice(html) {
  const marker = "dataLayer = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const arrayStart = html.indexOf("[", start + marker.length);
  if (arrayStart === -1) return null;
  const arrayEnd = findMatchingBracket(html, arrayStart, "[", "]");
  if (arrayEnd === -1) return null;
  try {
    const parsed = JSON.parse(html.slice(arrayStart, arrayEnd + 1));
    return { start: arrayStart, end: arrayEnd + 1, parsed };
  } catch {
    return null;
  }
}

function routeFromFile(filePath) {
  return rel(filePath).replace(/\/index\.html$/i, "");
}

function productKey(item) {
  return {
    id: String(item?.idProduct || item?.id || "").trim(),
    url: normalizeRoute(item?.urlProduct || item?.url || ""),
    name: slugify(item?.nameProduct || item?.title || item?.name || ""),
    brand: slugify(item?.brand || item?.marca || item?.category || "")
  };
}

function itemShouldRemove(item) {
  const key = productKey(item);
  if (key.id && removeIds.has(key.id)) return true;
  if (key.url && removeRoutes.has(key.url)) return true;
  if (key.name && removeNames.has(key.name)) return true;
  if (key.brand && removedBrandSlugs.has(key.brand)) return true;
  return false;
}

function findMatchingDiv(html, start) {
  const openRe = /<div\b/gi;
  const closeRe = /<\/div>/gi;
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

function removeProductCards(html, products) {
  let next = html;
  let removedCards = 0;
  const hrefs = new Set();
  const names = new Set();
  for (const item of products) {
    const url = normalizeRoute(item?.urlProduct || item?.url || "");
    if (url) {
      hrefs.add(`/${url}`);
      hrefs.add(url);
      hrefs.add(`/${url}/index.html`);
      hrefs.add(`${url}/index.html`);
    }
    const name = cleanText(item?.nameProduct || item?.title || item?.name || "");
    if (name) names.add(name);
  }

  for (const href of hrefs) {
    let index = next.indexOf(`href="${href}"`);
    while (index !== -1) {
      const itemStart = next.lastIndexOf('<div class="item', index);
      const listStart = next.lastIndexOf('<div class="list-product', index);
      if (itemStart === -1 || (listStart !== -1 && itemStart < listStart)) break;
      const itemEnd = findMatchingDiv(next, itemStart);
      if (itemEnd === -1) break;
      next = next.slice(0, itemStart) + next.slice(itemEnd);
      removedCards += 1;
      index = next.indexOf(`href="${href}"`, itemStart);
    }
  }

  const nameRe = /<div class="product-name">([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = nameRe.exec(next))) {
    const name = cleanText(match[1]);
    if (!names.has(name)) continue;
    const itemStart = next.lastIndexOf('<div class="item', match.index);
    if (itemStart === -1) continue;
    const itemEnd = findMatchingDiv(next, itemStart);
    if (itemEnd === -1) continue;
    next = next.slice(0, itemStart) + next.slice(itemEnd);
    removedCards += 1;
    nameRe.lastIndex = itemStart;
  }
  return { html: next, removedCards };
}

function collectFile(pathRel, files) {
  if (!pathRel) return;
  const full = safeResolve(pathRel);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) files.add(full);
}

function collectDirFiles(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectDirFiles(full, files);
    else if (entry.isFile()) files.add(full);
  }
}

function shouldFilterJsonString(value) {
  const clean = normalizeRoute(value);
  if (!clean) return false;
  if (removeRoutes.has(clean)) return true;
  const parts = clean.split("/");
  if (parts.length >= 2 && removedBrandSlugs.has(parts[1])) return true;
  return false;
}

function filterJson(value) {
  if (Array.isArray(value)) {
    return value
      .map(filterJson)
      .filter((item) => !(typeof item === "string" && shouldFilterJsonString(item)))
      .filter((item) => !(item && typeof item === "object" && item.__drop));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      if (shouldFilterJsonString(key)) continue;
      const filtered = filterJson(child);
      if (typeof filtered === "string" && shouldFilterJsonString(filtered)) continue;
      if (filtered && typeof filtered === "object" && filtered.__drop) continue;
      next[key] = filtered;
    }
    return next;
  }
  return value;
}

function deleteEmptyParents(startDir) {
  let current = startDir;
  while (current !== root && current.startsWith(root + path.sep)) {
    const base = path.basename(current);
    if (categoryRoots.includes(base)) break;
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    const entries = fs.readdirSync(current);
    if (entries.length) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const removeProducts = report.produtos.filter((product) => product.acao === "REMOVER");
const removeIds = new Set(removeProducts.map((product) => String(product.id)));
const removeRoutes = new Set(removeProducts.map((product) => normalizeRoute(product.url)).filter(Boolean));
const removeNames = new Set(removeProducts.map((product) => slugify(product.nome)).filter(Boolean));
const removalLog = [];
const filesToBackup = new Set([reportPath, path.join(root, "precos.json"), path.join(root, "_assets", "tech7", "search-index.json")]);

for (const product of removeProducts) {
  collectFile(product.arquivo, filesToBackup);
  const route = normalizeRoute(product.url);
  if (route) collectDirFiles(safeResolve(route), filesToBackup);
}

for (const rootName of categoryRoots) {
  for (const brand of removedBrandSlugs) {
    collectDirFiles(safeResolve(rootName, brand), filesToBackup);
  }
}

for (const file of walkIndexFiles(root)) {
  const route = routeFromFile(file);
  if (!categoryRoots.some((rootName) => route === rootName || route.startsWith(`${rootName}/`))) continue;
  const html = fs.readFileSync(file, "utf8");
  const data = dataLayerSlice(html);
  if (!data) continue;
  const payload = Array.isArray(data.parsed) ? data.parsed[0] : null;
  if (payload?.idProduct && removeIds.has(String(payload.idProduct))) filesToBackup.add(file);
  if (Array.isArray(payload?.listProducts) && payload.listProducts.some(itemShouldRemove)) filesToBackup.add(file);
}

for (const fileRel of ["_custom/routes.json", "_custom/redirects.json", "_custom/product-redirects.json", "vercel.json", "index.html"]) {
  collectFile(fileRel, filesToBackup);
}

const backup = {
  generatedAt: new Date().toISOString(),
  sourceReport: "relatorio-auditoria-marcas.json",
  productsToRemove: removeProducts,
  files: [...filesToBackup].sort().map((file) => ({
    path: rel(file),
    encoding: "utf8",
    content: fs.readFileSync(file, "utf8")
  }))
};
fs.mkdirSync(backupDir, { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");

let deletedFiles = 0;
let updatedFiles = 0;
let removedListItems = 0;
let removedCards = 0;
const deletedPaths = new Set();

function markDeleted(file) {
  deletedPaths.add(rel(file));
}

for (const file of walkIndexFiles(root)) {
  const route = routeFromFile(file);
  if (!categoryRoots.some((rootName) => route === rootName || route.startsWith(`${rootName}/`))) continue;
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  const data = dataLayerSlice(html);
  const payload = data && Array.isArray(data.parsed) ? data.parsed[0] : null;
  if (payload?.idProduct && removeIds.has(String(payload.idProduct))) {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
    deletedFiles += 1;
    markDeleted(file);
    deleteEmptyParents(path.dirname(file));
    continue;
  }
}

for (const rootName of categoryRoots) {
  for (const brand of removedBrandSlugs) {
    const dir = safeResolve(rootName, brand);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    deletedFiles += 1;
    markDeleted(dir);
  }
}

for (const file of walkIndexFiles(root)) {
  const route = routeFromFile(file);
  if (!categoryRoots.some((rootName) => route === rootName || route.startsWith(`${rootName}/`))) continue;
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, "utf8");
  const data = dataLayerSlice(html);
  if (!data || !Array.isArray(data.parsed) || !data.parsed[0]) continue;
  const payload = data.parsed[0];
  if (!Array.isArray(payload.listProducts)) continue;
  const before = payload.listProducts.length;
  const removed = payload.listProducts.filter(itemShouldRemove);
  if (!removed.length) continue;
  payload.listProducts = payload.listProducts.filter((item) => !itemShouldRemove(item));
  if (typeof payload.quantity === "number") payload.quantity = payload.listProducts.length;
  const nextData = JSON.stringify(data.parsed);
  html = html.slice(0, data.start) + nextData + html.slice(data.end);
  const cardResult = removeProductCards(html, removed);
  html = cardResult.html;
  fs.writeFileSync(file, html, "utf8");
  updatedFiles += 1;
  removedListItems += before - payload.listProducts.length;
  removedCards += cardResult.removedCards;
}

const searchIndexPath = safeResolve("_assets", "tech7", "search-index.json");
if (fs.existsSync(searchIndexPath)) {
  const parsed = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const kept = items.filter((item) => !itemShouldRemove(item));
  if (kept.length !== items.length) {
    parsed.items = kept;
    parsed.total = kept.length;
    parsed.generatedAt = new Date().toISOString();
    fs.writeFileSync(searchIndexPath, JSON.stringify(parsed, null, 2), "utf8");
    updatedFiles += 1;
  }
}

const precosPath = safeResolve("precos.json");
if (fs.existsSync(precosPath)) {
  const prices = JSON.parse(fs.readFileSync(precosPath, "utf8"));
  let changed = false;
  const removeSlugs = new Set(removeProducts.map((product) => product.slug).filter(Boolean));
  for (const [section, brands] of Object.entries(prices)) {
    if (!brands || typeof brands !== "object") continue;
    for (const brand of Object.keys(brands)) {
      if (removedBrandSlugs.has(slugify(brand))) {
        delete brands[brand];
        changed = true;
        continue;
      }
      if (!brands[brand] || typeof brands[brand] !== "object") continue;
      for (const slug of Object.keys(brands[brand])) {
        if (removeSlugs.has(slug) || removeRoutes.has(`${section}/${brand}/${slug}`)) {
          delete brands[brand][slug];
          changed = true;
        }
      }
      if (!Object.keys(brands[brand]).length) {
        delete brands[brand];
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(precosPath, JSON.stringify(prices, null, 2), "utf8");
    updatedFiles += 1;
  }
}

for (const jsonRel of ["_custom/routes.json", "_custom/redirects.json", "_custom/product-redirects.json", "vercel.json"]) {
  const file = safeResolve(jsonRel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, "utf8");
  try {
    const parsed = JSON.parse(before);
    const filtered = filterJson(parsed);
    const after = JSON.stringify(filtered, null, 2);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      updatedFiles += 1;
    }
  } catch {
    // Keep malformed/non-JSON files untouched.
  }
}

for (const product of removeProducts) {
  const fileDeleted = product.arquivo && deletedPaths.has(product.arquivo);
  const dirDeleted = [...deletedPaths].some((deleted) => product.arquivo && product.arquivo.startsWith(`${deleted}/`));
  const fullFile = product.arquivo ? safeResolve(product.arquivo) : null;
  removalLog.push({
    id: product.id,
    nome: product.nome,
    marca: product.marca,
    categoria: product.categoria,
    status: fileDeleted || dirDeleted || (fullFile && !fs.existsSync(fullFile)) ? "sucesso" : "ignorado",
    motivo: fileDeleted || dirDeleted || (fullFile && !fs.existsSync(fullFile))
      ? "Pagina de produto/diretorio de marca removido e indices atualizados"
      : "Produto veio de listagem/search-index sem pagina fisica individual localizada"
  });
}

fs.writeFileSync(logPath, JSON.stringify(removalLog, null, 2), "utf8");

const errors = removalLog.filter((entry) => entry.status === "erro").length;
const ignored = removalLog.filter((entry) => entry.status === "ignorado").length;
const removed = removalLog.filter((entry) => entry.status === "sucesso").length;
console.log(`backup: ${rel(backupPath)}`);
console.log(`arquivos_deletados_ou_dirs=${deletedFiles} arquivos_atualizados=${updatedFiles} listProducts_removidos=${removedListItems} cards_removidos=${removedCards}`);
console.log(`FASE 2 CONCLUÍDA: ${removed} produtos removidos | ${errors} erros | ${ignored} ignorados`);
