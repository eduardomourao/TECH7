import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const wantedExt = new Set([".html", ".js"]);
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".vercel",
]);
const needles = ["/mvc/store", "/nocache", "/web_api"];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && wantedExt.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("\\/", "/")
    .replaceAll("\\u002F", "/");
}

function classify(value, context) {
  const hay = `${value} ${context}`.toLowerCase();
  if (hay.includes("newsletter")) return "newsletter";
  if (hay.includes("googletagmanager") || hay.includes("gtm") || hay.includes("analytics")) return "analytics";
  if (hay.includes("shipping") || hay.includes("frete") || hay.includes("cep")) return "shipping";
  if (hay.includes("payment_options") || hay.includes("formaspagto") || hay.includes("formas de pagamento")) return "payment options";
  if (hay.includes("variant_") || hay.includes("variacao") || hay.includes("variant-reference") || hay.includes("variant")) return "variacao";
  if (hay.includes("cart") || hay.includes("carrinho") || hay.includes("cartservice") || hay.includes("api-cart")) return "carrinho";
  if (hay.includes("busca") || hay.includes("search")) return "busca";
  if (hay.includes("product") || hay.includes("produto") || hay.includes("idprod")) return "produto";
  return "produto";
}

function normalizeEndpoint(raw) {
  let value = decodeHtml(raw).trim();
  value = value.replace(/[\\'");>,\]}]+$/g, "");
  if (value.startsWith("//")) return value;
  return value;
}

const endpointRe = /\/(?:mvc\/store|web_api)[^"'`\s<>)\]}]+|\/nocache[^"'`\s<>)\]}]*/gi;
const lineResults = [];
const byEndpoint = new Map();
const byFile = new Map();
const byCategory = new Map();

for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  if (!needles.some((needle) => text.includes(needle))) continue;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    endpointRe.lastIndex = 0;
    let match;
    while ((match = endpointRe.exec(line))) {
      const endpoint = normalizeEndpoint(match[0]);
      const category = classify(endpoint, line);
      const row = { file: rel(file), line: index + 1, endpoint, category };
      lineResults.push(row);

      const endpointBucket = byEndpoint.get(endpoint) ?? {
        endpoint,
        category,
        count: 0,
        files: new Set(),
        examples: [],
      };
      endpointBucket.count += 1;
      endpointBucket.files.add(row.file);
      if (endpointBucket.examples.length < 5) {
        endpointBucket.examples.push(`${row.file}:${row.line}`);
      }
      byEndpoint.set(endpoint, endpointBucket);

      const fileBucket = byFile.get(row.file) ?? {
        file: row.file,
        count: 0,
        categories: new Set(),
      };
      fileBucket.count += 1;
      fileBucket.categories.add(category);
      byFile.set(row.file, fileBucket);

      const categoryBucket = byCategory.get(category) ?? {
        category,
        count: 0,
        files: new Set(),
        endpoints: new Set(),
      };
      categoryBucket.count += 1;
      categoryBucket.files.add(row.file);
      categoryBucket.endpoints.add(endpoint);
      byCategory.set(category, categoryBucket);
    }
  });
}

const output = {
  scannedAt: new Date().toISOString(),
  totalMatches: lineResults.length,
  totalFiles: byFile.size,
  categories: [...byCategory.values()]
    .map((item) => ({
      category: item.category,
      count: item.count,
      fileCount: item.files.size,
      endpointCount: item.endpoints.size,
      sampleFiles: [...item.files].slice(0, 20),
      sampleEndpoints: [...item.endpoints].slice(0, 20),
    }))
    .sort((a, b) => a.category.localeCompare(b.category)),
  endpoints: [...byEndpoint.values()]
    .map((item) => ({
      endpoint: item.endpoint,
      category: item.category,
      count: item.count,
      fileCount: item.files.size,
      examples: item.examples,
    }))
    .sort((a, b) => b.count - a.count || a.endpoint.localeCompare(b.endpoint)),
  files: [...byFile.values()]
    .map((item) => ({
      file: item.file,
      count: item.count,
      categories: [...item.categories].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)),
};

console.log(JSON.stringify(output, null, 2));
