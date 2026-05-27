import fs from "node:fs";
import { failOrPass, readJson, routeExists } from "./lib/site-audit.js";

const errors = [];
const routes = readJson("_custom/routes.json");
const redirects = readJson("_custom/redirects.json");

if (!routes?.categories || typeof routes.categories !== "object") errors.push({ type: "missing-routes-categories" });
if (!Array.isArray(redirects?.redirects)) errors.push({ type: "missing-redirects-array" });

for (const [key, destination] of Object.entries(routes?.categories || {})) {
  if (!String(destination).startsWith("/")) errors.push({ type: "invalid-category-destination", key, destination });
  if (!routeExists(destination)) errors.push({ type: "category-destination-missing", key, destination });
}

const seen = new Set();
for (const rule of redirects?.redirects || []) {
  if (seen.has(rule.source)) errors.push({ type: "duplicate-redirect-source", source: rule.source });
  seen.add(rule.source);
  if (rule.source === rule.destination) errors.push({ type: "redirect-loop", source: rule.source });
  if (!rule.source?.startsWith("/") || !rule.destination?.startsWith("/")) errors.push({ type: "invalid-redirect-path", rule });
  if (!rule.destination.includes(":path*") && !rule.destination.startsWith("/api/") && !routeExists(rule.destination)) {
    errors.push({ type: "redirect-destination-missing", source: rule.source, destination: rule.destination });
  }
}

if (!fs.existsSync("_custom/endpoints.json")) errors.push({ type: "missing-endpoints-json" });

failOrPass("validate-routes", errors, { categories: Object.keys(routes?.categories || {}).length, redirects: redirects?.redirects?.length || 0 });
