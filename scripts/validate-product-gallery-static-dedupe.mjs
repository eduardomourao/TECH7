import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outPath = path.join(root, "_validation", "product-gallery-static-dedupe-results.json");
const skipDirs = new Set([".git", "node_modules", "backup", "_validation", "artifacts", "validation-screenshots"]);

function listIndexHtmlFiles(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listIndexHtmlFiles(full, out);
    else if (entry.name === "index.html") out.push(full);
  }
  return out;
}

function normalizeImageSrc(src) {
  return String(src || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .split("#")[0]
    .trim();
}

function normalizeImageKey(src) {
  let file = normalizeImageSrc(src).split("/").pop()?.toLowerCase() || "";
  if (!file) return "";
  return file
    .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, "")
    .replace(/^\d{2,4}_/, "")
    .replace(/-[a-f0-9]{6,}$/i, "")
    .replace(/_[a-f0-9]{16,}$/i, "")
    .replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, "$1");
}

function imageSize(src) {
  const file = normalizeImageSrc(src).split("/").pop() || "";
  const match = file.match(/^(\d{2,4})_/);
  return match ? Number(match[1]) : 0;
}

function imageAttr(tag) {
  return [...tag.matchAll(/\b(?:src|data-src|data-lazy)=["']([^"']+)["']/gi)].map((match) => match[1])[0] || "";
}

function duplicateGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeImageKey(item.src);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .filter(([, group]) => shouldDedupeGroup(group))
    .map(([key, group]) => ({ key, count: group.length }));
}

function shouldDedupeGroup(items) {
  if (items.length < 2) return false;
  const srcs = new Set(items.map((item) => normalizeImageSrc(item.src)).filter(Boolean));
  const sizes = new Set(items.map((item) => imageSize(item.src)).filter(Boolean));
  const hasSized = items.some((item) => imageSize(item.src) > 0);
  const hasFull = items.some((item) => imageSize(item.src) === 0);
  return srcs.size < items.length || (hasFull && hasSized) || sizes.size > 1;
}

function score(item, mode) {
  const size = imageSize(item.src);
  if (mode === "main") return size ? 1000 + size : 10000;
  if (size === 90) return 10000;
  if (size === 180) return 9000;
  if (size) return 8000 - size;
  return 1000;
}

function simulateDedupe(items, mode) {
  const groups = new Map();
  items.forEach((item, order) => {
    const key = normalizeImageKey(item.src);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...item, order });
  });

  const kept = [];
  for (const group of groups.values()) {
    if (!shouldDedupeGroup(group)) {
      kept.push(...group);
      continue;
    }
    group.sort((a, b) => score(b, mode) - score(a, mode) || a.order - b.order);
    kept.push(group[0]);
  }
  kept.sort((a, b) => a.order - b.order);
  return kept;
}

function productTokensFromFile(file) {
  const slug = file.replace(/\\/g, "/").replace(/\/index\.html$/i, "").split("/").pop() || "";
  const stop = new Set([
    "tela", "display", "lcd", "oled", "frontal", "bateria", "battery", "samsung", "apple", "xiaomi",
    "redmi", "motorola", "realme", "lg", "asus", "original", "retirada", "nacional", "amazon",
    "vip", "sem", "com", "aro", "borda", "fina", "incell", "flex", "conector", "carga", "placa",
    "peca", "pecas", "componentes", "touch", "visor", "vidro", "traseira", "tampa", "carcaca",
    "carcaça", "troca", "chip", "ci", "jk"
  ]);
  const normalized = slug.normalize ? slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : slug;
  const tokens = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !stop.has(token) && !/^\d$/.test(token) && (/[0-9]/.test(token) || token.length >= 3));
  return [...new Set(tokens)];
}

function imageTokenScore(src, tokens) {
  const key = normalizeImageKey(src).replace(/[^a-z0-9]+/g, " ");
  const padded = ` ${key} `;
  return tokens.reduce((total, token) => total + (padded.includes(` ${token} `) || key.includes(token) ? 1 : 0), 0);
}

function simulateMismatchFilter(items, tokens) {
  if (tokens.length < 2 || items.length < 2) return items;
  const required = Math.min(2, tokens.length);
  const rows = items.map((item, order) => ({ ...item, order, score: imageTokenScore(item.src, tokens) }));
  const matching = rows.filter((item) => item.score >= required);
  if (!matching.length || matching.length === rows.length) return items;
  return rows.filter((item) => item.score >= required);
}

function extractGalleryItems(html) {
  const nav = html.match(/<div class=["']nav-images["'][\s\S]*?<div class=["']image-show["']/i)?.[0] || "";
  const main = html.match(/<div class=["']image-show["'][\s\S]*?<div class=["']dots["']><\/div>/i)?.[0] || "";
  return {
    nav: [...nav.matchAll(/<img\b[^>]*>/gi)].map((match) => ({ src: imageAttr(match[0]) })).filter((item) => item.src),
    main: [...main.matchAll(/<img\b[^>]*>/gi)].map((match) => ({ src: imageAttr(match[0]) })).filter((item) => item.src),
  };
}

const results = [];
let galleryFiles = 0;
let filesWithRawDuplicates = 0;
let rawDuplicateGroups = 0;
let rawImages = 0;
let keptImages = 0;
let removedByMismatch = 0;

for (const file of listIndexHtmlFiles()) {
  const html = fs.readFileSync(file, "utf8");
  if (!html.includes("image-show") || !html.includes("nav-images")) continue;
  galleryFiles += 1;

  const rel = path.relative(root, file).replace(/\\/g, "/");
  const { nav, main } = extractGalleryItems(html);
  const tokens = productTokensFromFile(rel);
  const navBefore = duplicateGroups(nav);
  const mainBefore = duplicateGroups(main);
  const navMatched = simulateMismatchFilter(nav, tokens);
  const mainMatched = simulateMismatchFilter(main, tokens);
  const navAfterItems = simulateDedupe(navMatched, "nav");
  const mainAfterItems = simulateDedupe(mainMatched, "main");
  const navAfter = duplicateGroups(navAfterItems);
  const mainAfter = duplicateGroups(mainAfterItems);

  rawImages += nav.length + main.length;
  keptImages += navAfterItems.length + mainAfterItems.length;
  removedByMismatch += (nav.length - navMatched.length) + (main.length - mainMatched.length);

  if (navBefore.length || mainBefore.length) {
    filesWithRawDuplicates += 1;
    rawDuplicateGroups += navBefore.length + mainBefore.length;
    results.push({
      file: rel,
      before: { nav: navBefore, main: mainBefore, navImages: nav.length, mainImages: main.length },
      mismatchFiltered: { navImages: navMatched.length, mainImages: mainMatched.length },
      after: { nav: navAfter, main: mainAfter, navImages: navAfterItems.length, mainImages: mainAfterItems.length },
      ok: navAfter.length === 0 && mainAfter.length === 0,
    });
  }
}

const failed = results.filter((result) => !result.ok);
const report = {
  generatedAt: new Date().toISOString(),
  galleryFiles,
  filesWithRawDuplicates,
  rawDuplicateGroups,
  rawImages,
  keptImagesAfterDedupe: keptImages,
  removedBySimulation: rawImages - keptImages,
  removedByMismatch,
  failed: failed.length,
  results,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("[validate-product-gallery-static-dedupe]");
console.log(`Galerias: ${galleryFiles} | Arquivos com duplicata bruta: ${filesWithRawDuplicates} | Removidas por simulacao: ${report.removedBySimulation} | Falhas: ${failed.length}`);
if (failed.length) {
  for (const item of failed.slice(0, 20)) console.log(`FALHOU ${item.file}`);
  process.exitCode = 1;
}
