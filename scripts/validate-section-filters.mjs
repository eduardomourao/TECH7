import fs from "node:fs";
import assert from "node:assert/strict";

import {
  resolveSectionFilterValues,
  rowMatchesSection
} from "../server/lib/product-filters.js";

import {
  resolveSectionFilterValues as resolveBackendSectionFilterValues
} from "../backend/src/utils/product-filters.js";

function same(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
}

same(resolveSectionFilterValues("baterias-celular"), ["baterias", "baterias-celular"], "baterias alias");
same(resolveSectionFilterValues("baterias"), ["baterias", "baterias-celular"], "baterias legacy");
same(resolveSectionFilterValues("display-e-lcd"), ["display", "display-e-lcd"], "display alias");
same(resolveSectionFilterValues("tela-display-lcd"), ["display", "display-e-lcd"], "display canonical page alias");
same(resolveSectionFilterValues("touch-e-visor"), ["touchs-e-visores"], "touch alias");
same(resolveSectionFilterValues("pecas-componentes"), ["pecas-e-componentes"], "pecas alias");
same(resolveSectionFilterValues("tampas-carcacas"), ["tampas-e-carcacas"], "tampas alias");

same(resolveBackendSectionFilterValues("baterias-celular"), ["baterias", "baterias-celular"], "backend baterias alias");
same(resolveBackendSectionFilterValues("display-e-lcd"), ["display", "display-e-lcd"], "backend display alias");

assert.equal(rowMatchesSection("baterias", "baterias-celular"), true, "baterias-celular must include baterias");
assert.equal(rowMatchesSection("baterias-celular", "baterias"), true, "baterias must include baterias-celular");
assert.equal(rowMatchesSection("display", "display-e-lcd"), true, "display-e-lcd must include display");
assert.equal(rowMatchesSection("display-e-lcd", "tela-display-lcd"), true, "tela-display-lcd must include display-e-lcd");
assert.equal(rowMatchesSection("pecas-e-componentes", "baterias-celular"), false, "baterias must not include pecas");

const backendProducts = fs.readFileSync("backend/src/routes/products.js", "utf8");
assert.equal(
  /eq\(["']category["']\s*,\s*cat\)/.test(backendProducts),
  false,
  "backend product filter must not query category; actual products table uses section"
);
assert.match(
  backendProducts,
  /\.in\(["']section["']\s*,\s*sections\)/,
  "backend product filter must query section aliases with in()"
);

const searchIndex = JSON.parse(fs.readFileSync("_assets/tech7/search-index.json", "utf8"));
const counts = new Map();
for (const item of searchIndex.items || []) {
  const category = String(item.category || item.section || "");
  counts.set(category, (counts.get(category) || 0) + 1);
}

assert.ok((counts.get("baterias") || 0) > 0, "search index must contain legacy baterias values");
assert.ok((counts.get("display") || 0) > 0, "search index must contain legacy display values");
assert.ok((counts.get("display-e-lcd") || 0) > 0, "search index must contain display-e-lcd values");

console.log("[validate-section-filters] OK");
