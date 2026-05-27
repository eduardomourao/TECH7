import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const mapPath = path.join(root, '_validation', 'display-products-map.json');
const outPath = path.join(root, '_validation', 'display-all-product-layout-results.json');
const screenshotDir = path.join(root, '_validation', 'display-layout-failures');

const baseUrl = process.env.TECH7_BASE_URL || 'http://localhost:3000';
const limit = Number.parseInt(process.env.DISPLAY_LAYOUT_LIMIT || '0', 10);

if (!fs.existsSync(mapPath)) {
  console.error(`Missing map: ${mapPath}. Run node scripts/map-display-products.mjs first.`);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const models = map.models
  .filter((item) => item.route && item.included)
  .filter((item) => item.tree !== 'display-lcd' && item.tree !== 'telas-display-lcd')
  .slice(0, limit > 0 ? limit : undefined);

function joinUrl(route) {
  return `${baseUrl}${route.startsWith('/') ? route : `/${route}`}`;
}

async function inspect(page, model, index) {
  const url = joinUrl(model.route);
  let response = null;
  let error = null;
  try {
    response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (err) {
    error = err.message;
  }

  const data = await page.evaluate(() => {
    const visibleRect = (selector) => {
      const candidates = [...document.querySelectorAll(selector)];
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        const text = (el.textContent || '').trim();
        if (r.width > 0 && r.height > 0 && text) {
          return { selector, x: r.left, y: r.top, width: r.width, height: r.height, text: text.slice(0, 160) };
        }
      }
      return null;
    };
    const priceSelectors = [
      '.product-colum-right .t7-buy-price',
      '.product-colum-right .PrecoPrincipal',
      '.product-colum-right .produto-preco',
      '.product-colum-right .price-off',
      '.product-colum-right #product-priceBox',
      '.product-colum-right [id*="preco"]',
    ];
    const price = priceSelectors.map(visibleRect).find(Boolean);
    const title = visibleRect('h1');
    const right = document.querySelector('.product-colum-right');
    const left = document.querySelector('.product-colum-left');
    const box = document.querySelector('.box-col-product');
    return {
      finalUrl: location.href,
      pageClass: document.documentElement.className,
      title,
      price,
      rightInsideLeft: Boolean(right && left && left.contains(right)),
      rightParentClass: right?.parentElement?.className || '',
      rightX: right?.getBoundingClientRect().left ?? null,
      leftX: left?.getBoundingClientRect().left ?? null,
      boxX: box?.getBoundingClientRect().left ?? null,
      hasBuyButton: Boolean(document.querySelector('.product-colum-right button, .product-colum-right .botao-comprar, .product-colum-right .btn-comprar')),
      hasMainImage: Boolean(document.querySelector('.product-colum-left img')),
      h1Count: document.querySelectorAll('h1').length,
    };
  }).catch((err) => ({ evalError: err.message }));

  const status = response?.status() || null;
  const httpOk = status !== null && status >= 200 && status < 400;
  const titleOk = Boolean(data.title && data.title.x > 600);
  const priceOk = Boolean(data.price && data.price.x > 600);
  const structureOk = Boolean(!data.rightInsideLeft && data.rightParentClass.includes('box-col-product'));
  const passed = !error && httpOk && titleOk && priceOk && structureOk && data.hasBuyButton && data.hasMainImage;
  const result = {
    index: index + 1,
    route: model.route,
    sourceFile: model.file,
    name: model.name,
    url,
    httpStatus: status,
    passed,
    error,
    checks: {
      httpOk,
      titleOk,
      priceOk,
      structureOk,
      hasBuyButton: Boolean(data.hasBuyButton),
      hasMainImage: Boolean(data.hasMainImage),
    },
    ...data,
  };

  if (!passed) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const name = `${String(index + 1).padStart(4, '0')}-${model.route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 120)}.png`;
    result.screenshot = path.relative(root, path.join(screenshotDir, name)).replaceAll(path.sep, '/');
    await page.screenshot({ path: path.join(root, result.screenshot), fullPage: false }).catch(() => {});
  }

  return result;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

const results = [];
for (let i = 0; i < models.length; i += 1) {
  const result = await inspect(page, models[i], i);
  results.push(result);
  const label = result.passed ? 'OK' : 'ERRO';
  console.log(`${label} ${String(i + 1).padStart(4, '0')}/${models.length} ${result.route} | titleX=${result.title?.x ?? 'null'} priceX=${result.price?.x ?? 'null'}`);
}

await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  browser: 'chrome',
  baseUrl,
  mappedModels: map.totalMappedModels,
  testedModels: results.length,
  passed: results.filter((item) => item.passed).length,
  failed: results.filter((item) => !item.passed).length,
  failures: results.filter((item) => !item.passed).map((item) => ({
    route: item.route,
    name: item.name,
    checks: item.checks,
    titleX: item.title?.x ?? null,
    priceX: item.price?.x ?? null,
    finalUrl: item.finalUrl,
    screenshot: item.screenshot,
  })),
  results,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Resultado geral: ${report.passed} OK / ${report.failed} erro(s)`);

if (report.failed > 0) {
  process.exitCode = 1;
}
