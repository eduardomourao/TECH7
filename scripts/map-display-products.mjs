import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const displayDirs = ['display', 'display-e-lcd', 'display-lcd', 'tela-display-lcd', 'telas-display-lcd'];
const displayRoutePattern = /^\/?(display|display-e-lcd|display-lcd|tela-display-lcd|telas-display-lcd)(\/|$)/i;
const outPath = path.join(root, '_validation', 'display-products-map.json');

const displayWords = /\b(tela|display|lcd|oled|frontal)\b/i;
const nonDisplayWords = /\b(bateria|battery|tampa|carca[cç]a|placa|conector|flex|campainha|alto falante|bot[aã]o|c[aâ]mera|sensor|chassi|aro camera)\b/i;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile() && entry.name === 'index.html') files.push(full);
  }
  return files;
}

function routeFromFile(file) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/').replace(/\/index\.html$/, '');
  return `/${rel}`;
}

function firstMatch(source, regex) {
  const match = source.match(regex);
  return match ? match[1].trim() : '';
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseDataLayer(html) {
  const marker = 'dataLayer = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const after = start + marker.length;
  const end = html.indexOf('</script>', after);
  if (end === -1) return null;
  const raw = html.slice(after, end).trim().replace(/;$/, '');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data[0] || null : null;
  } catch {
    return null;
  }
}

const physical = [];
for (const dir of displayDirs) {
  for (const file of walk(path.join(root, dir))) {
    const html = fs.readFileSync(file, 'utf8');
    const route = routeFromFile(file);
    const isAlias = html.includes('TECH7_PRODUCT_ALIAS_PAGE');
    const isProduct = html.includes('page-product');
    const data = isProduct ? parseDataLayer(html) : null;
    const name = normalizeText(data?.nameProduct || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ''));
    const categoryText = normalizeText([
      data?.item_category,
      data?.category,
      data?.breadcrumb,
      ...(Array.isArray(data?.breadcrumbDetails) ? data.breadcrumbDetails.map((item) => item.name) : []),
    ].join(' '));
    const title = normalizeText(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/<[^>]+>/g, ''));
    const evidenceText = `${route} ${name} ${title} ${categoryText}`;
    const displayByEvidence = /\bDISPLAY\b/i.test(categoryText) || displayWords.test(evidenceText);
    const likelyNonDisplay = nonDisplayWords.test(name) && !displayWords.test(name);
    physical.push({
      route,
      file: path.relative(root, file).replaceAll(path.sep, '/'),
      tree: route.split('/')[1],
      isAlias,
      isProduct,
      idProduct: normalizeText(data?.idProduct),
      reference: normalizeText(data?.reference),
      name,
      categoryEvidence: categoryText,
      displayByEvidence,
      likelyNonDisplay,
      included: isProduct && !isAlias && displayByEvidence && !likelyNonDisplay,
    });
  }
}

let searchIndex = [];
const searchIndexPath = path.join(root, '_assets', 'tech7', 'search-index.json');
if (fs.existsSync(searchIndexPath)) {
  const raw = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
  searchIndex = Array.isArray(raw) ? raw : raw.products || raw.items || [];
}

const searchProducts = searchIndex
  .filter((item) => {
    const text = `${item.title || ''} ${item.description || ''}`;
    return displayRoutePattern.test(String(item.url || '')) && (!nonDisplayWords.test(text) || displayWords.test(text));
  })
  .map((item) => ({
    title: normalizeText(item.title),
    url: item.url ? `/${String(item.url).replace(/^\/+/, '').replace(/\/index\.html$/, '')}` : '',
    slug: normalizeText(item.slug),
  }));

const included = physical.filter((item) => item.included);
const byRoute = new Map();
for (const item of included) byRoute.set(item.route.replace(/\/$/, ''), item);
for (const item of searchProducts) {
  if (item.url && !byRoute.has(item.url.replace(/\/$/, ''))) {
    byRoute.set(item.url.replace(/\/$/, ''), {
      route: item.url,
      file: null,
      tree: item.url.split('/')[1],
      isAlias: false,
      isProduct: false,
      idProduct: '',
      reference: '',
      name: item.title,
      categoryEvidence: 'search-index',
      displayByEvidence: true,
      likelyNonDisplay: false,
      included: true,
      source: 'search-index',
    });
  }
}

const allModels = [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route));

const byTree = {};
for (const item of allModels) {
  byTree[item.tree] = (byTree[item.tree] || 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  physicalScanned: physical.length,
  physicalProductPages: physical.filter((item) => item.isProduct).length,
  aliases: physical.filter((item) => item.isAlias).length,
  includedPhysicalDisplayProducts: included.length,
  searchIndexDisplayCandidates: searchProducts.length,
  totalMappedModels: allModels.length,
  byTree,
  excludedLikelyNonDisplay: physical.filter((item) => item.isProduct && item.likelyNonDisplay).map((item) => ({
    route: item.route,
    name: item.name,
  })),
  models: allModels,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  physicalScanned: report.physicalScanned,
  physicalProductPages: report.physicalProductPages,
  aliases: report.aliases,
  includedPhysicalDisplayProducts: report.includedPhysicalDisplayProducts,
  searchIndexDisplayCandidates: report.searchIndexDisplayCandidates,
  totalMappedModels: report.totalMappedModels,
  byTree: report.byTree,
  excludedLikelyNonDisplay: report.excludedLikelyNonDisplay.length,
}, null, 2));
