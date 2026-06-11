import fs from 'node:fs';
import path from 'node:path';

export const root = process.cwd();
export const placeholderPath = '/_assets/tech7/product-placeholder.svg';
export const assetWebPrefix = '/_assets/images.tcdn.com.br/img/img_prod/996644/';
export const assetDir = path.join(root, '_assets', 'images.tcdn.com.br', 'img', 'img_prod', '996644');

export function listHtmlFiles(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'backup', '_validation'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listHtmlFiles(fullPath, out);
    } else if (entry.name === 'index.html') {
      out.push(fullPath);
    }
  }
  return out;
}

export function listAssetNames() {
  if (!fs.existsSync(assetDir)) return [];
  return fs.readdirSync(assetDir).filter((name) => /\.(?:jpe?g|png|webp|gif|avif)$/i.test(name));
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeRoute(value) {
  const route = String(value || '').split(/[?#]/)[0].trim();
  if (!route) return '';
  return route
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/index\.html$/i, '')
    .replace(/\/+$/g, '');
}

export function imageKey(value) {
  const file = String(value || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .split('/')
    .pop()
    .toLowerCase();

  return file
    .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '')
    .replace(/^\d{2,4}_/, '')
    .replace(/-[a-f0-9]{6,}$/i, '')
    .replace(/_[a-f0-9]{16,}$/i, '')
    .replace(/_\d{3,6}_\d+(?:_[a-f0-9]{2,})?$/i, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) index += 1;
  return index;
}

function imageSizeScore(name) {
  if (/^180_/i.test(name)) return 5000;
  if (/^450_/i.test(name)) return 4500;
  if (!/^\d{2,4}_/i.test(name)) return 4000;
  if (/^90_/i.test(name)) return 1000;
  return 500;
}

export function localImageForUrl(urlImage, assetNames) {
  const sourceKey = imageKey(urlImage);
  if (!sourceKey) return '';

  const candidates = assetNames
    .map((name) => {
      const candidateKey = imageKey(name);
      if (!candidateKey) return null;
      const prefix = commonPrefixLength(sourceKey, candidateKey);
      const minRequired = Math.min(36, Math.floor(Math.min(sourceKey.length, candidateKey.length) * 0.78));
      if (prefix < minRequired && !sourceKey.startsWith(candidateKey) && !candidateKey.startsWith(sourceKey)) {
        return null;
      }

      return {
        name,
        score: prefix * 100 + imageSizeScore(name) + Math.min(candidateKey.length, sourceKey.length),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return candidates[0] ? assetWebPrefix + candidates[0].name : '';
}

export function dataLayerProductsFromHtml(html) {
  const products = [];
  for (const match of html.matchAll(/<script>\s*dataLayer\s*=\s*(\[[\s\S]*?\])<\/script>/gi)) {
    try {
      const layer = JSON.parse(match[1]);
      for (const item of layer) {
        if (Array.isArray(item?.listProducts)) products.push(...item.listProducts);
      }
    } catch {
      // Ignore non-JSON script blocks.
    }
  }
  return products;
}

export function productCardData(block) {
  const name = (block.match(/<div class="product-name">([\s\S]*?)<\/div>/i)?.[1] || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const href = block.match(/<a class="space-image[^"']*" href="([^"]+)"/i)?.[1] || '';
  const src = block.match(/<img\b[^>]*\ssrc="([^"]+)"/i)?.[1] || '';
  return { name, href, src };
}

export function productLookup(products) {
  const byRoute = new Map();
  const byName = new Map();
  for (const product of products) {
    if (product?.urlProduct) byRoute.set(normalizeRoute(product.urlProduct), product);
    if (product?.nameProduct) byName.set(normalizeText(product.nameProduct), product);
  }
  return { byRoute, byName };
}

export function matchingProduct(card, lookup) {
  return lookup.byRoute.get(normalizeRoute(card.href)) || lookup.byName.get(normalizeText(card.name));
}

function productPagePath(card, sourceFile) {
  const href = String(card.href || '').split(/[?#]/)[0];
  if (!href) return '';

  const route = href.replace(/\/+$/g, '');
  const relative = route.endsWith('/index.html') ? route : `${route}/index.html`;
  const file = relative.startsWith('/')
    ? path.join(root, relative.replace(/^\/+/, ''))
    : path.resolve(path.dirname(sourceFile), relative);

  return fs.existsSync(file) ? file : '';
}

function productPageImage(card, sourceFile, assetNames) {
  const file = productPagePath(card, sourceFile);
  if (!file) return '';

  const html = fs.readFileSync(file, 'utf8');
  const images = [];

  for (const match of html.matchAll(/"urlImage"\s*:\s*"([^"]+)"/gi)) {
    images.push(match[1].replace(/\\\//g, '/'));
  }

  for (const match of html.matchAll(/"image"\s*:\s*"([^"]+)"/gi)) {
    images.push(match[1].replace(/\\\//g, '/'));
  }

  for (const image of images) {
    const localImage = localImageForUrl(image, assetNames);
    if (localImage) return localImage;
  }

  const gallery = html.match(/<div class="image-show">([\s\S]*?)<div class="dots"><\/div><\/div>/i)?.[1] || '';
  for (const match of gallery.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi)) {
    const image = match[1];
    if (!image || image.includes('product-placeholder.svg') || /^data:/i.test(image)) continue;

    const cleanImage = image.split(/[?#]/)[0];
    const filePath = cleanImage.startsWith('/')
      ? path.join(root, cleanImage.replace(/^\/+/, ''))
      : path.resolve(path.dirname(file), cleanImage);

    if (fs.existsSync(filePath)) {
      return `/${path.relative(root, filePath).replace(/\\/g, '/')}`;
    }
  }

  return '';
}

function searchIndexImage(card, assetNames) {
  const searchPath = path.join(root, '_assets', 'tech7', 'search-index.json');
  if (!fs.existsSync(searchPath)) return '';

  let items = [];
  try {
    const index = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
    items = Array.isArray(index?.items) ? index.items : [];
  } catch {
    return '';
  }

  const route = normalizeRoute(card.href).replace(/^\/+/, '');
  const name = normalizeText(card.name);
  const product = items.find((item) =>
    String(item?.url || '').replace(/\/index\.html$/i, '') === route ||
    normalizeText(item?.title) === name
  );

  if (!product?.image) return '';
  return localImageForUrl(product.image, assetNames);
}

function cardImageCandidate(card, lookup, assetNames, sourceFile) {
  const fromProductPage = productPageImage(card, sourceFile, assetNames);
  if (fromProductPage) return { image: fromProductPage, source: 'product-page' };

  const fromSearchIndex = searchIndexImage(card, assetNames);
  if (fromSearchIndex) return { image: fromSearchIndex, source: 'search-index' };

  const product = matchingProduct(card, lookup);
  if (product?.urlImage) {
    const localImage = localImageForUrl(product.urlImage, assetNames);
    if (localImage) return { image: localImage, source: 'catalog-dataLayer' };
  }

  return null;
}

function repairFirstImageTag(block, localImage) {
  return block.replace(/<img\b[^>]*>/i, (tag) =>
    tag
      .replace(/(\ssrc=["'])([^"']*)(["'])/i, `$1${localImage}$3`)
      .replace(/(\sdata-src=["'])([^"']*)(["'])/i, `$1${localImage}$3`),
  );
}

function cardNeedsImageRepair(card, candidate) {
  if (!candidate?.image) return false;
  if (!card.src || /(?:^|\/)product-placeholder\.svg(?:$|[?#])/i.test(card.src)) return true;
  return imageKey(card.src) !== imageKey(candidate.image);
}

export function repairCatalogHtml(html, assetNames) {
  return repairCatalogHtmlForFile(html, assetNames, root);
}

export function repairCatalogHtmlForFile(html, assetNames, sourceFile) {
  if (!html.includes('catalog-content') || !html.includes('listProducts')) {
    return { html, changes: [] };
  }

  const products = dataLayerProductsFromHtml(html);
  const lookup = productLookup(products);
  const changes = [];

  const nextHtml = html.replace(/<li class="item flex">([\s\S]*?)<\/li>/g, (full) => {
    const card = productCardData(full);
    const candidate = cardImageCandidate(card, lookup, assetNames, sourceFile);
    if (!cardNeedsImageRepair(card, candidate)) return full;

    const repaired = repairFirstImageTag(full, candidate.image);

    if (repaired !== full) {
      changes.push({
        name: card.name,
        href: card.href,
        previousImage: card.src,
        image: candidate.image,
        source: candidate.source,
      });
    }

    return repaired;
  });

  return { html: nextHtml, changes };
}

export function findRepairablePlaceholders(html, assetNames) {
  return findRepairablePlaceholdersForFile(html, assetNames, root);
}

export function findRepairablePlaceholdersForFile(html, assetNames, sourceFile) {
  if (!html.includes('catalog-content') || !html.includes('listProducts') || !html.includes(placeholderPath)) {
    return [];
  }

  const products = dataLayerProductsFromHtml(html);
  const lookup = productLookup(products);
  const repairable = [];

  for (const match of html.matchAll(/<li class="item flex">([\s\S]*?)<\/li>/g)) {
    const block = match[0];

    const card = productCardData(block);
    if (!/\/_assets\/tech7\/product-placeholder\.svg/i.test(card.src)) continue;

    const candidate = cardImageCandidate(card, lookup, assetNames, sourceFile);
    if (!candidate?.image) continue;

    repairable.push({
      name: card.name,
      href: card.href,
      image: candidate.image,
      source: candidate.source,
    });
  }

  return repairable;
}

export function findCardImageMismatchesForFile(html, assetNames, sourceFile) {
  if (!html.includes('catalog-content') || !html.includes('listProducts')) {
    return [];
  }

  const products = dataLayerProductsFromHtml(html);
  const lookup = productLookup(products);
  const mismatches = [];

  for (const match of html.matchAll(/<li class="item flex">([\s\S]*?)<\/li>/g)) {
    const block = match[0];
    if (!block.includes('product-name')) continue;

    const card = productCardData(block);
    const candidate = cardImageCandidate(card, lookup, assetNames, sourceFile);
    if (!cardNeedsImageRepair(card, candidate)) continue;

    mismatches.push({
      name: card.name,
      href: card.href,
      cardImage: card.src,
      expectedImage: candidate.image,
      source: candidate.source,
      reason: card.src ? 'card-image-differs-from-product' : 'card-image-missing',
    });
  }

  return mismatches;
}
