import fs from "node:fs";
import path from "node:path";

export const CATALOG_ROUTE_SECTIONS = [
  "baterias",
  "baterias-celular",
  "display",
  "display-e-lcd",
  "pecas-e-componentes",
  "tampas-e-carcacas",
  "touchs-e-visores"
];

let routeIndex = null;

function normalizeSegment(value) {
  try {
    value = decodeURIComponent(String(value || ""));
  } catch {
    value = String(value || "");
  }

  return value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html?$/i, "")
    .toLowerCase();
}

function isSafeSegment(value) {
  return /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

function catalogIndexPath(staticDir) {
  return path.join(staticDir, "_assets", "tech7", "search-index.json");
}

function loadRouteIndex(staticDir) {
  if (routeIndex) return routeIndex;

  const bySectionAndSlug = new Map();
  const subcategories = new Map();
  const file = catalogIndexPath(staticDir);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));

  for (const item of data.items || []) {
    const cleanUrl = String(item.url || "")
      .replace(/^\/+/, "")
      .replace(/\/index\.html?$/i, "");
    const parts = cleanUrl.split("/").filter(Boolean);
    if (parts.length < 3) continue;

    const section = normalizeSegment(parts[0]);
    const slug = normalizeSegment(parts[parts.length - 1]);
    if (!CATALOG_ROUTE_SECTIONS.includes(section) || !slug) continue;

    if (parts.length === 2) {
      bySectionAndSlug.set(`${section}/${slug}`, `/${cleanUrl}/`);
      continue;
    }

    const subcategory = normalizeSegment(parts[1]);
    if (subcategory) subcategories.set(`${section}/${subcategory}`, `/${section}/${subcategory}/`);
    bySectionAndSlug.set(`${section}/${slug}`, `/${cleanUrl}/`);
  }

  routeIndex = { bySectionAndSlug, subcategories };
  return routeIndex;
}

function existingShortPath(staticDir, section, slug) {
  const target = path.resolve(staticDir, section, slug, "index.html");
  const root = path.resolve(staticDir);
  if (!target.startsWith(root + path.sep)) return null;
  return fs.existsSync(target) ? `/${section}/${slug}/` : null;
}

export function resolveShortCatalogRoute({ staticDir, section, slug } = {}) {
  const cleanSection = normalizeSegment(section);
  const cleanSlug = normalizeSegment(slug);

  if (!CATALOG_ROUTE_SECTIONS.includes(cleanSection)) return null;
  if (!isSafeSegment(cleanSlug)) return null;

  const index = loadRouteIndex(staticDir);
  const key = `${cleanSection}/${cleanSlug}`;
  return (
    index.subcategories.get(key)
    || index.bySectionAndSlug.get(key)
    || existingShortPath(staticDir, cleanSection, cleanSlug)
    || null
  );
}
