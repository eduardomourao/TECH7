import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const aliasMarker = "TECH7_PRODUCT_ALIAS_PAGE";
const searchIndexPath = path.join(root, "_assets", "tech7", "search-index.json");

const publicCategoryDirs = new Set([
  "baterias",
  "baterias-celular",
  "bateria",
  "bateria-celular",
  "display-e-lcd",
  "tela-display-lcd",
  "display",
  "display-lcd",
  "telas",
  "telas-display-lcd",
  "touchs-e-visores",
  "touch-e-visor",
  "touchs-visores",
  "touch-visor",
  "touch",
  "pecas-e-componentes",
  "pecas-componentes",
  "componentes",
  "pecas",
  "tampas-e-carcacas",
  "tampas-carcacas",
  "carcacas",
  "tampas",
  "maquinas-e-ferramentas",
  "maquinas-ferramentas",
  "ferramentas",
  "suprimentos"
]);

const skipDirs = new Set([".git", ".vercel", ".claude", "node_modules", "backend", "server"]);
const htmlSkipDirs = new Set([...skipDirs, "api", "scripts", "_assets"]);

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/");
}

function rel(filePath) {
  return toPosix(path.relative(root, filePath));
}

function walk(dir, output = [], options = {}) {
  const skip = options.skip || skipDirs;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      walk(path.join(dir, entry.name), output, options);
      continue;
    }
    if (!options.predicate || options.predicate(entry.name, path.join(dir, entry.name))) {
      output.push(path.join(dir, entry.name));
    }
  }
  return output;
}

function normalizeRoute(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function readSearchTitles() {
  const titles = new Map();
  if (!fs.existsSync(searchIndexPath)) return titles;
  const index = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  for (const item of Array.isArray(index.items) ? index.items : []) {
    const route = normalizeRoute(item.url || item.href || "");
    if (route) titles.set(route, item.title || item.name || "");
  }
  return titles;
}

function generateProductSitemap() {
  const titles = readSearchTitles();
  const htmlFiles = walk(root, [], {
    skip: htmlSkipDirs,
    predicate: (name) => name.toLowerCase() === "index.html"
  });
  const rows = [];

  for (const file of htmlFiles) {
    const route = normalizeRoute(rel(file));
    const parts = route.split("/").filter(Boolean);
    if (parts.length < 2 || !publicCategoryDirs.has(parts[0])) continue;
    const html = fs.readFileSync(file, "utf8");
    const isAlias = html.includes(aliasMarker);
    rows.push({
      route,
      type: isAlias ? "alias" : "real",
      slug: parts.at(-1),
      category: parts[0],
      brand: parts.length >= 3 ? parts[1] : "",
      title: titles.get(route) || "",
      file: rel(file)
    });
  }

  rows.sort((a, b) => a.route.localeCompare(b.route));
  const realCount = rows.filter((row) => row.type === "real").length;
  const aliasCount = rows.length - realCount;

  const lines = [
    "# Sitemap de Produtos TECH7",
    "",
    `Gerado: ${new Date().toISOString()}`,
    "",
    "## Resumo",
    "",
    `- Rotas fisicas reais: ${realCount}`,
    `- Rotas alias/redirecionamento: ${aliasCount}`,
    `- Total mapeado: ${rows.length}`,
    "",
    "## Rotas",
    "",
    "| Tipo | Categoria | Marca | Slug | Rota | Arquivo |",
    "|---|---|---|---|---|---|"
  ];

  for (const row of rows) {
    lines.push(`| ${row.type} | ${row.category} | ${row.brand || "-"} | ${row.slug} | /${row.route}/ | ${row.file} |`);
  }

  fs.writeFileSync(path.join(root, "SITEMAP-PRODUTOS.md"), `${lines.join("\n")}\n`, "utf8");
  return { totalRoutes: rows.length, realCount, aliasCount };
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*([\"'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function hasAttr(tag, name) {
  return new RegExp(`\\s${name}\\s*=`, "i").test(tag);
}

function splitSrcset(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function isSkippableUrl(value) {
  const url = String(value || "").trim();
  return !url ||
    url.startsWith("#") ||
    /^(data|blob|javascript|mailto|tel):/i.test(url) ||
    /^\/\//.test(url) ||
    /^https?:\/\//i.test(url);
}

function resolveLocalAsset(sourceFile, value) {
  if (isSkippableUrl(value)) return null;
  let clean = String(value).trim().replace(/^['"]|['"]$/g, "");
  clean = clean.split("#")[0].split("?")[0];
  if (!clean) return null;
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep malformed URLs as-is so they can still be reported.
  }
  const resolved = clean.startsWith("/")
    ? path.join(root, clean)
    : path.resolve(path.dirname(sourceFile), clean);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function caseInsensitiveCandidate(filePath) {
  const parts = path.relative(root, filePath).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (!fs.existsSync(current)) return "";
    const entries = fs.readdirSync(current);
    const match = entries.find((entry) => entry.toLowerCase() === part.toLowerCase());
    if (!match) return "";
    current = path.join(current, match);
  }
  return fs.existsSync(current) ? current : "";
}

function auditAssets() {
  const files = walk(root, [], {
    skip: skipDirs,
    predicate: (name) => /\.(html|css)$/i.test(name)
  });
  const missing = [];
  const caseMismatches = [];
  let references = 0;
  let imgTags = 0;
  let imgMissingSrc = 0;
  let imgMissingAlt = 0;
  let imgMissingWidth = 0;
  let imgMissingHeight = 0;
  let imgMissingLoading = 0;

  function check(sourceFile, value, kind) {
    const target = resolveLocalAsset(sourceFile, value);
    if (!target) return;
    references += 1;
    if (fs.existsSync(target)) return;
    const candidate = caseInsensitiveCandidate(target);
    const record = {
      source: rel(sourceFile),
      kind,
      value,
      resolved: rel(target),
      candidate: candidate ? rel(candidate) : ""
    };
    if (candidate) caseMismatches.push(record);
    else missing.push(record);
  }

  for (const file of files) {
    const rawContent = fs.readFileSync(file, "utf8");
    const content = file.toLowerCase().endsWith(".html")
      ? rawContent.replace(/<script\b[\s\S]*?<\/script>/gi, "")
      : rawContent;
    for (const tag of content.match(/<img\b[^>]*>/gi) || []) {
      imgTags += 1;
      const src = attrValue(tag, "src");
      const dataSrc = attrValue(tag, "data-src");
      if (!src && !dataSrc) imgMissingSrc += 1;
      if (!hasAttr(tag, "alt")) imgMissingAlt += 1;
      if (!hasAttr(tag, "width")) imgMissingWidth += 1;
      if (!hasAttr(tag, "height")) imgMissingHeight += 1;
      if (!hasAttr(tag, "loading")) imgMissingLoading += 1;
      check(file, src, "img[src]");
      check(file, dataSrc, "img[data-src]");
      for (const srcsetUrl of splitSrcset(attrValue(tag, "srcset"))) check(file, srcsetUrl, "img[srcset]");
      for (const srcsetUrl of splitSrcset(attrValue(tag, "data-srcset"))) check(file, srcsetUrl, "img[data-srcset]");
    }

    for (const tag of content.match(/<source\b[^>]*>/gi) || []) {
      for (const srcsetUrl of splitSrcset(attrValue(tag, "srcset"))) check(file, srcsetUrl, "source[srcset]");
      for (const srcsetUrl of splitSrcset(attrValue(tag, "data-srcset"))) check(file, srcsetUrl, "source[data-srcset]");
    }

    for (const match of content.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      check(file, match[2], "background/url()");
    }
  }

  const lines = [
    "# Auditoria de Assets TECH7",
    "",
    `Gerado: ${new Date().toISOString()}`,
    "",
    "## Resumo",
    "",
    `- Arquivos HTML/CSS inspecionados: ${files.length}`,
    `- Referencias locais de imagem/font/css encontradas: ${references}`,
    `- Tags img encontradas: ${imgTags}`,
    `- Img sem src/data-src: ${imgMissingSrc}`,
    `- Img sem alt: ${imgMissingAlt}`,
    `- Img sem width: ${imgMissingWidth}`,
    `- Img sem height: ${imgMissingHeight}`,
    `- Img sem loading: ${imgMissingLoading}`,
    `- Paths inexistentes: ${missing.length}`,
    `- Paths com diferenca de maiusculas/minusculas: ${caseMismatches.length}`,
    "",
    "## Paths inexistentes",
    ""
  ];

  if (!missing.length) {
    lines.push("Nenhum path local inexistente encontrado.");
  } else {
    for (const item of missing.slice(0, 300)) {
      lines.push(`- ${item.source} :: ${item.kind} :: ${item.value} -> ${item.resolved}`);
    }
    if (missing.length > 300) lines.push(`- Mais ${missing.length - 300} ocorrencias omitidas.`);
  }

  lines.push("", "## Paths com case mismatch", "");
  if (!caseMismatches.length) {
    lines.push("Nenhum path com case mismatch encontrado.");
  } else {
    for (const item of caseMismatches.slice(0, 300)) {
      lines.push(`- ${item.source} :: ${item.kind} :: ${item.value} -> ${item.candidate}`);
    }
    if (caseMismatches.length > 300) lines.push(`- Mais ${caseMismatches.length - 300} ocorrencias omitidas.`);
  }

  fs.writeFileSync(path.join(root, "IMAGE-AUDIT.md"), `${lines.join("\n")}\n`, "utf8");
  return {
    files: files.length,
    references,
    imgTags,
    imgMissingSrc,
    imgMissingAlt,
    imgMissingWidth,
    imgMissingHeight,
    imgMissingLoading,
    missing: missing.length,
    caseMismatches: caseMismatches.length
  };
}

const sitemap = generateProductSitemap();
const assets = auditAssets();
console.log(JSON.stringify({ sitemap, assets }, null, 2));
