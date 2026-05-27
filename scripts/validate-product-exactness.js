import fs from "node:fs";
import path from "node:path";
import { failOrPass, readJson, root } from "./lib/site-audit.js";

const errors = [];
const config = readJson("_custom/redirects.json", { redirects: [] });

function walkProducts(rootSlug) {
  const dir = path.join(root, rootSlug);
  const result = [];
  if (!fs.existsSync(dir)) return result;
  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") {
        const relative = path.relative(dir, full).replaceAll("\\", "/");
        if (relative.split("/").length >= 3) result.push(relative);
      }
    }
  }
  walk(dir);
  return result;
}

for (const rule of config.redirects || []) {
  if (!rule.source?.endsWith("/:path*")) continue;
  const src = rule.source.replace(/^\/|\/:path\*$/g, "");
  const dst = rule.destination.replace(/^\/|\/:path\*$/g, "");
  const dstSet = new Set(walkProducts(dst));
  for (const relative of walkProducts(src)) {
    if (!dstSet.has(relative)) errors.push({ type: "missing-product-destination", source: `/${src}/${relative}`, destination: `/${dst}/${relative}` });
  }
}

failOrPass("validate-product-exactness", errors, { wildcardRedirects: (config.redirects || []).filter((rule) => rule.source?.endsWith("/:path*")).length });
