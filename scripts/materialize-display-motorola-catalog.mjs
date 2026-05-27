import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targetPath = path.join(root, "display-e-lcd", "motorola", "index.html");
const templatePath = path.join(root, "display-e-lcd", "samsung", "index.html");
const searchIndexPath = path.join(root, "_assets", "tech7", "search-index.json");
const placeholderImage = "/_assets/tech7/product-placeholder.svg";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function extractScript(html, marker) {
  const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  return scripts.find((script) => script.includes(marker)) || "";
}

function extractDataLayer(html) {
  const marker = "dataLayer = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("dataLayer not found");
  const end = html.indexOf("</script>", start);
  if (end === -1) throw new Error("dataLayer script end not found");
  const json = html.slice(start + marker.length, end).trim().replace(/;$/, "");
  const parsed = JSON.parse(json);
  const catalog = parsed.find((entry) => Array.isArray(entry?.listProducts));
  if (!catalog) throw new Error("catalog listProducts not found");
  return { parsed, catalog, script: `<script>dataLayer = ${JSON.stringify(parsed)};</script>` };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeRoute(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let route = raw;
  try {
    route = new URL(raw).pathname;
  } catch {}
  route = route
    .replace(/\\/g, "/")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return route;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSlug(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function assetExists(localPath) {
  if (!localPath || !localPath.startsWith("/")) return false;
  return fs.existsSync(path.join(root, ...localPath.slice(1).split("/")));
}

function localAssetPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/_assets/")) return raw;
  try {
    const url = new URL(raw);
    if (/images\.tcdn\.com\.br$/i.test(url.hostname)) {
      return "/_assets/images.tcdn.com.br" + url.pathname;
    }
  } catch {
    if (raw.startsWith("_assets/")) return "/" + raw;
  }
  return raw;
}

function buildSearchImageIndex() {
  const byRoute = new Map();
  const bySlug = new Map();
  const byTitle = new Map();
  if (!fs.existsSync(searchIndexPath)) return { byRoute, bySlug, byTitle };

  const searchIndex = JSON.parse(read(searchIndexPath));
  for (const item of searchIndex.items || []) {
    const image = localAssetPath(item.image);
    if (!assetExists(image)) continue;

    const route = normalizeRoute(item.url);
    const slug = normalizeSlug(item.slug || route.split("/").pop());
    const title = normalizeText(item.title || item.description);

    if (route && !byRoute.has(route)) byRoute.set(route, image);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, image);
    if (title && !byTitle.has(title)) byTitle.set(title, image);
  }
  return { byRoute, bySlug, byTitle };
}

const searchImages = buildSearchImageIndex();

function imageForProduct(product) {
  const route = normalizeRoute(product.urlProduct);
  const routeParts = route.split("/");
  const slug = normalizeSlug(routeParts[routeParts.length - 1]);
  const title = normalizeText(product.nameProduct);
  const directLocal = localAssetPath(product.urlImage);

  return searchImages.byRoute.get(route)
    || searchImages.byRoute.get(route.replace(/^display-e-lcd\//, "display/"))
    || searchImages.bySlug.get(slug)
    || searchImages.byTitle.get(title)
    || (assetExists(directLocal) ? directLocal : placeholderImage);
}

function money(value) {
  const number = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Preço sob consulta";
}

function installment(value) {
  const number = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return "";
  return (number / (1 - 0.125) / 3).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function productCard(product) {
  const name = product.nameProduct || "Produto TECH 7";
  const href = product.urlProduct || "#";
  const image = imageForProduct(product);
  const price = money(product.sellPrice || product.price);
  const installmentPrice = installment(product.sellPrice || product.price);
  return `<li class="item flex"><div class="product nb show-down"><div class="image"><a class="space-image second" href="${escapeHtml(href)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" class="lazyload transform" data-src="${escapeHtml(image)}" width="450" height="450" loading="lazy"></a></div><a class="info-product" href="${escapeHtml(href)}"><div class="product-name">${escapeHtml(name)}</div><div class="down-line"><div class="list-star flex justify-center"><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div></div><div class="box-price"><div class="price"><div class="product-price"><span class="price-off"><span>${escapeHtml(price)}</span></span></div></div>${installmentPrice ? `<div class="product-payment"><span>em 3x de <strong>${escapeHtml(installmentPrice)}</strong> MasterCard - Elo</span></div>` : ""}</div></div></a><div class="variants hide-on-mobile"><form class="list-variants" data-api-cart="1" data-id="${escapeHtml(product.idProduct || "")}" data-variants=""><div class="flex add-cart"><input required="" type="number" value="1"/><button class="action">Adicionar ao carrinho</button></div></form></div></div></li>`;
}

function replaceBetween(html, startMarker, endMarker, replacement) {
  const start = html.indexOf(startMarker);
  if (start === -1) throw new Error(`start marker not found: ${startMarker}`);
  const end = html.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker}`);
  return html.slice(0, start + startMarker.length) + replacement + html.slice(end);
}

const original = read(targetPath);
const template = read(templatePath);
const { catalog, script: dataLayerScript } = extractDataLayer(original);
const ga4Script = extractScript(original, "view_item_list");
const cards = catalog.listProducts.map(productCard).join("");

let next = template;
next = next.replace(/<title>[\s\S]*?<\/title>/i, "<title>Display Motorola | Telas Moto - TECH 7</title>");
next = next.replace(/<meta content="[^"]*" name="description"\/>/i, '<meta content="MOTOROLA" name="description"/>');
next = next.replace(/<meta content="\/display-e-lcd\/samsung" property="og:url"\/>/i, '<meta content="/display-e-lcd/motorola" property="og:url"/>');
next = next.replace(/<meta content="[^"]*Samsung[^"]*" property="og:title"\/>/i, '<meta content="Display Motorola | Telas Moto - TECH 7" property="og:title"/>');
next = next.replace(/<meta content="[^"]*Samsung[^"]*" property="og:description"\/>/i, '<meta content="MOTOROLA" property="og:description"/>');
next = next.replace(/<link href="\/loja\/catalogo\.php\?loja=996644&amp;categoria=\d+&amp;pg=2" rel="next"\/>/i, "");

const templateDataLayerScript = extractScript(next, "dataLayer = ");
if (!templateDataLayerScript) throw new Error("template dataLayer not found");
next = next.replace(templateDataLayerScript, dataLayerScript);

const templateGa4Script = extractScript(next, "view_item_list");
if (templateGa4Script && ga4Script) next = next.replace(templateGa4Script, ga4Script);

next = next.replace(/SAMSUNG/g, "MOTOROLA");
next = next.replace(/Samsung Galaxy/g, "Motorola Moto");
next = next.replace(/Samsung/g, "Motorola");
next = next.replace(/Displays Motorola Galaxy com qualidade e pronta entrega na TECH 7\./g, "Displays Motorola Moto com qualidade e pronta entrega na TECH 7.");

next = replaceBetween(
  next,
  '<ul class="list flex f-wrap row">',
  '</ul></div></div><div class="catalog-footer pagination">',
  cards
);
next = replaceBetween(
  next,
  '<div class="catalog-footer pagination">',
  '</div></div></div></div></div></div></div></main>',
  '<div class="flex align-center justify-center"><div class="paginate-links"><span class="page-current page-link">1</span></div></div>'
);

fs.writeFileSync(targetPath, next, "utf8");

console.log(JSON.stringify({
  updated: path.relative(root, targetPath).replace(/\\/g, "/"),
  products: catalog.listProducts.length,
  template: path.relative(root, templatePath).replace(/\\/g, "/")
}, null, 2));
