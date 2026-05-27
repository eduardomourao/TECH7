import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const outPath = path.join(root, '_validation', 'product-images-visible-results.json');
const screenshotDir = path.join(root, '_validation', 'product-image-screenshots');

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
  'http://localhost:3000/baterias-celular/placa-conector-carga-pcb-motorola-moto-edge-40-xt2303',
];

async function inspectPage(browser, url, index) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const img =
      document.querySelector('#product-container .product-colum-left .image-show img') ||
      document.querySelector('#product-container .product-colum-left img') ||
      document.querySelector('#product-container img');
    if (!img) return { ok: false, reason: 'NO_IMG_ELEMENT' };
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);
    const centerElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const centerClass = centerElement?.className || '';
    const zoomOverlayVisible = String(centerClass).split(/\s+/).includes('zoomImg');
    return {
      ok: !!(img.currentSrc || img.src) &&
        img.naturalWidth > 0 &&
        img.naturalHeight > 0 &&
        rect.width > 80 &&
        rect.height > 80 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        !zoomOverlayVisible,
      reason: zoomOverlayVisible ? 'ZOOM_OVERLAY_VISIBLE' : 'INSPECTED',
      finalUrl: location.href,
      title: document.querySelector('h1')?.textContent?.trim() || '',
      src: img.currentSrc || img.src || '',
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: Math.round(rect.width),
      clientHeight: Math.round(rect.height),
      opacity: style.opacity,
      display: style.display,
      visibility: style.visibility,
      centerTag: centerElement?.tagName || '',
      centerClass: String(centerClass),
      className: img.className || '',
    };
  });

  if (index < 2) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, `sample-${index + 1}.png`),
      fullPage: false,
    });
  }

  await page.close();
  return { url, ...result };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const queue = urls.map((url, index) => ({ url, index }));
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length > 0) {
    const item = queue.shift();
    results.push(await inspectPage(browser, item.url, item.index));
  }
});

await Promise.all(workers);
await browser.close();

const orderedResults = results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
const failures = orderedResults.filter((result) => !result.ok);
const report = {
  generatedAt: new Date().toISOString(),
  browser: 'chrome',
  total: orderedResults.length,
  passed: orderedResults.length - failures.length,
  failed: failures.length,
  results: orderedResults,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

for (const result of orderedResults) {
  console.log(`${result.ok ? 'OK' : 'ERRO'} ${result.url} opacity=${result.opacity || 'n/a'} natural=${result.naturalWidth || 0}x${result.naturalHeight || 0}`);
}
console.log(`Resultado: ${report.passed}/${report.total} imagens visiveis`);

if (failures.length) {
  process.exitCode = 1;
}
