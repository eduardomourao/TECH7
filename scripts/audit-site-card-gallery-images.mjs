import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "_validation", "site-card-gallery-image-audit.json");
const assetRoot = path.join(root, "_assets", "images.tcdn.com.br", "img", "img_prod", "996644");
const placeholder = "/_assets/tech7/product-placeholder.svg";
const categories = [
  "baterias-celular",
  "display-e-lcd",
  "pecas-e-componentes",
  "tampas-e-carcacas",
  "touchs-e-visores",
];

function normalizeImageUrl(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw || raw === "undefined" || raw === "null") return "";
  const assetIndex = raw.indexOf("_assets/");
  if (assetIndex >= 0) return `/${raw.slice(assetIndex).replace(/^\/+/, "")}`;
  if (/^\/_assets\//i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (/images\.tcdn\.com\.br$/i.test(url.hostname)) return `/_assets/images.tcdn.com.br${url.pathname}`;
  } catch {
    return raw;
  }
  return raw;
}

function imageFileExists(publicPath) {
  const clean = normalizeImageUrl(publicPath);
  if (!clean || clean === placeholder) return false;
  if (!clean.startsWith("/_assets/images.tcdn.com.br/img/img_prod/996644/")) return false;
  const rel = clean.replace(/^\/_assets\/images\.tcdn\.com\.br\/img\/img_prod\/996644\//i, "");
  return fs.existsSync(path.join(assetRoot, rel));
}

function imageKey(value) {
  const file = normalizeImageUrl(value).split(/[?#]/)[0].split("/").pop()?.toLowerCase() || "";
  return file
    .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, "")
    .replace(/^\d{2,4}_/, "")
    .replace(/-[a-f0-9]{6,}$/i, "")
    .replace(/_[a-f0-9]{16,}$/i, "")
    .replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, "$1");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function auditBackendCards() {
  const problems = [];
  let total = 0;

  for (const category of categories) {
    for (let offset = 0; ; offset += 100) {
      const payload = await fetchJson(`http://localhost:3000/api/products?category=${encodeURIComponent(category)}&limit=100&offset=${offset}`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      total += items.length;

      for (const item of items) {
        const image = normalizeImageUrl(item.image_url || item.image || "");
        if (!image || image === placeholder || !imageFileExists(image)) {
          problems.push({
            type: !image ? "missing-image-url" : "missing-local-file",
            category,
            id: item.id,
            name: item.name || item.title,
            url: item.url,
            image_url: item.image_url || "",
            normalized: image,
          });
        }
      }

      if (offset + items.length >= Number(payload.total || payload.count || 0) || !items.length) break;
    }
  }

  return { total, problems };
}

function listHtmlFiles(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "backup", "_validation"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listHtmlFiles(full, out);
    else if (entry.name === "index.html") out.push(full);
  }
  return out;
}

function semanticDuplicates(srcs) {
  const groups = new Map();
  for (const src of srcs) {
    const key = imageKey(src);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(normalizeImageUrl(src));
  }

  return [...groups.entries()]
    .filter(([, values]) => new Set(values).size < values.length)
    .map(([key, values]) => ({ key, count: values.length }));
}

function auditStaticCatalogAndGallery() {
  const catalogPlaceholders = [];
  const galleriesWithExactDuplicates = [];
  let catalogFiles = 0;
  let productGalleryFiles = 0;

  for (const file of listHtmlFiles()) {
    const html = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (html.includes("catalog-content")) {
      catalogFiles += 1;
      const count = (html.match(/_assets\/tech7\/product-placeholder\.svg/gi) || []).length;
      if (count) catalogPlaceholders.push({ file: rel, count });
    }

    if (html.includes("image-show") && html.includes("nav-images")) {
      productGalleryFiles += 1;
      const imageShow = html.match(/<div class="image-show">([\s\S]*?)<div class="dots"><\/div>/i)?.[1] || "";
      const srcs = [...imageShow.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)].map((match) => match[1]);
      const duplicates = semanticDuplicates(srcs);
      if (duplicates.length) galleriesWithExactDuplicates.push({ file: rel, duplicates });
    }
  }

  return { catalogFiles, productGalleryFiles, catalogPlaceholders, galleriesWithExactDuplicates };
}

const backend = await auditBackendCards();
const staticAudit = auditStaticCatalogAndGallery();
const report = {
  generatedAt: new Date().toISOString(),
  backendCards: {
    total: backend.total,
    problems: backend.problems.length,
    samples: backend.problems.slice(0, 50),
  },
  staticCatalog: {
    files: staticAudit.catalogFiles,
    placeholderFiles: staticAudit.catalogPlaceholders.length,
    placeholders: staticAudit.catalogPlaceholders.reduce((sum, item) => sum + item.count, 0),
    samples: staticAudit.catalogPlaceholders.slice(0, 50),
  },
  productGalleries: {
    files: staticAudit.productGalleryFiles,
    exactDuplicateFiles: staticAudit.galleriesWithExactDuplicates.length,
    samples: staticAudit.galleriesWithExactDuplicates.slice(0, 50),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

console.log("[audit-site-card-gallery-images]");
console.log(JSON.stringify(report, null, 2));

if (backend.problems.length || staticAudit.catalogPlaceholders.length) {
  process.exitCode = 1;
}
