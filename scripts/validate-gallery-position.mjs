import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const outPath = path.join(root, '_validation', 'gallery-position-results.json');

const urls = [
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-s24-plus-s926-sem-aro-original-nacional/',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-original-retirada/',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-a16-5g-a166-original-retirada/',
  'http://localhost:3000/display-e-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-pro-oled/',
  'http://localhost:3000/display-e-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-fusion-edge-60-edge-60s-oled-xt2503-4/',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-s25-ultra-s938-original-retirada-sem-aro',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-14-pro-5g-poco-x7-incell',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-13-pro-plus-note-14-pro-oled',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-redmi-note-13-4g-oled-com-aro',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-16-plus-jk-troca-ci',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-16-jk-troca-ci',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-xs-max-vivid',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a17-4g-5g-incell',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-15-4g-5g-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-15c-com-aro',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-g86-5g-g86-power-xt2527',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a07-4g-a075-incell',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a17-5g-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a16-4g-a166-original-com-aro-borda-fina',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-g56-5g-xt2529',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a56-5g-a566-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-m15-m156-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-tablet-samsung-galaxy-tab-x210-x215',
];

async function waitForGallery(page) {
  await page.waitForSelector('#product-container', { timeout: 15000 });
  await page.waitForFunction(() => {
    const rootEl = document.querySelector('#product-container');
    const thumbs = rootEl ? rootEl.querySelectorAll('img[alt*="thumb"], img[src*="thumb"]') : [];
    return thumbs.length > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(1200);
}

async function testGallery(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await waitForGallery(page);

  const result = await page.evaluate(() => {
    const normalizeImageSrc = (src) => (src || '')
      .replace(/^https?:\/\/[^/]+/, '')
      .split('?')[0]
      .trim();
    const normalizeImageKey = (src) => {
      const file = normalizeImageSrc(src)
        .split('#')[0]
        .split('/')
        .pop()
        .toLowerCase();
      if (!file) return '';

      return file
        .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '')
        .replace(/^\d{2,4}_/, '')
        .replace(/-[a-f0-9]{6,}$/i, '')
        .replace(/_[a-f0-9]{16,}$/i, '')
        .replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, '$1');
    };
    const imageSizePrefix = (src) => {
      const file = normalizeImageSrc(src).split('/').pop() || '';
      const match = file.match(/^(\d{2,4})_/);
      return match ? Number(match[1]) : 0;
    };
    const duplicatesOf = (items) => [...new Set(items.filter((item, index) => item && items.indexOf(item) !== index))];
    const semanticDuplicatesOf = (items) => {
      const groups = new Map();
      for (const src of items) {
        const key = normalizeImageKey(src);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({
          src,
          size: imageSizePrefix(src),
        });
      }

      return [...groups.entries()]
        .filter(([, group]) => {
          if (group.length < 2) return false;
          const srcs = new Set(group.map((item) => item.src));
          const sizes = new Set(group.map((item) => item.size).filter(Boolean));
          const hasFull = group.some((item) => !item.size);
          const hasSized = group.some((item) => item.size);
          return srcs.size < group.length || (hasFull && hasSized) || sizes.size > 1;
        })
        .map(([key]) => key);
    };
    const thumbs = [...document.querySelectorAll('img[alt*="thumb"], img[src*="thumb"]')];
    const thumbSrcs = thumbs.map((img) => normalizeImageSrc(img.getAttribute('src')));
    const mainSrcs = [...document.querySelectorAll('#product-container .image-show .swiper-slide img:not(.zoomImg)')]
      .map((img) => normalizeImageSrc(img.getAttribute('src')));
    const totalThumbs = thumbs.length;
    const duplicatedThumbs = duplicatesOf(thumbSrcs);
    const duplicatedMainImages = duplicatesOf(mainSrcs);
    const duplicatedThumbImageKeys = semanticDuplicatesOf(thumbSrcs);
    const duplicatedMainImageKeys = semanticDuplicatesOf(mainSrcs);
    const thumbRects = thumbs.map((img, index) => {
      const rect = img.getBoundingClientRect();
      return {
        index,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        src: img.getAttribute('src') || '',
        key: normalizeImageKey(img.getAttribute('src')),
      };
    });

    const visibleThumbs = thumbRects.filter((rect) => rect.x > 0 || rect.y > 0).length;
    const zeroPositionThumbs = thumbRects.filter((rect) => rect.index > 0 && rect.x === 0 && rect.y === 0).length;

    const beforeActive = document.querySelector('#product-container .image-show .swiper-slide-active img:not(.zoomImg)')?.getAttribute('src') || '';
    const secondThumb = thumbs[1];
    if (secondThumb) secondThumb.click();

    return new Promise((resolve) => {
      window.setTimeout(() => {
        const mainImgs = [...document.querySelectorAll('#product-container img:not([src*="thumb"]):not(.zoomImg)')];
        const activeMain = mainImgs.filter((img) => {
          const rect = img.getBoundingClientRect();
          const style = window.getComputedStyle(img);
          return rect.x >= 100 &&
            rect.x < 700 &&
            rect.width > 100 &&
            rect.height > 100 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            img.naturalWidth > 0;
        });
        const afterActive = document.querySelector('#product-container .image-show .swiper-slide-active img:not(.zoomImg)')?.getAttribute('src') || '';
        const clickWorked = activeMain.length > 0 && (!secondThumb || beforeActive !== afterActive || totalThumbs === 1);

        resolve({
          totalThumbs,
          visibleThumbs,
          zeroPositionThumbs,
          clickWorked,
          beforeActive,
          afterActive,
          thumbRects,
          activeMainCount: activeMain.length,
          duplicatedThumbs,
          duplicatedMainImages,
          duplicatedThumbImageKeys,
          duplicatedMainImageKeys,
        });
      }, 500);
    });
  });

  await page.close();

  const ok = result.totalThumbs >= 1 &&
    result.visibleThumbs >= Math.min(result.totalThumbs, 2) &&
    result.zeroPositionThumbs === 0 &&
    result.duplicatedThumbs.length === 0 &&
    result.duplicatedMainImages.length === 0 &&
    result.duplicatedThumbImageKeys.length === 0 &&
    result.duplicatedMainImageKeys.length === 0 &&
    (result.totalThumbs === 1 || result.clickWorked);

  return { url, ...result, ok, consoleErrors: consoleErrors.slice(0, 3) };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const queue = [...urls];

await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length > 0) {
    const url = queue.shift();
    results.push(await testGallery(browser, url));
  }
}));

await browser.close();

const ordered = results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
const passed = ordered.filter((result) => result.ok);
const failed = ordered.filter((result) => !result.ok);

const report = {
  generatedAt: new Date().toISOString(),
  browser: 'Chrome via Playwright',
  total: ordered.length,
  passed: passed.length,
  failed: failed.length,
  results: ordered,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('\n===== RESULTADO GALERIA / POSICAO =====');
console.log(`Passou: ${passed.length} / ${ordered.length}`);
console.log(`Falhou: ${failed.length} / ${ordered.length}\n`);

for (const result of ordered) {
  console.log(`${result.ok ? 'OK' : 'FALHOU'} ${result.url}`);
  console.log(`   Thumbs no DOM: ${result.totalThumbs} | Visiveis: ${result.visibleThumbs} | (0,0) apos primeiro: ${result.zeroPositionThumbs} | Click funcionou: ${result.clickWorked} | Duplicadas: thumbs=${result.duplicatedThumbs.length}, main=${result.duplicatedMainImages.length}, semanticThumbs=${result.duplicatedThumbImageKeys.length}, semanticMain=${result.duplicatedMainImageKeys.length}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
