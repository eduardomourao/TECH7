import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const { Client } = pg;
const root = process.cwd();
const categoryPath = path.join(root, "tampas-e-carcacas", "apple", "index.html");
const searchIndexPath = path.join(root, "_assets", "tech7", "search-index.json");
const productTemplatePath = path.join(root, "tampas-e-carcacas", "apple", "tampa-traseira-iphone-17-pro-max", "index.html");

const productIds = [
  "tampas-e-carcacas-apple-carcaca-transforma-iphone-xs-em-iphone-17-pro-max",
  "tampas-e-carcacas-apple-carcaca-transforma-iphone-xr-em-iphone-17-pro-max",
  "tampas-e-carcacas-apple-carcaca-transforma-iphone-11-em-iphone-17-pro"
];

function databaseUrl() {
  const candidates = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_DB_URL"
  ];
  const name = candidates.find((key) => String(process.env[key] || "").trim());
  if (!name) throw new Error("No database URL env found");
  const parsed = new URL(String(process.env[name]).trim());
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("supa");
  parsed.searchParams.delete("pgbouncer");
  return parsed.toString();
}

function dbSsl(url) {
  return /supabase\.com/i.test(url) ? { rejectUnauthorized: false } : undefined;
}

function findMatchingBracket(text, openIndex) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function dataLayerSlice(html) {
  const marker = "dataLayer = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("dataLayer not found");
  const open = html.indexOf("[", start + marker.length);
  const close = findMatchingBracket(html, open);
  if (open === -1 || close === -1) throw new Error("dataLayer array not found");
  return { open, close: close + 1, data: JSON.parse(html.slice(open, close + 1)) };
}

function money(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productUrl(row) {
  return `/tampas-e-carcacas/apple/${row.slug}`;
}

function productPagePath(row) {
  return path.join(root, "tampas-e-carcacas", "apple", row.slug, "index.html");
}

function imagesFor(row) {
  const metadataImages = Array.isArray(row.metadata?.images) ? row.metadata.images : [];
  return [...new Set([row.primary_image_url, row.image_url, ...metadataImages].filter(Boolean))];
}

function toListingProduct(row) {
  const price = Number(row.price_cents || 0) / 100;
  return {
    idProduct: row.id,
    idCategory: "107",
    category: "APPLE",
    nameProduct: row.name,
    sellPrice: price.toFixed(2),
    price: price.toFixed(2),
    promotion: "NO",
    brand: "APPLE",
    model: "",
    reference: row.metadata?.firecrawl_scrape_id || row.source_platform || "FIRECRAWL-CELLTEK",
    availability: row.availability || "YES",
    urlImage: row.primary_image_url || row.image_url,
    urlProduct: productUrl(row),
    freeShipping: "NO",
    hot: "NO",
    additionalButton: "NO",
    release: "YES"
  };
}

function productCard(item) {
  const href = escapeHtml(item.urlProduct);
  const image = escapeHtml(item.urlImage);
  const name = escapeHtml(item.nameProduct);
  const price = money(item.sellPrice);
  return `<li class="item flex"><div class="product variant nb show-down"><div class="image"><a class="space-image" href="${href}"><img src="${image}" alt="${name}" class="lazyload transform" data-src="${image}" width="450" height="450" loading="lazy"></a></div><a class="info-product" href="${href}"><div class="product-name">${name}</div><div class="down-line"><div class="list-star flex justify-center"><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div></div><div class="box-price"><div class="price"><div class="product-price"><span class="price-off">${price}</span></div></div></div></div></a><div class="actions"><a class="button" href="${href}">Comprar</a></div></div></li>`;
}

function removeExistingCard(html, url) {
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<li class="item flex"><div class="product variant nb show-down"><div class="image"><a class="space-image" href="${escapedUrl}"[\\s\\S]*?</li>`, "g");
  return html.replace(re, "");
}

function updateCategoryPage(rows) {
  const listingProducts = rows.map(toListingProduct);
  let html = fs.readFileSync(categoryPath, "utf8");
  const slice = dataLayerSlice(html);
  const payload = slice.data.find((entry) => Array.isArray(entry?.listProducts));
  if (!payload) throw new Error("listProducts not found");

  const productUrls = new Set(listingProducts.map((item) => item.urlProduct.toLowerCase()));
  payload.listProducts = payload.listProducts.filter((item) => !productUrls.has(String(item.urlProduct || "").toLowerCase()));
  payload.listProducts.unshift(...listingProducts);
  payload.quantity = payload.listProducts.length;
  html = html.slice(0, slice.open) + JSON.stringify(slice.data) + html.slice(slice.close);

  const listStart = html.indexOf('<ul class="list flex f-wrap row">');
  if (listStart === -1) throw new Error("catalog product list not found");
  for (const item of listingProducts) html = removeExistingCard(html, item.urlProduct);
  const insertAt = html.indexOf('<ul class="list flex f-wrap row">') + '<ul class="list flex f-wrap row">'.length;
  html = html.slice(0, insertAt) + listingProducts.map(productCard).join("") + html.slice(insertAt);
  fs.writeFileSync(categoryPath, html, "utf8");
}

function updateSearchIndex(rows) {
  const parsed = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  const urls = new Set(rows.map((row) => `tampas-e-carcacas/apple/${row.slug}/index.html`));
  const nextItems = rows.map((row) => {
    const colors = Array.isArray(row.metadata?.colors) ? row.metadata.colors.join(" ") : "";
    return {
      title: row.name,
      description: row.description_text || "",
      url: `tampas-e-carcacas/apple/${row.slug}/index.html`,
      image: row.primary_image_url || row.image_url,
      category: "tampas-e-carcacas",
      brand: "apple",
      slug: row.slug,
      keywords: `${row.name} tampas-e-carcacas apple cores ${colors}`.toLowerCase()
    };
  });
  parsed.items = [...nextItems, ...(parsed.items || []).filter((item) => !urls.has(String(item.url || "")))];
  fs.writeFileSync(searchIndexPath, JSON.stringify(parsed, null, 2), "utf8");
}

function productDataLayer(row) {
  const listing = toListingProduct(row);
  return {
    pageTitle: row.name,
    pageCategory: "Produto",
    event: "",
    siteSearchFrom: "",
    idProduct: row.id,
    nameProduct: row.name,
    category: "APPLE",
    idCategory: "107",
    priceSell: listing.sellPrice,
    promotion: "NO",
    price: listing.price,
    brand: "APPLE",
    reference: listing.reference,
    model: "",
    availability: row.availability || "YES",
    availabilityDetails: "",
    urlImage: listing.urlImage,
    urlProduct: listing.urlProduct,
    listSku: [
      { idSku: `${row.id}-azul`, nameSku: "Cor: Azul", price: 350, sellPrice: 350, availability: "YES", reference: `${listing.reference}-AZUL`, urlImage: "", priceSellDetails: [], EAN: "" },
      { idSku: `${row.id}-prata`, nameSku: "Cor: Prata", price: 350, sellPrice: 350, availability: "YES", reference: `${listing.reference}-PRATA`, urlImage: "", priceSellDetails: [], EAN: "" },
      { idSku: `${row.id}-laranja`, nameSku: "Cor: Laranja", price: 350, sellPrice: 350, availability: "YES", reference: `${listing.reference}-LARANJA`, urlImage: "", priceSellDetails: [], EAN: "" }
    ],
    characteristcs: [],
    priceSellDetails: "",
    EAN: "",
    breadcrumbDetails: [
      { id: 11, name: "TAMPAS e CARCAÇAS", level: 1 },
      { id: 107, name: "APPLE", level: 2 }
    ],
    freeShipping: "NO",
    hot: "NO",
    additionalButton: "NO",
    release: "YES",
    rating: { count: 0, average: 0 },
    breadcrumb: `Página Inicial > TAMPAS e CARCAÇAS > APPLE > ${row.name}`
  };
}

function productJsonLd(row) {
  const price = Number(row.price_cents || 0) / 100;
  return {
    "@context": "http://schema.org/",
    "@type": "Product",
    name: row.name,
    image: imagesFor(row),
    description: row.description_text || row.name,
    sku: row.id,
    brand: { "@type": "Brand", name: "APPLE" },
    offers: {
      "@type": "Offer",
      url: productUrl(row),
      priceCurrency: "BRL",
      price: price.toFixed(2),
      itemCondition: "http://schema.org/NewCondition",
      availability: "http://schema.org/InStock"
    }
  };
}

function trayGallery(row) {
  const alt = escapeHtml(row.name);
  const thumbs = imagesFor(row).map((url, index) => `<div class="item swiper-slide"><div class="box-img index-list${index === 0 ? " active" : ""}" data-index="${index + 1}"><img src="${escapeHtml(url)}" alt="${alt} - Image thumb ${index + 1}" class="swiper-lazy" data-src="${escapeHtml(url)}" width="300" height="300" loading="lazy"></div></div>`).join("");
  const slides = imagesFor(row).map((url, index) => `<div class="item swiper-slide"><div class="box-img index-list${index === 0 ? " active" : ""}" data-index="${index + 1}"><div class="zoom"><img src="${escapeHtml(url)}" alt="${alt}" class="swiper-lazy" data-src="${escapeHtml(url)}" width="1200" height="1200" loading="lazy"></div></div></div>`).join("");
  return `<div class="product-colum-left"><div class="box-gallery flex"><div class="nav-images"><div class="list swiper-container"><div class="swiper-wrapper">${thumbs}</div></div><div class="controls"><div class="arrow prev"></div><div class="arrow next"></div></div></div><div class="image-show"><div class="list swiper-container"><div class="swiper-wrapper">${slides}</div></div><div class="dots"></div></div></div></div>`;
}

function colorVariants() {
  const variants = [
    ["Azul", "azul.jpg"],
    ["Prata", "cinza_claro.jpg"],
    ["Laranja", "laranja.jpg"]
  ];
  return variants.map(([name, file], index) => `<li class="${index === 0 ? "selected" : ""}" data-id="${index + 1}" data-variant-availability="YES" data-variant-type="Cor" data-variant-value="${name}" style="cursor:pointer;"><img alt="${name}" class="cor_selecionada" data-tray-tst="variation_first_color_${index}" id="cor_${index + 1}" src="../../../_assets/images.tcdn.com.br/commerce/assets/store/img/variant_colors/${file}" title="${name}" width="30" height="30" loading="lazy"/><span style="display:none">${name}</span></li>`).join("");
}

function descriptionBoard(row) {
  const model = row.specifications?.compatibilidade || row.name;
  return `<div class="page-info-product"><div class="section-box description" data-tab-id="#descricao"><div class="title-section"><span>Descrição Geral</span></div><div class="board_htm"><h2><span style="color: #333333;"><span style="font-size: 22px;">${escapeHtml(row.name)}</span></span></h2><h3><span style="color: #999999;"><span style="font-size: 20px;">Ficha Técnica Do Produto:</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* Compatível Com Os Modelos.: ${escapeHtml(model)}</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* Transformação Visual: iPhone 17 Pro Max</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* Cores Disponíveis: Azul, Prata e Laranja</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* Marca: Apple</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* Procedência: Produto Importado - Novo</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* Instalação Recomendada Por Assistência Técnica Especializada.</span></span></h3><h3><span style="color: #999999;"><span style="font-size: 20px;">* As Imagens São Meramente Ilustrativas.</span></span></h3></div></div><div class="section-box" id="ficha"><div class="title-section"><span>Informações sobre o produto</span></div><div class="board_htm"><table><tr><td>Código</td><td>${escapeHtml(row.id)}</td></tr><tr><td>Estoque</td><td>${Number(row.stock || 0)}</td></tr><tr><td>Categoria</td><td>APPLE</td></tr><tr><td>Marca</td><td>APPLE</td></tr></table></div></div><div style="display: none !important;"><span data-tab-container-id="#formasPagto" data-tab-url="/api/products/payment-options?loja=996644&amp;IdProd=${escapeHtml(row.id)}&amp;IdVariacao=%s" style="display: none !important;">Formas de Pagamento</span><div class="section-box payment_methods" data-tab-id="#formasPagto" style="display: none !important;"></div></div><div class="section-box comments" data-tab-id="#coments"><div class="title-section"><span>Avaliações</span></div><h2 class="color">Deixe seu comentário e sua avaliação</h2><br/><div id="comentario_cliente"><div id="div_erro"><div class="blocoAlerta" style="display: none;"></div></div><a class="tray-hide" data-logged-user="false" href="/loja/login_layout.php?loja=996644&amp;origem=comentario_produto&amp;IdProd=${escapeHtml(row.id)}">Faça seu login e comente.</a></div><div class="blocoSucesso" style="display: none;">Seu comentário foi enviado com sucesso, Obrigado por opinar em nossa loja</div></div></div>`;
}

function trayProductMain(row) {
  const listing = toListingProduct(row);
  const price = Number(row.price_cents || 0) / 100;
  const priceText = price.toFixed(2).replace(".", ",");
  return `<div class="clearfix"><div class="breadcrumb flex f-wrap"><span class="breadcrumb-item flex align-center"><a class="t-color" href="../../../index.html">Home</a></span><span class="breadcrumb-item"><a href="../../index.html" title="TAMPAS e CARCAÇAS">TAMPAS e CARCAÇAS</a></span><span class="breadcrumb-item"><a href="../index.html" title="APPLE">APPLE</a></span><span class="breadcrumb-item">${escapeHtml(row.name)}</span></div><div class="box-col-product flex">${trayGallery(row)}<div class="product-colum-right"><div class="relative-area"><div class="fixed-info"><div class="load-css" id="loading-product-container"><div class="icon"></div></div><h1 class="product-name">${escapeHtml(row.name)}</h1><div class="product-release-date">Data de lançamento: 08/06/2026</div><div class="line-info flex align-center"><span class="ref" data-url="/api/products/variant-reference?loja=996644" id="product-reference">${escapeHtml(listing.reference)}</span><div class="list-star flex cursor"><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div><span class="total">0 Opiniões</span></div></div><span class="produto-bonus bonus_produto">            Na compra desse produto ganhe
            <strong class="code bgcolor" id="idBonusVariacao">350</strong><strong class="color">Pontos Fidelidade</strong></span><form action="/loja/cartService.php?loja=996644&amp;acao=incluir&amp;IdProd=${escapeHtml(row.id)}" data-app="product.buy-form" data-id="${escapeHtml(row.id)}" id="form_comprar" method="post"><div class="box-variants"><input id="selectedVariant" name="variacao" type="hidden" value=""/><input id="variantSelectedType" type="hidden" value=""/><input id="variantSelectedValue" type="hidden" value=""/><input id="showLabelAvailability" type="hidden" value=""/><input id="shortestAvailabilityBetweenVariations" type="hidden" value=""/><input id="uniformAvailabilityLabel" type="hidden" value=""/><div class="cor_variacao passo show_size_and_color_type" id="show_size_and_color_main_type"><div align="left" data-mandatory="1" data-multi-variant="0" data-product-id="${escapeHtml(row.id)}" data-tray-tst="it_has_variation" data-url="/api/products/load-next-variant-dropdown?loja=996644" data-url-gallery="/api/products/variant-gallery?loja=996644" id="menuVars"><div class="texto_variacao"><h2>Cores disponíveis</h2><span id="cor_nome"></span></div><ul class="lista_cor_variacao">${colorVariants()}</ul></div></div><div style="clear:both;"></div></div><div data-url-pricebox="/api/products/variant-price?loja=996644" id="product-priceBox"><div class="produto-preco bg-tone-5 border-tone-5" data-app="product.price-box"><div data-product-id="${escapeHtml(row.id)}" id="coupon-badge"></div><div align="left" id="preco"><br/><div id="produto_preco"><span class="color-tone-2 txt-por">Por:</span><br/><span class="PrecoPrincipal color-tone-2"><abbr class="currency" title="BRL"> R$ </abbr><span data-app="product.price" data-tray-tst="price_product" id="variacaoPreco">${priceText}</span><input id="preco_atual" type="hidden" value="${price.toFixed(2)}"/></span><br/><span id="precoDe"></span><h5 class="produto-economize" id="economize"></h5><span id="info_preco"></span><div id="detalhes_formas"></div></div><div id="produto_nao_disp"><input id="verifica_variacao" name="verifica_variacao" type="hidden" value=""/><input id="verifica_clientes_aguardando" name="verifica_clientes_aguardando" type="hidden" value="1"/><input id="verifica_estoque_venda" name="verifica_estoque_venda" type="hidden" value=""/><input id="verifica_variacao_dupla_valor" name="verifica_variacao_dupla_valor" type="hidden" value="0"/><input id="layout_variacao" name="layout_variacao" type="hidden" value="2"/><input id="define_radio_select" name="define_radio_select" type="hidden" value=""/><input id="variant_selected" name="variant_selected" type="hidden" value="0"/></div></div><div align="left" class="produto-formas-pagamento" id="info"><a class="color" data-cache="cache" href="index.html#formaPagto" id="showPaymentMethods" rel="nofollow">+ Ver todas as formas de pagamentos</a></div></div></div><div class="box-price"><span class="blocoAlerta" id="span_erro_carrinho" style="display:none;">Selecione uma opção para variação do produto</span><span class="passo" data-url-form="/api/products/variant-form?loja=996644" id="product-form-box"><div data-app="product.quantity" id="quantidade"><label class="color">Quantidade: <input class="text" id="quant" maxlength="5" name="quant" size="1" type="text" value="1"/></label><span id="estoque_variacao"></span><input id="estoque_" type="hidden"/></div><div align="left" class="remove-bg" data-app="product.buy-button" id="bt_comprar"><button class="botao-commerce botao-comprar" data-tray-tst="button_buy_product" id="button-buy" type="submit"><span class="botao-commerce-img">Comprar</span></button><div align="left" id="loading_btn" style="display:none"><img src="../../../_assets/images.tcdn.com.br/commerce/assets/store/img/loading.gif" alt="" width="48" height="48" loading="lazy"/>Calculando ...</div></div></span></div></form><div class="box-frete"><div class="produto-calcular-frete bg-tone-5 border-tone-5" data-app="product.zip-box"><div class="cepbox" id="cepbox"><h6 class="cepbox-text color-tone-1">Simulador de Frete</h6><label for="cep1">CEP:</label><input autocomplete="zip-code" class="text" data-app="product.zip1" id="cep1" maxlength="5" name="cep1" size="5" type="tel" value=""/> - <input autocomplete="zip-code" class="text" data-app="product.zip2" id="cep2" maxlength="3" name="cep2" size="3" type="tel" value=""/><a class="botao-commerce botao-simular-frete" data-app="product.shipping-calculate" data-modal-width="80%" data-title="${escapeHtml(row.name)}" data-url="/api/products/shipping?nocache=69ec2ca29a581&amp;loja=996644&amp;simular=ok&amp;cep1=%s&amp;cep2=%s&amp;quantidade=%s&amp;variacao=%s&amp;id_produto=${escapeHtml(row.id)}&amp;use_api=&amp;additional_information=" href="index.html" id="shippingSimulatorButton">Calcular frete</a></div><span class="blocoAlerta" id="span_erro_cep" style="display:none;">Digite o seu CEP, por favor.</span><span class="blocoAlerta" id="span_erro_variacao" style="display:none;">Selecione uma opção para variação do produto</span></div><form class="new-frete flex justify-between"><label class="box-left flex align-center"><span class="text">INFORME SEU CEP</span><input class="crazy_cep" maxlength="9" minlength="9" name="number-frete" placeholder="00000-000" required="" type="tel"/></label><button class="submit-frete">Calcular</button></form><div class="result"></div></div></div></div></div></div></div>${descriptionBoard(row)}<div id="prognoos_lsi"></div>`;
}

function cartInterceptScript(row) {
  return `<script>
document.addEventListener('submit', function (event) {
  var form = event.target && event.target.id === 'form_comprar' ? event.target : null;
  if (!form) return;
  event.preventDefault();
  var item = { id: '${escapeHtml(row.id)}', nome: '${escapeHtml(row.name)}', preco: ${Number(row.price_cents || 0) / 100}, quantidade: 1, imagem: '${escapeHtml(row.primary_image_url || row.image_url)}', url: '${escapeHtml(productUrl(row))}/' };
  var items = [];
  try { items = JSON.parse(localStorage.getItem('carrinho') || '[]'); } catch (_err) {}
  var found = items.find(function (entry) { return entry.id === item.id; });
  if (found) found.quantidade = Math.max(1, Number(found.quantidade || 1)) + 1;
  else items.push(item);
  localStorage.setItem('carrinho', JSON.stringify(items));
  window.location.href = '/carrinho/';
});
document.addEventListener('click', function (event) {
  var button = event.target && event.target.closest ? event.target.closest('.btn-comprar') : null;
  if (!button || button.getAttribute('data-id') !== '${escapeHtml(row.id)}') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  var selected = document.querySelector('#t7-variacao-container .t7-variant-selected, #t7-variacao-container .selected');
  var color = selected ? (selected.getAttribute('data-variant-value') || selected.textContent || '').trim() : '';
  var item = { id: '${escapeHtml(row.id)}', nome: '${escapeHtml(row.name)}', preco: ${Number(row.price_cents || 0) / 100}, quantidade: 1, imagem: '${escapeHtml(row.primary_image_url || row.image_url)}', url: '${escapeHtml(productUrl(row))}/', variacao: color ? 'Cor: ' + color : '' };
  var items = [];
  try { items = JSON.parse(localStorage.getItem('carrinho') || '[]'); } catch (_err) {}
  var found = items.find(function (entry) { return entry.id === item.id && String(entry.variacao || '') === String(item.variacao || ''); });
  if (found) found.quantidade = Math.max(1, Number(found.quantidade || 1)) + 1;
  else items.push(item);
  localStorage.setItem('carrinho', JSON.stringify(items));
  try { document.dispatchEvent(new CustomEvent('carrinhoAtualizado', { detail: { items: items } })); } catch (_err) {}
  window.location.href = '/carrinho/';
}, true);
</script>`;
}

function productPage(row) {
  let html = fs.readFileSync(productTemplatePath, "utf8");
  const description = row.description_text || row.name;
  const image = row.primary_image_url || row.image_url;
  const url = productUrl(row);

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(row.name)} - TECH 7</title>`);
  html = html.replace(/<meta content="[^"]*" name="description"\/>/, `<meta content="${escapeHtml(description)}" name="description"/>`);
  html = html.replace(/<meta content="[^"]*" name="keywords"\/>/, `<meta content="${escapeHtml(`${row.name}, carcaça iphone, tampa e carcaça apple, iPhone 17 Pro Max, Tech 7`)}" name="keywords"/>`);
  html = html.replace(/<meta content="[^"]*" name="title"\/>/, `<meta content="${escapeHtml(row.name)}" name="title"/>`);
  html = html.replace(/<meta content="[^"]*" property="og:url"\/>/, `<meta content="${escapeHtml(url)}" property="og:url"/>`);
  html = html.replace(/<meta content="[^"]*" property="og:title"\/>/, `<meta content="${escapeHtml(row.name)}" property="og:title"/>`);
  html = html.replace(/<meta content="[^"]*" property="og:description"\/>/, `<meta content="${escapeHtml(description)}" property="og:description"/>`);
  html = html.replace(/<meta content="[^"]*" property="og:image"\/>/, `<meta content="${escapeHtml(image)}" property="og:image"/>`);

  const slice = dataLayerSlice(html);
  html = html.slice(0, slice.open) + JSON.stringify([productDataLayer(row)]) + html.slice(slice.close);
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(productJsonLd(row))}</script>`);

  const productStart = html.indexOf('<div class="clearfix">');
  const relatedStart = html.indexOf('<div class="product-related">', productStart);
  if (productStart === -1 || relatedStart === -1) throw new Error("Product template body anchors not found");
  html = html.slice(0, productStart) + trayProductMain(row) + html.slice(relatedStart);
  html = html.replace("</body>", `${cartInterceptScript(row)}\n</body>`);
  return html;
}

function writeProductPages(rows) {
  for (const row of rows) {
    const filePath = productPagePath(row);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, productPage(row), "utf8");
  }
}

async function main() {
  const url = databaseUrl();
  const client = new Client({ connectionString: url, ssl: dbSsl(url) });
  await client.connect();
  const { rows } = await client.query(
    `select id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
            active, is_active, title, description_text, description_html, price_text, stock,
            availability, source_platform, source_url, specifications, metadata
       from products
      where id = any($1::text[])
      order by array_position($1::text[], id)`,
    [productIds]
  );
  await client.end();
  if (rows.length !== productIds.length) {
    throw new Error(`Expected ${productIds.length} products, found ${rows.length}`);
  }

  updateCategoryPage(rows);
  updateSearchIndex(rows);
  writeProductPages(rows);

  console.log(JSON.stringify({
    updated: [
      "tampas-e-carcacas/apple/index.html",
      "_assets/tech7/search-index.json",
      ...rows.map((row) => `tampas-e-carcacas/apple/${row.slug}/index.html`)
    ],
    products: rows.map((row) => ({ id: row.id, slug: row.slug, images: imagesFor(row).length }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
