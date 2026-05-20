import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skipDirs = new Set([".git", ".vercel", ".claude", "node_modules", "backend", "server", "api", "scripts", "_assets"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function hasAttr(tag, name) {
  return new RegExp("(^|\\s)" + name + "\\s*=", "i").test(tag);
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp("(^|\\s)" + name + "\\s*=\\s*([\"'])(.*?)\\2", "i"));
  return match ? match[3] : "";
}

function hydrateImgTag(tag) {
  if (!hasAttr(tag, "data-src") || hasAttr(tag, "src")) return tag;
  const dataSrc = getAttr(tag, "data-src");
  if (!dataSrc) return tag;
  return tag.replace(/^<img\b/i, `<img src="${dataSrc}"`);
}

function hydrateSourceTag(tag) {
  if (!hasAttr(tag, "data-srcset") || hasAttr(tag, "srcset")) return tag;
  const dataSrcset = getAttr(tag, "data-srcset");
  if (!dataSrcset) return tag;
  return tag.replace(/^<source\b/i, `<source srcset="${dataSrcset}"`);
}

let filesChanged = 0;
let imgTagsHydrated = 0;
let sourceTagsHydrated = 0;

for (const file of walk(root)) {
  const original = fs.readFileSync(file, "utf8");
  let imgCount = 0;
  let sourceCount = 0;
  let next = original.replace(/<img\b[^>]*>/gi, (tag) => {
    const hydrated = hydrateImgTag(tag);
    if (hydrated !== tag) imgCount += 1;
    return hydrated;
  });
  next = next.replace(/<source\b[^>]*>/gi, (tag) => {
    const hydrated = hydrateSourceTag(tag);
    if (hydrated !== tag) sourceCount += 1;
    return hydrated;
  });

  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    filesChanged += 1;
    imgTagsHydrated += imgCount;
    sourceTagsHydrated += sourceCount;
  }
}

console.log(JSON.stringify({ filesChanged, imgTagsHydrated, sourceTagsHydrated }, null, 2));
