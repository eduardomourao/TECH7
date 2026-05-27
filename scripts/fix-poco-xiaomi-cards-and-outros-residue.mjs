import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const products = [
  {
    id: '4972',
    slug: 'lente-da-camera-poco-x3',
    name: 'Lente Da Camera Poco X3 X3 Pro',
    oldUrl: '/pecas-e-componentes/outros/lente-da-camera-poco-x3',
    newUrl: '/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-x3',
  },
  {
    id: '4970',
    slug: 'lente-da-camera-poco-m3',
    name: 'Lente Da Camera Xiaomi Poco M3',
    oldUrl: '/pecas-e-componentes/outros/lente-da-camera-poco-m3',
    newUrl: '/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-m3',
  },
];

const changed = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function writeIfChanged(rel, before, after, note) {
  if (before === after) return false;
  fs.writeFileSync(path.join(root, rel), after, 'utf8');
  changed.push({ file: rel, note });
  return true;
}

function extractProductCard(html, id) {
  const marker = `data-id="${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Card marker not found for ${id}`);
  }
  const start = html.lastIndexOf('<li class="item flex">', markerIndex);
  const end = html.indexOf('</li>', markerIndex);
  if (start === -1 || end === -1) {
    throw new Error(`Card boundaries not found for ${id}`);
  }
  return html.slice(start, end + '</li>'.length);
}

function ensureXiaomiCards() {
  const targetRel = 'pecas-e-componentes/xiaomi-redmi/index.html';
  const sourceHtml = read('pecas-e-componentes/outros/index.html');
  const before = read(targetRel);
  const listOpen = '<ul class="list flex f-wrap row">';
  const listStart = before.indexOf(listOpen);
  if (listStart === -1) {
    throw new Error('Xiaomi catalog product list not found');
  }
  const firstListEnd = before.indexOf('</ul>', listStart);
  const listHtml = before.slice(listStart, firstListEnd);
  const cards = products
    .filter((product) => !listHtml.includes(`data-id="${product.id}"`))
    .map((product) => {
      let card = extractProductCard(sourceHtml, product.id);
      card = card.replaceAll(product.oldUrl, product.newUrl);
      card = card.replaceAll(`${product.oldUrl}/index.html`, `${product.newUrl}/index.html`);
      card = card.replaceAll('../../outros/', '../');
      return card;
    });

  if (!cards.length) return;
  const insertAt = listStart + listOpen.length;
  const after = before.slice(0, insertAt) + cards.join('') + before.slice(insertAt);
  writeIfChanged(targetRel, before, after, `Inseridos ${cards.length} cards Poco na grade visual Xiaomi`);
}

function fixProductPages() {
  for (const product of products) {
    const rel = `pecas-e-componentes/xiaomi-redmi/${product.slug}/index.html`;
    const before = read(rel);
    let after = before;
    after = after.replaceAll(product.oldUrl, product.newUrl);
    after = after.replaceAll(product.oldUrl.replaceAll('/', '\\/'), product.newUrl.replaceAll('/', '\\/'));
    after = after.replaceAll('"item_category2":"OUTROS"', '"item_category2":"XIAOMI REDMI"');
    after = after.replaceAll('{"id":103,"name":"OUTROS","level":2}', '{"id":99,"name":"XIAOMI REDMI","level":2}');
    after = after.replaceAll('title="OUTROS">OUTROS</a>', 'title="XIAOMI REDMI">XIAOMI REDMI</a>');
    writeIfChanged(rel, before, after, `Atualizados metadados e breadcrumb do produto ${product.id}`);
  }
}

function removeOutrosOptions() {
  const replacements = [
    ['pecas-e-componentes/index.html', '<option value="103">OUTROS</option>'],
    ['tampas-e-carcacas/index.html', '<option value="133">OUTROS</option>'],
  ];
  for (const [rel, needle] of replacements) {
    const before = read(rel);
    const after = before.replaceAll(needle, '');
    writeIfChanged(rel, before, after, `Removida opcao OUTROS do filtro principal`);
  }
}

function redirectPage(destination) {
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${destination}/"><meta http-equiv="refresh" content="0; url=${destination}/"><title>Redirecionando - TECH 7</title><script>window.location.replace("${destination}/");</script></head><body></body></html>`;
}

function replaceOldCategoryPages() {
  const redirects = [
    ['pecas-e-componentes/outros/index.html', '/pecas-e-componentes/xiaomi-redmi'],
    ['tampas-e-carcacas/outros/index.html', '/tampas-e-carcacas'],
  ];
  for (const [rel, destination] of redirects) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    const before = read(rel);
    const after = redirectPage(destination);
    writeIfChanged(rel, before, after, `Subcategoria OUTROS convertida em redirecionamento para ${destination}`);
  }
}

function ensureRedirects() {
  const specs = [
    { source: '/pecas-e-componentes/outros', destination: '/pecas-e-componentes/xiaomi-redmi', permanent: false },
    { source: '/tampas-e-carcacas/outros', destination: '/tampas-e-carcacas', permanent: false },
    ...products.map((product) => ({ source: product.oldUrl, destination: product.newUrl, permanent: true })),
  ];

  for (const rel of ['_custom/redirects.json', 'vercel.json']) {
    const before = read(rel);
    const data = JSON.parse(before);
    const redirects = Array.isArray(data) ? data : data.redirects;
    if (!Array.isArray(redirects)) {
      throw new Error(`Redirect array not found in ${rel}`);
    }
    for (const spec of specs) {
      const idx = redirects.findIndex((entry) => entry.source === spec.source);
      if (idx === -1) {
        redirects.unshift(spec);
      } else {
        redirects[idx] = { ...redirects[idx], ...spec };
      }
    }
    const after = `${JSON.stringify(data, null, 2)}\n`;
    writeIfChanged(rel, before, after, 'Garantidos redirects antigos OUTROS para novas rotas');
  }
}

ensureXiaomiCards();
fixProductPages();
removeOutrosOptions();
replaceOldCategoryPages();
ensureRedirects();

console.log(JSON.stringify({ changed }, null, 2));
