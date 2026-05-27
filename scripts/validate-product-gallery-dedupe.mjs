import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const staticReportPath = path.join(root, "_validation", "product-gallery-static-duplicates.json");
const outPath = path.join(root, "_validation", "product-gallery-dedupe-runtime-results.json");
const baseUrl = process.env.TECH7_BASE_URL || "http://localhost:3000";
const limit = Number(process.env.TECH7_GALLERY_DEDUPE_LIMIT || 0);
const skipDirs = new Set([".git", "node_modules", "backup", "_validation", "artifacts", "validation-screenshots"]);

function normalizeImageSrc(src) {
  return String(src || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .split("#")[0]
    .trim();
}

function normalizeImageKey(src) {
  let file = normalizeImageSrc(src).split("/").pop()?.toLowerCase() || "";
  if (!file) return "";
  file = file
    .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, "")
    .replace(/^\d{2,4}_/, "")
    .replace(/-[a-f0-9]{6,}$/i, "")
    .replace(/_[a-f0-9]{16,}$/i, "")
    .replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, "$1");
  return file;
}

function duplicateKeys(items) {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeImageKey(item.src);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, count: group.length }));
}

function listIndexHtmlFiles(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listIndexHtmlFiles(full, out);
    else if (entry.name === "index.html") out.push(full);
  }
  return out;
}

function imageAttr(tag) {
  return [...tag.matchAll(/\b(?:src|data-src|data-lazy)=["']([^"']+)["']/gi)].map((match) => match[1])[0] || "";
}

function staticDuplicateFiles() {
  const files = [];
  for (const file of listIndexHtmlFiles()) {
    const html = fs.readFileSync(file, "utf8");
    if (!html.includes("image-show") || !html.includes("nav-images")) continue;
    const nav = html.match(/<div class=["']nav-images["'][\s\S]*?<div class=["']image-show["']/i)?.[0] || "";
    const main = html.match(/<div class=["']image-show["'][\s\S]*?<div class=["']dots["']><\/div>/i)?.[0] || "";
    const navItems = [...nav.matchAll(/<img\b[^>]*>/gi)].map((match) => ({ src: imageAttr(match[0]) })).filter((item) => item.src);
    const mainItems = [...main.matchAll(/<img\b[^>]*>/gi)].map((match) => ({ src: imageAttr(match[0]) })).filter((item) => item.src);
    if (duplicateKeys(navItems).length || duplicateKeys(mainItems).length) {
      files.push(path.relative(root, file).replace(/\\/g, "/"));
    }
  }
  return files;
}

function loadTargets() {
  const report = fs.existsSync(staticReportPath)
    ? JSON.parse(fs.readFileSync(staticReportPath, "utf8"))
    : {};
  const all = Array.isArray(report.files) ? report.files : staticDuplicateFiles();
  const targets = all
    .map((item) => typeof item === "string" ? item : item.file)
    .filter(Boolean)
    .map((file) => {
      const route = `/${file.replace(/\\/g, "/").replace(/\/index\.html$/i, "")}`;
      return { file, url: `${baseUrl}${route}` };
    });
  return limit > 0 ? targets.slice(0, limit) : targets;
}

async function validateOne(browser, target) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${target.url}?t7-dedupe=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("#product-container", { timeout: 15000 });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
      const normalizeImageSrc = (src) => String(src || "")
        .replace(/^https?:\/\/[^/]+/i, "")
        .split("?")[0]
        .split("#")[0]
        .trim();
      const normalizeImageKey = (src) => {
        let file = normalizeImageSrc(src).split("/").pop()?.toLowerCase() || "";
        if (!file) return "";
        return file
          .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, "")
          .replace(/^\d{2,4}_/, "")
          .replace(/-[a-f0-9]{6,}$/i, "")
          .replace(/_[a-f0-9]{16,}$/i, "")
          .replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, "$1");
      };
      const duplicateKeys = (items) => {
        const groups = new Map();
        for (const item of items) {
          const key = normalizeImageKey(item.src);
          if (!key) continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        }
        return [...groups.entries()]
          .filter(([, group]) => group.length > 1)
          .map(([key, group]) => ({ key, count: group.length }));
      };
      const imageInfo = (img) => {
        const rect = img.getBoundingClientRect();
        return {
          src: normalizeImageSrc(img.getAttribute("src") || img.getAttribute("data-src") || ""),
          key: normalizeImageKey(img.getAttribute("src") || img.getAttribute("data-src") || ""),
          naturalWidth: img.naturalWidth || 0,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      };
      const thumbs = [...document.querySelectorAll("#product-container .nav-images .swiper-slide img")].map(imageInfo);
      const mains = [...document.querySelectorAll("#product-container .image-show .swiper-slide img:not(.zoomImg)")].map(imageInfo);
      const beforeActive = document.querySelector("#product-container .image-show .swiper-slide-active img:not(.zoomImg)")?.getAttribute("src") || "";
      const secondThumb = document.querySelectorAll("#product-container .nav-images .box-img")[1];
      if (secondThumb) secondThumb.click();
      return new Promise((resolve) => {
        window.setTimeout(() => {
          const afterActive = document.querySelector("#product-container .image-show .swiper-slide-active img:not(.zoomImg)")?.getAttribute("src") || "";
          resolve({
            thumbs,
            mains,
            thumbDuplicateKeys: duplicateKeys(thumbs),
            mainDuplicateKeys: duplicateKeys(mains),
            unloadedThumbs: thumbs.filter((item) => item.naturalWidth <= 0).length,
            unloadedMains: mains.filter((item) => item.naturalWidth <= 0).length,
            clickChanged: thumbs.length <= 1 || beforeActive !== afterActive,
          });
        }, 450);
      });
    });

    const ok = result.thumbDuplicateKeys.length === 0 &&
      result.mainDuplicateKeys.length === 0 &&
      result.unloadedThumbs === 0 &&
      result.unloadedMains === 0 &&
      result.clickChanged;

    return { ...target, ok, ...result, consoleErrors: consoleErrors.slice(0, 3) };
  } catch (error) {
    return { ...target, ok: false, error: error.message, consoleErrors: consoleErrors.slice(0, 3) };
  } finally {
    await page.close().catch(() => {});
  }
}

const targets = loadTargets();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const queue = [...targets];
const results = [];
const workers = Array.from({ length: 5 }, async () => {
  while (queue.length) {
    const target = queue.shift();
    results.push(await validateOne(browser, target));
    if (results.length % 5 === 0) console.log(`[validate-product-gallery-dedupe] ${results.length}/${targets.length}`);
  }
});

await Promise.all(workers);
await browser.close();

results.sort((a, b) => targets.findIndex((target) => target.file === a.file) - targets.findIndex((target) => target.file === b.file));
const failed = results.filter((result) => !result.ok);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("[validate-product-gallery-dedupe]");
console.log(`Total: ${report.total} | OK: ${report.passed} | Falhas: ${report.failed}`);
if (failed.length) {
  for (const item of failed.slice(0, 30)) {
    console.log(`FALHOU ${item.file}: ${item.error || `thumbDup=${item.thumbDuplicateKeys?.length || 0} mainDup=${item.mainDuplicateKeys?.length || 0}`}`);
  }
  process.exitCode = 1;
}
