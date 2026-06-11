import fs from "node:fs";
import path from "node:path";

export const root = process.cwd();

const SKIP_DIRS = new Set([".git", "node_modules", ".vercel", ".od-skills", "_validation"]);
const INTERNAL_PROTOCOL = /^(mailto:|tel:|whatsapp:|javascript:|data:|blob:|sms:|viber:|skype:)/i;

export function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

export function rel(filePath) {
  return toPosix(path.relative(root, filePath));
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, filePath), "utf8"));
  } catch (_error) {
    return fallback;
  }
}

export function walk(dir = root, output = [], options = {}) {
  const skip = options.skip || SKIP_DIRS;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      walk(path.join(dir, entry.name), output, options);
      continue;
    }
    if (!options.predicate || options.predicate(entry.name, path.join(dir, entry.name))) {
      output.push(path.join(dir, entry.name));
    }
  }
  return output;
}

export function routeFromHtmlFile(filePath) {
  const r = rel(filePath);
  if (r === "index.html") return "/";
  if (r.endsWith("/index.html")) return `/${r.slice(0, -"/index.html".length)}`;
  if (r.endsWith(".html")) return `/${r.slice(0, -".html".length)}`;
  return `/${r}`;
}

function relativeBaseFor(filePath) {
  const r = rel(filePath);
  const route = routeFromHtmlFile(filePath);
  if (r === "index.html") return "/";
  if (r.endsWith("/index.html")) return route.endsWith("/") ? route : `${route}/`;
  return `${path.posix.dirname(route)}/`;
}

export function htmlBase(content, filePath) {
  const baseMatch = content.match(/<base\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (!baseMatch) return relativeBaseFor(filePath);
  const href = baseMatch[1].trim();
  if (!href) return relativeBaseFor(filePath);
  if (/^https?:/i.test(href)) {
    try {
      return new URL(href).pathname || "/";
    } catch (_error) {
      return "/";
    }
  }
  return href.startsWith("/") ? href : path.posix.normalize(path.posix.join(relativeBaseFor(filePath), href));
}

function isExternalAbsolute(value) {
  if (/^\/\//.test(value)) return true;
  if (!/^https?:/i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return !/tech|localhost|127\.0\.0\.1/i.test(parsed.hostname);
  } catch (_error) {
    return true;
  }
}

export function normalizeInternalUrl(raw, filePath, basePath = null) {
  if (raw == null) return null;
  let value = String(raw).trim().replace(/&amp;/g, "&");
  if (!value || value === "#" || value === "\"" || value === "'" || value.includes("${") || value.includes("' +")) return null;
  if (INTERNAL_PROTOCOL.test(value) || isExternalAbsolute(value)) return null;

  if (/^https?:/i.test(value)) {
    value = new URL(value).pathname + new URL(value).search + new URL(value).hash;
  } else if (!value.startsWith("/")) {
    const base = basePath || relativeBaseFor(filePath);
    value = path.posix.normalize(path.posix.join(base, value));
    if (!value.startsWith("/")) value = `/${value}`;
  }

  const cleanPath = value.split("#")[0].split("?")[0].replace(/\/+/g, "/") || "/";
  return { raw: String(raw), url: value, path: cleanPath };
}

export function physicalPathCandidates(cleanPath) {
  let p = cleanPath || "/";
  try {
    p = decodeURIComponent(p);
  } catch (_error) {
    // Keep original path.
  }
  if (p === "/") return [path.join(root, "index.html")];
  const noLead = p.replace(/^\/+/, "");
  if (p.endsWith("/")) return [path.join(root, noLead, "index.html")];
  if (p.endsWith("/index.html")) return [path.join(root, noLead)];
  if (path.extname(noLead)) return [path.join(root, noLead)];
  return [path.join(root, noLead, "index.html"), path.join(root, `${noLead}.html`)];
}

const routeExistsCache = new Map();
export function routeExists(cleanPath) {
  if (routeExistsCache.has(cleanPath)) return routeExistsCache.get(cleanPath);
  const value = physicalPathCandidates(cleanPath).some((candidate) => fs.existsSync(candidate));
  routeExistsCache.set(cleanPath, value);
  return value;
}

function stripRulePath(rulePath) {
  return String(rulePath || "").replace(/\/:path\*$/, "").replace(/\/+$/, "") || "/";
}

export function loadRedirectRules() {
  if (loadRedirectRules.cache) return loadRedirectRules.cache;
  const custom = readJson("_custom/redirects.json", { redirects: [] });
  loadRedirectRules.cache = Array.isArray(custom.redirects) ? custom.redirects : [];
  return loadRedirectRules.cache;
}

export function loadEndpointRules() {
  if (loadEndpointRules.cache) return loadEndpointRules.cache;
  const custom = readJson("_custom/endpoints.json", { endpoints: [], legacy: [] });
  const endpoints = Array.isArray(custom.endpoints) ? custom.endpoints : [];
  const newEndpoints = Array.isArray(custom.newEndpoints)
    ? custom.newEndpoints.map((item) => ({ ...item, source: item.source || item.route }))
    : [];
  const legacy = Array.isArray(custom.legacy) ? custom.legacy : [];
  const legacyDetails = Array.isArray(custom.legacyDetails)
    ? custom.legacyDetails.map((item) => ({ ...item, source: item.source || item.legacy || item.cleanRoute }))
    : [];
  const compatibility = [
    { method: "POST", source: "/api/products/add-comment" },
    { method: "GET", source: "/api/products/add-comment" },
    { method: "POST", source: "/api/products/unavailable-let-me-know" },
    { method: "GET", source: "/api/products/unavailable-let-me-know" }
  ];
  loadEndpointRules.cache = { endpoints: [...endpoints, ...newEndpoints, ...compatibility], legacy: [...legacy, ...legacyDetails] };
  return loadEndpointRules.cache;
}

const redirectCache = new Map();
export function redirectFor(cleanPath) {
  if (redirectCache.has(cleanPath)) return redirectCache.get(cleanPath);
  const rules = loadRedirectRules();
  for (const rule of rules) {
    const source = String(rule.source || "");
    const destination = String(rule.destination || "");
    if (!source || !destination) continue;
    if (source.endsWith("/:path*")) {
      const prefix = stripRulePath(source);
      if (cleanPath === prefix || cleanPath.startsWith(`${prefix}/`)) {
        const rest = cleanPath.slice(prefix.length).replace(/^\/+/, "");
        const value = destination.replace("/:path*", rest ? `/${rest}` : "");
        redirectCache.set(cleanPath, value);
        return value;
      }
    } else if (cleanPath === source || cleanPath === `${source}/`) {
      redirectCache.set(cleanPath, destination);
      return destination;
    }
  }
  redirectCache.set(cleanPath, "");
  return "";
}

const endpointCache = new Map();
export function endpointFor(cleanPath) {
  if (endpointCache.has(cleanPath)) return endpointCache.get(cleanPath);
  const { endpoints, legacy } = loadEndpointRules();
  const found = [...endpoints, ...legacy].find((rule) => {
    const source = String(rule.source || "").replace(/\/+$/, "") || "/";
    const pathValue = String(cleanPath || "").replace(/\/+$/, "") || "/";
    return source === pathValue;
  }) || null;
  endpointCache.set(cleanPath, found);
  return found;
}

const resolvableCache = new Map();
export function isResolvablePath(cleanPath) {
  if (resolvableCache.has(cleanPath)) return resolvableCache.get(cleanPath);
  let value = false;
  if (routeExists(cleanPath)) value = true;
  if (!value && endpointFor(cleanPath)) value = true;
  if (!value) {
    const redirected = redirectFor(cleanPath);
    if (redirected) value = routeExists(redirected) || endpointFor(redirected) || redirected.startsWith("/api/");
  }
  resolvableCache.set(cleanPath, value);
  return value;
}

function lastUsefulCapture(match) {
  for (let i = match.length - 1; i >= 1; i -= 1) {
    const value = match[i];
    if (value && value !== "\"" && value !== "'" && value !== "`") return value;
  }
  return "";
}

function contextKind(snippet, type) {
  const hay = snippet.toLowerCase();
  return {
    menu: /menu|submenu|nav|header|categor|dropdown|mega/.test(hay),
    mobileMenu: /mobile|hamb|drawer|offcanvas|menu-mobile/.test(hay),
    breadcrumb: /breadcrumb|breadcrumbs|bread-crumb|migalha/.test(hay),
    pagination: type === "next" || type === "prev" || /pagination|paginacao|rel=["'](?:next|prev)/.test(hay),
    related: /related|relacionad|produto-relacionado|compre-junto|quem-viu/.test(hay)
  };
}

function pushRecord(records, content, filePath, index, type, raw, basePath) {
  const normalized = normalizeInternalUrl(raw, filePath, basePath);
  if (!normalized) return;
  const snippet = content.slice(Math.max(0, index - 450), Math.min(content.length, index + 650));
  records.push({
    file: rel(filePath),
    type,
    raw: normalized.raw,
    url: normalized.url,
    path: normalized.path,
    exists: routeExists(normalized.path),
    resolvable: isResolvablePath(normalized.path),
    context: contextKind(snippet, type)
  });
}

export function extractInternalReferences(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const basePath = path.extname(filePath).toLowerCase() === ".html" ? htmlBase(content, filePath) : null;
  const records = [];
  const attrRegex = /(?<![-\w])(href|src|action|data-url)\s*=\s*(["'])(.*?)\2/ig;
  for (const match of content.matchAll(attrRegex)) {
    pushRecord(records, content, filePath, match.index || 0, match[1].toLowerCase(), match[3], basePath);
  }
  const patterns = [
    ["canonical", /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/ig],
    ["canonical", /<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/ig],
    ["next", /<link\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["'][^>]*>/ig],
    ["prev", /<link\b[^>]*rel=["']prev["'][^>]*href=["']([^"']+)["'][^>]*>/ig],
    ["meta-refresh", /<meta\b[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["'][^>]*>/ig],
    ["fetch", /fetch\(\s*(["'`])([^"'`]+)\1/ig],
    ["XMLHttpRequest", /\.open\(\s*(["'`])(?:GET|POST|PUT|PATCH|DELETE)\1\s*,\s*(["'`])([^"'`]+)\2/ig],
    ["window-location", /window\.location\.replace\(\s*(["'`])([^"'`]+)\1\s*\)/ig],
    ["window-location", /window\.location\.href\s*=\s*(["'`])([^"'`]+)\1/ig]
  ];
  for (const [type, pattern] of patterns) {
    for (const match of content.matchAll(pattern)) {
      pushRecord(records, content, filePath, match.index || 0, type, lastUsefulCapture(match), basePath);
    }
  }
  return records;
}

export function htmlFiles() {
  return walk(root, [], { predicate: (name) => name.toLowerCase().endsWith(".html") });
}

export function scanFiles() {
  return walk(root, [], { predicate: (name) => /\.(html|js|json|mjs|cjs)$/i.test(name) });
}

export function failOrPass(name, errors, summary = {}) {
  const outDir = path.join(root, "_validation");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = { generatedAt: new Date().toISOString(), name, ok: errors.length === 0, summary, errors };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(payload, null, 2), "utf8");
  if (errors.length) {
    console.error(`[${name}] FAIL ${errors.length}`);
    console.error(JSON.stringify(errors.slice(0, 20), null, 2));
    process.exit(1);
  }
  console.log(`[${name}] OK`);
  console.log(JSON.stringify(summary, null, 2));
}
