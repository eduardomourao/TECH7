import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outPath = path.join(root, "_validation", "listing-card-sync-report.json");
const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts"]);
const categoryRoots = new Set([
  "baterias-celular", "baterias", "bateria", "bateria-celular",
  "tela-display-lcd", "display-e-lcd", "display", "display-lcd", "telas-display-lcd",
  "pecas-e-componentes", "pecas", "pecas-componentes", "componentes",
  "tampas-e-carcacas", "tampas", "tampas-carcacas", "carcacas"
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
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseListProducts(html) {
  const key = '"listProducts":';
  const start = html.indexOf(key);
  if (start === -1) return [];
  const open = html.indexOf("[", start + key.length);
  const close = findMatchingBracket(html, open);
  if (open === -1 || close === -1) return [];
  try {
    return JSON.parse(html.slice(open, close + 1));
  } catch {
    return [];
  }
}

function findMatchingLi(html, start) {
  const openRe = /<li\b/gi;
  const closeRe = /<\/li>/gi;
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

function productName(block) {
  const match = block.match(/<div class="product-name">([\s\S]*?)<\/div>/i);
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function routeExists(route) {
  const clean = String(route || "").replace(/^\/+|\/+$/g, "");
  if (!clean) return false;
  if (fs.existsSync(path.join(root, clean, "index.html"))) return true;
  if (fs.existsSync(path.join(root, clean))) return true;
  return false;
}

const report = { generatedAt: new Date().toISOString(), changedFiles: [], scanned: 0, removedCards: 0, rewrittenCards: 0 };

for (const file of walk(root)) {
  const routeParts = rel(file).split("/");
  if (!categoryRoots.has(routeParts[0])) continue;
  let html = fs.readFileSync(file, "utf8");
  if (/\bpage-product\b/.test(html)) continue;
  const items = parseListProducts(html);
  if (!items.length) continue;
  const allowed = new Map();
  for (const item of items) {
    const name = String(item.nameProduct || item.title || "").replace(/\s+/g, " ").trim();
    const url = String(item.urlProduct || "").trim();
    if (name && routeExists(url)) allowed.set(name, url);
  }
  report.scanned += 1;
  let pos = 0;
  let removed = 0;
  let rewritten = 0;
  while (true) {
    const start = html.indexOf('<li class="item flex"', pos);
    if (start === -1) break;
    const end = findMatchingLi(html, start);
    if (end === -1) break;
    let block = html.slice(start, end);
    const name = productName(block);
    if (!allowed.has(name)) {
      html = html.slice(0, start) + html.slice(end);
      removed += 1;
      pos = start;
      continue;
    }
    const target = allowed.get(name);
    block = block.replace(/href="[^"]+"/g, `href="${target}"`);
    html = html.slice(0, start) + block + html.slice(end);
    rewritten += 1;
    pos = start + block.length;
  }
  if (removed || rewritten) {
    fs.writeFileSync(file, html, "utf8");
    report.changedFiles.push({ file: rel(file), allowedProducts: allowed.size, removedCards: removed, rewrittenCards: rewritten });
    report.removedCards += removed;
    report.rewrittenCards += rewritten;
  }
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  report: rel(outPath),
  scanned: report.scanned,
  changedFiles: report.changedFiles.length,
  removedCards: report.removedCards,
  rewrittenCards: report.rewrittenCards
}, null, 2));
