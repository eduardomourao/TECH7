import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const SEARCH_INDEX_PATH = path.join(ROOT_DIR, "_assets", "tech7", "search-index.json");

let searchIndexByKey;
let routeAliasByPath;

export function normalizeProductSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

function normalizeRoutePath(value) {
  let clean = String(value || "").trim().replace(/\\/g, "/");
  if (!clean) return "";

  if (/^https?:\/\//i.test(clean)) {
    try {
      clean = new URL(clean).pathname;
    } catch (e) {
      return "";
    }
  }

  clean = clean.split("#")[0].split("?")[0].replace(/^\/+|\/+$/g, "");
  if (!clean || /['"<>\s]|(?:\+)|(?:productUrl\()/i.test(clean)) return "";
  if (!/^[a-z0-9._~/%-]+$/i.test(clean)) return "";
  if (!clean.endsWith(".html")) clean += "/index.html";
  return clean;
}

function routeExists(routePath) {
  const clean = normalizeRoutePath(routePath);
  if (!clean) return false;
  return fs.existsSync(path.join(ROOT_DIR, ...clean.split("/")));
}

function slugFromRoute(routePath) {
  const clean = normalizeRoutePath(routePath);
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  const tail = parts[parts.length - 1] === "index.html" ? parts[parts.length - 2] : parts[parts.length - 1];
  return normalizeProductSegment(tail);
}

function indexKey(section, brand, slug) {
  return [section, brand, slug].join("|");
}

function cleanRouteKey(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .toLowerCase();
}

function addRouteAlias(map, source, destination) {
  const key = cleanRouteKey(source);
  const target = normalizeRoutePath(destination);
  if (!key || !target) return;
  if (!map.has(key)) map.set(key, target);
}

function loadRouteAliases() {
  if (routeAliasByPath) return routeAliasByPath;

  routeAliasByPath = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, "utf8"));
    const items = Array.isArray(parsed?.items) ? parsed.items : [];

    for (const item of items) {
      const routePath = normalizeRoutePath(item?.url);
      if (!routePath) continue;

      const cleanRoute = cleanRouteKey(routePath);
      const parts = cleanRoute.split("/").filter(Boolean);
      const section = normalizeProductSegment(parts[0] || item?.category);
      const brand = normalizeProductSegment(item?.brand);
      const slug = normalizeProductSegment(item?.slug || parts[parts.length - 1]);
      if (!section || !slug) continue;

      addRouteAlias(routeAliasByPath, cleanRoute, routePath);
      addRouteAlias(routeAliasByPath, `${section}/${slug}`, routePath);
      if (brand && brand !== section && brand !== "tech7" && brand !== "catalogo") {
        addRouteAlias(routeAliasByPath, `${section}/${brand}/${slug}`, routePath);
      }
    }
  } catch (e) {
    routeAliasByPath = new Map();
  }

  return routeAliasByPath;
}

function loadSearchIndex() {
  if (searchIndexByKey) return searchIndexByKey;

  searchIndexByKey = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, "utf8"));
    const items = Array.isArray(parsed?.items) ? parsed.items : [];

    for (const item of items) {
      const routePath = normalizeRoutePath(item?.url);
      if (!routePath) continue;

      const section = normalizeProductSegment(item?.category || routePath.split("/")[0]);
      const brand = normalizeProductSegment(item?.brand);
      const slug = normalizeProductSegment(item?.slug || slugFromRoute(routePath));
      if (!slug) continue;

      const keys = [
        indexKey(section, brand, slug),
        indexKey(section, "", slug),
        indexKey("", brand, slug),
        indexKey("", "", slug)
      ];

      for (const key of keys) {
        if (!searchIndexByKey.has(key)) searchIndexByKey.set(key, routePath);
      }
    }
  } catch (e) {
    searchIndexByKey = new Map();
  }

  return searchIndexByKey;
}

export function productUrlFromRow(row) {
  const section = normalizeProductSegment(row?.section);
  const brand = normalizeProductSegment(row?.brand);
  const slug = normalizeProductSegment(row?.slug);
  if (!slug) return "";

  const indexed = loadSearchIndex().get(indexKey(section, brand, slug))
    || loadSearchIndex().get(indexKey(section, "", slug))
    || loadSearchIndex().get(indexKey("", brand, slug))
    || loadSearchIndex().get(indexKey("", "", slug));

  const hasBrand = brand && brand !== section && brand !== "tech7" && brand !== "catalogo";
  const candidates = [
    indexed,
    section && hasBrand ? `${section}/${brand}/${slug}/index.html` : "",
    section ? `${section}/${slug}/index.html` : "",
    hasBrand ? `${brand}/${slug}/index.html` : "",
    `${slug}/index.html`
  ].filter(Boolean);

  for (const candidate of candidates) {
    const clean = normalizeRoutePath(candidate);
    if (clean && routeExists(clean)) return clean;
  }

  return normalizeRoutePath(indexed || candidates[0] || "");
}

export function resolveProductRoutePath(requestPath) {
  const key = cleanRouteKey(requestPath);
  if (!key) return "";

  const direct = normalizeRoutePath(key);
  if (direct && routeExists(direct)) return direct;

  const indexed = loadRouteAliases().get(key);
  if (indexed && routeExists(indexed)) return indexed;

  return "";
}
