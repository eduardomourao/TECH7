import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "_validation", "chrome-catalog-cleanup-qa");
fs.mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.TECH7_BASE_URL || "http://localhost:3000";
const removedSlugs = [
  "zenfone",
  "asus",
  "infinix",
  "lenovo",
  "nokia",
  "alcatel",
  "cce",
  "importados",
  "importado",
  "multilaser",
  "positivo",
  "sony",
  "sony-experia",
  "blu",
  "zz-outras"
];
const removedWords = ["ZENFONE", "ASUS", "INFINIX", "LENOVO", "NOKIA", "ALCATEL", "CCE", "IMPORTADOS", "MULTILASER", "POSITIVO", "SONY", "BLU"];

const categoryRoutes = [
  "/",
  "/baterias-celular/",
  "/display-e-lcd/",
  "/pecas-e-componentes/",
  "/tampas-e-carcacas/"
];

const removedRoutes = [
  "/baterias-celular/infinix/",
  "/baterias-celular/zenfone/",
  "/display-e-lcd/alcatel/",
  "/display-e-lcd/positivo/",
  "/pecas-e-componentes/sony/",
  "/tampas-e-carcacas/zenfone/"
];

function safeName(route) {
  return (route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-")) || "route";
}

async function launchBrowser() {
  try {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    return { browser, channel: "chrome" };
  } catch (error) {
    const browser = await chromium.launch({ headless: true });
    return { browser, channel: "bundled-chromium", chromeLaunchError: String(error.message || error) };
  }
}

const { browser, channel, chromeLaunchError } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const checks = [];

for (const route of categoryRoutes) {
  const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);
  const screenshot = path.join(outDir, `${safeName(route)}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const data = await page.evaluate(({ removedSlugs, removedWords }) => {
    const selectors = {
      header: Boolean(document.querySelector("header, .header")),
      main: Boolean(document.querySelector("main")),
      footer: Boolean(document.querySelector("footer, .footer"))
    };
    const productCards = document.querySelectorAll(".product-name, .product, [class*='product']").length;
    const linksToRemoved = [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") || "")
      .filter((href) => removedSlugs.some((slug) => new RegExp(`(^|/)${slug}(/|$|[?#])`, "i").test(href)));
    const filterTexts = [...document.querySelectorAll(".filter__item, option, label, nav a")]
      .map((el) => (el.textContent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase())
      .filter((text) => removedWords.some((word) => text === word || text.includes(` ${word} `)));
    const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    return { selectors, productCards, linksToRemoved, filterTexts, hasHorizontalOverflow, title: document.title };
  }, { removedSlugs, removedWords });
  const ok = (response?.status() || 0) < 400
    && data.selectors.header
    && data.selectors.main
    && (route === "/" || data.selectors.footer)
    && (route === "/" || data.productCards > 0)
    && data.linksToRemoved.length === 0
    && data.filterTexts.length === 0
    && true;
  checks.push({ route, status: response?.status() || null, ok, screenshot, ...data });
}

for (const route of removedRoutes) {
  const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(400);
  const finalUrl = page.url();
  const data = await page.evaluate(({ removedSlugs, removedWords }) => {
    const productSignals = document.querySelectorAll(".page-product, .product-name, .product-price, .add-cart, [data-id-product]").length;
    const dataLayerText = JSON.stringify(globalThis.dataLayer || []);
    const linksToRemoved = [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") || "")
      .filter((href) => removedSlugs.some((slug) => new RegExp(`(^|/)${slug}(/|$|[?#])`, "i").test(href)));
    const visibleRemovedLabels = [...document.querySelectorAll(".filter__item, option, label, nav a, h1, h2")]
      .map((el) => (el.textContent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase())
      .filter((text) => removedWords.some((word) => text === word || text.includes(` ${word} `)));
    return { productSignals, dataLayerTextHasRemovedProduct: /idProduct|listProducts/.test(dataLayerText), linksToRemoved, visibleRemovedLabels };
  }, { removedSlugs, removedWords });
  const status = response?.status() || null;
  const ok = status === 404
    || (data.productSignals === 0 && !data.dataLayerTextHasRemovedProduct && data.linksToRemoved.length === 0 && data.visibleRemovedLabels.length === 0);
  checks.push({ route, status, finalUrl, ok, removedRouteCheck: true, ...data });
}

await browser.close();

const result = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browserChannel: channel,
  chromeLaunchError,
  ok: checks.every((check) => check.ok),
  checks
};

fs.writeFileSync(path.join(root, "_validation", "chrome-catalog-cleanup-qa.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify({
  ok: result.ok,
  browserChannel: result.browserChannel,
  checks: checks.length,
  failed: checks.filter((check) => !check.ok).length,
  report: "_validation/chrome-catalog-cleanup-qa.json"
}, null, 2));

if (!result.ok) process.exit(1);
