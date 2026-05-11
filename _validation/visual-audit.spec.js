import { test } from '@playwright/test';

const targets = [
  { name: 'home', url: 'file:///C:/Users/Admin/Downloads/site%20novo/index.html' },
  { name: 'produto_s23_plus', url: 'file:///C:/Users/Admin/Downloads/site%20novo/display/samsung/tela-display-lcd-samsung-s23-plus-s916-oled-com-aro/index.html' }
];

for (const target of targets) {
  test(`visual-audit ${target.name} desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });

    const report = await page.evaluate(() => {
      const nav = document.querySelector('.header .nav');
      const subMenus = Array.from(document.querySelectorAll('.header .nav .sub-line-category'));
      const visibleSubmenus = subMenus.filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      }).length;

      const menuIcons = Array.from(document.querySelectorAll('.header .nav li > a img'));
      const iconStats = menuIcons.map((img) => {
        const r = img.getBoundingClientRect();
        return {
          src: img.getAttribute('src') || '',
          width: r.width,
          height: r.height,
          naturalWidth: img.naturalWidth || 0
        };
      });
      const brokenIcons = iconStats.filter((i) => i.naturalWidth <= 0 || i.width <= 0 || i.height <= 0).length;

      const horizontalOverflow = document.documentElement.scrollWidth - window.innerWidth;

      let navOverlapMain = false;
      const firstMainBlock = document.querySelector('.line-info, .section-showcase, .showcase, main, .application');
      if (nav && firstMainBlock) {
        const navR = nav.getBoundingClientRect();
        const mainR = firstMainBlock.getBoundingClientRect();
        navOverlapMain = navR.bottom > mainR.top + 8;
      }

      return {
        visibleSubmenus,
        menuIconCount: menuIcons.length,
        brokenIcons,
        horizontalOverflow,
        navOverlapMain
      };
    });

    console.log(JSON.stringify({ page: target.name, viewport: 'desktop', ...report }));
  });

  test(`visual-audit ${target.name} mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });

    const report = await page.evaluate(() => {
      const nav = document.querySelector('.header .nav');
      const subMenus = Array.from(document.querySelectorAll('.header .nav .sub-line-category'));
      const visibleSubmenus = subMenus.filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      }).length;

      const menuIcons = Array.from(document.querySelectorAll('.header .nav li > a img'));
      const iconStats = menuIcons.map((img) => {
        const r = img.getBoundingClientRect();
        return {
          src: img.getAttribute('src') || '',
          width: r.width,
          height: r.height,
          naturalWidth: img.naturalWidth || 0
        };
      });
      const brokenIcons = iconStats.filter((i) => i.naturalWidth <= 0 || i.width <= 0 || i.height <= 0).length;

      const horizontalOverflow = document.documentElement.scrollWidth - window.innerWidth;

      let navVisible = false;
      if (nav) {
        const cs = getComputedStyle(nav);
        const r = nav.getBoundingClientRect();
        navVisible = cs.display !== 'none' && r.width > 2 && r.height > 2;
      }

      return {
        visibleSubmenus,
        menuIconCount: menuIcons.length,
        brokenIcons,
        horizontalOverflow,
        navVisible
      };
    });

    console.log(JSON.stringify({ page: target.name, viewport: 'mobile', ...report }));
  });
}
