import { spawnSync } from "node:child_process";

const commands = [
  ["node", ["scripts/validate-links.js"]],
  ["node", ["scripts/validate-assets.js"]],
  ["node", ["scripts/validate-routes.js"]],
  ["node", ["scripts/validate-endpoints.js"]],
  ["node", ["scripts/validate-redirects.js"]],
  ["node", ["scripts/validate-menu-routes.js"]],
  ["node", ["scripts/validate-section-filters.mjs"]],
  ["node", ["scripts/validate-api-security.mjs"]],
  ["node", ["scripts/validate-backend-prices.mjs"]],
  ["node", ["scripts/validate-product-exactness.js"]],
  ["node", ["scripts/validate-product-cards.mjs"]]
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("[validate-build] OK");
