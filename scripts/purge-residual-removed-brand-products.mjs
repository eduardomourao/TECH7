import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const backupDir = path.join(root, "backup");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `produtos-backup-residuos-${timestamp}.json`);
const logPath = path.join(root, "log-remocao.json");

const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
const roots = [
  "baterias-celular", "baterias", "bateria-celular", "bateria",
  "display-e-lcd", "tela-display-lcd", "display", "display-lcd", "telas-display-lcd",
  "pecas-e-componentes", "pecas-componentes", "pecas", "componentes",
  "tampas-e-carcacas", "tampas-carcacas", "tampas", "carcacas"
];
const removedRe = /\b(zenfone|asus|infinix|lenovo|nokia|alcatel|multilaser|positivo|sony|importados?|cce)\b/i;

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function safeResolve(...parts) {
  const resolved = path.resolve(root, ...parts);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`Path fora do workspace: ${resolved}`);
  return resolved;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.toLowerCase() === "index.html") {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
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

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
    return { start: arrayStart, end: arrayEnd + 1, parsed: JSON.parse(html.slice(arrayStart, arrayEnd + 1)) };
  } catch {
    return null;
  }
}

function itemEvidence(item) {
  return [
    item?.idProduct,
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

function shouldPurgeItem(item) {
  return removedRe.test(itemEvidence(item));
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

function removeCards(html, items) {
  let next = html;
  const hrefs = new Set();
  const names = new Set(items.map((item) => cleanText(item.nameProduct || item.title || item.name)).filter(Boolean));
  for (const item of items) {
    const route = normalizeRoute(item.urlProduct || item.url || "");
    if (!route) continue;
    hrefs.add(route);
    hrefs.add(`/${route}`);
    hrefs.add(`${route}/index.html`);
    hrefs.add(`/${route}/index.html`);
  }
  for (const href of hrefs) {
    let index = next.indexOf(`href="${href}"`);
    while (index !== -1) {
      const itemStart = next.lastIndexOf('<div class="item', index);
      const itemEnd = itemStart === -1 ? -1 : findMatchingTag(next, itemStart, "div");
      if (itemStart === -1 || itemEnd === -1) break;
      next = next.slice(0, itemStart) + next.slice(itemEnd);
      index = next.indexOf(`href="${href}"`, itemStart);
    }
  }
  const nameRe = /<div class="product-name">([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = nameRe.exec(next))) {
    if (!names.has(cleanText(match[1]))) continue;
    const itemStart = next.lastIndexOf('<div class="item', match.index);
    const itemEnd = itemStart === -1 ? -1 : findMatchingTag(next, itemStart, "div");
    if (itemStart === -1 || itemEnd === -1) continue;
    next = next.slice(0, itemStart) + next.slice(itemEnd);
    nameRe.lastIndex = itemStart;
  }
  return next;
}

const files = roots.flatMap((dir) => walk(safeResolve(dir)));
const filesToBackup = new Set();
const pageDeletes = [];
const listUpdates = [];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const data = dataLayerSlice(html);
  const payload = data && Array.isArray(data.parsed) ? data.parsed[0] : null;
  const productEvidence = payload?.idProduct ? itemEvidence(payload) : "";
  const aliasOrRedirect = /TECH7_PRODUCT_ALIAS_PAGE|http-equiv=["']refresh|window\.location\.replace/i.test(html);
  if ((payload?.idProduct && removedRe.test(productEvidence)) || (aliasOrRedirect && removedRe.test(cleanText(html)))) {
    filesToBackup.add(file);
    pageDeletes.push({ file, payload });
    continue;
  }
  if (Array.isArray(payload?.listProducts)) {
    const removed = payload.listProducts.filter(shouldPurgeItem);
    if (removed.length) {
      filesToBackup.add(file);
      listUpdates.push({ file, data, payload, removed });
    }
  }
}

const searchIndexPath = safeResolve("_assets", "tech7", "search-index.json");
if (fs.existsSync(searchIndexPath)) filesToBackup.add(searchIndexPath);
if (fs.existsSync(logPath)) filesToBackup.add(logPath);

fs.mkdirSync(backupDir, { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  reason: "Purge de residuos de marcas removidas em contexto de produto",
  files: [...filesToBackup].sort().map((file) => ({ path: rel(file), content: fs.readFileSync(file, "utf8") }))
}, null, 2), "utf8");

const appendedLog = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
let deletedPages = 0;
let updatedListings = 0;
let removedListingItems = 0;

for (const { file, payload } of pageDeletes) {
  if (!fs.existsSync(file)) continue;
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  deletedPages += 1;
  appendedLog.push({
    id: String(payload?.idProduct || ""),
    nome: cleanText(payload?.nameProduct || payload?.pageTitle || rel(file)),
    marca: cleanText(payload?.brand || payload?.category || ""),
    categoria: cleanText(payload?.category || ""),
    status: "sucesso",
    motivo: "Removido na varredura residual por mencionar marca nao autorizada em contexto de produto"
  });
}

for (const entry of listUpdates) {
  if (!fs.existsSync(entry.file)) continue;
  let html = fs.readFileSync(entry.file, "utf8");
  const data = dataLayerSlice(html);
  if (!data || !Array.isArray(data.parsed) || !data.parsed[0]?.listProducts) continue;
  const payload = data.parsed[0];
  const removed = payload.listProducts.filter(shouldPurgeItem);
  if (!removed.length) continue;
  payload.listProducts = payload.listProducts.filter((item) => !shouldPurgeItem(item));
  if (typeof payload.quantity === "number") payload.quantity = payload.listProducts.length;
  html = html.slice(0, data.start) + JSON.stringify(data.parsed) + html.slice(data.end);
  html = removeCards(html, removed);
  fs.writeFileSync(entry.file, html, "utf8");
  updatedListings += 1;
  removedListingItems += removed.length;
  for (const item of removed) {
    appendedLog.push({
      id: String(item.idProduct || ""),
      nome: cleanText(item.nameProduct || item.title || ""),
      marca: cleanText(item.brand || item.category || ""),
      categoria: cleanText(item.category || ""),
      status: "sucesso",
      motivo: "Removido de listagem na varredura residual por mencionar marca nao autorizada"
    });
  }
}

if (fs.existsSync(searchIndexPath)) {
  const parsed = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const kept = items.filter((item) => !shouldPurgeItem(item));
  if (kept.length !== items.length) {
    parsed.items = kept;
    parsed.total = kept.length;
    parsed.generatedAt = new Date().toISOString();
    fs.writeFileSync(searchIndexPath, JSON.stringify(parsed, null, 2), "utf8");
  }
}

fs.writeFileSync(logPath, JSON.stringify(appendedLog, null, 2), "utf8");
console.log(JSON.stringify({
  backup: rel(backupPath),
  deletedPages,
  updatedListings,
  removedListingItems,
  logEntries: appendedLog.length
}, null, 2));
