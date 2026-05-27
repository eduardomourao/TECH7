import fs from "node:fs";
import path from "node:path";
import { failOrPass, readJson, root } from "./lib/site-audit.js";

const errors = [];
const config = readJson("_custom/redirects.json", { redirects: [] });

function walkIndex(rootSlug) {
  const dir = path.join(root, rootSlug);
  const result = [];
  if (!fs.existsSync(dir)) return result;
  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") {
        const relative = path.relative(dir, full).replaceAll("\\", "/");
        if (relative !== "index.html") result.push(relative);
      }
    }
  }
  walk(dir);
  return result;
}

for (const rule of config.redirects || []) {
  if (rule.source === rule.destination) errors.push({ type: "self-loop", rule });
  if (rule.source?.endsWith("/:path*")) {
    const src = rule.source.replace(/^\/|\/:path\*$/g, "");
    const dst = rule.destination.replace(/^\/|\/:path\*$/g, "");
    const dstSet = new Set(walkIndex(dst));
    const missing = walkIndex(src).filter((item) => !dstSet.has(item));
    if (missing.length) errors.push({ type: "unsafe-wildcard", source: rule.source, destination: rule.destination, missing: missing.slice(0, 20), missingCount: missing.length });
  }
  if (rule.source === "/display/:path*") errors.push({ type: "blocked-display-wildcard", rule });
}

failOrPass("validate-redirects", errors, { redirects: config.redirects?.length || 0 });
