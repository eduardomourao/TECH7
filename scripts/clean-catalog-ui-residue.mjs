import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "relatorio-auditoria-marcas.json");
const outputPath = path.join(root, "relatorio-limpeza-ui.json");

const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
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
  "asism", // kept harmless for malformed exports
  "asus",
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
  "ASUS"
];
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
  "carcacas",
  "touch-e-visor",
  "touchs-e-visores",
  "touchs-visores",
  "touch-visor",
  "touch"
];
const explicitEmptyRoutes = [
  "/baterias/zenfone/",
  "/baterias-celular/zenfone/",
  "/baterias/infinix/",
  "/baterias-celular/infinix/",
  "/baterias/lenovo/",
  "/baterias/nokia/",
  "/display-e-lcd/zenfone/",
  "/display-e-lcd/infinix/",
  "/display-e-lcd/alcatel/",
  "/display-e-lcd/multilaser/",
  "/display-e-lcd/positivo/",
  "/display-e-lcd/cce/",
  "/display-e-lcd/zz-outras/",
  "/pecas-e-componentes/zenfone/",
  "/pecas-e-componentes/nokia/",
  "/pecas-e-componentes/infinix/",
  "/pecas-e-componentes/alcatel/",
  "/pecas-e-componentes/sony/",
  "/pecas-e-componentes/sony-experia/",
  "/pecas-e-componentes/lenovo/",
  "/tampas-e-carcacas/zenfone/"
];
const explicitBrandDirs = ["Asus"];

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function safeResolve(routeOrPath) {
  const clean = String(routeOrPath || "").replace(/^\/+/, "");
  const resolved = path.resolve(root, clean);
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
  const clean = String(value || "")
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/g, "");
  return clean
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walkFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.isFile() && /\.(html|json)$/i.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

function runtimeFiles() {
  const files = [];
  for (const dir of [
    ...categoryRoots,
    "Apple",
    "Samsung",
    "Motorola",
    "LG",
    "Realme",
    "Xiaomi",
    "_custom",
    "_assets/tech7"
  ]) {
    walkFiles(path.join(root, dir), files);
  }
  for (const file of ["index.html", "admin.html", "precos.json", "vercel.json", "_assets/tech7/search-index.json"]) {
    const full = safeResolve(file);
    if (fs.existsSync(full)) files.push(full);
  }
  return [...new Set(files)];
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

function findMatchingDiv(html, start) {
  return findMatchingTag(html, start, "div");
}

function productKey(item) {
  return {
    id: String(item?.idProduct || item?.id || "").trim(),
    url: normalizeRoute(item?.urlProduct || item?.url || ""),
    name: slugify(item?.nameProduct || item?.title || item?.name || ""),
    brand: slugify(item?.brand || item?.marca || item?.category || "")
  };
}

function shouldRemoveProduct(item) {
  const key = productKey(item);
  if (key.id && removeIds.has(key.id)) return true;
  if (key.url && removeRoutes.has(key.url)) return true;
  if (key.name && removeNames.has(key.name)) return true;
  if (key.brand && removedBrandSlugs.has(key.brand)) return true;
  return false;
}

function routeHasRemovedBrand(value) {
  const route = normalizeRoute(value);
  if (!route) return false;
  if (removeRoutes.has(route)) return true;
  const parts = route.split("/");
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (categoryRoots.includes(parts[index]) && removedBrandSlugs.has(parts[index + 1])) return true;
  }
  return false;
}

function removeCards(html, products) {
  let next = html;
  let removed = 0;
  const hrefs = new Set();
  const names = new Set();
  for (const item of products) {
    const url = normalizeRoute(item?.urlProduct || item?.url || "");
    if (url) {
      hrefs.add(url);
      hrefs.add(`/${url}`);
      hrefs.add(`${url}/index.html`);
      hrefs.add(`/${url}/index.html`);
    }
    const name = cleanText(item?.nameProduct || item?.title || item?.name || "");
    if (name) names.add(name);
  }
  for (const href of hrefs) {
    let index = next.indexOf(`href="${href}"`);
    while (index !== -1) {
      const itemStart = next.lastIndexOf('<div class="item', index);
      const itemEnd = itemStart === -1 ? -1 : findMatchingDiv(next, itemStart);
      if (itemStart === -1 || itemEnd === -1) break;
      next = next.slice(0, itemStart) + next.slice(itemEnd);
      removed += 1;
      index = next.indexOf(`href="${href}"`, itemStart);
    }
  }
  const nameRe = /<div class="product-name">([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = nameRe.exec(next))) {
    if (!names.has(cleanText(match[1]))) continue;
    const itemStart = next.lastIndexOf('<div class="item', match.index);
    const itemEnd = itemStart === -1 ? -1 : findMatchingDiv(next, itemStart);
    if (itemStart === -1 || itemEnd === -1) continue;
    next = next.slice(0, itemStart) + next.slice(itemEnd);
    removed += 1;
    nameRe.lastIndex = itemStart;
  }
  return { html: next, removed };
}

function removeEnclosingTagByHref(html, tag) {
  let next = html;
  let removed = 0;
  const hrefRe = /href="([^"]+)"/gi;
  let match;
  while ((match = hrefRe.exec(next))) {
    if (!routeHasRemovedBrand(match[1])) continue;
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

function removeFilterBrandItems(html) {
  let removed = 0;
  const next = html.replace(/<li\b[^>]*class="[^"]*\bfilter__item\b[^"]*"[\s\S]*?<\/li>/gi, (block) => {
    if (!/filter__input--brand/i.test(block)) return block;
    const text = stripAccents(cleanText(block)).toUpperCase();
    const value = slugify((block.match(/\bvalue=["']([^"']+)["']/i)?.[1] || "").replace(/\+/g, " "));
    const id = slugify(block.match(/\bid=["']([^"']+)["']/i)?.[1] || "");
    const shouldRemove = removedBrandSlugs.has(value)
      || removedBrandSlugs.has(id)
      || removedBrandWords.some((word) => text.includes(word));
    if (!shouldRemove) return block;
    removed += 1;
    return "";
  });
  return { html: next, removed };
}

function removeBrandSlides(html) {
  let next = html;
  let removed = 0;
  const hrefRe = /href="([^"]+)"/gi;
  let match;
  while ((match = hrefRe.exec(next))) {
    const route = normalizeRoute(match[1]);
    const first = route.split("/")[0] || "";
    if (!removedBrandSlugs.has(slugify(first)) && !routeHasRemovedBrand(route)) continue;
    const slideStart = next.lastIndexOf('<div class="swiper-slide"', match.index);
    const slideEnd = slideStart === -1 ? -1 : findMatchingDiv(next, slideStart);
    if (slideStart === -1 || slideEnd === -1) continue;
    next = next.slice(0, slideStart) + next.slice(slideEnd);
    removed += 1;
    hrefRe.lastIndex = slideStart;
  }
  return { html: next, removed };
}

function isRemovedAliasOrRedirectPage(html, file) {
  const route = normalizeRoute(rel(file).replace(/\/index\.html$/i, ""));
  if (routeHasRemovedBrand(route)) return true;
  const text = stripAccents(cleanText(html)).toUpperCase();
  const hasRedirectShape = /TECH7_PRODUCT_ALIAS_PAGE|http-equiv=["']refresh|window\.location\.replace/i.test(html);
  if (!hasRedirectShape) return false;
  return removedBrandWords.some((word) => text.includes(word));
}

function removeSimpleTagByBrandText(html, tag) {
  let next = html;
  let removed = 0;
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi");
  next = next.replace(re, (block) => {
    const text = stripAccents(cleanText(block)).toUpperCase();
    const valueMatch = block.match(/\bvalue=["']([^"']+)["']/i);
    const valueSlug = slugify(valueMatch?.[1] || "");
    if (removedBrandSlugs.has(valueSlug) || removedBrandWords.some((word) => text === word || text.includes(`>${word}<`))) {
      removed += 1;
      return "";
    }
    return block;
  });
  return { html: next, removed };
}

function jsonValueHasRemovedRoute(value) {
  if (typeof value === "string") return routeHasRemovedBrand(value);
  if (Array.isArray(value)) return value.some(jsonValueHasRemovedRoute);
  if (value && typeof value === "object") return Object.values(value).some(jsonValueHasRemovedRoute);
  return false;
}

function filterJson(value) {
  if (Array.isArray(value)) return value.map(filterJson).filter((item) => !jsonValueHasRemovedRoute(item));
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      if (routeHasRemovedBrand(key)) continue;
      const filtered = filterJson(child);
      if (jsonValueHasRemovedRoute(filtered)) continue;
      next[key] = filtered;
    }
    return next;
  }
  return value;
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const removedProducts = report.produtos.filter((product) => product.acao === "REMOVER");
const removeIds = new Set(removedProducts.map((product) => String(product.id)));
const removeRoutes = new Set(removedProducts.map((product) => normalizeRoute(product.url)).filter(Boolean));
const removeNames = new Set(removedProducts.map((product) => slugify(product.nome)).filter(Boolean));
const previousReport = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;

const cleanupReport = {
  data_limpeza: new Date().toISOString(),
  arquivos_modificados: [],
  rotas_removidas_ou_ausentes: [],
  resumo: {
    arquivos_html_modificados: 0,
    arquivos_json_modificados: 0,
    links_ui_removidos: 0,
    filtros_ou_options_removidos: 0,
    referencias_produto_removidas: 0,
    rotas_vazias_removidas_ou_ausentes: 0
  }
};

for (const route of explicitEmptyRoutes) {
  const dir = safeResolve(route);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    cleanupReport.rotas_removidas_ou_ausentes.push({ rota: route, status: "removida" });
  } else {
    cleanupReport.rotas_removidas_ou_ausentes.push({ rota: route, status: "ausente" });
  }
  cleanupReport.resumo.rotas_vazias_removidas_ou_ausentes += 1;
}
for (const dirName of explicitBrandDirs) {
  const dir = safeResolve(dirName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    cleanupReport.rotas_removidas_ou_ausentes.push({ rota: `/${dirName}/`, status: "removida" });
    cleanupReport.resumo.rotas_vazias_removidas_ou_ausentes += 1;
  }
}

for (const file of runtimeFiles()) {
  if (!fs.existsSync(file)) continue;
  if (rel(file) === "relatorio-auditoria-marcas.json" || rel(file) === "log-remocao.json") continue;
  const ext = path.extname(file).toLowerCase();
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  const changes = [];

  if (ext === ".html") {
    if (isRemovedAliasOrRedirectPage(after, file)) {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
      cleanupReport.arquivos_modificados.push({ arquivo: rel(file), removido: ["pagina alias/redirect de marca removida deletada"], status: "sucesso" });
      cleanupReport.resumo.arquivos_html_modificados += 1;
      continue;
    }
    const data = dataLayerSlice(after);
    if (data && Array.isArray(data.parsed) && data.parsed[0] && Array.isArray(data.parsed[0].listProducts)) {
      const payload = data.parsed[0];
      const removed = payload.listProducts.filter(shouldRemoveProduct);
      if (removed.length) {
        payload.listProducts = payload.listProducts.filter((item) => !shouldRemoveProduct(item));
        if (typeof payload.quantity === "number") payload.quantity = payload.listProducts.length;
        after = after.slice(0, data.start) + JSON.stringify(data.parsed) + after.slice(data.end);
        changes.push(`listProducts: ${removed.length} produtos removidos`);
        cleanupReport.resumo.referencias_produto_removidas += removed.length;
        const cards = removeCards(after, removed);
        after = cards.html;
        if (cards.removed) changes.push(`cards de produto removidos: ${cards.removed}`);
      }
    }
    const li = removeEnclosingTagByHref(after, "li");
    after = li.html;
    if (li.removed) {
      changes.push(`links de menu/sidebar removidos: ${li.removed}`);
      cleanupReport.resumo.links_ui_removidos += li.removed;
    }
    const filterBrands = removeFilterBrandItems(after);
    after = filterBrands.html;
    if (filterBrands.removed) {
      changes.push(`filtros de marca removidos: ${filterBrands.removed}`);
      cleanupReport.resumo.filtros_ou_options_removidos += filterBrands.removed;
    }
    const slides = removeBrandSlides(after);
    after = slides.html;
    if (slides.removed) {
      changes.push(`logos/slides de marca removidos: ${slides.removed}`);
      cleanupReport.resumo.links_ui_removidos += slides.removed;
    }
    const labels = removeSimpleTagByBrandText(after, "label");
    after = labels.html;
    const options = removeSimpleTagByBrandText(after, "option");
    after = options.html;
    if (labels.removed || options.removed) {
      changes.push(`filtros/options removidos: ${labels.removed + options.removed}`);
      cleanupReport.resumo.filtros_ou_options_removidos += labels.removed + options.removed;
    }
  } else if (ext === ".json") {
    try {
      const filtered = filterJson(JSON.parse(after));
      const serialized = JSON.stringify(filtered, null, 2);
      if (serialized !== after) {
        after = serialized;
        changes.push("rotas/referencias JSON de marcas removidas filtradas");
      }
    } catch {
      // Keep non-JSON-like payloads untouched.
    }
  }

  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    if (ext === ".html") cleanupReport.resumo.arquivos_html_modificados += 1;
    if (ext === ".json") cleanupReport.resumo.arquivos_json_modificados += 1;
    cleanupReport.arquivos_modificados.push({ arquivo: rel(file), removido: changes, status: "sucesso" });
  }
}

if (previousReport) {
  cleanupReport.execucoes_anteriores = previousReport.execucoes_anteriores || [];
  cleanupReport.execucoes_anteriores.push({
    data_limpeza: previousReport.data_limpeza,
    resumo: previousReport.resumo,
    arquivos_modificados: previousReport.arquivos_modificados?.length || 0,
    rotas_removidas_ou_ausentes: previousReport.rotas_removidas_ou_ausentes?.length || 0
  });
  cleanupReport.arquivos_modificados = [
    ...(previousReport.arquivos_modificados || []),
    ...cleanupReport.arquivos_modificados
  ];
  cleanupReport.rotas_removidas_ou_ausentes = [
    ...(previousReport.rotas_removidas_ou_ausentes || []),
    ...cleanupReport.rotas_removidas_ou_ausentes
  ];
  for (const key of Object.keys(cleanupReport.resumo)) {
    cleanupReport.resumo[key] += previousReport.resumo?.[key] || 0;
  }
}
fs.writeFileSync(outputPath, JSON.stringify(cleanupReport, null, 2), "utf8");
console.log(JSON.stringify({
  relatorio: rel(outputPath),
  ...cleanupReport.resumo
}, null, 2));
