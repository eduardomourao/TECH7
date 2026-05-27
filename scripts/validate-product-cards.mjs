import fs from 'node:fs';
import path from 'node:path';
import {
  findRepairablePlaceholdersForFile,
  listAssetNames,
  listHtmlFiles,
  root,
} from './tech7-product-card-image-core.mjs';

const assetNames = listAssetNames();
const failures = [];
let filesScanned = 0;

for (const file of listHtmlFiles()) {
  const html = fs.readFileSync(file, 'utf8');
  filesScanned += 1;

  const repairable = findRepairablePlaceholdersForFile(html, assetNames, file);
  if (!repairable.length) continue;

  failures.push({
    file: path.relative(root, file),
    repairable,
  });
}

if (failures.length) {
  console.error('[validate-product-cards] FAIL');
  console.error(JSON.stringify({
    filesScanned,
    filesWithRepairablePlaceholders: failures.length,
    repairableCards: failures.reduce((total, item) => total + item.repairable.length, 0),
    samples: failures.slice(0, 10),
  }, null, 2));
  process.exit(1);
}

console.log('[validate-product-cards] OK');
console.log(JSON.stringify({
  filesScanned,
  filesWithRepairablePlaceholders: 0,
  repairableCards: 0,
}, null, 2));
