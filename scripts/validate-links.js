import { extractInternalReferences, failOrPass, htmlFiles } from "./lib/site-audit.js";

const files = htmlFiles();
const errors = [];
let references = 0;

for (const file of files) {
  for (const ref of extractInternalReferences(file)) {
    if (!["href", "action", "canonical", "next", "prev", "meta-refresh", "window-location"].includes(ref.type)) continue;
    references += 1;
    if (!ref.resolvable) errors.push(ref);
  }
}

failOrPass("validate-links", errors, { htmlFiles: files.length, references });
