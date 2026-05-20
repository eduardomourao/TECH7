import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("C:/tmp/tech7-preview-build");

const skipDirs = new Set([
  ".git",
  ".vercel",
  ".claude",
  "node_modules",
  "backend",
  "scripts",
  "_validation",
  "test-results"
]);

const publicFileExtensions = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".txt",
  ".xml",
  ".webmanifest",
  ".ico"
]);

const rootFiles = new Set([
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".nojekyll",
  "404.html",
  "favicon.ico",
  "favicon.png",
  "apple-touch-icon.png",
  "logo.png",
  "logourl.png",
  "precos.json"
]);

const explicitDirs = [
  "api",
  "server",
  "_custom",
  "_assets/tech7"
];

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function rel(filePath) {
  return toPosix(path.relative(root, filePath));
}

function shouldSkipDir(name) {
  return skipDirs.has(name);
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      walk(path.join(dir, entry.name), output);
      continue;
    }
    output.push(path.join(dir, entry.name));
  }
  return output;
}

function copyFile(source) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return false;
  const target = path.join(outDir, path.relative(root, source));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function copyTree(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return 0;
  let count = 0;
  for (const file of walk(full)) {
    if (copyFile(file)) count += 1;
  }
  return count;
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*([\"'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function splitSrcset(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function isExternal(value) {
  const url = String(value || "").trim();
  return !url ||
    url.startsWith("#") ||
    /^(data|blob|javascript|mailto|tel):/i.test(url) ||
    /^\/\//.test(url) ||
    /^https?:\/\//i.test(url);
}

function resolveLocal(sourceFile, value) {
  if (isExternal(value)) return "";
  let clean = String(value).trim().replace(/^['"]|['"]$/g, "");
  clean = clean.split("#")[0].split("?")[0];
  if (!clean) return "";
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep malformed URLs visible to the missing report.
  }
  const resolved = clean.startsWith("/")
    ? path.join(root, clean)
    : path.resolve(path.dirname(sourceFile), clean);
  return resolved.startsWith(root) ? resolved : "";
}

function addAsset(sourceFile, value, assets, missing) {
  const resolved = resolveLocal(sourceFile, value);
  if (!resolved) return;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    assets.add(resolved);
  } else {
    missing.add(`${rel(sourceFile)} -> ${value}`);
  }
}

function collectAssetsFromFile(file, assets, missing) {
  const content = fs.readFileSync(file, "utf8");
  for (const tag of content.match(/<img\b[^>]*>/gi) || []) {
    addAsset(file, attrValue(tag, "src"), assets, missing);
    addAsset(file, attrValue(tag, "data-src"), assets, missing);
    for (const item of splitSrcset(attrValue(tag, "srcset"))) addAsset(file, item, assets, missing);
    for (const item of splitSrcset(attrValue(tag, "data-srcset"))) addAsset(file, item, assets, missing);
  }
  for (const tag of content.match(/<source\b[^>]*>/gi) || []) {
    for (const item of splitSrcset(attrValue(tag, "srcset"))) addAsset(file, item, assets, missing);
    for (const item of splitSrcset(attrValue(tag, "data-srcset"))) addAsset(file, item, assets, missing);
  }
  for (const tag of content.match(/<link\b[^>]*>/gi) || []) {
    addAsset(file, attrValue(tag, "href"), assets, missing);
  }
  for (const tag of content.match(/<script\b[^>]*>/gi) || []) {
    addAsset(file, attrValue(tag, "src"), assets, missing);
  }
  for (const match of content.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    addAsset(file, match[2], assets, missing);
  }
}

function collectSearchIndexAssets(assets, missing) {
  const indexPath = path.join(root, "_assets", "tech7", "search-index.json");
  if (!fs.existsSync(indexPath)) return;
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  for (const item of Array.isArray(index.items) ? index.items : []) {
    for (const key of ["image", "img", "thumb", "thumbnail"]) {
      if (item[key]) addAsset(indexPath, item[key], assets, missing);
    }
  }
}

function dirSize(dir) {
  let total = 0;
  for (const file of walk(dir)) total += fs.statSync(file).size;
  return total;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const allFiles = walk(root);
const publicFiles = allFiles.filter((file) => {
  const relative = rel(file);
  const ext = path.extname(file).toLowerCase();
  if (rootFiles.has(relative)) return true;
  if (!publicFileExtensions.has(ext)) return false;
  if (relative.startsWith("_assets/") && !relative.startsWith("_assets/tech7/")) return false;
  return true;
});

let copiedPublic = 0;
for (const file of publicFiles) {
  if (copyFile(file)) copiedPublic += 1;
}

let copiedExplicit = 0;
for (const dir of explicitDirs) copiedExplicit += copyTree(dir);

const assets = new Set();
const missing = new Set();
for (const file of publicFiles) {
  if (/\.(html|css)$/i.test(file)) collectAssetsFromFile(file, assets, missing);
}
for (const file of allFiles.filter((file) => /\.(css)$/i.test(file) && rel(file).startsWith("_assets/"))) {
  collectAssetsFromFile(file, assets, missing);
}
collectSearchIndexAssets(assets, missing);

let copiedAssets = 0;
for (const asset of assets) {
  if (copyFile(asset)) copiedAssets += 1;
}

const missingList = [...missing].sort();
fs.writeFileSync(path.join(outDir, "PREVIEW-PACKAGE-MISSING-ASSETS.txt"), `${missingList.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  outDir,
  copiedPublic,
  copiedExplicit,
  copiedAssets,
  missingAssets: missingList.length,
  sizeMb: +(dirSize(outDir) / 1024 / 1024).toFixed(1)
}, null, 2));
