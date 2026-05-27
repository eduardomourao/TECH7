import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const outPath = path.join(root, '_validation', 'diag-product-images-results.json');

const urls = [
  'http://localhost:3000/pecas-e-componentes/apple/flex-conector-carga-iphone-16-pro',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-s24-plus-s926-sem-aro-original-nacional',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-original-retirada',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-a16-5g-a166-original-retirada',
  'http://localhost:3000/display-e-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-pro-oled',
  'http://localhost:3000/display-e-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-fusion-edge-60-edge-60s-oled-xt2503-4',
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

async function diagnosePage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const consoleErrors = [];
  const failedRequests = [];
  const imageResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), reason: request.failure()?.errorText || '' });
  });
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if (type === 'image') imageResponses.push({ url: response.url(), status: response.status() });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const productContainer = document.querySelector('#product-container');
    const img =
      productContainer?.querySelector('.product-colum-left .image-show img') ||
      productContainer?.querySelector('.product-colum-left img') ||
      productContainer?.querySelector('img');

    if (!img) return { symptom: 'NO_IMG_ELEMENT' };

    const src = img.getAttribute('src') || '';
    const dataSrc = img.getAttribute('data-src') || '';
    const currentSrc = img.currentSrc || '';
    const computedStyle = window.getComputedStyle(img);
    const parentStyle = img.parentElement ? window.getComputedStyle(img.parentElement) : null;
    const rect = img.getBoundingClientRect();
    const parentRect = img.parentElement?.getBoundingClientRect();

    return {
      finalUrl: location.href,
      src,
      dataSrc,
      currentSrc,
      srcEmpty: !src || src === 'undefined' || src === 'null',
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      clientWidth: rect.width,
      clientHeight: rect.height,
      parentWidth: parentRect?.width || 0,
      parentHeight: parentRect?.height || 0,
      cssDisplay: computedStyle.display,
      cssVisibility: computedStyle.visibility,
      cssOpacity: computedStyle.opacity,
      cssPosition: computedStyle.position,
      cssZIndex: computedStyle.zIndex,
      cssObjectFit: computedStyle.objectFit,
      parentDisplay: parentStyle?.display || '',
      parentHeightCss: parentStyle?.height || '',
      parentBackground: parentStyle?.backgroundColor || '',
      imgClasses: img.className || '',
      parentClasses: img.parentElement?.className || '',
      symptom: !src
        ? 'SRC_EMPTY'
        : img.naturalWidth === 0
          ? 'IMG_FAILED_TO_LOAD'
          : computedStyle.display === 'none'
            ? 'CSS_DISPLAY_NONE'
            : computedStyle.visibility === 'hidden'
              ? 'CSS_VISIBILITY_HIDDEN'
              : computedStyle.opacity === '0'
                ? 'CSS_OPACITY_ZERO'
                : rect.width === 0 || rect.height === 0
                  ? 'CSS_ZERO_SIZE'
                  : 'IMAGE_LOADED_VISIBLE_BY_DOM',
    };
  });

  let httpStatus = null;
  const directSrc = result.currentSrc || result.src;
  if (directSrc && (result.naturalWidth === 0 || result.symptom === 'IMG_FAILED_TO_LOAD')) {
    httpStatus = await page.evaluate(async (src) => {
      try {
        const response = await fetch(src);
        return response.status;
      } catch {
        return 'FETCH_ERROR';
      }
    }, directSrc);
  }

  await page.close();
  return {
    url,
    ...result,
    httpStatus,
    consoleErrors: consoleErrors.slice(0, 5),
    failedRequests: failedRequests.slice(0, 5),
    imageResponses: imageResponses.slice(0, 10),
  };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const queue = [...urls];
const workers = Array.from({ length: 5 }, async () => {
  while (queue.length > 0) {
    const url = queue.shift();
    results.push(await diagnosePage(browser, url));
  }
});

await Promise.all(workers);
await browser.close();

const symptoms = {};
for (const result of results) {
  symptoms[result.symptom] = (symptoms[result.symptom] || 0) + 1;
}

const dominantSymptom = Object.entries(symptoms).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NO_RESULTS';
const sampleSrc = results.find((result) => result.src || result.currentSrc)?.currentSrc || results.find((result) => result.src)?.src || '';
const report = {
  generatedAt: new Date().toISOString(),
  browser: 'chrome',
  dominantSymptom,
  sampleSrc,
  symptoms,
  results: results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url)),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  dominantSymptom,
  sampleSrc,
  symptoms,
  total: results.length,
}, null, 2));

for (const result of report.results) {
  const ok = result.symptom === 'IMAGE_LOADED_VISIBLE_BY_DOM';
  console.log(`${ok ? 'OK' : 'ERRO'} [${result.symptom}] ${result.url} src=${result.src || '<empty>'} natural=${result.naturalWidth}x${result.naturalHeight} box=${result.clientWidth}x${result.clientHeight}`);
}
