import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = String(process.argv[2] || "").replace(/\/+$/, "");
const vercelShareUrl = String(process.env.VERCEL_SHARE_URL || "").trim();
const playwrightCdpUrl = String(process.env.PLAYWRIGHT_CDP_URL || "").trim();
let vercelShareToken = "";
try {
  vercelShareToken = vercelShareUrl ? new URL(vercelShareUrl).searchParams.get("_vercel_share") || "" : "";
} catch {
  vercelShareToken = "";
}
if (!baseUrl) {
  console.error("Usage: node scripts/validate-preview-browser.mjs <preview-url>");
  process.exit(1);
}

const validationFile = "C:/tmp/paginas_validacao.txt";
const screenshotDir = path.join(root, "validation-screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

function routeFromHtmlPath(filePath) {
  const clean = String(filePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "")
    .replace(/^\/+|\/+$/g, "");
  return clean ? `/${clean}` : "/";
}

function safeName(route) {
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "home";
}

function isExternalResourceConsoleNoise(message) {
  return /^Failed to load resource: net::ERR_/i.test(String(message || ""));
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 6000);
      });
    }));
  });
}

async function authorizeVercelPreview(page) {
  if (!vercelShareUrl) return;
  await page.goto(vercelShareUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

function withVercelShare(url) {
  if (!vercelShareToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("_vercel_share", vercelShareToken);
  return parsed.href;
}

async function collectPage(context, route, index, options = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];
  const externalNetworkErrors = [];
  const trayRequests = [];
  const image404 = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const line = `${request.failure()?.errorText || "failed"} ${request.url()}`;
    const requestUrl = new URL(request.url(), baseUrl);
    if (requestUrl.origin === new URL(baseUrl).origin) networkErrors.push(line);
    else externalNetworkErrors.push(line);
    if (/\/(?:mvc\/store|nocache\/|web_api\/)/i.test(requestUrl.pathname)) trayRequests.push(line);
  });
  page.on("response", (response) => {
    const status = response.status();
    const responseUrl = new URL(response.url(), baseUrl);
    if (/\/(?:mvc\/store|nocache\/|web_api\/)/i.test(responseUrl.pathname)) {
      trayRequests.push(`${status} ${response.url()}`);
    }
    if (status >= 400) {
      const line = `${status} ${response.url()}`;
      if (responseUrl.origin === new URL(baseUrl).origin) {
        networkErrors.push(line);
        if (response.request().resourceType() === "image") image404.push(line);
      } else {
        externalNetworkErrors.push(line);
      }
    }
  });

  const url = `${baseUrl}${route}`;
  const targetUrl = withVercelShare(url);
  let status = 0;
  let finalUrl = url;
  let navigationError = "";
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    status = response?.status() || 0;
    finalUrl = page.url();
  } catch (error) {
    navigationError = error.message;
  }
  await waitForImages(page).catch(() => {});

  const desktop = await page.evaluate(() => {
    const broken = Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src || img.getAttribute("data-src") || "")
      .filter(Boolean);
    return {
      title: document.title,
      imageCount: document.images.length,
      brokenImages: broken,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  }).catch(() => ({ title: "", imageCount: 0, brokenImages: [], overflow: true }));

  const baseName = `${String(index).padStart(2, "0")}-${safeName(route)}`;
  const desktopShot = path.join(screenshotDir, `${baseName}-desktop.png`);
  await page.screenshot({ path: desktopShot, fullPage: false }).catch(() => {});

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await waitForImages(page).catch(() => {});
  const mobile = await page.evaluate(() => {
    const broken = Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src || img.getAttribute("data-src") || "")
      .filter(Boolean);
    return {
      imageCount: document.images.length,
      brokenImages: broken,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  }).catch(() => ({ imageCount: 0, brokenImages: [], overflow: true }));
  const mobileShot = path.join(screenshotDir, `${baseName}-mobile.png`);
  await page.screenshot({ path: mobileShot, fullPage: false }).catch(() => {});

  await page.close();

  return {
    label: options.label || "page",
    route,
    url,
    finalUrl,
    status,
    navigationError,
    title: desktop.title,
    imageCount: desktop.imageCount,
    brokenImages: desktop.brokenImages,
    mobileImageCount: mobile.imageCount,
    mobileBrokenImages: mobile.brokenImages,
    image404,
    consoleErrors,
    pageErrors,
    networkErrors,
    externalNetworkErrors,
    trayRequests,
    desktopOverflow: desktop.overflow,
    mobileOverflow: mobile.overflow,
    desktopShot: path.relative(root, desktopShot).replace(/\\/g, "/"),
    mobileShot: path.relative(root, mobileShot).replace(/\\/g, "/")
  };
}

const validationPages = fs.readFileSync(validationFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 20)
  .map(routeFromHtmlPath);

const extraRoutes = [
  "/",
  "/baterias-celular",
  "/tela-display-lcd",
  "/touch-e-visor",
  "/pecas-e-componentes",
  "/tampas-e-carcacas"
];

const browser = playwrightCdpUrl
  ? await chromium.connectOverCDP(playwrightCdpUrl)
  : await chromium.launch({ headless: true });
const context = playwrightCdpUrl
  ? browser.contexts()[0] || await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  : await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const authPage = await context.newPage();
await authorizeVercelPreview(authPage);
await authPage.close();

const results = [];
let i = 1;
for (const route of validationPages) {
  results.push(await collectPage(context, route, i++, { label: "validation" }));
}
for (const route of extraRoutes) {
  results.push(await collectPage(context, route, i++, { label: "extra" }));
}

let flow = { ok: false, notes: [] };
try {
  const page = await context.newPage();
  const home = await page.goto(withVercelShare(`${baseUrl}/`), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const productHref = await page.evaluate(() => {
    const categoryHeads = new Set(["baterias", "baterias-celular", "bateria", "bateria-celular", "display", "display-e-lcd", "tela-display-lcd", "pecas-e-componentes", "pecas-componentes", "componentes", "pecas", "tampas-e-carcacas", "tampas", "touch-e-visor", "touchs-e-visores"]);
    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      const href = anchor.getAttribute("href") || "";
      if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) continue;
      const parts = href.replace(/\\/g, "/").split("?")[0].split("#")[0].split("/").filter(Boolean);
      const indexPos = parts.findIndex((part) => part.toLowerCase() === "index.html");
      const cleanParts = indexPos >= 0 ? parts.slice(0, indexPos) : parts;
      if (cleanParts.length >= 2 && categoryHeads.has(cleanParts[0].toLowerCase())) return href;
    }
    return "";
  });
  flow.notes.push(`home status ${home?.status() || 0}`);
  if (productHref) {
    const productUrl = new URL(productHref, `${baseUrl}/`).href;
    const product = await page.goto(withVercelShare(productUrl), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    flow.notes.push(`produto ${product?.status() || 0} ${page.url()}`);
    const cart = await page.goto(withVercelShare(`${baseUrl}/carrinho`), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    flow.notes.push(`carrinho ${cart?.status() || 0}`);
    flow.ok = (home?.status() || 0) < 400 && (product?.status() || 0) < 400 && (cart?.status() || 0) < 400;
  } else {
    flow.notes.push("nenhum link de produto encontrado na home");
  }
  await page.close();
} catch (error) {
  flow.notes.push(error.message);
}
await context.close();
await browser.close();

const validationOnly = results.filter((item) => item.label === "validation");
const failures = results.filter((item) =>
  item.status >= 400 ||
  item.status === 0 ||
  item.navigationError ||
  item.brokenImages.length ||
  item.mobileBrokenImages.length ||
  item.image404.length ||
  item.trayRequests.length ||
  item.mobileOverflow
);

const criticalConsole = results.flatMap((item) => [
  ...item.consoleErrors
    .filter((error) => !isExternalResourceConsoleNoise(error))
    .map((error) => `${item.route}: ${error}`),
  ...item.pageErrors.map((error) => `${item.route}: ${error}`)
]);

const approved = failures.length === 0 && criticalConsole.length === 0 && flow.ok;
const lines = [
  "# Relatorio de Validacao TECH7",
  "",
  `Gerado: ${new Date().toISOString()}`,
  `Preview: ${baseUrl}`,
  `Status final: ${approved ? "APROVADO" : "REPROVADO"}`,
  "",
  "## Resumo",
  "",
  `- Paginas obrigatorias testadas: ${validationOnly.length}`,
  `- Paginas extras/categorias testadas: ${results.length - validationOnly.length}`,
  `- Falhas de status/imagem/mobile: ${failures.length}`,
  `- Console/page errors capturados: ${criticalConsole.length}`,
  `- Requests Tray capturados: ${results.reduce((sum, item) => sum + item.trayRequests.length, 0)}`,
  `- Fluxo Home -> Produto -> Carrinho: ${flow.ok ? "OK" : "FALHOU"}`,
  "- Browser MCP do Codex: indisponivel nesta sessao (Transport closed); validacao executada com Chromium local/Playwright.",
  "",
  "## Fluxo",
  "",
  ...flow.notes.map((note) => `- ${note}`),
  "",
  "## 20 paginas obrigatorias",
  "",
  "| # | URL | Status | Imgs | Quebradas | Image 404 | Mobile overflow | Screenshot desktop | Screenshot mobile |",
  "|---:|---|---:|---:|---:|---:|---|---|---|"
];

for (const [index, result] of validationOnly.entries()) {
  lines.push(`| ${index + 1} | ${result.url} | ${result.status} | ${result.imageCount} | ${result.brokenImages.length + result.mobileBrokenImages.length} | ${result.image404.length} | ${result.mobileOverflow ? "SIM" : "NAO"} | ${result.desktopShot} | ${result.mobileShot} |`);
}

lines.push("", "## Extras", "");
for (const result of results.filter((item) => item.label === "extra")) {
  lines.push(`- ${result.url}: status ${result.status}, imagens quebradas ${result.brokenImages.length + result.mobileBrokenImages.length}, mobile overflow ${result.mobileOverflow ? "SIM" : "NAO"}`);
}

lines.push("", "## Console e network", "");
if (!criticalConsole.length && !results.some((item) => item.networkErrors.length)) {
  lines.push("Nenhum erro de console/page error/network >=400 capturado.");
} else {
  for (const result of results) {
    const issues = [
      ...result.consoleErrors.map((item) => `console: ${item}`),
      ...result.pageErrors.map((item) => `pageerror: ${item}`),
      ...result.networkErrors.map((item) => `network: ${item}`)
    ];
    if (!issues.length) continue;
    lines.push(`### ${result.url}`, "");
    for (const issue of issues.slice(0, 30)) lines.push(`- ${issue}`);
    if (issues.length > 30) lines.push(`- Mais ${issues.length - 30} ocorrencias omitidas.`);
    lines.push("");
  }
}

fs.writeFileSync(path.join(root, "RELATORIO-VALIDACAO.md"), `${lines.join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(root, "validation-results.json"), JSON.stringify({ baseUrl, approved, flow, results }, null, 2), "utf8");

console.log(JSON.stringify({
  baseUrl,
  approved,
  validationPages: validationOnly.length,
  totalPages: results.length,
  failures: failures.length,
  criticalConsole: criticalConsole.length,
  report: "RELATORIO-VALIDACAO.md"
}, null, 2));
