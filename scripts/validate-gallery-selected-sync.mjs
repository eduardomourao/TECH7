import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const outPath = path.join(root, '_validation', 'gallery-selected-sync-results.json');
const defaultLimit = Number.parseInt(process.argv[2] || '160', 10);

const roots = [
  'display',
  'display-e-lcd',
  'tela-display-lcd',
  'baterias-celular',
  'pecas-e-componentes',
  'tampas-e-carcacas',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '_validation', 'backup', 'artifacts'].includes(entry.name)) walk(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
      out.push(full);
    }
  }
  return out;
}

function routeFromFile(file) {
  return '/' + path.relative(root, file)
    .replace(/\\/g, '/')
    .replace(/\/index\.html$/i, '');
}

function isProductGalleryHtml(file) {
  const html = fs.readFileSync(file, 'utf8');
  return /class=["'][^"']*nav-images/i.test(html) &&
    /class=["'][^"']*image-show/i.test(html) &&
    /class=["'][^"']*swiper-slide/i.test(html);
}

const candidates = [];
for (const dir of roots.map((name) => path.join(root, name))) {
  for (const file of walk(dir)) {
    const route = routeFromFile(file);
    const parts = route.split('/').filter(Boolean);
    if (parts.length < 3) continue;
    if (isProductGalleryHtml(file)) candidates.push(route);
  }
}

const prioritized = [
  '/display/samsung/tela-display-lcd-samsung-note-20-n981-oled',
  '/display/samsung/tela-display-lcd-samsung-s23-ultra-5g-s918-original-retirada',
  '/display-e-lcd/samsung/tela-display-lcd-samsung-s24-plus-s926-sem-aro-original-nacional',
  '/display-e-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-original-retirada',
  '/display-e-lcd/apple/tela-display-lcd-iphone-14-plus-oled-troca-ci',
  '/pecas-e-componentes/apple/flex-conector-carga-iphone-16-pro',
].filter((route) => candidates.includes(route));

const urls = [...new Set([...prioritized, ...candidates])].slice(0, Number.isFinite(defaultLimit) && defaultLimit > 0 ? defaultLimit : 160)
  .map((route) => `http://localhost:3000${route}`);

async function testPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.nav-images .box-img, #product-container', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);

  const result = await page.evaluate(async () => {
    const normalize = (src) => {
      let file = String(src || '').replace(/^https?:\/\/[^/]+/i, '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
      let base = file.replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '');
      base = base
        .replace(/^\d{2,4}_/, '')
        .replace(/-[a-f0-9]{6,}$/i, '')
        .replace(/_[a-f0-9]{16,}$/i, '')
        .replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, '$1')
        .replace(/_variac$/i, '_variacao');
      return base;
    };
    const srcOf = (img) => img && (img.getAttribute('src') || img.getAttribute('data-src') || img.currentSrc || '');
    const boxes = [...document.querySelectorAll('.nav-images .box-img')];
    const checks = [];

    for (let i = 0; i < Math.min(boxes.length, 6); i += 1) {
      const box = boxes[i];
      box.click();
      await new Promise((resolve) => setTimeout(resolve, 320));
      await new Promise((resolve) => {
        const deadline = Date.now() + 2500;
        const tick = () => {
          const active = document.querySelector('.image-show .swiper-slide-active img:not(.zoomImg)');
          if (!active || active.naturalWidth > 0 || Date.now() > deadline) {
            resolve();
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      });
      const thumb = box.querySelector('img:not(.zoomImg)');
      const main = document.querySelector('.image-show .swiper-slide-active img:not(.zoomImg)');
      const mainRect = main ? main.getBoundingClientRect() : null;
      const style = window.getComputedStyle(box);
      checks.push({
        index: i,
        thumbKey: normalize(srcOf(thumb)),
        mainKey: normalize(srcOf(main)),
        active: box.classList.contains('active'),
        borderColor: style.borderTopColor,
        mainNaturalWidth: main ? main.naturalWidth : 0,
        mainVisible: Boolean(mainRect && mainRect.width > 100 && mainRect.height > 100 && mainRect.x >= 0 && mainRect.x < window.innerWidth),
      });
    }

    return {
      thumbCount: boxes.length,
      mainCount: document.querySelectorAll('.image-show .swiper-slide').length,
      checks,
    };
  });

  await page.close();

  const hasMultiple = result.thumbCount > 1;
  const ok = result.thumbCount >= 1 &&
    result.checks.every((check) => {
      const syncOk = !hasMultiple || check.thumbKey === check.mainKey;
      return syncOk &&
        check.active &&
        /255, 106, 0/.test(check.borderColor) &&
        check.mainNaturalWidth > 0 &&
        check.mainVisible;
    });

  return { url, ok, ...result, consoleErrors: consoleErrors.slice(0, 3) };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const queue = [...urls];

await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const url = queue.shift();
    try {
      results.push(await testPage(browser, url));
    } catch (error) {
      results.push({ url, ok: false, error: error.message });
    }
  }
}));

await browser.close();

const failed = results.filter((result) => !result.ok);
const report = {
  generatedAt: new Date().toISOString(),
  browser: 'Google Chrome via Playwright channel=chrome',
  candidates: candidates.length,
  tested: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('\n===== GALLERY SELECTED SYNC =====');
console.log(`Candidatos locais: ${candidates.length}`);
console.log(`Testados: ${report.tested}`);
console.log(`Passou: ${report.passed}`);
console.log(`Falhou: ${report.failed}`);
if (failed.length) {
  for (const item of failed.slice(0, 30)) {
    console.log(`FALHOU ${item.url}`);
    if (item.error) console.log(`  ${item.error}`);
    else console.log(`  thumbs=${item.thumbCount} main=${item.mainCount}`);
  }
  process.exitCode = 1;
}
