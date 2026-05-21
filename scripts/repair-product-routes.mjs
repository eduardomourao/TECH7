import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const searchIndexPath = path.join(root, "_assets", "tech7", "search-index.json");
const marker = "TECH7_PRODUCT_ALIAS_PAGE";
const missingReportPath = path.join(root, "ROUTE-AUDIT-MISSING-PRODUCTS.md");

const publicCategoryDirs = new Set([
  "baterias",
  "baterias-celular",
  "display-e-lcd",
  "tela-display-lcd",
  "touchs-e-visores",
  "touch-e-visor",
  "pecas-e-componentes",
  "tampas-e-carcacas",
  "maquinas-e-ferramentas",
  "suprimentos"
]);

const categoryAliases = {
  "baterias": ["baterias", "baterias-celular", "bateria", "bateria-celular"],
  "baterias-celular": ["baterias-celular", "baterias", "bateria", "bateria-celular"],
  "display-e-lcd": ["display-e-lcd", "tela-display-lcd", "display", "display-lcd", "telas", "telas-display-lcd"],
  "tela-display-lcd": ["tela-display-lcd", "display-e-lcd", "display", "display-lcd", "telas", "telas-display-lcd"],
  "touchs-e-visores": ["touchs-e-visores", "touch-e-visor", "touchs-visores", "touch-visor", "touch"],
  "touch-e-visor": ["touch-e-visor", "touchs-e-visores", "touchs-visores", "touch-visor", "touch"],
  "pecas-e-componentes": ["pecas-e-componentes", "pecas-componentes", "componentes", "pecas"],
  "tampas-e-carcacas": ["tampas-e-carcacas", "tampas-carcacas", "carcacas", "tampas"],
  "maquinas-e-ferramentas": ["maquinas-e-ferramentas", "maquinas-ferramentas", "ferramentas"],
  "suprimentos": ["suprimentos"]
};

const skipDirNames = new Set([
  ".git",
  ".vercel",
  ".claude",
  "node_modules",
  "backend",
  "server",
  "api",
  "scripts",
  "_assets"
]);

let htmlFileCache = null;
const routeStateCache = new Map();

function cleanRoute(value) {
  let route = String(value || "").trim();
  if (!route) return "";
  route = route.replace(/\\/g, "/");
  route = route.replace(/^https?:\/\/[^/]+/i, "");
  route = route.split("#")[0].split("?")[0];
  try {
    route = decodeURIComponent(route);
  } catch {
    // Keep the original route if it has malformed escapes.
  }
  return route
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .toLowerCase();
}

function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listHtmlFiles(dir = root, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue;
      listHtmlFiles(path.join(dir, entry.name), output);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      output.push(path.join(dir, entry.name));
    }
  }
  return output;
}

function getHtmlFiles() {
  if (!htmlFileCache) htmlFileCache = listHtmlFiles(root);
  return htmlFileCache;
}

function toPosixRel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function routeFile(route) {
  return path.join(root, ...route.split("/"), "index.html");
}

function fileRoute(filePath) {
  const rel = toPosixRel(filePath);
  if (rel === "index.html") return "";
  if (!rel.endsWith("/index.html")) return null;
  return cleanRoute(rel.replace(/\/index\.html$/i, ""));
}

function buildRouteStateCache() {
  routeStateCache.clear();
  for (const file of getHtmlFiles()) {
    const route = fileRoute(file);
    if (route === null) continue;
    const content = fs.readFileSync(file, "utf8");
    routeStateCache.set(route, content.includes(marker) ? "alias" : "real");
  }
}

function routeExists(route) {
  const clean = cleanRoute(route);
  return routeStateCache.has(clean);
}

function isAliasFile(filePath) {
  const route = fileRoute(filePath);
  if (route !== null && routeStateCache.has(route)) return routeStateCache.get(route) === "alias";
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, "utf8").includes(marker);
}

function aliasHtml(title, canonicalRoute) {
  const canonical = `/${canonicalRoute}/`;
  const safeTitle = htmlEscape(title || "Produto TECH 7");
  const safeCanonical = htmlEscape(canonical);
  const jsTarget = JSON.stringify(canonical);
  return `<!DOCTYPE html>
<!-- ${marker} -->
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} - TECH 7</title>
  <link rel="canonical" href="${safeCanonical}">
  <meta http-equiv="refresh" content="0;url=${safeCanonical}">
  <meta name="robots" content="noindex,follow">
</head>
<body>
  <script>window.location.replace(${jsTarget});</script>
  <p>Redirecionando para <a href="${safeCanonical}">${safeTitle}</a>.</p>
</body>
</html>
`;
}

function addProduct(productsByRoute, productsBySlug, route, title = "") {
  const clean = cleanRoute(route);
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2 || !publicCategoryDirs.has(parts[0])) return;
  const file = routeFile(clean);
  if (!fs.existsSync(file) || isAliasFile(file)) return;

  const existing = productsByRoute.get(clean);
  if (existing) {
    if (!existing.title && title) existing.title = title;
    return;
  }

  const product = {
    route: clean,
    slug: parts.at(-1),
    section: parts[0],
    brand: parts.length >= 3 ? parts[1] : "",
    title
  };
  productsByRoute.set(clean, product);
  if (!productsBySlug.has(product.slug)) productsBySlug.set(product.slug, []);
  productsBySlug.get(product.slug).push(product);
}

function buildProductIndex() {
  const productsByRoute = new Map();
  const productsBySlug = new Map();

  if (fs.existsSync(searchIndexPath)) {
    const index = readJson(searchIndexPath);
    for (const item of Array.isArray(index.items) ? index.items : []) {
      addProduct(productsByRoute, productsBySlug, item.url, item.title || item.name || "");
    }
  }

  for (const htmlFile of getHtmlFiles()) {
    const rel = toPosixRel(htmlFile);
    if (!rel.endsWith("/index.html")) continue;
    const route = cleanRoute(rel.replace(/\/index\.html$/i, ""));
    const parts = route.split("/").filter(Boolean);
    if (parts.length < 2 || !publicCategoryDirs.has(parts[0])) continue;
    addProduct(productsByRoute, productsBySlug, route, "");
  }

  return { productsByRoute, productsBySlug };
}

function createAlias(aliasRoute, canonicalRoute, title, stats) {
  const alias = cleanRoute(aliasRoute);
  const canonical = cleanRoute(canonicalRoute);
  if (!alias || !canonical || alias === canonical) return false;
  if (!routeExists(canonical)) {
    stats.skippedAliasesMissingCanonical += 1;
    return false;
  }
  if (routeExists(alias) && !isAliasFile(routeFile(alias))) {
    stats.skippedAliasesExistingRealPage += 1;
    return false;
  }

  const file = routeFile(alias);
  const nextHtml = aliasHtml(title, canonical);
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (!current.includes(marker)) {
      stats.skippedAliasesExistingRealPage += 1;
      return false;
    }
    if (current !== nextHtml) {
      fs.writeFileSync(file, nextHtml, "utf8");
      routeStateCache.set(alias, "alias");
      stats.updatedAliases += 1;
      return true;
    }
    stats.unchangedAliases += 1;
    return false;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, nextHtml, "utf8");
  routeStateCache.set(alias, "alias");
  stats.createdAliases += 1;
  return true;
}

function addGlobalAliases(productsByRoute, stats) {
  for (const product of productsByRoute.values()) {
    const aliases = new Set();
    aliases.add(`${product.section}/${product.slug}`);
    const sectionAliases = categoryAliases[product.section] || [product.section];
    for (const section of sectionAliases) {
      aliases.add(`${section}/${product.slug}`);
      if (product.brand) aliases.add(`${section}/${product.brand}/${product.slug}`);
    }
    for (const alias of aliases) {
      createAlias(alias, product.route, product.title, stats);
    }
  }
}

function hrefToRoute(href, sourceFile) {
  const value = String(href || "").trim();
  if (!value || value.startsWith("#") || value.startsWith("javascript:")) return null;
  if (/^(mailto|tel|whatsapp):/i.test(value)) return null;
  if (/^https?:\/\//i.test(value) && !/^https?:\/\/([^/]+\.)?tech-7\.vercel\.app/i.test(value)) {
    return null;
  }
  if (/^https?:\/\/(api\.whatsapp|wa\.me|www\.whatsapp)/i.test(value)) return null;

  const rel = toPosixRel(sourceFile);
  const sourceDir = rel.endsWith("/index.html") ? rel.replace(/\/index\.html$/i, "") : path.posix.dirname(rel);
  const base = `https://local.test/${sourceDir ? `${sourceDir}/` : ""}`;
  let url;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== "https://local.test" && !/tech-7\.vercel\.app$/i.test(url.hostname)) return null;
  return cleanRoute(url.pathname);
}

function relativeHref(sourceFile, targetRoute) {
  const rel = toPosixRel(sourceFile);
  const sourceDir = rel.endsWith("/index.html") ? path.posix.dirname(rel) : path.posix.dirname(rel);
  const target = `${targetRoute}/index.html`;
  let href = path.posix.relative(sourceDir === "." ? "." : sourceDir, target);
  if (!href.startsWith(".") && !href.startsWith("/")) return href;
  return href;
}

function isProductLike(route, productsBySlug) {
  const clean = cleanRoute(route);
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  if (publicCategoryDirs.has(parts[0])) return true;
  if (Object.values(categoryAliases).some((aliases) => aliases.includes(parts[0]))) return true;
  return productsBySlug.has(parts.at(-1));
}

function pickCandidate(route, sourceFile, productsBySlug) {
  const clean = cleanRoute(route);
  const parts = clean.split("/").filter(Boolean);
  const slug = parts.at(-1);
  const candidates = productsBySlug.get(slug) || [];
  if (!candidates.length) return null;

  const sourceRel = toPosixRel(sourceFile);
  const sourceSection = sourceRel.split("/")[0];
  const scored = candidates.map((candidate) => {
    let score = 0;
    if (candidate.section === parts[0]) score += 20;
    if (parts.length >= 3 && candidate.brand === parts[1]) score += 10;
    if (candidate.section === sourceSection) score += 4;
    if (candidate.route.includes(`/${parts[1]}/`)) score += 2;
    return { candidate, score };
  }).sort((a, b) => b.score - a.score || a.candidate.route.localeCompare(b.candidate.route));

  return scored[0].candidate;
}

function repairInternalLinks(productsByRoute, productsBySlug, stats) {
  const unresolved = new Map();
  const htmlFiles = getHtmlFiles();

  for (const file of htmlFiles) {
    const original = fs.readFileSync(file, "utf8");
    const replacements = [];
    const hrefRegex = /\bhref\s*=\s*(["'])(.*?)\1/gi;
    let match;

    while ((match = hrefRegex.exec(original))) {
      stats.hrefsScanned += 1;
      const [full, quote, href] = match;
      const route = hrefToRoute(href, file);
      if (route === null) continue;
      if (!route || routeExists(route)) continue;
      if (!isProductLike(route, productsBySlug)) continue;

      stats.brokenProductHrefs += 1;
      const candidate = pickCandidate(route, file, productsBySlug);
      if (!candidate) {
        const key = `${route}|${href}`;
        if (!unresolved.has(key)) {
          unresolved.set(key, {
            route,
            href,
            sources: new Set(),
            reason: "No matching product folder found by slug"
          });
        }
        unresolved.get(key).sources.add(toPosixRel(file));
        continue;
      }

      createAlias(route, candidate.route, candidate.title, stats);
      const nextHref = relativeHref(file, candidate.route);
      if (href !== nextHref) {
        const replacement = `href=${quote}${nextHref}${quote}`;
        replacements.push({
          start: match.index,
          end: match.index + full.length,
          replacement
        });
        stats.hrefsRewritten += 1;
      }
    }

    if (replacements.length) {
      let next = original;
      for (const replacement of replacements.reverse()) {
        next = `${next.slice(0, replacement.start)}${replacement.replacement}${next.slice(replacement.end)}`;
      }
      fs.writeFileSync(file, next, "utf8");
      stats.filesRewritten += 1;
    }
  }

  return [...unresolved.values()].map((item) => ({
    ...item,
    sources: [...item.sources].sort()
  }));
}

function writeMissingReport(unresolved, stats) {
  const lines = [
    "# Route Audit - Missing Product Pages",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Products indexed from verified folders: ${stats.productsIndexed}`,
    `- Hrefs scanned: ${stats.hrefsScanned}`,
    `- Broken product hrefs found: ${stats.brokenProductHrefs}`,
    `- Hrefs rewritten to canonical product pages: ${stats.hrefsRewritten}`,
    `- Alias pages created: ${stats.createdAliases}`,
    `- Alias pages updated: ${stats.updatedAliases}`,
    `- Unresolved product routes: ${unresolved.length}`,
    ""
  ];

  if (!unresolved.length) {
    lines.push("## Missing Products", "", "No unresolved product page was found after folder-by-folder verification.", "");
  } else {
    lines.push("## Missing Products", "");
    for (const item of unresolved) {
      lines.push(`### ${item.route}`);
      lines.push(`- Original href: ${item.href}`);
      lines.push(`- Reason: ${item.reason}`);
      lines.push(`- Source files: ${item.sources.slice(0, 20).join(", ")}`);
      if (item.sources.length > 20) lines.push(`- Additional source files: ${item.sources.length - 20}`);
      lines.push("");
    }
  }

  fs.writeFileSync(missingReportPath, `${lines.join("\n")}\n`, "utf8");
}

const stats = {
  productsIndexed: 0,
  hrefsScanned: 0,
  brokenProductHrefs: 0,
  hrefsRewritten: 0,
  filesRewritten: 0,
  createdAliases: 0,
  updatedAliases: 0,
  unchangedAliases: 0,
  skippedAliasesExistingRealPage: 0,
  skippedAliasesMissingCanonical: 0
};

buildRouteStateCache();
const { productsByRoute, productsBySlug } = buildProductIndex();
stats.productsIndexed = productsByRoute.size;

addGlobalAliases(productsByRoute, stats);
const unresolved = repairInternalLinks(productsByRoute, productsBySlug, stats);
writeMissingReport(unresolved, stats);

console.log(JSON.stringify({
  ...stats,
  unresolvedProductRoutes: unresolved.length,
  missingReport: path.relative(root, missingReportPath).replace(/\\/g, "/")
}, null, 2));
