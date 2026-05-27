import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targetDirs = ['display', 'display-e-lcd', 'display-lcd', 'tela-display-lcd', 'telas-display-lcd'];
const reportPath = path.join(root, '_validation', 'display-product-layout-fix-report.json');

const brokenNeedle = '<div class="dots"></div></div></div><div class="product-colum-right">';
const fixedNeedle = '<div class="dots"></div></div></div></div><div class="product-colum-right">';
const leftNeedle = '<div class="product-colum-left">';
const rightNeedle = '<div class="product-colum-right">';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && entry.name === 'index.html') {
      files.push(full);
    }
  }
  return files;
}

const report = {
  scanned: 0,
  productPages: 0,
  changedFiles: 0,
  alreadyFixed: 0,
  skippedAliases: 0,
  changed: [],
  remainingBrokenPattern: [],
};

function divBalanceBeforeRight(html) {
  const leftStart = html.indexOf(leftNeedle);
  const rightStart = html.indexOf(rightNeedle);
  if (leftStart === -1 || rightStart === -1 || rightStart < leftStart) return 0;
  const between = html.slice(leftStart, rightStart);
  const opens = between.match(/<div\b/gi)?.length || 0;
  const closes = between.match(/<\/div>/gi)?.length || 0;
  return opens - closes;
}

for (const dir of targetDirs) {
  for (const file of walk(path.join(root, dir))) {
    report.scanned += 1;
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('class="page-product"') && !html.includes("class='page-product'")) {
      if (html.includes('TECH7_PRODUCT_ALIAS_PAGE')) report.skippedAliases += 1;
      continue;
    }

    report.productPages += 1;
    const balance = divBalanceBeforeRight(html);
    if (balance <= 0) {
      report.alreadyFixed += 1;
      continue;
    }

    if (html.includes(brokenNeedle)) {
      html = html.replace(brokenNeedle, fixedNeedle);
      fs.writeFileSync(file, html);
      report.changedFiles += 1;
      report.changed.push(path.relative(root, file).replaceAll(path.sep, '/'));
      continue;
    }

    if (html.includes(leftNeedle) && html.includes(rightNeedle)) {
      html = html.replace(rightNeedle, `${'</div>'.repeat(balance)}${rightNeedle}`);
      fs.writeFileSync(file, html);
      report.changedFiles += 1;
      report.changed.push(path.relative(root, file).replaceAll(path.sep, '/'));
      continue;
    }
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
