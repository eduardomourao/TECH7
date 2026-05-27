import fs from "node:fs";
import path from "node:path";

export const root = process.cwd();

export const publicCategoryGroups = {
  display: ["display", "display-e-lcd", "display-lcd", "tela-display-lcd", "telas-display-lcd", "telas"],
  bateria: ["bateria", "bateria-celular", "baterias", "baterias-celular"],
  touch: ["touch", "touch-visor", "touchs-visores", "touchs-e-visores", "touch-e-visor"],
  pecas: ["pecas", "pecas-componentes", "pecas-e-componentes", "componentes"],
  tampas: ["tampas", "tampas-carcacas", "tampas-e-carcacas", "carcacas"],
  ferramentas: ["ferramentas", "maquinas-ferramentas", "maquinas-e-ferramentas"]
};

export const knownLegacyEndpoints = [
  "/loja/cartService.php",
  "/loja/login_layout.php",
  "/loja/catalogo.php",
  "/loja/busca.php",
  "/loja/logout.php",
  "/loja/redirect_cart_service.php",
  "/mvc/store/newsletter/",
  "/contato/contato.php",
  "/depoimentos-de-clientes/funcoes/envia_depoimento.php"
];

export const newEndpoints = [
  { method: "POST", route: "/api/cart/add" },
  { method: "POST", route: "/api/newsletter" },
  { method: "POST", route: "/api/comments" },
  { method: "POST", route: "/api/contact" },
  { method: "POST", route: "/api/testimonials" },
  { method: "GET", route: "/api/search" }
];

const skipDirs = new Set([
  ".git",
  ".vercel",
  "node_modules",
  "backend/node_modules"
]);

const scannedTopDirs = new Set([
  "server",
  "api",
  "assets",
  "_assets",
  "_custom",
  "scripts"
]);

const routeRefTypes = new Set([
  "href",
  "action",
  "canonical",
  "next",
  "prev",
  "meta-refresh",
  "window.location",
  "fetch",
  "xhr",
  "data-url"
]);

export function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

export function rel(filePath) {
  return toPosix(path.relative(root, filePath));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function walk(dir, output = [], predicate = null) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = rel(full);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name) || skipDirs.has(relative)) continue;
      walk(full, output, predicate);
      continue;
    }
    if (!predicate || predicate(full, entry.name)) output.push(full);
  }
  return output;
}

export function listHtmlFiles() {
  return walk(root, [], (file, name) => name.toLowerCase().endsWith(".html"));
}

export function listScannableFiles() {
  return walk(root, [], (file, name) => {
    const relative = rel(file);
    const top = relative.split("/")[0];
    if (top.startsWith(".") && top !== ".github") return false;
    if (!/\.(html|js|json)$/i.test(name)) return false;
    if (relative.startsWith("_validation/")) return false;
    if (/\.html$/i.test(name)) return true;
    return relative.indexOf("/") === -1 || scannedTopDirs.has(top) || relative.endsWith("vercel.json") || relative.endsWith("package.json");
  });
}

export function cleanPathname(value) {
  let url = String(value || "").trim().replace(/&amp;/g, "&").replace(/\\/g, "/");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      url = parsed.pathname;
    } catch {
      return "";
    }
  }
  url = url.split("#")[0].split("?")[0];
  try {
    url = decodeURIComponent(url);
  } catch {
    // Keep malformed values reportable.
  }
  url = url.replace(/\/+/g, "/");
  if (!url.startsWith("/")) url = `/${url}`;
  url = url.replace(/\/index\.html$/i, "");
  url = url.replace(/\.html$/i, "");
  url = url.replace(/\/+$/g, "");
  return url || "/";
}

export function routeFromHtmlFile(filePath) {
  const relative = rel(filePath);
  if (relative.toLowerCase() === "index.html") return "/";
  if (relative.toLowerCase().endsWith("/index.html")) {
    return cleanPathname(`/${relative.slice(0, -"/index.html".length)}`);
  }
  if (relative.toLowerCase().endsWith(".html")) {
    return cleanPathname(`/${relative.slice(0, -".html".length)}`);
  }
  return "";
}

export function sourceBasePath(filePath) {
  const relative = rel(filePath);
  if (relative.toLowerCase().endsWith("/index.html")) {
    return `/${relative.slice(0, -"/index.html".length)}/`;
  }
  if (relative.toLowerCase() === "index.html") return "/";
  return `/${toPosix(path.dirname(relative))}/`;
}

export function isExternalOrSpecial(value) {
  const url = String(value || "").trim();
  return !url
    || url.startsWith("#")
    || /^(data|blob|javascript|mailto|tel):/i.test(url)
    || /^\/\//.test(url)
    || (/^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1|tech-7|[^/]*vercel\.app)/i.test(url));
}

export function looksLikeAsset(value) {
  return /\.(avif|bmp|css|csv|eot|gif|ico|jpeg|jpg|js|json|map|mp3|mp4|otf|pdf|png|svg|ttf|txt|webm|webp|woff|woff2|xml)$/i
    .test(String(value || "").split("#")[0].split("?")[0]);
}

export function resolveReference(filePath, raw) {
  if (isExternalOrSpecial(raw)) return null;
  let value = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
  if (!value || /["'<>\s]$/.test(value)) return null;
  if (/^https?:\/\//i.test(value)) return cleanPathname(value);
  if (value.startsWith("/")) return cleanPathname(value);
  try {
    return cleanPathname(new URL(value, `https://tech7.local${sourceBasePath(filePath)}`).pathname);
  } catch {
    return null;
  }
}

function attrValue(tag, attr) {
  const match = tag.match(new RegExp(`\\s${attr}\\s*=\\s*([\"'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function hasClassLike(tag, pattern) {
  return pattern.test(attrValue(tag, "class")) || pattern.test(attrValue(tag, "rel"));
}

function titleFromHtml(html) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalFromHtml(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (/rel\s*=\s*["'][^"']*\bcanonical\b/i.test(tag)) return attrValue(tag, "href");
  }
  return "";
}

function metaRefreshFromHtml(html) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/http-equiv\s*=\s*["']refresh["']/i.test(tag)) continue;
    const content = attrValue(tag, "content");
    const match = content.match(/url\s*=\s*([^;]+)/i);
    if (match) return match[1].trim();
  }
  return "";
}

function addRef(refs, file, type, raw, context = "") {
  if (!raw || isExternalOrSpecial(raw)) return;
  if (String(raw).includes("${")) return;
  const routePath = routeRefTypes.has(type) ? resolveReference(file, raw) : null;
  refs.push({ file: rel(file), type, raw, routePath, context });
}

export function extractReferences(file, content = fs.readFileSync(file, "utf8")) {
  const refs = [];
  if (file.toLowerCase().endsWith(".html")) {
    for (const tag of content.match(/<a\b[^>]*>/gi) || []) addRef(refs, file, "href", attrValue(tag, "href"), contextForTag(tag));
    for (const tag of content.match(/<form\b[^>]*>/gi) || []) addRef(refs, file, "action", attrValue(tag, "action"), contextForTag(tag));
    for (const tag of content.match(/<link\b[^>]*>/gi) || []) {
      const relValue = attrValue(tag, "rel").toLowerCase();
      if (relValue.includes("canonical")) addRef(refs, file, "canonical", attrValue(tag, "href"), "canonical");
      else if (relValue.includes("next")) addRef(refs, file, "next", attrValue(tag, "href"), "pagination");
      else if (relValue.includes("prev")) addRef(refs, file, "prev", attrValue(tag, "href"), "pagination");
      else addRef(refs, file, "href", attrValue(tag, "href"), "asset-link");
    }
    for (const tag of content.match(/<[^>]+\sdata-url\s*=\s*["'][^"']+["'][^>]*>/gi) || []) {
      addRef(refs, file, "data-url", attrValue(tag, "data-url"), contextForTag(tag));
    }
    const refresh = metaRefreshFromHtml(content);
    if (refresh) addRef(refs, file, "meta-refresh", refresh, "alias");
  }

  for (const match of content.matchAll(/(?:window\.)?location(?:\.href)?\s*=\s*([`"'])([^`"']+)\1/gi)) {
    addRef(refs, file, "window.location", match[2], "script");
  }
  for (const match of content.matchAll(/(?:window\.)?location\.(?:replace|assign)\s*\(\s*([`"'])([^`"']+)\1/gi)) {
    addRef(refs, file, "window.location", match[2], "script");
  }
  for (const match of content.matchAll(/\bfetch\s*\(\s*([`"'])([^`"']+)\1/gi)) {
    addRef(refs, file, "fetch", match[2], "script");
  }
  for (const match of content.matchAll(/\.open\s*\(\s*([`"'])(?:GET|POST|PUT|PATCH|DELETE)\1\s*,\s*([`"'])([^`"']+)\2/gi)) {
    addRef(refs, file, "xhr", match[3], "script");
  }
  return refs;
}

function contextForTag(tag) {
  if (hasClassLike(tag, /\b(second-nivel|sub|category|menu|nav)\b/i)) return "menu";
  if (hasClassLike(tag, /\b(page|next|prev|pagination)\b/i)) return "pagination";
  if (hasClassLike(tag, /\b(breadcrumb|bread|crumb)\b/i)) return "breadcrumb";
  if (hasClassLike(tag, /\b(product|related|space-image|info-product)\b/i)) return "product";
  return "";
}

export function buildRouteIndex() {
  const htmlFiles = listHtmlFiles();
  const routes = new Map();
  const pages = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const route = routeFromHtmlFile(file);
    const canonicalRaw = canonicalFromHtml(html);
    const refreshRaw = metaRefreshFromHtml(html);
    const canonical = canonicalRaw ? resolveReference(file, canonicalRaw) : "";
    const refresh = refreshRaw ? resolveReference(file, refreshRaw) : "";
    const page = {
      route,
      file: rel(file),
      title: titleFromHtml(html),
      canonical,
      metaRefresh: refresh,
      isAlias: !!(refresh && refresh !== route) || html.includes("TECH7_PRODUCT_ALIAS_PAGE")
    };
    routes.set(route.toLowerCase(), page);
    pages.push(page);
  }
  return { routes, pages };
}

export function routeExists(routeIndex, routePath) {
  const clean = cleanPathname(routePath).toLowerCase();
  if (routeIndex.routes.has(clean)) return true;
  const fileCandidate = path.join(root, `${clean === "/" ? "index" : clean.slice(1)}.html`);
  return fs.existsSync(fileCandidate);
}

export function readVercelRoutes() {
  const vercel = readJsonIfExists(path.join(root, "vercel.json"), {});
  return {
    redirects: Array.isArray(vercel.redirects) ? vercel.redirects : [],
    rewrites: Array.isArray(vercel.rewrites) ? vercel.rewrites : [],
    headers: Array.isArray(vercel.headers) ? vercel.headers : [],
    cleanUrls: vercel.cleanUrls === true,
    trailingSlash: vercel.trailingSlash === true
  };
}

function vercelPatternToRegex(pattern) {
  const withMarkers = cleanPathname(pattern)
    .replace(/:[A-Za-z0-9_]+\*/g, "__WILDCARD__")
    .replace(/:[A-Za-z0-9_]+/g, "__PARAM__");
  const escaped = withMarkers
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/__WILDCARD__/g, ".*")
    .replace(/__PARAM__/g, "[^/]+");
  return new RegExp(`^${escaped}/?$`, "i");
}

export function vercelMatch(routePath, rules) {
  const clean = cleanPathname(routePath);
  for (const rule of rules) {
    if (vercelPatternToRegex(rule.source).test(clean)) return rule;
  }
  return null;
}

export function isRouteCovered(routeIndex, routePath, vercelRoutes = readVercelRoutes()) {
  if (!routePath) return true;
  if (routeExists(routeIndex, routePath)) return true;
  const redirect = vercelMatch(routePath, vercelRoutes.redirects);
  if (redirect) return true;
  const rewrite = vercelMatch(routePath, vercelRoutes.rewrites);
  if (rewrite) return true;
  return false;
}

export function categoryForRoute(routePath) {
  const first = cleanPathname(routePath).split("/").filter(Boolean)[0] || "";
  for (const [group, candidates] of Object.entries(publicCategoryGroups)) {
    if (candidates.includes(first)) return group;
  }
  return "";
}

export function isLikelyProductRoute(routePath) {
  const parts = cleanPathname(routePath).split("/").filter(Boolean);
  if (!categoryForRoute(routePath)) return false;
  const groupCandidates = Object.values(publicCategoryGroups).flat();
  if (parts.length === 1 && groupCandidates.includes(parts[0])) return false;
  return parts.length >= 2;
}

export function productNameFromPage(page) {
  return String(page?.title || "").replace(/\s*-\s*TECH 7.*$/i, "").trim();
}
