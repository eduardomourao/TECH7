import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
const reportPath = path.join(root, "relatorio-limpeza-ui.json");

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
  "sony-experia",
  "blu",
  "zz-outras"
]);

const removedBrandWords = [
  "ZENFONE",
  "ASUS",
  "INFINIX",
  "LENOVO",
  "NOKIA",
  "ALCATEL",
  "CCE",
  "IMPORTADOS",
  "IMPORTADO",
  "MULTILASER",
  "POSITIVO",
  "SONY",
  "SONY EXPERIA",
  "BLU",
  "ZZ OUTRAS"
];

const categoryRoots = new Set([
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
  "carcacas",
  "touch-e-visor",
  "touchs-e-visores",
  "touchs-visores",
  "touch-visor",
  "touch",
  "telas"
]);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
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
  const clean = String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/^\/+/, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/g, "");

  const parts = [];
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function routeHasRemovedBrand(value) {
  const route = normalizeRoute(value);
  if (!route) return false;
  const parts = route.split("/");
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (categoryRoots.has(parts[index]) && removedBrandSlugs.has(parts[index + 1])) return true;
  }
  return removedBrandSlugs.has(parts[0]);
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

function removeEnclosingTagByRemovedHref(html, tag) {
  let next = html;
  let removed = 0;
  const hrefRe = /\bhref=(["'])(.*?)\1/gi;
  let match;
  while ((match = hrefRe.exec(next))) {
    if (!routeHasRemovedBrand(match[2])) continue;
    const tagStart = next.lastIndexOf(`<${tag}`, match.index);
    if (tagStart === -1) continue;
    const tagEnd = findMatchingTag(next, tagStart, tag);
    if (tagEnd === -1) continue;
    next = next.slice(0, tagStart) + next.slice(tagEnd);
    removed += 1;
    hrefRe.lastIndex = tagStart;
  }
  return { html: next, removed };
}

function removeBrokenLinksFromLastValidation(html, brokenPaths) {
  let next = html;
  let removed = 0;
  const hrefRe = /\bhref=(["'])(.*?)\1/gi;
  let match;
  while ((match = hrefRe.exec(next))) {
    if (!brokenPaths.has(normalizeRoute(match[2]))) continue;
    const itemStart = next.lastIndexOf('<div class="item', match.index);
    const itemEnd = itemStart === -1 ? -1 : findMatchingTag(next, itemStart, "div");
    if (itemStart !== -1 && itemEnd !== -1) {
      next = next.slice(0, itemStart) + next.slice(itemEnd);
      removed += 1;
      hrefRe.lastIndex = itemStart;
      continue;
    }
    const liStart = next.lastIndexOf("<li", match.index);
    const liEnd = liStart === -1 ? -1 : findMatchingTag(next, liStart, "li");
    if (liStart !== -1 && liEnd !== -1) {
      next = next.slice(0, liStart) + next.slice(liEnd);
      removed += 1;
      hrefRe.lastIndex = liStart;
    }
  }
  return { html: next, removed };
}

function removeRemovedBrandFilterItems(html) {
  let removed = 0;
  const next = html.replace(/<li\b[^>]*class=(["'])(?:(?!\1)[\s\S])*\bfilter__item\b(?:(?!\1)[\s\S])*\1[^>]*>[\s\S]*?<\/li>/gi, (block) => {
    const text = stripAccents(block.replace(/<[^>]*>/g, " ")).toUpperCase().replace(/\s+/g, " ").trim();
    const value = slugify((block.match(/\bvalue=(["'])(.*?)\1/i)?.[2] || "").replace(/\+/g, " "));
    const id = slugify(block.match(/\bid=(["'])(.*?)\1/i)?.[2] || "");
    const shouldRemove = removedBrandSlugs.has(value)
      || removedBrandSlugs.has(id)
      || removedBrandWords.some((word) => text.includes(word));
    if (!shouldRemove) return block;
    removed += 1;
    return "";
  });
  return { html: next, removed };
}

function compactRedirectArrays(payload) {
  let removed = 0;
  for (const key of ["redirects", "rewrites", "headers"]) {
    if (!Array.isArray(payload[key])) continue;
    const before = payload[key].length;
    payload[key] = payload[key].filter((rule) => {
      if (!rule || typeof rule !== "object") return false;
      if (!rule.source) return false;
      if (key !== "headers" && !rule.destination) return false;
      if (routeHasRemovedBrand(rule.source) || routeHasRemovedBrand(rule.destination)) return false;
      return true;
    });
    removed += before - payload[key].length;
  }
  return removed;
}

const summary = {
  htmlFilesModified: 0,
  menuLinksRemoved: 0,
  filtersRemoved: 0,
  brokenLinksRemoved: 0,
  aliasPagesRemoved: 0,
  jsonFilesModified: 0,
  jsonRulesRemoved: 0,
  files: []
};

const brokenByFile = new Map();
const lastLinkValidation = path.join(root, "_validation", "validate-links.json");
if (fs.existsSync(lastLinkValidation)) {
  const validation = JSON.parse(fs.readFileSync(lastLinkValidation, "utf8"));
  for (const error of validation.errors || []) {
    if (!error.file || !error.path) continue;
    const list = brokenByFile.get(error.file) || new Set();
    list.add(normalizeRoute(error.path));
    brokenByFile.set(error.file, list);
  }
}

for (const file of walkHtml(root)) {
  const route = normalizeRoute(rel(file).replace(/\/index\.html$/i, ""));
  if (routeHasRemovedBrand(route)) {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
    summary.aliasPagesRemoved += 1;
    summary.htmlFilesModified += 1;
    summary.files.push({ arquivo: rel(file), removido: ["pagina alias/redirect de marca removida deletada"], status: "sucesso" });
    continue;
  }

  const before = fs.readFileSync(file, "utf8");
  let after = before;
  const changes = [];

  const li = removeEnclosingTagByRemovedHref(after, "li");
  after = li.html;
  if (li.removed) {
    summary.menuLinksRemoved += li.removed;
    changes.push(`links de menu/sidebar removidos: ${li.removed}`);
  }

  const filters = removeRemovedBrandFilterItems(after);
  after = filters.html;
  if (filters.removed) {
    summary.filtersRemoved += filters.removed;
    changes.push(`filtros de marca/categoria removidos: ${filters.removed}`);
  }

  const broken = removeBrokenLinksFromLastValidation(after, brokenByFile.get(rel(file)) || new Set());
  after = broken.html;
  if (broken.removed) {
    summary.brokenLinksRemoved += broken.removed;
    changes.push(`cards/listas com links quebrados removidos: ${broken.removed}`);
  }

  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    summary.htmlFilesModified += 1;
    summary.files.push({ arquivo: rel(file), removido: changes, status: "sucesso" });
  }
}

for (const fileRel of ["_custom/redirects.json", "_custom/product-redirects.json", "vercel.json"]) {
  const file = path.join(root, fileRel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, "utf8");
  const payload = JSON.parse(before);
  const removed = compactRedirectArrays(payload);
  const after = JSON.stringify(payload, null, 2);
  if (removed || after !== before) {
    fs.writeFileSync(file, after, "utf8");
    summary.jsonFilesModified += 1;
    summary.jsonRulesRemoved += removed;
    summary.files.push({ arquivo: fileRel, removido: [`regras JSON invalidas/removidas: ${removed}`], status: "sucesso" });
  }
}

if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.execucoes_anteriores = report.execucoes_anteriores || [];
  report.execucoes_anteriores.push({
    data_limpeza: report.data_limpeza,
    resumo: report.resumo,
    arquivos_modificados: report.arquivos_modificados?.length || 0,
    rotas_removidas_ou_ausentes: report.rotas_removidas_ou_ausentes?.length || 0
  });
  report.data_limpeza = new Date().toISOString();
  report.resumo = report.resumo || {};
  report.resumo.arquivos_html_modificados = (report.resumo.arquivos_html_modificados || 0) + summary.htmlFilesModified;
  report.resumo.arquivos_json_modificados = (report.resumo.arquivos_json_modificados || 0) + summary.jsonFilesModified;
  report.resumo.links_ui_removidos = (report.resumo.links_ui_removidos || 0) + summary.menuLinksRemoved;
  report.resumo.filtros_ou_options_removidos = (report.resumo.filtros_ou_options_removidos || 0) + summary.filtersRemoved;
  report.resumo.links_quebrados_removidos = (report.resumo.links_quebrados_removidos || 0) + summary.brokenLinksRemoved;
  report.resumo.paginas_alias_removidas = (report.resumo.paginas_alias_removidas || 0) + summary.aliasPagesRemoved;
  report.arquivos_modificados = [...(report.arquivos_modificados || []), ...summary.files];
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

console.log(JSON.stringify(summary, null, 2));
