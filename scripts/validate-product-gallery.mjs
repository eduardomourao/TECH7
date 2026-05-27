import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const outPath = path.join(root, '_validation', 'product-gallery-results.json');
const screenshotDir = path.join(root, '_validation', 'product-gallery-screenshots');

const urls = [
  'http://localhost:3000/display-e-lcd/apple/tela-display-lcd-iphone-14-plus-oled-troca-ci',
  'http://localhost:3000/pecas-e-componentes/apple/flex-conector-carga-iphone-16-pro',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-s24-plus-s926-sem-aro-original-nacional',
  'http://localhost:3000/display-e-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-original-retirada',
  'http://localhost:3000/display-e-lcd/motorola/tela-display-lcd-motorola-moto-edge-60-pro-oled',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-s25-ultra-s938-original-retirada-sem-aro',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-14-pro-5g-poco-x7-incell',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-13-pro-plus-note-14-pro-oled',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-16-plus-jk-troca-ci',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-16-jk-troca-ci',
  'http://localhost:3000/tela-display-lcd/apple/tela-display-lcd-iphone-xs-max-vivid',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a17-4g-5g-incell',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-15-4g-5g-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a36-5g-a366-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-g86-5g-g86-power-xt2527',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a07-4g-a075-incell',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a17-5g-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/motorola/tela-display-lcd-motorola-moto-g56-5g-xt2529',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a56-5g-a566-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-m15-m156-incell-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a16-4g-a166-original-com-aro-borda-fina',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-redmi-note-13-4g-oled-com-aro',
  'http://localhost:3000/tela-display-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-15c-com-aro',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-tablet-samsung-galaxy-tab-x210-x215',
  'http://localhost:3000/tela-display-lcd/samsung/tela-display-lcd-samsung-a16-5g-a166-original-retirada',
];

async function inspect(browser, url, index) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const jsErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') jsErrors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const before = await page.evaluate(() => {
    const container = document.querySelector('#product-container');
    if (!container) return { error: 'NO_CONTAINER' };

    const thumbs = [...container.querySelectorAll('.nav-images .swiper-slide .box-img img')];
    const slides = [...container.querySelectorAll('.image-show .swiper-slide')];
    const mainImages = [...container.querySelectorAll('.image-show .zoom > img:not(.zoomImg), .image-show img.swiper-lazy:not(.zoomImg)')];
    const thumbVisibleByStyle = thumbs.filter((img) => {
      const style = window.getComputedStyle(img);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }).length;
    const navSwiper = container.querySelector('.nav-images .list')?.swiper;
    const mainSwiper = container.querySelector('.image-show .list')?.swiper;

    return {
      thumbsInDOM: thumbs.length,
      thumbsVisibleByStyle: thumbVisibleByStyle,
      slidesInDOM: slides.length,
      mainImagesInDOM: mainImages.length,
      navSwiperReady: !!navSwiper,
      mainSwiperReady: !!mainSwiper,
      navActiveIndex: navSwiper?.activeIndex ?? null,
      mainActiveIndex: mainSwiper?.activeIndex ?? null,
      slidesPerView: Number(navSwiper?.params?.slidesPerView || 0),
      nextDisabled: container.querySelector('.nav-images .controls .next')?.classList.contains('swiper-button-disabled') ?? null,
      prevDisabled: container.querySelector('.nav-images .controls .prev')?.classList.contains('swiper-button-disabled') ?? null,
      activeSrc: container.querySelector('.image-show .swiper-slide-active .zoom > img:not(.zoomImg)')?.getAttribute('src') || '',
    };
  });

  const checks = [];
  if (before.error) {
    await page.close();
    return { url, ok: false, before, checks: [{ name: before.error, ok: false }], jsErrors: jsErrors.slice(0, 3) };
  }

  checks.push({ name: 'thumbs-rendered', ok: before.thumbsInDOM > 0 });
  checks.push({ name: 'thumbs-style-visible', ok: before.thumbsVisibleByStyle === before.thumbsInDOM });
  checks.push({ name: 'slides-match-thumbs', ok: before.slidesInDOM === before.thumbsInDOM });
  checks.push({ name: 'main-swiper-ready', ok: before.mainSwiperReady });
  checks.push({ name: 'nav-swiper-ready', ok: before.navSwiperReady });

  const thumbResults = [];
  const thumbCount = await page.locator('#product-container .nav-images .swiper-slide .box-img').count();
  const maxThumbsToClick = Math.min(thumbCount, 8);

  for (let i = 0; i < maxThumbsToClick; i += 1) {
    const result = { index: i, ok: false };
    try {
      await page.locator('#product-container .nav-images .swiper-slide .box-img').nth(i).click({ timeout: 5000 });
      await page.waitForTimeout(700);
      Object.assign(result, await page.evaluate((expectedIndex) => {
        const container = document.querySelector('#product-container');
        const mainSwiper = container.querySelector('.image-show .list')?.swiper;
        const img = container.querySelector('.image-show .swiper-slide-active .zoom > img:not(.zoomImg)');
        if (!img) return { ok: false, reason: 'NO_ACTIVE_IMAGE' };

        const rect = img.getBoundingClientRect();
        const style = window.getComputedStyle(img);
        const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const centerIsZoom = String(center?.className || '').split(/\s+/).includes('zoomImg');
        const imageVisible = img.naturalWidth > 0 &&
          rect.width > 80 &&
          rect.height > 80 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          !centerIsZoom;

        return {
          ok: mainSwiper?.activeIndex === expectedIndex && imageVisible,
          activeIndex: mainSwiper?.activeIndex ?? null,
          src: img.getAttribute('src') || '',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          opacity: style.opacity,
          centerTag: center?.tagName || '',
          centerClass: String(center?.className || ''),
          reason: imageVisible ? 'OK' : 'ACTIVE_IMAGE_NOT_VISIBLE',
        };
      }, i));
    } catch (error) {
      result.reason = error.message.split('\n')[0];
    }
    thumbResults.push(result);
  }

  checks.push({ name: 'thumb-clicks-change-gallery', ok: thumbResults.every((result) => result.ok) });

  const arrowResult = { ok: false, reason: 'NOT_RUN' };
  if (before.slidesInDOM <= 1) {
    Object.assign(arrowResult, { ok: true, reason: 'SINGLE_IMAGE_NO_ARROW_NEEDED' });
  } else {
    try {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const container = document.querySelector('#product-container');
        const mainSwiper = container?.querySelector('.image-show .list')?.swiper;
        const navSwiper = container?.querySelector('.nav-images .list')?.swiper;
        mainSwiper?.slideTo(0, 0);
        navSwiper?.slideTo(0, 0);
      });
      await page.waitForTimeout(500);
      const start = await page.evaluate(() => document.querySelector('#product-container .image-show .list')?.swiper?.activeIndex ?? null);
      await page.locator('#product-container .nav-images .controls .next').click({ timeout: 5000 });
      await page.waitForTimeout(700);
      const afterNext = await page.evaluate(() => document.querySelector('#product-container .image-show .list')?.swiper?.activeIndex ?? null);
      await page.locator('#product-container .nav-images .controls .prev').click({ timeout: 5000 });
      await page.waitForTimeout(700);
      const afterPrev = await page.evaluate(() => document.querySelector('#product-container .image-show .list')?.swiper?.activeIndex ?? null);
      Object.assign(arrowResult, {
        ok: start === 0 && afterNext === 1 && afterPrev === 0,
        reason: 'REAL_ARROW_CLICK_CHECK',
        start,
        afterNext,
        afterPrev,
      });
    } catch (error) {
      Object.assign(arrowResult, {
        ok: false,
        reason: error.message.split('\n')[0],
      });
    }
  }

  checks.push({ name: 'gallery-arrows-change-main-image', ok: arrowResult.ok });

  const ok = checks.every((check) => check.ok);
  if (index < 2) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `gallery-sample-${index + 1}.png`), fullPage: false });
  }

  await page.close();
  return { url, ok, before, checks, thumbResults, arrowResult, jsErrors: jsErrors.slice(0, 3) };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const queue = urls.map((url, index) => ({ url, index }));
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length > 0) {
    const item = queue.shift();
    results.push(await inspect(browser, item.url, item.index));
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
  const counts = result.before && !result.before.error
    ? `${result.before.thumbsVisibleByStyle}/${result.before.thumbsInDOM} thumbs, ${result.before.slidesInDOM} slides`
    : result.before?.error || 'NO_DATA';
  console.log(`${result.ok ? 'OK' : 'ERRO'} ${result.url} - ${counts}`);
  if (!result.ok) {
    console.log('  checks:', result.checks.filter((check) => !check.ok).map((check) => check.name).join(', '));
  }
}
console.log(`Resultado: ${report.passed}/${report.total} galerias OK`);

if (failures.length) {
  process.exitCode = 1;
}
