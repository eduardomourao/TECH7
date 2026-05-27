import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportDir = path.join(root, "_validation");
const reportPath = path.join(reportDir, "menu-normalization-report.json");
const skipDirs = new Set([".git", "node_modules", ".vercel", "_validation", "validation-screenshots", "artifacts"]);

const exactHrefMap = new Map([
  ["/baterias/index.html", "/baterias-celular/index.html"],
  ["/bateria/index.html", "/baterias-celular/index.html"],
  ["/bateria-celular/index.html", "/baterias-celular/index.html"],
  ["/display/index.html", "/tela-display-lcd/index.html"],
  ["/display-e-lcd/index.html", "/tela-display-lcd/index.html"],
  ["/display-lcd/index.html", "/tela-display-lcd/index.html"],
  ["/telas-display-lcd/index.html", "/tela-display-lcd/index.html"],
  ["/touch-e-visor/index.html", "/tela-display-lcd/index.html"],
  ["/touchs-e-visores/index.html", "/tela-display-lcd/index.html"],
  ["/pecas/index.html", "/pecas-e-componentes/index.html"],
  ["/pecas-componentes/index.html", "/pecas-e-componentes/index.html"],
  ["/componentes/index.html", "/pecas-e-componentes/index.html"],
  ["/tampas/index.html", "/tampas-e-carcacas/index.html"],
  ["/tampas-carcacas/index.html", "/tampas-e-carcacas/index.html"],
  ["/carcacas/index.html", "/tampas-e-carcacas/index.html"]
]);

const prefixMap = [
  ["/display-e-lcd/", "/tela-display-lcd/"],
  ["/display-lcd/", "/tela-display-lcd/"],
  ["/telas-display-lcd/", "/tela-display-lcd/"],
  ["/display/", "/tela-display-lcd/"],
  ["/baterias/", "/baterias-celular/"],
  ["/bateria/", "/baterias-celular/"],
  ["/bateria-celular/", "/baterias-celular/"],
  ["/pecas/", "/pecas-e-componentes/"],
  ["/pecas-componentes/", "/pecas-e-componentes/"],
  ["/componentes/", "/pecas-e-componentes/"],
  ["/tampas/", "/tampas-e-carcacas/"],
  ["/tampas-carcacas/", "/tampas-e-carcacas/"],
  ["/carcacas/", "/tampas-e-carcacas/"]
];

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.name.toLowerCase().endsWith(".html")) out.push(path.join(dir, entry.name));
  }
  return out;
}

function findTagEnd(html, start) {
  const end = html.indexOf(">", start);
  return end === -1 ? -1 : end + 1;
}

function findMatchingTag(html, start, tagName) {
  const openRe = new RegExp(`<${tagName}\\b`, "gi");
  const closeRe = new RegExp(`</${tagName}>`, "gi");
  openRe.lastIndex = start;
  closeRe.lastIndex = start;
  let depth = 0;
  let open = openRe.exec(html);
  let close = closeRe.exec(html);
  while (open || close) {
    if (open && (!close || open.index < close.index)) {
      depth += 1;
      open = openRe.exec(html);
      continue;
    }
    depth -= 1;
    const end = close.index + close[0].length;
    if (depth === 0) return end;
    close = closeRe.exec(html);
  }
  return -1;
}

function extractElement(html, marker, tagName) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const end = findMatchingTag(html, start, tagName);
  if (end === -1) return null;
  return { start, end, html: html.slice(start, end) };
}

function findTopLevelLiBlocks(ulHtml) {
  const blocks = [];
  let cursor = 0;
  while (cursor < ulHtml.length) {
    const liStart = ulHtml.indexOf("<li", cursor);
    if (liStart === -1) break;
    const liOpenEnd = findTagEnd(ulHtml, liStart);
    if (liOpenEnd === -1) break;
    let depth = 1;
    let pos = liOpenEnd;
    while (pos < ulHtml.length) {
      const nextOpen = ulHtml.indexOf("<li", pos);
      const nextClose = ulHtml.indexOf("</li>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        pos = findTagEnd(ulHtml, nextOpen);
        continue;
      }
      depth -= 1;
      pos = nextClose + "</li>".length;
      if (depth === 0) {
        blocks.push(ulHtml.slice(liStart, pos));
        break;
      }
    }
    cursor = pos;
  }
  return blocks;
}

function replaceUlTopLevelItems(block, ulMarker, keepPredicate) {
  const ul = extractElement(block, ulMarker, "ul");
  if (!ul) throw new Error(`UL marker not found: ${ulMarker}`);
  const openEnd = findTagEnd(ul.html, 0);
  const open = ul.html.slice(0, openEnd);
  const close = "</ul>";
  const inner = ul.html.slice(openEnd, -close.length);
  const kept = findTopLevelLiBlocks(inner).filter(keepPredicate).join("");
  return block.slice(0, ul.start) + open + kept + close + block.slice(ul.end);
}

function absolutizeMenuPaths(block) {
  return block.replace(/\s(href|src|action)=("|')([^"']+)\2/gi, (full, attr, quote, raw) => {
    if (/^(?:https?:|mailto:|tel:|whatsapp:|javascript:|#|\/\/)/i.test(raw)) return full;
    let value = raw.trim();
    value = value.replace(/^\.\//, "");
    while (value.startsWith("../")) value = value.slice(3);
    if (!value.startsWith("/")) value = "/" + value;
    if (attr.toLowerCase() === "href") value = canonicalHref(value);
    return ` ${attr}=${quote}${value}${quote}`;
  });
}

function canonicalHref(value) {
  if (!value || value === "/") return value;
  const suffix = value.endsWith("/") ? "index.html" : "";
  let normalized = value + suffix;
  normalized = exactHrefMap.get(normalized) || normalized;
  for (const [from, to] of prefixMap) {
    if (normalized.startsWith(from)) {
      normalized = to + normalized.slice(from.length);
      break;
    }
  }
  normalized = normalized.replace(/\/$/, "/index.html");
  return normalized;
}

function routeExists(value) {
  const clean = String(value || "").split("#")[0].split("?")[0].replace(/^\/+/, "");
  if (!clean || clean === "index.html") return true;
  const direct = path.join(root, clean);
  if (fs.existsSync(direct)) return true;
  if (!path.extname(clean) && fs.existsSync(path.join(root, clean, "index.html"))) return true;
  if (clean.endsWith("/index.html") && fs.existsSync(path.join(root, clean))) return true;
  return false;
}

function removeElementByStart(block, marker, tagName) {
  let next = block;
  let removed = 0;
  let start = next.indexOf(marker);
  while (start !== -1) {
    const end = findMatchingTag(next, start, tagName);
    if (end === -1) break;
    next = next.slice(0, start) + next.slice(end);
    removed += 1;
    start = next.indexOf(marker, start);
  }
  return { block: next, removed };
}

function removeBrokenSubmenuLinks(block) {
  return block.replace(/<li><a class="(?:second-nivel|)" href="([^"]+)">[\s\S]*?<\/a><\/li>/g, (full, href) => {
    if (/^(?:https?:|mailto:|tel:|whatsapp:|javascript:|#|\/\/)/i.test(href)) return full;
    return routeExists(href) ? full : "";
  });
}

function normalizeMenuBlock(block, type) {
  let next = block;
  if (type === "desktop") {
    next = replaceUlTopLevelItems(next, '<ul class="list flex grow">', (li) => {
      return /<div class="name">\s*(?:BATERIAS|DISPLAY|PECAS e COMPONENTES|PEÇAS E COMPONENTES|TAMPAS e CARCAÇAS|TAMPAS E CARCACAS)/i.test(li)
        && !/TOUCHS\s*e\s*VISORES/i.test(li);
    });
  } else {
    next = replaceUlTopLevelItems(next, '<ul class="list-nav">', (li) => {
      return /<span class="text">\s*(?:BATERIAS|DISPLAY|PECAS e COMPONENTES|PEÇAS E COMPONENTES|TAMPAS e CARCAÇAS|TAMPAS E CARCACAS)/i.test(li)
        && !/TOUCHS\s*e\s*VISORES/i.test(li);
    });
  }
  next = next.replace(/PECAS e COMPONENTES/g, "PEÇAS E COMPONENTES");
  next = next.replace(/PEÇAS e COMPONENTES/g, "PEÇAS E COMPONENTES");
  next = next.replace(/TAMPAS e CARCAÇAS/g, "TAMPAS E CARCAÇAS");
  next = absolutizeMenuPaths(next);
  next = removeElementByStart(next, '<div class="col-product">', "div").block;
  next = removeBrokenSubmenuLinks(next);
  return next;
}

const sourceHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sourceDesktop = extractElement(sourceHtml, '<nav class="nav">', "nav");
const sourceMobile = extractElement(sourceHtml, '<div class="content-nav flex-grow">', "div");
if (!sourceDesktop || !sourceMobile) throw new Error("index.html does not contain both menu blocks");

const canonicalDesktop = normalizeMenuBlock(sourceDesktop.html, "desktop");
const canonicalMobile = normalizeMenuBlock(sourceMobile.html, "mobile");

const files = walk(root);
const report = {
  generatedAt: new Date().toISOString(),
  canonicalItems: [
    { label: "BATERIAS", href: "/baterias-celular/index.html" },
    { label: "DISPLAY", href: "/tela-display-lcd/index.html" },
    { label: "PEÇAS E COMPONENTES", href: "/pecas-e-componentes/index.html" },
    { label: "TAMPAS E CARCAÇAS", href: "/tampas-e-carcacas/index.html" }
  ],
  changedFiles: [],
  skippedWithoutMenu: 0,
  replacements: { desktop: 0, mobile: 0 }
};

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  const desktop = extractElement(after, '<nav class="nav">', "nav");
  if (desktop) {
    after = after.slice(0, desktop.start) + canonicalDesktop + after.slice(desktop.end);
    report.replacements.desktop += 1;
  }
  const mobile = extractElement(after, '<div class="content-nav flex-grow">', "div");
  if (mobile) {
    after = after.slice(0, mobile.start) + canonicalMobile + after.slice(mobile.end);
    report.replacements.mobile += 1;
  }
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    report.changedFiles.push(rel(file));
  } else if (!desktop && !mobile) {
    report.skippedWithoutMenu += 1;
  }
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  report: rel(reportPath),
  changedFiles: report.changedFiles.length,
  desktopReplacements: report.replacements.desktop,
  mobileReplacements: report.replacements.mobile,
  skippedWithoutMenu: report.skippedWithoutMenu
}, null, 2));
