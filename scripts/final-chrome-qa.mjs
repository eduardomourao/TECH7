import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = "http://localhost:3000";
const outDir = path.join(root, "_validation");
const screenshotDir = path.join(outDir, "chrome-final-screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

function strip(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function inferCategory(name) {
  const text = strip(name);
  if (/\b(bateria|battery|eb-|bn\d|blp\d)\b/.test(text)) return "baterias";
  if (/\b(tampa|carcaca|back cover|traseira)\b/.test(text)) return "tampas";
  if (/\b(tela|display|lcd|oled|frontal|touch)\b/.test(text)) return "display";
  if (/\b(placa|conector|pcb|flex|campainha|botao|alto falante|camera|sensor|aro|chassi|speaker|microfone|fone|dock|carga|lente)\b/.test(text)) return "pecas";
  return "unknown";
}

async function launchBrowser() {
  try {
    return { browser: await chromium.launch({ channel: "chrome", headless: true }), browserName: "chrome" };
  } catch (chromeError) {
    return { browser: await chromium.launch({ headless: true }), browserName: `chromium-fallback: ${chromeError.message}` };
  }
}

async function goto(page, pathValue) {
  const response = await page.goto(`${baseUrl}${pathValue}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  return response;
}

async function categoryCheck(page, pathValue, expected, label) {
  const response = await goto(page, pathValue);
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(800);
  const result = await page.evaluate((expectedCategory) => {
    const navNames = Array.from(document.querySelectorAll("header.header nav.nav .name")).map((node) => node.textContent.trim());
    const navHrefs = Array.from(document.querySelectorAll("header.header nav.nav > .container > ul.list > li > a")).map((node) => node.getAttribute("href"));
    const iconOk = Array.from(document.querySelectorAll("header.header nav.nav > .container > ul.list > li > a img")).every((img) => img.complete && img.naturalWidth > 0);
    const text = document.body.innerText || "";
    const names = Array.from(document.querySelectorAll("main .product-name, .catalog-content .product-name")).map((node) => node.textContent.trim()).filter(Boolean);
    const wrong = names.filter((name) => {
      const t = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      let actual = "unknown";
      if (/\b(bateria|battery|eb-|bn\d|blp\d)\b/.test(t)) actual = "baterias";
      else if (/\b(tampa|carcaca|back cover|traseira)\b/.test(t)) actual = "tampas";
      else if (/\b(tela|display|lcd|oled|frontal|touch)\b/.test(t)) actual = "display";
      else if (/\b(placa|conector|pcb|flex|campainha|botao|alto falante|camera|sensor|aro|chassi|speaker|microfone|fone|dock|carga|lente)\b/.test(t)) actual = "pecas";
      return actual !== "unknown" && actual !== expectedCategory;
    });
    return {
      title: document.title,
      navNames,
      navHrefs,
      iconOk,
      touchVisibleInMenu: /TOUCHS\s+e\s+VISORES/i.test(Array.from(document.querySelectorAll("header.header nav.nav, .content-nav")).map((node) => node.textContent).join(" ")),
      productCount: names.length,
      wrong,
      hasPlaceholder: /\[[a-z_]+\]/i.test(text),
      imagesOk: Array.from(document.querySelectorAll(".catalog-content .product .image img, main .product .image img")).filter((img) => img.offsetParent !== null).slice(0, 12).every((img) => img.complete && img.naturalWidth > 0)
    };
  }, expected);
  return {
    label,
    path: pathValue,
    finalUrl: page.url(),
    status: response?.status() || null,
    ok: response?.ok() && result.navNames.join("|") === "BATERIAS|DISPLAY|PEÇAS E COMPONENTES|TAMPAS E CARCAÇAS" && result.navHrefs.join("|") === "/baterias-celular/index.html|/tela-display-lcd/index.html|/pecas-e-componentes/index.html|/tampas-e-carcacas/index.html" && result.iconOk && !result.touchVisibleInMenu && result.wrong.length === 0 && !result.hasPlaceholder && result.imagesOk,
    details: result
  };
}

async function productCheck(page, href, label) {
  const response = await goto(page, href);
  const result = await page.evaluate(() => {
    const h1 = document.querySelector("h1")?.textContent?.trim() || document.querySelector("[itemprop='name']")?.textContent?.trim() || "";
    const image = Array.from(document.querySelectorAll("main img, .page-product img")).find((img) => img.offsetParent !== null && img.naturalWidth > 60);
    const buy = document.querySelector("#form_comprar, [data-app='product.buy-form'], button, .botao-commerce");
    const breadcrumb = document.querySelector(".breadcrumb, .breadcrumbs, .bread-crumb")?.textContent?.replace(/\s+/g, " ").trim() || "";
    return {
      title: document.title,
      h1,
      pageProduct: document.documentElement.className.includes("page-product"),
      imageOk: Boolean(image),
      buyOk: Boolean(buy),
      breadcrumb,
      hasPlaceholder: /\[[a-z_]+\]/i.test(document.body.innerText || "")
    };
  });
  return {
    label,
    path: href,
    finalUrl: page.url(),
    status: response?.status() || null,
    ok: response?.ok() && result.pageProduct && result.h1.length > 3 && result.imageOk && result.buyOk && !result.hasPlaceholder,
    details: result
  };
}

const { browser, browserName } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const results = {
  generatedAt: new Date().toISOString(),
  browserName,
  baseUrl,
  routeChecks: [],
  productChecks: [],
  searchCheck: null,
  screenshots: []
};

const routeCases = [
  ["/baterias-celular/index.html", "baterias", "Baterias root"],
  ["/tela-display-lcd/index.html", "display", "Display root"],
  ["/pecas-e-componentes/index.html", "pecas", "Pecas root"],
  ["/tampas-e-carcacas/index.html", "tampas", "Tampas root"],
  ["/tela-display-lcd/realme/index.html", "display", "Display Realme"],
  ["/baterias/samsung/index.html", "baterias", "Baterias Samsung legacy"],
  ["/display-e-lcd/realme/index.html", "display", "Display Realme legacy"]
];

for (const [pathValue, expected, label] of routeCases) {
  const check = await categoryCheck(page, pathValue, expected, label);
  results.routeChecks.push(check);
}

await goto(page, "/baterias/index.html");
results.routeChecks.push({
  label: "Baterias legacy redirect",
  path: "/baterias/index.html",
  finalUrl: page.url(),
  status: 200,
  ok: page.url().endsWith("/baterias-celular/index.html")
});

await goto(page, "/tela-display-lcd/realme/index.html");
await page.screenshot({ path: path.join(screenshotDir, "realme-category.png"), fullPage: true });
results.screenshots.push("_validation/chrome-final-screenshots/realme-category.png");
const productHrefs = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll(".catalog-content a.info-product, .catalog-content a.space-image")).map((a) => a.getAttribute("href")).filter(Boolean))).slice(0, 10));

let productIndex = 0;
for (const href of productHrefs) {
  productIndex += 1;
  const check = await productCheck(page, href, `Realme product ${productIndex}`);
  results.productChecks.push(check);
}
await page.screenshot({ path: path.join(screenshotDir, "last-product.png"), fullPage: true });
results.screenshots.push("_validation/chrome-final-screenshots/last-product.png");

await goto(page, "/busca/index.html?q=a22");
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(800);
results.searchCheck = await page.evaluate(() => {
  const names = Array.from(document.querySelectorAll(".result-card .name")).map((node) => node.textContent.trim());
  const imgs = Array.from(document.querySelectorAll(".result-card img"));
  return {
    finalUrl: window.location.href,
    count: names.length,
    names: names.slice(0, 10),
    noPlaceholder: !/\[[a-z_]+\]/i.test(document.body.innerText || ""),
    imagesOk: imgs.slice(0, 10).every((img) => img.complete && img.naturalWidth > 0)
  };
});
results.searchCheck.ok = results.searchCheck.count > 0 && results.searchCheck.noPlaceholder && results.searchCheck.imagesOk;

results.summary = {
  routePassed: results.routeChecks.filter((r) => r.ok).length,
  routeTotal: results.routeChecks.length,
  productPassed: results.productChecks.filter((r) => r.ok).length,
  productTotal: results.productChecks.length,
  searchPassed: Boolean(results.searchCheck?.ok),
  allPassed: results.routeChecks.every((r) => r.ok) && results.productChecks.every((r) => r.ok) && Boolean(results.searchCheck?.ok)
};

fs.writeFileSync(path.join(outDir, "chrome-final-qa-results.json"), JSON.stringify(results, null, 2));
await browser.close();

console.log(JSON.stringify(results.summary, null, 2));
