import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts", "backup"]);
const replacements = new Map([
  ["../../outros/lente-da-camera-poco-m3/index.html", "../lente-da-camera-poco-m3/index.html"],
  ["../../outros/lente-da-camera-poco-x3/index.html", "../lente-da-camera-poco-x3/index.html"],
  ["/pecas-e-componentes/outros/lente-da-camera-poco-m3", "/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-m3"],
  ["/pecas-e-componentes/outros/lente-da-camera-poco-x3", "/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-x3"],
  ["pecas-e-componentes/outros/lente-da-camera-poco-m3/index.html", "pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-m3/index.html"],
  ["pecas-e-componentes/outros/lente-da-camera-poco-x3/index.html", "pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-x3/index.html"]
]);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(full, out);
      continue;
    }
    if (entry.isFile() && /\.(html|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const report = { modified: 0, replacements: 0, files: [] };
for (const file of walk(root)) {
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  let count = 0;
  for (const [from, to] of replacements) {
    const parts = after.split(from);
    if (parts.length > 1) {
      count += parts.length - 1;
      after = parts.join(to);
    }
  }
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    report.modified += 1;
    report.replacements += count;
    report.files.push({ arquivo: rel(file), substituicoes: count });
  }
}
fs.writeFileSync(path.join(root, "_validation", "poco-old-links-repair-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
