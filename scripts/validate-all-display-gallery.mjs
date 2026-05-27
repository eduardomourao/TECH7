import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const mapPath = path.join(root, '_validation', 'display-products-map.json');
const outPath = path.join(root, '_validation', 'display-all-gallery-results.json');
const baseUrl = 'http://localhost:3000';

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const models = map.models
  .filter((model) => model.included && model.route)
  .map((model) => ({
    route: model.route,
    url: baseUrl + model.route,
    name: model.name || '',
  }));
const progressPath = path.join(root, '_validation', 'display-all-gallery-progress.json');

async function validatePage(page, model) {
  try {
    await page.goto(model.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(450);

    const before = await page.evaluate(() => {
      const container = document.querySelector('#product-container');
      if (!container) return { error: 'NO_CONTAINER' };
      const thumbs = [...container.querySelectorAll('.nav-images .swiper-slide .box-img img')];
      const slides = [...container.querySelectorAll('.image-show .swiper-slide')];
      const mainSwiper = container.querySelector('.image-show .list')?.swiper;
      const navSwiper = container.querySelector('.nav-images .list')?.swiper;
      const activeImage = container.querySelector('.image-show .swiper-slide-active .zoom > img:not(.zoomImg)');
      const activeRect = activeImage?.getBoundingClientRect();
      const activeStyle = activeImage ? window.getComputedStyle(activeImage) : null;
      const next = container.querySelector('.nav-images .controls .next');
      const prev = container.querySelector('.nav-images .controls .prev');

      return {
        thumbsInDOM: thumbs.length,
        slidesInDOM: slides.length,
        mainSwiperReady: !!mainSwiper,
        navSwiperReady: !!navSwiper,
        activeIndex: mainSwiper?.activeIndex ?? null,
        activeImageVisible: !!activeImage &&
          activeImage.naturalWidth > 0 &&
          activeRect.width > 80 &&
          activeRect.height > 80 &&
          activeStyle.display !== 'none' &&
          activeStyle.visibility !== 'hidden' &&
          activeStyle.opacity !== '0',
        nextDisabled: next?.classList.contains('swiper-button-disabled') ?? null,
        prevDisabled: prev?.classList.contains('swiper-button-disabled') ?? null,
      };
    });

    if (before.error) {
      return { ...model, ok: false, before, error: before.error };
    }

    let arrow = { ok: true, reason: 'SINGLE_IMAGE_OR_NO_ARROW_NEEDED' };
    if (before.slidesInDOM > 1) {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const container = document.querySelector('#product-container');
        container?.querySelector('.image-show .list')?.swiper?.slideTo(0, 0);
        container?.querySelector('.nav-images .list')?.swiper?.slideTo(0, 0);
      });
      await page.waitForTimeout(250);

      try {
        await page.locator('#product-container .nav-images .controls .next').click({ timeout: 2500 });
        await page.waitForTimeout(180);
        const afterNext = await page.evaluate(() => document.querySelector('#product-container .image-show .list')?.swiper?.activeIndex ?? null);
        await page.locator('#product-container .nav-images .controls .prev').click({ timeout: 2500 });
        await page.waitForTimeout(180);
        const afterPrev = await page.evaluate(() => document.querySelector('#product-container .image-show .list')?.swiper?.activeIndex ?? null);
        arrow = {
          ok: afterNext === 1 && afterPrev === 0,
          reason: 'REAL_ARROW_CLICK_CHECK',
          afterNext,
          afterPrev,
        };
      } catch (error) {
        arrow = { ok: false, reason: error.message.split('\n')[0] };
      }
    }

    const ok =
      before.thumbsInDOM > 0 &&
      before.slidesInDOM === before.thumbsInDOM &&
      before.mainSwiperReady &&
      before.navSwiperReady &&
      before.activeImageVisible &&
      arrow.ok;

    return { ...model, ok, before, arrow };
  } catch (error) {
    return { ...model, ok: false, error: error.message.split('\n')[0] };
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const queue = [...models];
let completed = 0;
function saveProgress() {
  fs.writeFileSync(progressPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: models.length,
    completed,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    latestFailures: results.filter((result) => !result.ok).slice(-20),
  }, null, 2));
}

const workers = Array.from({ length: 8 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  while (queue.length > 0) {
    const model = queue.shift();
    results.push(await validatePage(page, model));
    completed += 1;
    if (completed % 25 === 0) {
      saveProgress();
      console.log(`Progresso Display gallery: ${completed}/${models.length}`);
    }
  }
  await page.close().catch(() => {});
});

await Promise.all(workers);
await browser.close();

const orderedResults = results.sort((a, b) => models.findIndex((model) => model.route === a.route) - models.findIndex((model) => model.route === b.route));
const failures = orderedResults.filter((result) => !result.ok);
const report = {
  generatedAt: new Date().toISOString(),
  browser: 'chrome',
  total: orderedResults.length,
  passed: orderedResults.length - failures.length,
  failed: failures.length,
  failures: failures.slice(0, 100),
  results: orderedResults,
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
saveProgress();

console.log(`Resultado Display: ${report.passed}/${report.total} galerias OK`);
if (failures.length) {
  for (const failure of failures.slice(0, 20)) {
    console.log(`ERRO ${failure.route} - ${failure.error || failure.arrow?.reason || 'falha'}`);
  }
  process.exitCode = 1;
}
