import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportDir = path.join(root, "_validation");
const reportPath = path.join(reportDir, "realme-display-canonical-report.json");

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function findMatchingBracket(text, openIndex) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function listProducts(html) {
  const key = '"listProducts":';
  const start = html.indexOf(key);
  if (start === -1) return [];
  const open = html.indexOf("[", start + key.length);
  const close = findMatchingBracket(html, open);
  if (open === -1 || close === -1) return [];
  return JSON.parse(html.slice(open, close + 1));
}

function routeToFile(route) {
  const clean = String(route || "").replace(/^\/+|\/+$/g, "");
  return path.join(root, clean, "index.html");
}

function isCompleteProduct(html) {
  return /\bpage-product\b/.test(html)
    && /pageCategory["']?\s*:\s*["']Produto/i.test(html)
    && /idProduct/i.test(html)
    && /nameProduct/i.test(html)
    && /(id="form_comprar"|data-app="product\.buy-form"|Adicionar ao carrinho)/i.test(html);
}

function updateProductRoute(html, sourceRoute, destRoute) {
  let next = html;
  const sourceNoSlash = sourceRoute.replace(/\/$/, "");
  const destNoSlash = destRoute.replace(/\/$/, "");
  next = next.split(sourceNoSlash).join(destNoSlash);
  next = next.split(sourceNoSlash + "/").join(destNoSlash + "/");
  next = next.replace(/<link href="index\.html" rel="canonical"\/>/i, `<link href="${destNoSlash}/index.html" rel="canonical"/>`);
  return next;
}

function absolutizeAttributes(html, sourceRoute) {
  const base = new URL(`${sourceRoute.replace(/\/$/, "")}/index.html`, "https://tech7.local");
  const withAttrs = html.replace(/\s(href|src|action|data-src|data-original)=("|')([^"']+)\2/gi, (full, attr, quote, raw) => {
    if (!raw || /^(?:https?:|mailto:|tel:|whatsapp:|javascript:|data:|blob:|#|\/\/)/i.test(raw)) return full;
    try {
      const resolved = new URL(raw, base);
      const value = resolved.origin === "https://tech7.local" ? resolved.pathname + resolved.search + resolved.hash : resolved.href;
      return ` ${attr}=${quote}${value}${quote}`;
    } catch {
      return full;
    }
  });
  return withAttrs.replace(/url\((["']?)(?!data:|https?:|\/\/|#)([^"')]+)\1\)/gi, (full, quote, raw) => {
    try {
      const resolved = new URL(raw.trim(), base);
      const value = resolved.origin === "https://tech7.local" ? resolved.pathname + resolved.search + resolved.hash : resolved.href;
      return `url(${quote || ""}${value}${quote || ""})`;
    } catch {
      return full;
    }
  });
}

function updateListing(html) {
  let next = html;
  next = next.split("/display-e-lcd/realme").join("/tela-display-lcd/realme");
  next = next.split("/display/realme").join("/tela-display-lcd/realme");
  next = next.split("/display/").join("/tela-display-lcd/");
  next = next.replace(/<link href="[^"]*" rel="canonical"\/>/i, '<link href="/tela-display-lcd/realme/index.html" rel="canonical"/>');
  next = next.replace(/DISPLAY\s*&gt;\s*REALME/g, "DISPLAY &gt; REALME");
  return next;
}

const sourceListing = path.join(root, "display-e-lcd", "realme", "index.html");
const destListing = path.join(root, "tela-display-lcd", "realme", "index.html");
const sourceHtml = read(sourceListing);
const products = listProducts(sourceHtml);

const report = {
  generatedAt: new Date().toISOString(),
  sourceListing: rel(sourceListing),
  destListing: rel(destListing),
  productsInListing: products.length,
  copiedProducts: [],
  blockers: []
};

write(destListing, updateListing(sourceHtml));

for (const product of products) {
  const current = String(product.urlProduct || "").replace(/^\/+|\/+$/g, "");
  const slug = current.split("/").filter(Boolean).pop();
  if (!slug) continue;
  const sourceCandidates = [
    `display/realme/${slug}`,
    `display/outras/${slug}`,
    `display/${slug}`,
    `display-e-lcd/realme/${slug}`,
    `display-e-lcd/${slug}`,
    current.replace(/^tela-display-lcd\//, "display/")
  ];
  const source = sourceCandidates.map(routeToFile).find((candidate) => fs.existsSync(candidate) && isCompleteProduct(read(candidate)));
  const destRoute = `/tela-display-lcd/realme/${slug}`;
  const dest = routeToFile(destRoute);
  if (!source) {
    report.blockers.push({ nameProduct: product.nameProduct, slug, candidates: sourceCandidates });
    continue;
  }
  const sourceRoute = "/" + rel(source).replace(/\/index\.html$/, "");
  const normalizedSource = absolutizeAttributes(read(source), sourceRoute);
  write(dest, updateProductRoute(normalizedSource, sourceRoute, destRoute));
  report.copiedProducts.push({ nameProduct: product.nameProduct, slug, source: rel(source), destination: rel(dest) });
}

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  report: rel(reportPath),
  productsInListing: products.length,
  copiedProducts: report.copiedProducts.length,
  blockers: report.blockers.length
}, null, 2));
