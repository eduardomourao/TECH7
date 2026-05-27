import fs from "node:fs";
import path from "node:path";
import { failOrPass, htmlBase, htmlFiles, normalizeInternalUrl, root } from "./lib/site-audit.js";

const errors = [];
let references = 0;
const assetExtensions = new Set([".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif", ".json", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm"]);

function check(file, raw, type, basePath) {
  const normalized = normalizeInternalUrl(raw, file, basePath);
  if (!normalized || !path.extname(normalized.path)) return;
  if (!assetExtensions.has(path.extname(normalized.path).toLowerCase())) return;
  references += 1;
  const target = path.join(root, normalized.path.replace(/^\/+/, ""));
  if (!fs.existsSync(target)) errors.push({ file: path.relative(root, file).replaceAll("\\", "/"), type, raw, path: normalized.path });
}

for (const file of htmlFiles()) {
  const html = fs.readFileSync(file, "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const basePath = htmlBase(html, file);
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/ig)) check(file, match[2], "html-asset", basePath);
  for (const match of html.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/ig)) check(file, match[2], "css-url", basePath);
}

failOrPass("validate-assets", errors, { references });
