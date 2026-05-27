import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function fail(message) {
  failures.push(message);
}

function mustNotContain(relative, pattern, message) {
  const content = read(relative);
  if (pattern.test(content)) fail(`${relative}: ${message}`);
}

mustNotContain("server/lib/prices.js", /precos\.json|readFileSync|from\s+["']node:fs["']|from\s+["']fs["']/i, "server price helper must not read local price maps");
mustNotContain("server/app.js", /joinRoute\(prefix,\s*["']\/search["']\)\s*,\s*resolveLocalSearch/i, "local /api/search interception is not allowed");
mustNotContain("server/app.js", /joinRoute\(prefix,\s*["']\/products\/resolve-prices["']\)\s*,\s*resolveLocalPrices/i, "local resolve-prices interception is not allowed");
mustNotContain("preco-loader.js", /precos\.json|lookupPagePrice|lookupInlinePagePrice|lookupPrice/i, "public price loader must resolve prices through the backend only");
mustNotContain("produto-comprar.js", /precos\.json|_precoCache|getPrecoFromJson/i, "buy flow must not read local price maps");
mustNotContain("cart-manager.js", /precos\.json/i, "cart flow must not mention or depend on local price maps");

const runtime = read("assets/js/tech7-local-runtime.js");
if (!/\/api\/products\?/.test(runtime) || !/prices\[\]/.test(runtime)) {
  fail("assets/js/tech7-local-runtime.js: catalog filters must submit to /api/products and parse prices[]");
}
if (/1\.165/.test(runtime) || !/0\.125/.test(runtime) || !/MasterCard - Elo/.test(runtime)) {
  fail("assets/js/tech7-local-runtime.js: card installments must use the 12.50% payment-link fee formula");
}

const priceLoader = read("preco-loader.js");
if (/1\.165/.test(priceLoader) || !/PAYMENT_LINK_FEE_RATE\s*=\s*0\.125/.test(priceLoader) || !/MasterCard - Elo/.test(priceLoader)) {
  fail("preco-loader.js: synchronized card installments must use the 12.50% payment-link fee formula");
}

const productsRoute = read("server/routes/products.js");
if (!/price_cents\s*>=\s*200/.test(productsRoute)) {
  fail("server/routes/products.js: price filters must exclude products without valid backend price");
}
if (/sellPrice\s*\|\||priceSell\s*\|\|/.test(productsRoute)) {
  fail("server/routes/products.js: API route must not use HTML/dataLayer price fields");
}

if (failures.length) {
  console.error("[validate-backend-prices] FAIL");
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("[validate-backend-prices] OK");
