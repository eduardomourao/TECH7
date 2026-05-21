import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "_assets", "tech7", "search-index.json");
const marker = "TECH7_PRODUCT_ALIAS_PAGE";

function cleanRoute(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "");
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

function aliasHtml(title, canonical) {
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

const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const items = Array.isArray(parsed.items) ? parsed.items : [];
let created = 0;
let updated = 0;
let skippedExisting = 0;
let skippedInvalid = 0;

for (const item of items) {
  const canonicalRoute = cleanRoute(item.url);
  const parts = canonicalRoute.split("/").filter(Boolean);
  const section = parts[0];
  const slug = cleanRoute(item.slug || parts[parts.length - 1]);
  if (!section || !slug || !canonicalRoute) {
    skippedInvalid += 1;
    continue;
  }

  const aliasRoute = `${section}/${slug}`;
  if (aliasRoute === canonicalRoute) {
    skippedExisting += 1;
    continue;
  }

  const aliasFile = path.join(root, ...aliasRoute.split("/"), "index.html");
  const canonicalFile = path.join(root, ...canonicalRoute.split("/"), "index.html");
  if (!fs.existsSync(canonicalFile)) {
    skippedInvalid += 1;
    continue;
  }

  const canonicalUrl = `/${canonicalRoute}/`;
  const nextHtml = aliasHtml(item.title || item.name || slug, canonicalUrl);
  if (fs.existsSync(aliasFile)) {
    const current = fs.readFileSync(aliasFile, "utf8");
    if (!current.includes(marker)) {
      skippedExisting += 1;
      continue;
    }
    if (current !== nextHtml) {
      fs.writeFileSync(aliasFile, nextHtml, "utf8");
      updated += 1;
    }
    continue;
  }

  fs.mkdirSync(path.dirname(aliasFile), { recursive: true });
  fs.writeFileSync(aliasFile, nextHtml, "utf8");
  created += 1;
}

console.log(JSON.stringify({ items: items.length, created, updated, skippedExisting, skippedInvalid }, null, 2));
