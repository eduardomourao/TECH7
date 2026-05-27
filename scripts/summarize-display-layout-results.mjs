import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapPath = path.join(root, '_validation', 'display-products-map.json');
const fullPath = path.join(root, '_validation', 'display-all-product-layout-results.json');
const outPath = path.join(root, '_validation', 'display-layout-summary.json');

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
const mappedRoutes = new Set(map.models.filter((item) => item.included).map((item) => item.route));
const results = full.results.filter((item) => mappedRoutes.has(item.route));

const layoutFailures = results.filter((item) => {
  return !item.checks.httpOk || !item.checks.titleOk || !item.checks.priceOk || !item.checks.structureOk;
});

const commerceWarnings = results.filter((item) => {
  return item.checks.httpOk && item.checks.titleOk && item.checks.priceOk && item.checks.structureOk && !item.checks.hasBuyButton;
});

const imageWarnings = results.filter((item) => {
  return item.checks.httpOk && item.checks.titleOk && item.checks.priceOk && item.checks.structureOk && !item.checks.hasMainImage;
});

const summary = {
  generatedAt: new Date().toISOString(),
  mappedModels: map.totalMappedModels,
  testedMappedModels: results.length,
  layoutPassed: results.length - layoutFailures.length,
  layoutFailed: layoutFailures.length,
  layoutFailures: layoutFailures.map((item) => ({
    route: item.route,
    name: item.name,
    checks: item.checks,
    titleX: item.title?.x ?? null,
    priceX: item.price?.x ?? null,
    finalUrl: item.finalUrl,
  })),
  nonLayoutWarnings: {
    noBuyButton: commerceWarnings.length,
    noMainImage: imageWarnings.length,
    noBuyButtonRoutes: commerceWarnings.map((item) => item.route),
    noMainImageRoutes: imageWarnings.map((item) => item.route),
  },
};

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  mappedModels: summary.mappedModels,
  testedMappedModels: summary.testedMappedModels,
  layoutPassed: summary.layoutPassed,
  layoutFailed: summary.layoutFailed,
  noBuyButtonWarnings: summary.nonLayoutWarnings.noBuyButton,
  noMainImageWarnings: summary.nonLayoutWarnings.noMainImage,
}, null, 2));

if (summary.layoutFailed > 0) {
  process.exitCode = 1;
}
