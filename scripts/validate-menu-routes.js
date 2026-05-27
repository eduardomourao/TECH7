import { extractInternalReferences, failOrPass, htmlFiles } from "./lib/site-audit.js";

const errors = [];
let menuReferences = 0;

for (const file of htmlFiles()) {
  for (const ref of extractInternalReferences(file)) {
    if (!ref.context.menu && !ref.context.mobileMenu && !ref.context.breadcrumb) continue;
    if (!["href", "action", "canonical", "next", "prev"].includes(ref.type)) continue;
    menuReferences += 1;
    if (!ref.resolvable) errors.push(ref);
  }
}

failOrPass("validate-menu-routes", errors, { menuReferences });
