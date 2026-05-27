import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportDir = path.join(root, "_validation");
const reportPath = path.join(reportDir, "category-listing-normalization-report.json");
const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts"]);

const routeCategory = new Map([
  ["baterias-celular", "baterias"],
  ["baterias", "baterias"],
  ["bateria", "baterias"],
  ["bateria-celular", "baterias"],
  ["tela-display-lcd", "display"],
  ["display-e-lcd", "display"],
  ["display", "display"],
  ["display-lcd", "display"],
  ["telas-display-lcd", "display"],
  ["pecas-e-componentes", "pecas"],
  ["pecas", "pecas"],
  ["pecas-componentes", "pecas"],
  ["componentes", "pecas"],
  ["tampas-e-carcacas", "tampas"],
  ["tampas", "tampas"],
  ["tampas-carcacas", "tampas"],
  ["carcacas", "tampas"]
]);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.name.toLowerCase() === "index.html") out.push(path.join(dir, entry.name));
  }
  return out;
}

function strip(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function inferCategory(name) {
  const text = strip(name);
  if (/\b(bateria|battery|eb-|bn\d|blp\d)\b/.test(text)) return "baterias";
  if (/\b(tampa|carcaca|back cover|traseira)\b/.test(text)) return "tampas";
  if (/\b(tela|display|lcd|oled|frontal|touch)\b/.test(text)) return "display";
  if (/\b(placa|conector|pcb|flex|campainha|botao|alto falante|camera|sensor|aro|chassi|speaker|microfone|fone|dock|carga|lente)\b/.test(text)) return "pecas";
  return "unknown";
}

function expectedForRoute(filePath) {
  const parts = rel(filePath).split("/");
  return routeCategory.get(parts[0]) || null;
}

function findMatchingBracket(text, openIndex) {
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
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseListProducts(html) {
  const key = '"listProducts":';
  const start = html.indexOf(key);
  if (start === -1) return null;
  const open = html.indexOf("[", start + key.length);
  if (open === -1) return null;
  const close = findMatchingBracket(html, open);
  if (close === -1) return null;
  const raw = html.slice(open, close + 1);
  try {
    return { start: open, end: close + 1, items: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function findTagEnd(html, start) {
  const end = html.indexOf(">", start);
  return end === -1 ? -1 : end + 1;
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

function removeItemCardByHref(html, href) {
  if (!href) return { html, removed: 0 };
  const variants = new Set([
    href,
    href.replace(/^\//, ""),
    href.endsWith("/index.html") ? href.slice(0, -"/index.html".length) : href + "/index.html",
    href.endsWith("/") ? href + "index.html" : href + "/index.html"
  ]);
  let next = html;
  let removed = 0;
  for (const candidate of variants) {
    let index = next.indexOf(`href="${candidate}"`);
    while (index !== -1) {
      const itemStart = next.lastIndexOf('<div class="item', index);
      const listStart = next.lastIndexOf('<div class="list-product', index);
      if (itemStart === -1 || (listStart !== -1 && itemStart < listStart)) break;
      const itemEnd = findMatchingDiv(next, itemStart);
      if (itemEnd === -1) break;
      next = next.slice(0, itemStart) + next.slice(itemEnd);
      removed += 1;
      index = next.indexOf(`href="${candidate}"`, itemStart);
    }
  }
  return { html: next, removed };
}

function removeItemCardByProductName(html, name) {
  const cleanName = String(name || "").replace(/\s+/g, " ").trim();
  if (!cleanName) return { html, removed: 0 };
  const nameRe = /<div class="product-name">([\s\S]*?)<\/div>/gi;
  let next = html;
  let removed = 0;
  let match;
  while ((match = nameRe.exec(next))) {
    const currentName = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (currentName !== cleanName) continue;
    const itemStart = next.lastIndexOf('<div class="item', match.index);
    if (itemStart === -1) continue;
    const itemEnd = findMatchingDiv(next, itemStart);
    if (itemEnd === -1) continue;
    next = next.slice(0, itemStart) + next.slice(itemEnd);
    removed += 1;
    nameRe.lastIndex = itemStart;
  }
  return { html: next, removed };
}

function canonicalProductUrl(url, expected) {
  let clean = String(url || "").replace(/\\/g, "/");
  if (!clean) return clean;
  if (expected === "display") {
    clean = clean.replace(/^\/?display-e-lcd\//, "/tela-display-lcd/");
    clean = clean.replace(/^\/?display-lcd\//, "/tela-display-lcd/");
    clean = clean.replace(/^\/?telas-display-lcd\//, "/tela-display-lcd/");
    clean = clean.replace(/^\/?display\//, "/tela-display-lcd/");
  }
  if (expected === "baterias") {
    clean = clean.replace(/^\/?bateria\//, "/baterias-celular/");
    clean = clean.replace(/^\/?baterias\//, "/baterias-celular/");
  }
  if (expected === "pecas") {
    clean = clean.replace(/^\/?pecas\//, "/pecas-e-componentes/");
    clean = clean.replace(/^\/?pecas-componentes\//, "/pecas-e-componentes/");
  }
  if (expected === "tampas") {
    clean = clean.replace(/^\/?tampas\//, "/tampas-e-carcacas/");
    clean = clean.replace(/^\/?tampas-carcacas\//, "/tampas-e-carcacas/");
  }
  return clean;
}

const files = walk(root);
const report = { generatedAt: new Date().toISOString(), changedFiles: [], pagesScanned: 0, removedProducts: 0, removedCards: 0 };

for (const file of files) {
  const expected = expectedForRoute(file);
  if (!expected) continue;
  let html = fs.readFileSync(file, "utf8");
  if (/\bpage-product\b/.test(html)) continue;
  const list = parseListProducts(html);
  if (!list || !Array.isArray(list.items) || !list.items.length) continue;
  report.pagesScanned += 1;
  const kept = [];
  const removed = [];
  for (const item of list.items) {
    const actual = inferCategory(item.nameProduct || item.title || item.description || "");
    if (actual === expected || actual === "unknown") {
      kept.push({ ...item, urlProduct: canonicalProductUrl(item.urlProduct, expected) });
    } else {
      removed.push(item);
    }
  }
  if (!removed.length) continue;
  let next = html.slice(0, list.start) + JSON.stringify(kept) + html.slice(list.end);
  for (const item of removed) {
    const result = removeItemCardByHref(next, item.urlProduct);
    next = result.html;
    report.removedCards += result.removed;
    const resultByName = removeItemCardByProductName(next, item.nameProduct);
    next = resultByName.html;
    report.removedCards += resultByName.removed;
  }
  fs.writeFileSync(file, next, "utf8");
  report.changedFiles.push({
    file: rel(file),
    expected,
    before: list.items.length,
    after: kept.length,
    removed: removed.map((item) => ({ nameProduct: item.nameProduct, urlProduct: item.urlProduct, inferredCategory: inferCategory(item.nameProduct) }))
  });
  report.removedProducts += removed.length;
}

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  report: rel(reportPath),
  pagesScanned: report.pagesScanned,
  changedFiles: report.changedFiles.length,
  removedProducts: report.removedProducts,
  removedCards: report.removedCards
}, null, 2));
