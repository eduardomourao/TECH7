import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targetBrands = ["apple", "xiaomi-redmi", "samsung", "motorola", "realme"];
const targetRoots = ["display", "display-e-lcd"];
const localAssetDir = path.join(root, "_assets", "images.tcdn.com.br", "img", "img_prod", "996644");
const centralAssetDir = path.join("C:", "Users", "Admin", "Downloads", "central", "centralselling oficial", "_assets", "images.tcdn.com.br", "img", "img_prod", "996644");
const reportDir = path.join(root, "_validation");
const reportPath = path.join(reportDir, "display-brand-repair-report.json");

const templates = {
  apple: "display/apple/display-iphone-12-12-pro/index.html",
  samsung: "display/samsung/tela-display-lcd-samsung-s23-fe-s771-original-retirada-sem-aro/index.html",
  motorola: "display/motorola/lcd-moto-e7-power-xt2097-com-aro/index.html",
  "xiaomi-redmi": "display/xiaomi-redmi/lcd-para-xiaomi-mi-11-lite-5g/index.html",
  realme: "display/realme/tela-display-lcd-realme-c30-c33-rmx3581/index.html"
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (entry.name.toLowerCase() === "index.html") out.push(abs);
  }
  return out;
}

function rel(abs) {
  return path.relative(root, abs).replace(/\\/g, "/");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function parseDataLayerProduct(html) {
  const match = html.match(/dataLayer\s*=\s*(\[\{[\s\S]*?\}\])\s*<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1])[0] || null;
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteral(html, from, to) {
  if (!from || from === to) return html;
  return html.split(String(from)).join(String(to ?? ""));
}

function brPrice(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  return `R$ ${Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}`;
}

function priceFixed(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function installment(price) {
  const n = Number(String(price ?? 0).replace(",", "."));
  if (!Number.isFinite(n)) return "0.00";
  return (n / (1 - 0.125) / 3).toFixed(2);
}

function setMeta(html, keyType, key, content) {
  const keyLower = key.toLowerCase();
  let changed = false;
  const out = html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const attr = new RegExp(`${keyType}\\s*=\\s*["']${escapeRegExp(keyLower)}["']`, "i");
    if (!attr.test(tag.toLowerCase())) return tag;
    changed = true;
    if (/\scontent\s*=\s*["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\scontent\s*=\s*["'][^"']*["']/i, ` content="${content.replace(/"/g, "&quot;")}"`);
    }
    return tag.replace(/\s*\/?>$/, ` content="${content.replace(/"/g, "&quot;")}">`);
  });
  if (changed) return out;
  return out;
}

function normalizeRoute(raw) {
  const clean = String(raw || "").trim().replace(/\\/g, "/").replace(/^https?:\/\/[^/]+/i, "");
  const route = clean.split("?")[0].split("#")[0].replace(/\/index\.html$/i, "").replace(/\/+$/, "");
  return route.startsWith("/") ? route : `/${route}`;
}

function fileForRoute(route) {
  const clean = normalizeRoute(route).replace(/^\/+/, "");
  if (!clean) return path.join(root, "index.html");
  return path.join(root, clean, "index.html");
}

function routeExists(route) {
  return fs.existsSync(fileForRoute(route));
}

function sectionBrandFromPath(relativePath) {
  const parts = relativePath.split("/");
  return { section: parts[0] || "", brand: parts[1] || "" };
}

function templateForBrand(brand) {
  const tpl = templates[brand];
  if (!tpl) return null;
  const abs = path.join(root, tpl);
  return fs.existsSync(abs) ? abs : null;
}

function createAssetIndex(dirPath, knownIds) {
  const index = new Map();
  if (!fs.existsSync(dirPath)) return index;
  const known = new Set(Array.from(knownIds || []).map(String));
  for (const file of fs.readdirSync(dirPath)) {
    const segments = Array.from(file.matchAll(/_(\d{2,6})(?=_)/g)).map((m) => m[1]);
    if (!segments.length) continue;
    const id = [...segments].reverse().find((candidate) => known.has(candidate));
    if (!id) continue;
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(file);
  }
  return index;
}

function sortImageNames(files) {
  const weight = (name) => {
    if (name.startsWith("90_")) return 3;
    if (name.startsWith("180_")) return 2;
    return 1;
  };
  return [...files].sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wa - wb;
    return a.localeCompare(b);
  });
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tokenizedHints(productName, route) {
  const routeSlug = String(route || "").split("/").filter(Boolean).pop() || "";
  const routeBase = routeSlug.replace(/-[a-f0-9]{8,}$/i, "");
  const source = `${productName || ""} ${routeBase}`;
  const normalized = normalizeForMatch(source);
  const stop = new Set(["tela", "display", "lcd", "com", "sem", "aro", "incell", "oled", "original", "nacional", "para", "de", "da", "do", "pro", "max", "plus", "xt", "5g", "4g", "a", "e"]);
  const tokens = normalized.split("_").filter((t) => t && !stop.has(t) && (t.length >= 3 || /^\d+$/.test(t)));
  return Array.from(new Set(tokens));
}

function heuristicPickImageNames(productName, route, localAll, centralAll) {
  const tokens = tokenizedHints(productName, route);
  if (!tokens.length) return [];
  const sources = Array.from(new Set([...(localAll || []), ...(centralAll || [])]));
  const scored = [];
  for (const file of sources) {
    const lc = file.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (lc.includes(token)) score += token.length >= 5 ? 2 : 1;
    }
    if (score >= 3) scored.push({ file, score });
  }
  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored.slice(0, 12).map((x) => x.file);
}

function ensureLocalImages(product, route, localIndex, centralIndex, localAll, centralAll, copiedFiles) {
  const key = String(product?.idProduct || "");
  const local = localIndex.get(key) || [];
  if (local.length) return local;
  const central = centralIndex.get(key) || [];
  const heuristic = central.length ? [] : heuristicPickImageNames(product?.nameProduct || "", route, localAll, centralAll);
  const candidate = central.length ? central : heuristic;
  if (!candidate.length) return [];
  const copied = [];
  for (const file of candidate) {
    const fromCentral = path.join(centralAssetDir, file);
    const fromLocal = path.join(localAssetDir, file);
    const to = path.join(localAssetDir, file);
    if (fs.existsSync(fromLocal)) {
      copied.push(file);
      continue;
    }
    if (fs.existsSync(fromCentral)) {
      fs.copyFileSync(fromCentral, to);
      copiedFiles.push(file);
      copied.push(file);
    }
  }
  if (!copied.length) return [];
  if (!localIndex.has(key)) localIndex.set(key, []);
  localIndex.set(key, Array.from(new Set([...(localIndex.get(key) || []), ...copied])));
  return localIndex.get(key) || [];
}

function galleryHtml(productName, imageFiles) {
  const unique = Array.from(new Set(imageFiles));
  const full = unique.filter((f) => !f.startsWith("90_")).slice(0, 8);
  const main = full.length ? full : unique.slice(0, 8);
  const thumbs = unique.filter((f) => f.startsWith("90_"));
  if (!main.length) return "";

  const navSlides = main.map((file, index) => {
    const thumb = thumbs[index] || file;
    const src = `/_assets/images.tcdn.com.br/img/img_prod/996644/${thumb}`;
    return `<div class="item swiper-slide"><div class="box-img index-list${index === 0 ? " active" : ""}" data-index="${index + 1}"><img src="${src}" alt="${productName} - Image thumb ${index + 1}" class="swiper-lazy" data-src="${src}" width="300" height="300" loading="lazy"></div></div>`;
  }).join("");

  const mainSlides = main.map((file, index) => {
    const src = `/_assets/images.tcdn.com.br/img/img_prod/996644/${file}`;
    return `<div class="item swiper-slide"><div class="box-img index-list${index === 0 ? " active" : ""}" data-index="${index + 1}"><div class="zoom"><img src="${src}" alt="${productName}" class="swiper-lazy" data-src="${src}" width="2000" height="2000" loading="lazy"></div></div></div>`;
  }).join("");

  return `<div class="box-gallery flex"><div class="nav-images"><div class="list swiper-container"><div class="swiper-wrapper">${navSlides}</div></div><div class="controls"><div class="arrow prev"><svg class="icon" viewBox="0 0 451.847 451.847"><path d="M97.141,225.92c0-8.095,3.091-16.192,9.259-22.366L300.689,9.27c12.359-12.359,32.397-12.359,44.751,0   c12.354,12.354,12.354,32.388,0,44.748L173.525,225.92l171.903,171.909c12.354,12.354,12.354,32.391,0,44.744   c-12.354,12.365-32.386,12.365-44.745,0l-194.29-194.281C100.226,242.115,97.141,234.018,97.141,225.92z"></path></svg></div><div class="arrow next"><svg class="icon" viewBox="0 0 451.846 451.847"><path d="M345.441,248.292L151.154,442.573c-12.359,12.365-32.397,12.365-44.75,0c-12.354-12.354-12.354-32.391,0-44.744   L278.318,225.92L106.409,54.017c-12.359-12.359-12.354-32.394,0-44.748c12.354-12.359,32.391-12.359,44.75,0l194.287,194.284   c6.177,6.18,9.262,14.271,9.262,22.366C354.708,234.018,351.617,242.115,345.441,248.292z"></path></svg></div></div></div><div class="image-show"><div class="list swiper-container"><div class="swiper-wrapper">${mainSlides}</div></div><div class="dots"></div></div></div>`;
}

function normalizeStaticPaths(html, section, brand) {
  let out = html;
  out = out.replace(/(\.\.\/)+\/?_assets\//g, "/_assets/");
  out = out.replace(/(\.\.\/)+\/?assets\//g, "/assets/");
  out = out.replace(/(\.\.\/)+logo\.png/gi, "/logo.png");
  out = out.replace(/(\.\.\/)+favicon\.ico/gi, "/favicon.ico");
  out = out.replace(/(\.\.\/)+favicon\.png/gi, "/favicon.png");
  out = out.replace(/(\.\.\/)+apple-touch-icon\.png/gi, "/apple-touch-icon.png");
  out = out.replace(new RegExp(`/${section}/${brand}/\\.\\./\\.\\./`, "g"), "/");
  out = out.replace(new RegExp(`/${section}/${brand}/\\.\\./`, "g"), `/${section}/`);
  return out;
}

function rebuildFromTemplate(currentHtml, templateHtml, currentProduct, templateProduct, currentRoute) {
  let html = templateHtml;
  const currentTitle = currentHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || currentProduct.nameProduct || "TECH 7";
  const currentMetaTitle = currentHtml.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i)?.[1] || currentTitle;
  const currentDescription = currentHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
  const currentKeywords = currentHtml.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
  const newPrice = priceFixed(currentProduct.priceSell || currentProduct.price);
  const oldPrice = priceFixed(templateProduct.priceSell || templateProduct.price);

  const replacements = [
    [templateProduct.idProduct, currentProduct.idProduct],
    [templateProduct.nameProduct, currentProduct.nameProduct],
    [templateProduct.reference, currentProduct.reference || ""],
    [templateProduct.urlProduct, currentRoute],
    [oldPrice, newPrice],
    [installment(oldPrice), installment(newPrice)],
    [brPrice(oldPrice), brPrice(newPrice)]
  ];
  for (const [from, to] of replacements) html = replaceLiteral(html, from, to);

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${currentTitle}</title>`);
  html = setMeta(html, "name", "title", currentMetaTitle);
  if (currentDescription) {
    html = setMeta(html, "name", "description", currentDescription);
    html = setMeta(html, "property", "og:description", currentDescription);
  }
  if (currentKeywords) html = setMeta(html, "name", "keywords", currentKeywords);
  html = setMeta(html, "property", "og:title", currentMetaTitle);
  html = setMeta(html, "property", "og:url", currentRoute);

  const mergedProduct = {
    ...templateProduct,
    ...currentProduct,
    pageTitle: currentMetaTitle,
    idProduct: String(currentProduct.idProduct),
    nameProduct: currentProduct.nameProduct,
    priceSell: newPrice,
    price: newPrice,
    urlProduct: currentRoute,
    priceSellDetails: [{ name: "", "installment.months": "3", "installment.amount": installment(newPrice) }]
  };
  html = html.replace(/dataLayer\s*=\s*\[\{[\s\S]*?\}\]\s*<\/script>/i, `dataLayer = ${JSON.stringify([mergedProduct])}</script>`);
  return html;
}

function replaceGallery(html, productName, localFiles) {
  const gallery = galleryHtml(productName, sortImageNames(localFiles));
  if (!gallery) return html;
  const updated = html.replace(/<div class="box-gallery flex">[\s\S]*?<div class="product-colum-right">/i, `${gallery}<div class="product-colum-right">`);
  return updated;
}

function normalizeProblemLinks(html, section, brand) {
  const rules = [
    [/href=(["'])\.\.\/\.\.\/realme\/index\.html\1/gi, `href="/${section}/realme"`],
    [/href=(["'])\.\.\/\.\.\/infinix\/index\.html\1/gi, `href="/${section}/infinix"`],
    [/href=(["'])\.\.\/([^"']+)\/index\.html\1/gi, (_m, q, slug) => {
      const canonical = `/${section}/${brand}/${slug}`;
      return routeExists(canonical) ? `href=${q}${canonical}${q}` : _m;
    }],
    [/href=(["'])\.\.\/\.\.\/([^"']+)\/([^"']+)\/index\.html\1/gi, (_m, q, b, slug) => {
      const canonicalA = `/${section}/${b}/${slug}`;
      const canonicalB = `/display/${b}/${slug}`;
      const selected = routeExists(canonicalA) ? canonicalA : (routeExists(canonicalB) ? canonicalB : "");
      return selected ? `href=${q}${selected}${q}` : _m;
    }]
  ];

  let out = html;
  for (const [regex, replacement] of rules) {
    out = out.replace(regex, replacement);
  }
  return out;
}

function auditHtml(html, filePath, productId) {
  const hasHeader = /<header\b/i.test(html);
  const hasMain = /<main\b/i.test(html);
  const hasFooter = /<footer\b/i.test(html);
  const galleryBlockMatch = html.match(/<div class="box-gallery flex">[\s\S]*?<div class="product-colum-right">/i);
  const galleryBlock = galleryBlockMatch?.[0] || "";
  const galleryRefs = Array.from(galleryBlock.matchAll(/<(?:img)\b[^>]*(?:src|data-src)=["']([^"']+)["']/gi)).map((m) => m[1]);
  const productImageRefs = galleryRefs.filter((src) => /img\/img_prod\/996644\//i.test(src));
  const baseDir = path.dirname(filePath);
  const missingProductImages = productImageRefs.filter((src) => {
    const clean = src.replace(/\\/g, "/");
    if (/^https?:/i.test(clean) || /^\/\//.test(clean)) {
      const marker = "/img/img_prod/996644/";
      const pos = clean.indexOf(marker);
      if (pos < 0) return true;
      const file = clean.slice(pos + marker.length).split("?")[0].split("#")[0];
      return !fs.existsSync(path.join(localAssetDir, file));
    }
    if (clean.startsWith("/")) return !fs.existsSync(path.join(root, clean.replace(/^\/+/, "")));
    return !fs.existsSync(path.resolve(baseDir, clean));
  });
  return {
    hasHeader,
    hasMain,
    hasFooter,
    productImageRefs: Array.from(new Set(productImageRefs)).length,
    missingProductImagesCount: missingProductImages.length
  };
}

function main() {
  const files = [];
  for (const section of targetRoots) {
    for (const brand of targetBrands) {
      files.push(...walk(path.join(root, section, brand)));
    }
  }

  const knownIds = new Set();
  for (const abs of files) {
    const data = parseDataLayerProduct(read(abs));
    if (data?.idProduct) knownIds.add(String(data.idProduct));
  }

  const localIndex = createAssetIndex(localAssetDir, knownIds);
  const centralIndex = createAssetIndex(centralAssetDir, knownIds);
  const localAll = fs.existsSync(localAssetDir) ? fs.readdirSync(localAssetDir) : [];
  const centralAll = fs.existsSync(centralAssetDir) ? fs.readdirSync(centralAssetDir) : [];
  const copiedImages = [];
  const results = [];

  for (const abs of files) {
    const relative = rel(abs);
    const { section, brand } = sectionBrandFromPath(relative);
    const beforeHtml = read(abs);
    const beforeProduct = parseDataLayerProduct(beforeHtml);
    let workingHtml = normalizeStaticPaths(beforeHtml, section, brand);
    workingHtml = normalizeProblemLinks(workingHtml, section, brand);
    if (workingHtml !== beforeHtml) write(abs, workingHtml);

    if (!beforeProduct?.idProduct) {
      results.push({ file: relative, skipped: "missing-datalayer" });
      continue;
    }

    const templatePath = templateForBrand(brand);
    const templateHtml = templatePath ? read(templatePath) : "";
    const templateProduct = templateHtml ? parseDataLayerProduct(templateHtml) : null;
    const route = normalizeRoute(beforeProduct.urlProduct || `/${relative.replace(/\/index\.html$/i, "")}`);

    const needsRebuild = !/<header\b/i.test(workingHtml) || !/<main\b/i.test(workingHtml) || !/<footer\b/i.test(workingHtml);
    if (needsRebuild && templateProduct) {
      workingHtml = rebuildFromTemplate(workingHtml, templateHtml, beforeProduct, templateProduct, route);
    }

    const localImages = ensureLocalImages(beforeProduct, route, localIndex, centralIndex, localAll, centralAll, copiedImages);
    if (localImages.length) {
      workingHtml = replaceGallery(workingHtml, beforeProduct.nameProduct || "Produto TECH 7", localImages);
      const primary = sortImageNames(localImages).find((name) => !name.startsWith("90_")) || sortImageNames(localImages)[0];
      if (primary) {
        const ogLocal = `/_assets/images.tcdn.com.br/img/img_prod/996644/${primary}`;
        workingHtml = setMeta(workingHtml, "property", "og:image", ogLocal);
      }
    }

    workingHtml = normalizeStaticPaths(workingHtml, section, brand);
    workingHtml = normalizeProblemLinks(workingHtml, section, brand);
    if (workingHtml !== beforeHtml) write(abs, workingHtml);

    const audit = auditHtml(workingHtml, abs, beforeProduct.idProduct);
    results.push({
      file: relative,
      route,
      section,
      brand,
      productId: String(beforeProduct.idProduct),
      productName: beforeProduct.nameProduct || "",
      rebuilt: needsRebuild && Boolean(templateProduct),
      galleryImages: localImages.length,
      header: audit.hasHeader,
      main: audit.hasMain,
      footer: audit.hasFooter,
      productImageRefs: audit.productImageRefs,
      missingProductImagesCount: audit.missingProductImagesCount
    });
  }

  const failed = results.filter((r) =>
    !r.skipped &&
    (
      !r.header ||
      !r.main ||
      !r.footer ||
      (r.productImageRefs === 0 && r.galleryImages === 0) ||
      r.missingProductImagesCount > 0
    )
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    processed: results.filter((r) => !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    rebuilt: results.filter((r) => r.rebuilt).length,
    copiedImages: Array.from(new Set(copiedImages)).length,
    failedCount: failed.length
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ summary, failed, results }, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) process.exitCode = 2;
}

main();
