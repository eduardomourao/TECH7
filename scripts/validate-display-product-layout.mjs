import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const products = [
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-s24-plus-s926-sem-aro-original-nacional',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-original-retirada',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a16-5g-a166-original-retirada',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-pro-oled',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-fusion-edge-60-edge-60s-oled-xt2503-4',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-s25-ultra-s938-original-retirada-sem-aro',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-14-pro-5g-poco-x7-incell',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-13-pro-plus-note-14-pro-oled',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-redmi-note-13-4g-oled-com-aro',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-16-plus-jk-troca-ci',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-16-jk-troca-ci',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a17-4g-5g-incell',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-15-4g-5g-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-15c-com-aro',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-xs-max-vivid',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-g86-5g-g86-power-xt2527',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a07-4g-a075-incell',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a17-5g-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a16-4g-a166-original-com-aro-borda-fina',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-g56-5g-xt2529',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a56-5g-a566-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-m15-m156-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-tablet-samsung-galaxy-tab-x210-x215',
];

const reference = 'http://localhost:3000/pecas-e-componentes/apple/flex-conector-carga-iphone-16-pro';
const reportPath = path.join(process.cwd(), '_validation', 'display-product-layout-results.json');

function simpleStatus(status) {
  return status >= 200 && status < 400;
}

async function inspect(page, url, kind) {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  const data = await page.evaluate(() => {
    const rectFor = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height, text: (el.textContent || '').trim().slice(0, 160) };
    };
    const priceSelectors = [
      '.product-colum-right .t7-buy-price',
      '.product-colum-right #preco',
      '.product-colum-right .PrecoPrincipal',
      '.product-colum-right .produto-preco',
      '.product-colum-right .price-off',
      '.product-colum-right #product-priceBox',
    ];
    const priceSelector = priceSelectors.find((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /R\$/i.test(el.textContent || '');
    }) || priceSelectors.find((selector) => document.querySelector(selector)) || null;
    const title = rectFor('h1');
    const price = priceSelector ? rectFor(priceSelector) : null;
    const right = document.querySelector('.product-colum-right');
    const left = document.querySelector('.product-colum-left');
    return {
      finalUrl: location.href,
      title,
      price,
      priceSelector,
      rightInsideLeft: Boolean(right && left && left.contains(right)),
      rightParentClass: right?.parentElement?.className || null,
      hasBuyButton: Boolean(document.querySelector('.product-colum-right button, .product-colum-right .botao-comprar, .product-colum-right .btn-comprar')),
      hasMainImage: Boolean(document.querySelector('.product-colum-left img')),
    };
  });

  const titleOk = data.title && data.title.x > 600;
  const priceOk = data.price && data.price.x > 600;
  const structureOk = !data.rightInsideLeft && data.rightParentClass.includes('box-col-product');
  const passed = simpleStatus(response?.status() || 0) && titleOk && priceOk && structureOk && data.hasBuyButton && data.hasMainImage;

  return {
    kind,
    url,
    httpStatus: response?.status() || null,
    passed,
    checks: {
      titleOk,
      priceOk,
      structureOk,
      hasBuyButton: data.hasBuyButton,
      hasMainImage: data.hasMainImage,
    },
    ...data,
  };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const results = [];

results.push(await inspect(page, reference, 'reference'));
for (const url of products) {
  results.push(await inspect(page, url, 'display-product'));
}

await browser.close();

const summary = {
  browser: 'chrome',
  viewport: { width: 1365, height: 900 },
  generatedAt: new Date().toISOString(),
  referencePassed: results[0]?.passed === true,
  productsTotal: products.length,
  productsPassed: results.filter((item) => item.kind === 'display-product' && item.passed).length,
  productsFailed: results.filter((item) => item.kind === 'display-product' && !item.passed).length,
  results,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

for (const item of results) {
  const label = item.passed ? 'OK' : 'ERRO';
  console.log(`${label} - ${item.kind} - ${item.url} | titleX=${item.title?.x ?? 'null'} priceX=${item.price?.x ?? 'null'} final=${item.finalUrl}`);
}
console.log(`Resultado: ${summary.productsPassed} OK / ${summary.productsFailed} com erro`);

if (!summary.referencePassed || summary.productsFailed > 0) {
  process.exitCode = 1;
}
