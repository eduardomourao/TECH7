import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const baseUrl = String(process.argv[2] || "").replace(/\/+$/g, "");
const sampleCount = Number.parseInt(process.argv[3] || "100", 10);
const sectionFilter = process.argv[4] || "pecas-e-componentes";
const bypassSecret = String(process.env.VERCEL_BYPASS_SECRET || "").trim();

if (!baseUrl) {
  console.error("Usage: node scripts/validate-preview-vercel-curl.mjs <preview-url> [sample-count] [section]");
  process.exit(1);
}
if (!bypassSecret) {
  console.error("Set VERCEL_BYPASS_SECRET with the Vercel automation bypass token.");
  process.exit(1);
}

function cleanRoute(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\.html$/i, "");
}

async function vercelStatus(route) {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const url = `${baseUrl}${normalized}`;
  const command = `curl.exe -sS -L -I --max-time 30 --retry 2 --retry-delay 1 --retry-all-errors -H "x-vercel-protection-bypass: ${bypassSecret}" "${url}"`;
  let output = "";
  let match = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: 120000,
        maxBuffer: 1024 * 1024
      });
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      output = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
    }
    const matches = [...output.matchAll(/HTTP\/\S+\s+([1-5]\d\d)/g)];
    match = matches.at(-1);
    if (match) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  return {
    route: normalized,
    status: match ? Number(match[1]) : 0,
    raw: output.trim()
  };
}

const index = JSON.parse(fs.readFileSync("_assets/tech7/search-index.json", "utf8"));
const products = (index.items || [])
  .filter((item) => item.category === sectionFilter)
  .slice(0, sampleCount)
  .map((item) => ({
    title: item.title || item.description || item.slug || item.url,
    route: cleanRoute(item.url),
    image: cleanRoute(item.image)
  }));

const results = [];
for (let i = 0; i < products.length; i += 4) {
  const batch = products.slice(i, i + 4);
  const routeChecks = await Promise.all(batch.map(async (product) => {
    const page = await vercelStatus(product.route);
    const image = product.image ? await vercelStatus(product.image) : { status: 0, route: "" };
    return {
      title: product.title,
      route: product.route,
      status: page.status,
      image: product.image,
      imageStatus: image.status,
      ok: page.status === 200 && image.status === 200
    };
  }));
  results.push(...routeChecks);
  console.error(`validated ${results.length}/${products.length}`);
}

const failed = results.filter((item) => !item.ok);
const lines = [
  "# Relatorio de Validacao Vercel TECH7",
  "",
  `Gerado: ${new Date().toISOString()}`,
  `Preview: ${baseUrl}`,
  `Categoria: ${sectionFilter}`,
  `Produtos testados: ${products.length}`,
  `Status final: ${failed.length ? "REPROVADO" : "APROVADO"}`,
  "",
  "| # | Produto | Rota | Status | Imagem | Status imagem |",
  "|---:|---|---|---:|---|---:|"
];

for (const [indexResult, result] of results.entries()) {
  lines.push(`| ${indexResult + 1} | ${String(result.title).replace(/\|/g, "/")} | /${result.route} | ${result.status} | /${result.image} | ${result.imageStatus} |`);
}

if (failed.length) {
  lines.push("", "## Falhas", "");
  for (const item of failed) {
    lines.push(`- /${item.route}: status ${item.status}, imagem /${item.image}: ${item.imageStatus}`);
  }
}

fs.writeFileSync("RELATORIO-VALIDACAO-VERCEL.md", `${lines.join("\n")}\n`, "utf8");
fs.writeFileSync("validation-vercel-results.json", JSON.stringify({
  baseUrl,
  section: sectionFilter,
  requestedProducts: sampleCount,
  productsTested: products.length,
  failedCount: failed.length,
  failed,
  results
}, null, 2), "utf8");

console.log(JSON.stringify({
  baseUrl,
  section: sectionFilter,
  productsTested: products.length,
  failedCount: failed.length,
  approved: failed.length === 0,
  report: "RELATORIO-VALIDACAO-VERCEL.md"
}, null, 2));

if (products.length < sampleCount || failed.length) process.exit(1);
