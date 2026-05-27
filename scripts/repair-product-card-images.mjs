import fs from 'node:fs';
import path from 'node:path';
import {
  listAssetNames,
  listHtmlFiles,
  repairCatalogHtmlForFile,
  root,
} from './tech7-product-card-image-core.mjs';

const dryRun = process.argv.includes('--dry-run');
const assetNames = listAssetNames();
const files = listHtmlFiles();

const summary = {
  filesScanned: 0,
  filesChanged: 0,
  cardsChanged: 0,
  changes: [],
};

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const result = repairCatalogHtmlForFile(html, assetNames, file);
  summary.filesScanned += 1;

  if (!result.changes.length) continue;

  summary.filesChanged += 1;
  summary.cardsChanged += result.changes.length;
  summary.changes.push({
    file: path.relative(root, file),
    cards: result.changes,
  });

  if (!dryRun) {
    fs.writeFileSync(file, result.html);
  }
}

console.log(JSON.stringify(summary, null, 2));

if (dryRun) {
  console.log('[repair-product-card-images] dry-run only; no files written');
} else {
  console.log(`[repair-product-card-images] updated ${summary.cardsChanged} cards in ${summary.filesChanged} files`);
}
