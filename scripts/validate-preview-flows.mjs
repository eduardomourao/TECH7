import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.TECH7_PREVIEW_URL || "https://vercel-preview-package-ahnfpizfc-stiflerwfl1-oss-projects.vercel.app";
const shareUrl = process.env.TECH7_SHARE_URL || `${baseUrl}/?_vercel_share=dfNDMVkmq4bF0YRbPxSrZxFaMDiMQbem`;
const outFile = path.join(root, "_validation", "chrome-flow-results.json");
const cookieFile = path.join(root, "_validation", "vercel-share-cookies.txt");

const buckets = [
  { label: "Display", prefixes: ["/tela-display-lcd/", "/display-e-lcd/", "/display/"], count: 4 },
  { label: "Baterias", prefixes: ["/baterias-celular/", "/baterias/"], count: 4 },
  { label: "Touch/Visor", prefixes: ["/touch-e-visor/", "/touchs-e-visores/"], count: 4 },
  { label: "Peças e Componentes", prefixes: ["/pecas-e-componentes/"], count: 4 },
  { label: "Tampas e Carcaças", prefixes: ["/tampas-e-carcacas/"], count: 4 },
  { label: "Máquinas e Ferramentas", prefixes: ["/maquinas-e-ferramentas/", "/ferramentas/"], count: 2 },
  { label: "Apple", brand: "apple", count: 4 },
  { label: "Samsung", brand: "samsung", count: 4 },
  { label: "Motorola", brand: "motorola", count: 4 },
  { label: "Xiaomi", brand: "xiaomi", count: 4 },
  { label: "LG", brand: "lg", count: 4 },
  { label: "Realme", brand: "realme", count: 4 },
  { label: "Asus", brand: "asus", count: 4 }
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function readCookieHeader() {
  if (!fs.existsSync(cookieFile)) return "";
  return fs.readFileSync(cookieFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("# ") && !line.startsWith("##"))
    .map((line) => line.replace(/^#HttpOnly_/, "").split("\t"))
    .filter((parts) => parts.length >= 7)
    .map((parts) => `${parts[5]}=${parts[6]}`)
    .join("; ");
}

function normalizeRoute(value) {
  let route = String(value || "").trim().replace(/\\/g, "/");
  route = route.replace(/^https?:\/\/[^/]+/i, "").split("#")[0].split("?")[0];
  route = route.replace(/\/index\.html$/i, "").replace(/\.html$/i, "");
  if (!route.startsWith("/")) route = `/${route}`;
  return route.replace(/\/+$/g, "") || "/";
}

function selectFlows() {
  const products = readJson("_validation/product-routes-map.json").products
    .filter((item) => !item.isAlias && item.route && item.title)
    .map((item) => ({ ...item, route: normalizeRoute(item.route) }));
  const selected = [];
  const used = new Set();
  function add(bucket) {
    const matches = products.filter((item) => {
      if (used.has(item.route)) return false;
      if (bucket.brand) return String(item.brand || "").toLowerCase().includes(bucket.brand);
      return bucket.prefixes.some((prefix) => item.route.startsWith(prefix));
    });
    for (const item of matches.slice(0, bucket.count)) {
      selected.push({ bucket: bucket.label, product: item });
      used.add(item.route);
    }
  }
  for (const bucket of buckets) add(bucket);
  for (const bucket of buckets) add({ ...bucket, count: 4 });
  for (const item of products) {
    if (selected.length >= 50) break;
    if (!used.has(item.route)) selected.push({ bucket: "Extra", product: item });
  }
  return selected.slice(0, 50);
}

function textIncludesProductName(html, title) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase();
  const words = String(title || "").toLowerCase().split(/\s+/).filter((word) => word.length >= 4).slice(0, 5);
  return words.length === 0 || words.some((word) => text.includes(word));
}

function firstImage(html) {
  const tag = html.match(/<img\b[^>]*>/i)?.[0] || "";
  return tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i)?.[1] || "";
}

function absoluteUrl(value, route) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  const base = new URL(route, baseUrl);
  return new URL(value, base).href;
}

async function requestWithRedirects(route, options = {}) {
  let url = /^https?:\/\//i.test(route) ? route : new URL(route, baseUrl).href;
  const headers = {
    ...(options.headers || {}),
    ...(options.cookie ? { cookie: options.cookie } : {})
  };
  for (let redirect = 0; redirect <= 6; redirect += 1) {
    let response;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 60000);
      try {
        response = await fetch(url, {
          method: options.method || "GET",
          headers,
          body: options.body,
          redirect: "manual",
          signal: controller.signal
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      } finally {
        clearTimeout(timeout);
      }
    }
    if (lastError) throw lastError;
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
      url = new URL(response.headers.get("location"), url).href;
      if (response.status === 303) {
        options.method = "GET";
        delete options.body;
      }
      continue;
    }
    return {
      status: response.status,
      url,
      text: options.readText ? await response.text().catch(() => "") : ""
    };
  }
  return { status: 0, url, text: "" };
}

async function get(route, cookie, options = {}) {
  const response = await requestWithRedirects(route, { ...options, cookie });
  return {
    status: response.status,
    url: response.url,
    text: response.text
  };
}

async function run() {
  const cookie = readCookieHeader();
  if (!cookie) await requestWithRedirects(shareUrl, { timeout: 60000 });
  const flows = selectFlows();
  const results = [];

  for (const [index, flow] of flows.entries()) {
    const product = flow.product;
    const categoryRoute = `/${product.section || product.route.split("/").filter(Boolean)[0]}`;
    const brandRoute = product.brand ? `${categoryRoute}/${product.brand}` : categoryRoute;
    const result = {
      index: index + 1,
      bucket: flow.bucket,
      categoryRoute,
      brandRoute,
      productRoute: product.route,
      productTitle: product.title,
      steps: [],
      passed: false
    };

    const home = await get("/", cookie);
    const category = await get(categoryRoute, cookie);
    const brand = brandRoute !== categoryRoute ? await get(brandRoute, cookie) : category;
    const productPage = await get(product.route, cookie, { readText: true });
    const imageUrl = absoluteUrl(firstImage(productPage.text), product.route);
    const imageStatus = imageUrl ? (await requestWithRedirects(imageUrl, { cookie, timeout: 30000 }).catch(() => ({ status: 0 }))).status : 0;
    const cartPost = await requestWithRedirects("/api/cart/add", {
      cookie,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: product.slug, qty: 1 }),
      timeout: 30000
    }).catch(() => ({ status: 0 }));
    const cart = await get("/carrinho", cookie);
    const checkout = await get("/checkout", cookie);
    const nameVisible = textIncludesProductName(productPage.text, product.title);

    result.steps.push({ name: "home", status: home.status });
    result.steps.push({ name: "menu-hover", status: "simulated-by-route-map" });
    result.steps.push({ name: "category", route: categoryRoute, status: category.status });
    result.steps.push({ name: "subcategory-or-brand", route: brandRoute, status: brand.status });
    result.steps.push({ name: "product", status: productPage.status, finalUrl: productPage.url, nameVisible, imageStatus });
    result.steps.push({ name: "cart-add", status: cartPost.status });
    result.steps.push({ name: "cart", status: cart.status });
    result.steps.push({ name: "checkout", status: checkout.status });

    result.passed = [home.status, category.status, brand.status, productPage.status, imageStatus, cartPost.status, cart.status, checkout.status]
      .every((status) => Number(status) >= 200 && Number(status) < 400)
      && productPage.url.includes(product.route)
      && nameVisible;
    results.push(result);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    toolRequested: "@chrome",
    chromeDevtoolsStatus: "failed-timeout-before-navigation",
    fallbackTool: "node-fetch-manual-redirect",
    baseUrl,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    results
  };
  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ total: summary.total, passed: summary.passed, failed: summary.failed, outFile }, null, 2));
  if (summary.passed < 50) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
