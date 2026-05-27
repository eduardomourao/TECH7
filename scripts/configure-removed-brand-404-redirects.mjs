import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "relatorio-limpeza-ui.json");

const removedBrandSlugs = [
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

const categoryRoots = [
  "baterias-celular",
  "baterias",
  "bateria-celular",
  "bateria",
  "display-e-lcd",
  "tela-display-lcd",
  "display",
  "display-lcd",
  "telas-display-lcd",
  "telas",
  "pecas-e-componentes",
  "pecas-componentes",
  "pecas",
  "componentes",
  "tampas-e-carcacas",
  "tampas-carcacas",
  "tampas",
  "carcacas",
  "touch-e-visor",
  "touchs-e-visores",
  "touchs-visores",
  "touch-visor",
  "touch"
];

const redirectRules = [];
for (const rootSlug of categoryRoots) {
  for (const brandSlug of removedBrandSlugs) {
    redirectRules.push({
      source: `/${rootSlug}/${brandSlug}`,
      destination: "/404.html",
      type: "removed-brand-category",
      method: "GET",
      strategy: "404-redirect",
      permanent: false,
      proof: "catalog-brand-cleanup"
    });
  }
}

function upsertRedirects(fileRel, mapper = (rule) => rule) {
  const file = path.join(root, fileRel);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const current = Array.isArray(payload.redirects) ? payload.redirects : [];
  const bySource = new Map();
  for (const rule of current) {
    if (rule?.source) bySource.set(rule.source, rule);
  }
  let added = 0;
  for (const rule of redirectRules) {
    if (bySource.has(rule.source)) continue;
    bySource.set(rule.source, mapper(rule));
    added += 1;
  }
  const existingSources = new Set(current.map((rule) => rule?.source).filter(Boolean));
  const additions = redirectRules
    .filter((rule) => !existingSources.has(rule.source))
    .map(mapper);
  payload.redirects = [
    ...additions,
    ...current.filter((rule) => rule?.source && rule?.destination)
  ];
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return { arquivo: fileRel, adicionadas: added };
}

const results = [
  upsertRedirects("_custom/redirects.json"),
  upsertRedirects("vercel.json", (rule) => ({
    source: rule.source,
    destination: rule.destination,
    permanent: false
  }))
];

if (fs.existsSync(output)) {
  const report = JSON.parse(fs.readFileSync(output, "utf8"));
  report.arquivos_modificados = report.arquivos_modificados || [];
  for (const result of results) {
    report.arquivos_modificados.push({
      arquivo: result.arquivo,
      removido: [`redirects 404 para categorias/marcas removidas adicionados: ${result.adicionadas}`],
      status: "sucesso"
    });
  }
  report.resumo = report.resumo || {};
  report.resumo.arquivos_json_modificados = (report.resumo.arquivos_json_modificados || 0) + results.length;
  report.resumo.redirects_404_marcas_removidas = results.reduce((sum, item) => sum + item.adicionadas, 0);
  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");
}

console.log(JSON.stringify(results, null, 2));
