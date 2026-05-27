import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "_validation");
const outputPath = path.join(outputDir, "store-data-audit-before.json");
const extensions = new Set([".html", ".js", ".css", ".json", ".xml", ".md"]);
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  ".vercel",
  "test-results",
  "validation-screenshots"
]);

const patterns = [
  { key: "old_whatsapp_phone", re: /(?:55)?31\s*9?7354[-\s]?8107|97354[-\s]?8107/gi },
  { key: "old_landline", re: /(?:55)?31\s*3213[-\s]?6621|\(31\)\s*3213[-\s]?6621/gi },
  { key: "old_whatsapp_links", re: /https?:\/\/(?:wa\.me\/5531973548107|api\.whatsapp\.com\/send\?[^"'\s<>]*5531973548107)[^"'\s<>]*/gi },
  { key: "old_email", re: /comercial@centralselling\.com\.br/gi },
  { key: "old_instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/tech7\/?/gi },
  { key: "old_facebook", re: /https?:\/\/(?:www\.)?facebook\.com\/tech7\/?/gi },
  { key: "old_address_rua_caetes", re: /Rua dos Caet(?:é|&eacute;|Ã©)s[^<"\n\r]*/gi },
  { key: "old_address_cep", re: /30120[-\s]?082/gi },
  { key: "old_address_baalbeck", re: /Baalbeck/gi },
  { key: "tray_visible_footer", re: /Tecnologia\s*<a[^>]*>\s*TrayCommerce\s*<\/a>|TrayCommerce|Powered by Tray/gi },
  { key: "tray_meta_author", re: /Tray Tecnologia/gi },
  { key: "central_selling", re: /Central Selling|centralselling/gi }
];

function shouldSkipDir(name) {
  return ignoredDirs.has(name);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function lineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

const files = walk(root);
const hits = [];
const summary = Object.fromEntries(patterns.map((pattern) => [pattern.key, 0]));

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(text))) {
      summary[pattern.key] += 1;
      hits.push({
        file: rel,
        line: lineNumber(text, match.index),
        type: pattern.key,
        sample: match[0].slice(0, 240)
      });
      if (match[0].length === 0) pattern.re.lastIndex += 1;
    }
  }
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  summary,
  hits
}, null, 2));

console.log(JSON.stringify({
  output: path.relative(root, outputPath).replace(/\\/g, "/"),
  filesScanned: files.length,
  totalHits: hits.length,
  summary
}, null, 2));
