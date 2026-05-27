import fs from 'node:fs';
import path from 'node:path';
import {
  findRepairablePlaceholdersForFile,
  listAssetNames,
  listHtmlFiles,
  placeholderPath,
  productCardData,
  root,
} from './tech7-product-card-image-core.mjs';

function dataSrc(block) {
  return block.match(/<img\b[^>]*\sdata-src="([^"]+)"/i)?.[1] || '';
}

function localPathForImage(src, sourceFile) {
  if (!src || /^https?:/i.test(src) || /^data:/i.test(src) || src.startsWith('#')) return '';

  const clean = src.split(/[?#]/)[0];
  return clean.startsWith('/')
    ? path.join(root, clean.replace(/^\/+/, ''))
    : path.resolve(path.dirname(sourceFile), clean);
}

function localImageExists(src, sourceFile) {
  const file = localPathForImage(src, sourceFile);
  return !file || fs.existsSync(file);
}

const assetNames = listAssetNames();
const files = listHtmlFiles();
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    filesScanned: 0,
    catalogFiles: 0,
    productCards: 0,
    placeholders: 0,
    repairablePlaceholders: 0,
    unresolvedPlaceholders: 0,
    brokenLocalImages: 0,
  },
  repairablePlaceholders: [],
  unresolvedPlaceholders: [],
  brokenLocalImages: [],
};

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  report.summary.filesScanned += 1;
  if (!html.includes('product-name') || !html.includes('item flex')) continue;

  let hasCatalogCard = false;
  const repairable = findRepairablePlaceholdersForFile(html, assetNames, file);

  for (const match of html.matchAll(/<li class="item flex">([\s\S]*?)<\/li>/g)) {
    const block = match[0];
    if (!block.includes('product-name')) continue;

    hasCatalogCard = true;
    report.summary.productCards += 1;

    const card = productCardData(block);
    const lazySrc = dataSrc(block);
    const hasPlaceholder = card.src.includes(placeholderPath) || lazySrc.includes(placeholderPath);

    if (hasPlaceholder) {
      report.summary.placeholders += 1;
      const repairableCard = repairable.find((item) => item.href === card.href || item.name === card.name);
      if (repairableCard) {
        report.repairablePlaceholders.push({
          file: path.relative(root, file),
          ...repairableCard,
        });
      } else {
        report.unresolvedPlaceholders.push({
          file: path.relative(root, file),
          name: card.name,
          href: card.href,
          reason: 'Sem imagem real comprovada em dataLayer, search-index ou galeria da pagina do produto',
        });
      }
    }

    for (const image of [card.src, lazySrc].filter(Boolean)) {
      if (image.includes(placeholderPath)) continue;
      if (!localImageExists(image, file)) {
        report.brokenLocalImages.push({
          file: path.relative(root, file),
          name: card.name,
          href: card.href,
          image,
        });
      }
    }
  }

  if (hasCatalogCard) report.summary.catalogFiles += 1;
}

report.summary.repairablePlaceholders = report.repairablePlaceholders.length;
report.summary.unresolvedPlaceholders = report.unresolvedPlaceholders.length;
report.summary.brokenLocalImages = report.brokenLocalImages.length;

const outputPath = path.join(root, '_validation', 'product-card-image-audit.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log('[audit-product-card-images] OK');
console.log(JSON.stringify({
  output: path.relative(root, outputPath),
  summary: report.summary,
}, null, 2));
