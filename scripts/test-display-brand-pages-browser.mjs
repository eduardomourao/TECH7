import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = String(process.env.DISPLAY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const reportDir = path.join(root, "_validation");
const reportPath = path.join(reportDir, "display-brand-full-browser-test.json");
const brands = ["apple", "xiaomi-redmi", "samsung", "motorola", "realme"];
const sections = ["display", "display-e-lcd"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (entry.name.toLowerCase() === "index.html") out.push(abs);
  }
  return out;
}

function routeFromFile(abs) {
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  return `/${rel.replace(/\/index\.html$/i, "")}`;
}

function collectRoutes() {
  const files = [];
  for (const section of sections) {
    for (const brand of brands) {
      files.push(...walk(path.join(root, section, brand)));
    }
  }
  return files.map(routeFromFile).sort((a, b) => a.localeCompare(b));
}

async function run() {
  const routes = collectRoutes();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const results = [];

  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    const routeParts = route.split("/").filter(Boolean);
    const isCategoryRoute = routeParts.length <= 2;
    const url = `${baseUrl}${route}`;
    let status = 0;
    let navError = "";
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = response?.status() || 0;
      await page.waitForTimeout(isCategoryRoute ? 1600 : 350);
    } catch (error) {
      navError = String(error?.message || error);
    }

    const details = await page.evaluate(() => {
      const visibleImages = Array.from(document.images).filter((img) => img.closest("main, .box-gallery, .catalog-content, .showcase-catalog"));
      const galleryImages = Array.from(document.querySelectorAll(".box-gallery img"));
      const brokenImages = visibleImages
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => (img.getAttribute("src") || "").trim())
        .filter((src) => Boolean(src))
        .slice(0, 15);
      return {
        hasHeader: Boolean(document.querySelector("header")),
        hasMain: Boolean(document.querySelector("main")),
        hasFooter: Boolean(document.querySelector("footer")),
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        title: document.title,
        allImageCount: Array.from(document.images).length,
        validAllImages: Array.from(document.images).filter((img) => img.complete && img.naturalWidth > 0).length,
        visibleImageCount: visibleImages.length,
        validVisibleImages: visibleImages.filter((img) => img.complete && img.naturalWidth > 0).length,
        galleryImageCount: galleryImages.length,
        validGalleryImages: galleryImages.filter((img) => img.complete && img.naturalWidth > 0).length,
        brokenImages
      };
    }).catch(() => ({
      hasHeader: false,
      hasMain: false,
      hasFooter: false,
      h1: "",
      title: "",
      allImageCount: 0,
      validAllImages: 0,
      visibleImageCount: 0,
      validVisibleImages: 0,
      galleryImageCount: 0,
      validGalleryImages: 0,
      brokenImages: []
    }));

    const ok = !navError &&
      status > 0 &&
      status < 400 &&
      details.hasHeader &&
      details.hasMain &&
      (isCategoryRoute ? true : details.hasFooter) &&
      (isCategoryRoute ? details.validAllImages > 0 : details.validVisibleImages > 0) &&
      details.brokenImages.length === 0;

    results.push({
      route,
      url,
      status,
      navError,
      ok,
      ...details
    });
  }

  await page.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ summary, failed, results }, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) process.exitCode = 2;
}

run();
