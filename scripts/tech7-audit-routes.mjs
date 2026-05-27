import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  root,
  publicCategoryGroups,
  knownLegacyEndpoints,
  newEndpoints,
  buildRouteIndex,
  categoryForRoute,
  cleanPathname,
  ensureDir,
  extractReferences,
  isLikelyProductRoute,
  isRouteCovered,
  listScannableFiles,
  productNameFromPage,
  readJsonIfExists,
  readVercelRoutes,
  rel,
  routeExists,
  vercelMatch,
  writeJson
} from "./tech7-route-core.mjs";

const validationDir = path.join(root, "_validation");
const customDir = path.join(root, "_custom");
const searchIndexPath = path.join(root, "_assets", "tech7", "search-index.json");
const priceMapPath = path.join(root, "precos.json");
const compatibilityApiEndpoints = [
  { method: "GET", route: "/api/cart/count-local" },
  { method: "GET", route: "/api/cart/preview" },
  { method: "GET", route: "/api/products/variant-gallery" },
  { method: "GET", route: "/api/products/variant-price" },
  { method: "GET", route: "/api/products/variant-reference" },
  { method: "GET", route: "/api/products/variant-form" },
  { method: "GET", route: "/api/products/load-next-variant-dropdown" },
  { method: "GET", route: "/api/products/payment-options" },
  { method: "GET", route: "/api/products/payment-options-details" },
  { method: "GET", route: "/api/products/shipping" },
  { method: "GET", route: "/api/products/question" },
  { method: "POST", route: "/api/products/resolve-prices" },
  { method: "POST", route: "/api/products/add-comment" },
  { method: "POST", route: "/api/products/unavailable-let-me-know" }
];

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function inc(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
}

function routeFromSearchUrl(value) {
  if (!value) return "";
  return cleanPathname(value);
}

function readSearchEvidence() {
  const counts = {};
  const index = readJsonIfExists(searchIndexPath, {});
  for (const item of Array.isArray(index?.items) ? index.items : []) {
    const route = routeFromSearchUrl(item.url || item.href);
    if (route) inc(counts, route);
  }
  return counts;
}

function readPriceEvidence() {
  const counts = {};
  const prices = readJsonIfExists(priceMapPath, {});
  if (!prices || typeof prices !== "object") return counts;
  for (const [section, brands] of Object.entries(prices)) {
    if (!brands || typeof brands !== "object") continue;
    for (const [brand, slugs] of Object.entries(brands)) {
      if (!slugs || typeof slugs !== "object") continue;
      let activeInBrand = 0;
      for (const [slug, price] of Object.entries(slugs)) {
        if (Number(price) > 0) {
          inc(counts, cleanPathname(`/${section}/${brand}/${slug}`));
          activeInBrand += 1;
        }
      }
      if (activeInBrand > 0) inc(counts, cleanPathname(`/${section}/${brand}`), activeInBrand);
    }
  }
  return counts;
}

function evidenceForRoute(route, page, referenceCounts, searchCounts, priceCounts) {
  const evidence = [];
  if (page && !page.isAlias) evidence.push("physical-page");
  if (page?.canonical === route) evidence.push("canonical");
  if (referenceCounts[route]) evidence.push("menu-link");
  if (searchCounts[route]) evidence.push("search-index");
  if (priceCounts[route]) evidence.push("price-map");
  if (page?.metaRefresh && page.metaRefresh !== route) evidence.push("meta-refresh-alias");
  return evidence;
}

function discoverCanonicals(routeIndex, refs, searchCounts, priceCounts) {
  const referenceCounts = {};
  for (const ref of refs) {
    if (ref.routePath) inc(referenceCounts, cleanPathname(ref.routePath));
  }

  const canonicals = [];
  for (const [group, candidates] of Object.entries(publicCategoryGroups)) {
    const rows = [];
    for (const candidate of candidates) {
      const route = cleanPathname(`/${candidate}`);
      const page = routeIndex.routes.get(route.toLowerCase()) || null;
      const evidence = evidenceForRoute(route, page, referenceCounts, searchCounts, priceCounts);
      const score = (page && !page.isAlias ? 10000 : 0)
        + (page?.canonical === route ? 5000 : 0)
        + (searchCounts[route] || 0) * 20
        + (priceCounts[route] || 0) * 5
        + (referenceCounts[route] || 0);
      rows.push({
        group,
        candidate: route,
        evidence,
        score,
        isCanonical: false,
        confidence: 0
      });
    }
    rows.sort((a, b) => b.score - a.score || b.evidence.length - a.evidence.length || a.candidate.localeCompare(b.candidate));
    const winner = rows[0];
    if (winner && winner.score > 0 && winner.evidence.includes("physical-page")) {
      winner.isCanonical = true;
      winner.confidence = 1;
    }
    canonicals.push(...rows);
  }
  return canonicals;
}

function buildProductMaps(routeIndex) {
  const products = [];
  const aliases = [];
  const bySlug = new Map();

  for (const page of routeIndex.pages) {
    const group = categoryForRoute(page.route);
    if (!group) continue;
    const parts = page.route.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const row = {
      route: page.route,
      file: page.file,
      title: page.title,
      productName: productNameFromPage(page),
      group,
      section: parts[0] || "",
      brand: parts.length >= 3 ? parts[1] : "",
      slug: parts.at(-1) || "",
      isAlias: page.isAlias,
      canonical: page.canonical,
      metaRefresh: page.metaRefresh
    };
    if (page.isAlias && (page.canonical || page.metaRefresh)) {
      aliases.push({
        sourceRoute: page.route,
        sourceFile: page.file,
        destination: page.metaRefresh || page.canonical,
        proof: page.metaRefresh ? "meta-refresh" : "canonical",
        exists: routeExists(routeIndex, page.metaRefresh || page.canonical),
        isLikelyProduct: isLikelyProductRoute(page.route)
      });
    } else {
      products.push(row);
      if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
      bySlug.get(row.slug).push(row);
    }
  }

  return { products, aliases, bySlug };
}

function buildRedirectCandidates(routeIndex, aliases, canonicals) {
  const candidates = [];
  for (const row of aliases) {
    if (!row.exists || row.sourceRoute === row.destination) continue;
    candidates.push({
      source: row.sourceRoute,
      destination: cleanPathname(row.destination),
      type: row.isLikelyProduct ? "product" : "category",
      method: "GET",
      strategy: "static-alias",
      proof: row.proof
    });
  }

  const canonicalByGroup = new Map(canonicals.filter((row) => row.isCanonical).map((row) => [row.group, row.candidate]));
  for (const row of canonicals) {
    if (row.isCanonical) continue;
    const destination = canonicalByGroup.get(row.group);
    if (!destination || row.candidate === destination) continue;
    if (!routeExists(routeIndex, destination)) continue;
    candidates.push({
      source: row.candidate,
      destination,
      type: "category",
      method: "GET",
      strategy: "vercel-redirect",
      proof: row.evidence.includes("physical-page") ? "physical-page" : "canonical"
    });
  }
  return candidates;
}

function buildEndpointMap(refs) {
  const endpointRows = [];
  for (const endpoint of knownLegacyEndpoints) {
    const clean = cleanPathname(endpoint);
    const hits = refs.filter((ref) => ref.routePath && cleanPathname(ref.routePath) === clean);
    endpointRows.push({
      legacy: endpoint,
      cleanRoute: clean,
      occurrences: hits.length,
      methods: Array.from(new Set(hits.map((hit) => hit.type === "action" ? "POST" : "GET"))),
      replacement: endpoint.includes("newsletter")
        ? "/api/newsletter"
        : endpoint.includes("contato")
          ? "/api/contact"
          : endpoint.includes("depoimento")
            ? "/api/testimonials"
            : endpoint.includes("busca") || endpoint.includes("catalogo")
              ? "/api/search"
              : endpoint.includes("cart") || endpoint.includes("redirect_cart")
                ? "/api/cart/add"
                : "/my-account",
      strategy: endpoint.includes("busca") || endpoint.includes("catalogo") || endpoint.includes("login") || endpoint.includes("logout") || endpoint.includes("redirect_cart")
        ? "vercel-rewrite"
        : "api-handler"
    });
  }
  return endpointRows;
}

function mapRefs(refs, routeIndex, contextName, predicate) {
  const vercelRoutes = readVercelRoutes();
  return refs
    .filter(predicate)
    .map((ref) => ({
      ...ref,
      ok: !ref.routePath || isRouteCovered(routeIndex, ref.routePath, vercelRoutes),
      coveredBy: ref.routePath && routeExists(routeIndex, ref.routePath)
        ? "physical-page"
        : ref.routePath && vercelMatch(ref.routePath, vercelRoutes.redirects)
          ? "vercel-redirect"
          : ref.routePath && vercelMatch(ref.routePath, vercelRoutes.rewrites)
            ? "vercel-rewrite"
            : ""
    }))
    .filter((ref) => ref.routePath || ref.raw)
    .map((ref) => ({ context: contextName, ...ref }));
}

function brokenLinks(routeIndex, refs) {
  const vercelRoutes = readVercelRoutes();
  const broken = refs
    .filter((ref) => ref.routePath && !looksIgnoredForRoute(ref.raw))
    .filter((ref) => !isRouteCovered(routeIndex, ref.routePath, vercelRoutes));
  const byPath = Array.from(groupBy(broken, (ref) => cleanPathname(ref.routePath)).entries())
    .map(([route, hits]) => ({
      path: route,
      count: hits.length,
      types: hits.reduce((acc, hit) => (inc(acc, hit.type), acc), {}),
      examples: hits.slice(0, 12).map(({ file, raw, type }) => ({ file, raw, type }))
    }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  return { broken, byPath };
}

function looksIgnoredForRoute(raw) {
  return /\.(avif|bmp|css|csv|eot|gif|ico|jpeg|jpg|js|json|map|mp3|mp4|otf|pdf|png|svg|ttf|txt|webm|webp|woff|woff2|xml)$/i
    .test(String(raw || "").split("#")[0].split("?")[0]);
}

function buildBlockers(brokenByPath, aliases, searchCounts, priceCounts) {
  const blockers = [];
  for (const row of brokenByPath) {
    blockers.push({
      type: "broken-route",
      route: row.path,
      count: row.count,
      reason: "route-not-physical-and-not-covered-by-current-vercel"
    });
  }
  for (const alias of aliases) {
    if (!alias.exists) {
      blockers.push({
        type: "alias-target-missing",
        route: alias.sourceRoute,
        destination: alias.destination,
        reason: "alias-destination-not-found"
      });
    }
    const activeProductEvidence = !!(searchCounts[alias.sourceRoute] || priceCounts[alias.sourceRoute]);
    if (activeProductEvidence && alias.isLikelyProduct && !isLikelyProductRoute(alias.destination)) {
      blockers.push({
        type: "wrong-product-redirect",
        route: alias.sourceRoute,
        destination: alias.destination,
        reason: "product-alias-points-to-non-product"
      });
    }
  }
  return blockers;
}

export function runAudit({ writeCustomMaps = false } = {}) {
  ensureDir(validationDir);
  const routeIndex = buildRouteIndex();
  const files = listScannableFiles();
  const refs = [];
  for (const file of files) refs.push(...extractReferences(file));

  const searchCounts = readSearchEvidence();
  const priceCounts = readPriceEvidence();
  const canonicals = discoverCanonicals(routeIndex, refs, searchCounts, priceCounts);
  const { products, aliases } = buildProductMaps(routeIndex);
  const redirectCandidates = buildRedirectCandidates(routeIndex, aliases, canonicals);
  const endpoints = buildEndpointMap(refs);
  const broken = brokenLinks(routeIndex, refs);
  const blockers = buildBlockers(broken.byPath, aliases, searchCounts, priceCounts);
  const generatedAt = new Date().toISOString();

  writeJson(path.join(validationDir, "routes-inventory.json"), {
    generatedAt,
    routeCount: routeIndex.pages.length,
    routes: routeIndex.pages.map((page) => page.route).sort(),
    categorySummary: Object.fromEntries(Object.entries(publicCategoryGroups).map(([group, candidates]) => [
      group,
      candidates.map((candidate) => ({
        route: `/${candidate}`,
        exists: routeExists(routeIndex, `/${candidate}`),
        pages: routeIndex.pages.filter((page) => page.route === `/${candidate}` || page.route.startsWith(`/${candidate}/`)).length
      }))
    ]))
  });
  writeJson(path.join(validationDir, "physical-pages-inventory.json"), {
    generatedAt,
    htmlFileCount: routeIndex.pages.length,
    pages: routeIndex.pages
  });
  writeJson(path.join(validationDir, "menu-routes-map.json"), {
    generatedAt,
    routes: mapRefs(refs, routeIndex, "desktop-menu", (ref) => ref.context === "menu" && ref.type === "href")
  });
  writeJson(path.join(validationDir, "submenu-routes-map.json"), {
    generatedAt,
    routes: mapRefs(refs, routeIndex, "submenu", (ref) => ref.context === "menu" && /second-nivel|sub/i.test(ref.raw + ref.file))
  });
  writeJson(path.join(validationDir, "mobile-menu-routes-map.json"), {
    generatedAt,
    routes: mapRefs(refs, routeIndex, "mobile-menu", (ref) => ref.context === "menu")
  });
  writeJson(path.join(validationDir, "breadcrumbs-map.json"), {
    generatedAt,
    routes: mapRefs(refs, routeIndex, "breadcrumbs", (ref) => ref.context === "breadcrumb")
  });
  writeJson(path.join(validationDir, "pagination-map.json"), {
    generatedAt,
    routes: mapRefs(refs, routeIndex, "pagination", (ref) => ref.context === "pagination" || ref.type === "next" || ref.type === "prev")
  });
  writeJson(path.join(validationDir, "related-products-map.json"), {
    generatedAt,
    routes: mapRefs(refs, routeIndex, "related-products", (ref) => ref.context === "product")
  });
  writeJson(path.join(validationDir, "product-routes-map.json"), {
    generatedAt,
    productCount: products.length,
    products
  });
  writeJson(path.join(validationDir, "product-alias-map.json"), {
    generatedAt,
    aliasCount: aliases.length,
    aliases
  });
  writeJson(path.join(validationDir, "legacy-endpoints-map.json"), {
    generatedAt,
    endpoints,
    newEndpoints
  });
  writeJson(path.join(validationDir, "broken-links-before.json"), {
    generatedAt,
    brokenReferenceCount: broken.broken.length,
    uniqueBrokenPathCount: broken.byPath.length,
    byPath: broken.byPath
  });
  writeJson(path.join(validationDir, "redirect-candidates.json"), {
    generatedAt,
    count: redirectCandidates.length,
    candidates: redirectCandidates
  });
  writeJson(path.join(validationDir, "blockers-before.json"), {
    generatedAt,
    count: blockers.length,
    blockers
  });
  writeJson(path.join(validationDir, "canonical-candidates.json"), {
    generatedAt,
    candidates: canonicals
  });

  if (writeCustomMaps) {
    throw new Error(
      "--write-custom is disabled. This audit can generate broad candidates, but active route config must be written by the reviewed safe map."
    );
  }

  return {
    generatedAt,
    routeCount: routeIndex.pages.length,
    refs: refs.length,
    products: products.length,
    aliases: aliases.length,
    brokenReferenceCount: broken.broken.length,
    uniqueBrokenPathCount: broken.byPath.length,
    blockers: blockers.length,
    canonicals: canonicals.filter((row) => row.isCanonical)
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const writeCustomMaps = process.argv.includes("--write-custom");
  const result = runAudit({ writeCustomMaps });
  console.log(JSON.stringify(result, null, 2));
}
