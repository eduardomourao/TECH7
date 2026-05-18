(function() {
  'use strict';

  function removeAvisoModal() {
    var modal = document.querySelector('.modal-theme.email-modal');
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    if (!document.body) return;
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  onReady(removeAvisoModal);
  window.addEventListener('load', removeAvisoModal, { once: true });

  function loadScript(id, src, globalName) {
    return new Promise(function(resolve, reject) {
      if (globalName && window[globalName]) return resolve(window[globalName]);

      var current = document.getElementById(id) || document.querySelector('script[src="' + src + '"]');
      if (current) {
        if (globalName && window[globalName]) return resolve(window[globalName]);
        current.addEventListener('load', function() { resolve(globalName ? window[globalName] : true); }, { once: true });
        current.addEventListener('error', reject, { once: true });
        return;
      }

      var s = document.createElement('script');
      s.id = id;
      s.src = src;
      s.async = false;
      s.onload = function() { resolve(globalName ? window[globalName] : true); };
      s.onerror = reject;
      (document.head || document.body || document.documentElement).appendChild(s);
    });
  }

  function getPathParts(pathname) {
    var parts = String(pathname || window.location.pathname || '').replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') parts.pop();

    if (parts.length === 2) {
      return { secao: parts[0] || '', marca: '', slug: parts[1] || '' };
    }

    return {
      secao: parts.length >= 3 ? parts[parts.length - 3] : (parts[parts.length - 2] || ''),
      marca: parts.length >= 3 ? parts[parts.length - 2] : '',
      slug: parts[parts.length - 1] || ''
    };
  }

  function getNum(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var str = String(value || '').replace(/[^\d,.-]/g, '');
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.indexOf(',') > -1) str = str.replace(',', '.');
    var n = Number.parseFloat(str);
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoney(preco) {
    return Number(getNum(preco)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function normalizeProductId(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  function buildProductId(input) {
    input = input || {};
    return normalizeProductId([
      input.secao || input.section || '',
      input.marca || input.brand || '',
      input.slug || ''
    ].join('-'));
  }

  var priceDataPromise = null;

  function loadPrices() {
    if (!priceDataPromise) {
      priceDataPromise = fetch('/precos.json?nocache=' + Date.now(), { cache: 'no-store' })
        .then(function(res) {
          if (!res.ok) throw new Error('http_' + res.status);
          return res.json();
        })
        .catch(function(err) {
          console.error('preco-loader: erro ao carregar precos.json', err);
          return null;
        });
    }
    return priceDataPromise;
  }

  function lookupPrice(data, input) {
    input = input || {};
    var secao = input.secao || input.section || '';
    var marca = input.marca || input.brand || '';
    var slug = input.slug || '';
    var warnKey = [secao, marca, slug].filter(Boolean).join('/');

    if (!data || !slug) return { found: false, price: 0, secao: secao, marca: marca, slug: slug };

    var preco;
    var foundSecao = secao;
    var foundMarca = marca;

    if (secao && marca && data[secao] && data[secao][marca] && typeof data[secao][marca][slug] !== 'undefined') {
      preco = data[secao][marca][slug];
    }

    if (typeof preco === 'undefined' && secao && data[secao]) {
      var marcas = Object.keys(data[secao]);
      for (var i = 0; i < marcas.length; i++) {
        if (data[secao][marcas[i]] && typeof data[secao][marcas[i]][slug] !== 'undefined') {
          preco = data[secao][marcas[i]][slug];
          foundMarca = marcas[i];
          break;
        }
      }
    }

    if (typeof preco === 'undefined') {
      var secoes = Object.keys(data);
      for (var s = 0; s < secoes.length; s++) {
        var group = data[secoes[s]] || {};
        var groupMarcas = Object.keys(group);
        for (var j = 0; j < groupMarcas.length; j++) {
          if (group[groupMarcas[j]] && typeof group[groupMarcas[j]][slug] !== 'undefined') {
            preco = group[groupMarcas[j]][slug];
            foundSecao = secoes[s];
            foundMarca = groupMarcas[j];
            break;
          }
        }
        if (typeof preco !== 'undefined') break;
      }
    }

    var price = getNum(preco);
    var found = typeof preco !== 'undefined' && price >= 2;
    if (!found) console.warn('preco-loader: produto sem preco valido em precos.json', warnKey || slug || input);

    return { found: found, price: found ? price : 0, secao: foundSecao, marca: foundMarca, slug: slug };
  }

  function lookupPagePrice(input) {
    input = input || {};
    var slug = input.slug || '';
    var layers = Array.isArray(window.dataLayer) ? window.dataLayer : [];

    for (var i = 0; i < layers.length; i++) {
      var item = layers[i] || {};
      var pageSlug = '';

      if (item.urlProduct) {
        var parts = String(item.urlProduct).replace(/\/+$/, '').split('/').filter(Boolean);
        pageSlug = parts[parts.length - 1] || '';
      }

      if (slug && pageSlug && pageSlug !== slug) continue;

      var price = getNum(item.priceSell || item.price);
      if (price >= 2) {
        return {
          found: true,
          price: price,
          secao: input.secao || input.section || '',
          marca: input.marca || input.brand || item.brand || '',
          slug: slug || pageSlug
        };
      }
    }

    return { found: false, price: 0, secao: input.secao || input.section || '', marca: input.marca || input.brand || '', slug: slug };
  }

  function lookupInlinePagePrice(input) {
    input = input || {};
    var slug = input.slug || '';
    var scripts = document.querySelectorAll('script:not([src])');

    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || '';
      if (slug && text.indexOf(slug) === -1) continue;

      var match = text.match(/["']priceSell["']\s*:\s*["']?([^"',}]+)/) || text.match(/["']price["']\s*:\s*["']?([^"',}]+)/);
      var price = match ? getNum(match[1]) : 0;
      if (price >= 2) {
        return {
          found: true,
          price: price,
          secao: input.secao || input.section || '',
          marca: input.marca || input.brand || '',
          slug: slug
        };
      }
    }

    return { found: false, price: 0, secao: input.secao || input.section || '', marca: input.marca || input.brand || '', slug: slug };
  }

  function resolvePrice(input) {
    if (!input || !input.slug) input = getPathParts();
    var section = normalizeProductId(input.secao || input.section || '');
    var brand = normalizeProductId(input.marca || input.brand || '');
    var slug = normalizeProductId(input.slug || '');
    if (slug) {
      return loadPrices().then(function(data) {
        var jsonPrice = lookupPrice(data, { secao: section, marca: brand, slug: slug });
        if (jsonPrice.found) return jsonPrice;
        return fetch('/api/products/resolve-prices', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            items: [{ section: section, brand: brand, slug: slug }]
          })
        })
          .then(function(res) {
            if (!res.ok) throw new Error('http_' + res.status);
            return res.json();
          })
          .then(function(payload) {
            var list = Array.isArray(payload && payload.items) ? payload.items : [];
            var item = list[0] || {};
            if (!item.found) throw new Error('not_found');
            var price = Number(item.price_cents || 0) / 100;
            if (!Number.isFinite(price) || price < 2) throw new Error('invalid_price');
            return {
              found: true,
              price: price,
              secao: item.section || section,
              marca: item.brand || brand,
              slug: item.slug || slug
            };
          })
          .catch(function() {
            return jsonPrice;
          });
      }).catch(function() {
          return { found: false, price: 0, secao: section, marca: brand, slug: slug };
      });
    }

    var pagePrice = lookupPagePrice(input);
    if (pagePrice.found) return Promise.resolve(pagePrice);

    var inlinePagePrice = lookupInlinePagePrice(input);
    if (inlinePagePrice.found) return Promise.resolve(inlinePagePrice);

    return loadPrices().then(function(data) { return lookupPrice(data, input); });
  }

  function updateScopedText(selector, text) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
  }

  function updatePrice(result) {
    var preco = result && result.price ? getNum(result.price) : 0;
    if (preco < 2) {
      updateScopedText('.t7-buy-price', 'Preco sob consulta');
      return result;
    }

    window.T7_PRODUCT_PRICE = preco;
    var formatado = formatMoney(preco);
    var semMoeda = Number(preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var precoAtualEls = document.querySelectorAll('#product-priceBox #preco_atual, #form_comprar #preco_atual, input#preco_atual');
    for (var i = 0; i < precoAtualEls.length; i++) precoAtualEls[i].value = String(preco);

    updateScopedText('#product-priceBox #variacaoPreco, #form_comprar #variacaoPreco, #produto_preco #variacaoPreco', semMoeda);
    updateScopedText('#product-priceBox .price-off, #form_comprar .price-off, .t7-buy-price', formatado);

    var buyButtons = document.querySelectorAll('.btn-comprar[data-preco]');
    for (var b = 0; b < buyButtons.length; b++) buyButtons[b].setAttribute('data-preco', String(preco));

    if (typeof dataLayer !== 'undefined' && Array.isArray(dataLayer)) {
      for (var d = 0; d < dataLayer.length; d++) {
        if (dataLayer[d].priceSell) dataLayer[d].priceSell = String(preco);
        if (dataLayer[d].price) dataLayer[d].price = String(preco);
        if (Array.isArray(dataLayer[d].listSku)) {
          for (var sku = 0; sku < dataLayer[d].listSku.length; sku++) {
            if (dataLayer[d].listSku[sku].price) dataLayer[d].listSku[sku].price = preco;
            if (dataLayer[d].listSku[sku].sellPrice) dataLayer[d].listSku[sku].sellPrice = preco;
          }
        }
      }
    }

    document.dispatchEvent(new CustomEvent('tech7:price-loaded', { detail: result }));
    return result;
  }

  function extractPathInfoFromHref(href) {
    if (!href) return null;
    try {
      var url = new URL(href, window.location.origin);
      var parsed = getPathParts(url.pathname);
      if (!parsed || !parsed.slug) return null;
      return {
        secao: normalizeProductId(parsed.secao),
        marca: normalizeProductId(parsed.marca),
        slug: normalizeProductId(parsed.slug)
      };
    } catch (_err) {
      return null;
    }
  }

  function collectCatalogEntries(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var links = scope.querySelectorAll('a.info-product[href], a.t7-carousel-link[href]');
    var byKey = new Map();

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var parsed = extractPathInfoFromHref(link.getAttribute('href'));
      if (!parsed) continue;

      var product = link.closest('.product') || link.querySelector('.t7-carousel-card') || link.closest('.swiper-slide') || link;

      var priceNodes = product.querySelectorAll('.product-price .price-off, .t7-carousel-price');
      if (!priceNodes.length) continue;

      var key = [parsed.secao, parsed.marca, parsed.slug].join('|');
      var found = byKey.get(key);
      if (!found) {
        found = {
          secao: parsed.secao,
          marca: parsed.marca,
          slug: parsed.slug,
          nodes: []
        };
        byKey.set(key, found);
      }

      for (var n = 0; n < priceNodes.length; n++) {
        if (found.nodes.indexOf(priceNodes[n]) === -1) found.nodes.push(priceNodes[n]);
      }
    }

    return Array.from(byKey.values());
  }

  function resolveCatalogPricesBatch(entries) {
    return fetch('/api/products/resolve-prices', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: entries.map(function(entry) {
          return { section: entry.secao, brand: entry.marca, slug: entry.slug };
        })
      })
    })
      .then(function(res) {
        if (!res.ok) throw new Error('http_' + res.status);
        return res.json();
      })
      .then(function(payload) {
        return Array.isArray(payload && payload.items) ? payload.items : [];
      });
  }

  function updateCatalogPrices(root) {
    var entries = collectCatalogEntries(root);
    if (!entries.length) return Promise.resolve({ updated: 0, total: 0 });

    var byKey = new Map();
    for (var i = 0; i < entries.length; i++) {
      byKey.set([entries[i].secao, entries[i].marca, entries[i].slug].join('|'), entries[i]);
    }

    return resolveCatalogPricesBatch(entries)
      .then(function(items) {
        var updated = 0;
        var requested = entries.map(function(entry) { return [entry.secao, entry.marca, entry.slug].join('|'); });
        for (var x = 0; x < items.length; x++) {
          var item = items[x] || {};
          var price = Number(item.price_cents || 0) / 100;

          var secao = normalizeProductId(item.section);
          var marca = normalizeProductId(item.brand);
          var slug = normalizeProductId(item.slug);
          var key = [secao, marca, slug].join('|');
          var match = byKey.get(key);
          if (!match && requested[x]) match = byKey.get(requested[x]);
          if (!match && slug) {
            for (var m = 0; m < entries.length; m++) {
              if (entries[m].slug === slug) {
                match = entries[m];
                break;
              }
            }
          }
          if (!match) continue;

          var formatted = item.found && Number.isFinite(price) && price >= 2 ? formatMoney(price) : 'Preco sob consulta';
          for (var n = 0; n < match.nodes.length; n++) {
            match.nodes[n].textContent = formatted;
          }
          updated += match.nodes.length;
        }

        return { updated: updated, total: entries.length };
      })
      .catch(function(err) {
        // Approved fallback: keep last rendered card price when API fails.
        console.warn('preco-loader: falha ao sincronizar precos de cards', err);
        return { updated: 0, total: entries.length };
      });
  }

  var catalogSyncTimer = null;
  var catalogSyncObserver = null;
  var catalogSyncRunning = false;

  function scheduleCatalogPriceSync(root) {
    if (catalogSyncTimer) window.clearTimeout(catalogSyncTimer);
    catalogSyncTimer = window.setTimeout(function() {
      if (catalogSyncRunning) return;
      catalogSyncRunning = true;
      updateCatalogPrices(root || document).finally(function() {
        catalogSyncRunning = false;
      });
    }, 160);
  }

  function startCatalogPriceSync() {
    scheduleCatalogPriceSync(document);
    if (catalogSyncObserver || !document.body || typeof MutationObserver !== 'function') return;

    catalogSyncObserver = new MutationObserver(function(mutations) {
      var shouldSync = false;
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (!mutation.addedNodes || !mutation.addedNodes.length) continue;
        for (var n = 0; n < mutation.addedNodes.length; n++) {
          var node = mutation.addedNodes[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.matches && (node.matches('.product') || node.matches('a.info-product') || node.matches('.item.flex') || node.matches('.t7-carousel-card') || node.matches('a.t7-carousel-link'))) {
            shouldSync = true;
            break;
          }
          if (node.querySelector && node.querySelector('a.info-product[href], .product, a.t7-carousel-link[href], .t7-carousel-card')) {
            shouldSync = true;
            break;
          }
        }
        if (shouldSync) break;
      }
      if (shouldSync) scheduleCatalogPriceSync(document);
    });

    catalogSyncObserver.observe(document.body, { childList: true, subtree: true });
  }

  var currentProduct = getPathParts();
  var hasProductForm = !!document.querySelector('#form_comprar, [data-app="product.buy-form"], #bt_comprar, #button-buy');
  var looksLikeProduct = currentProduct.slug && (currentProduct.secao && currentProduct.marca || hasProductForm);

  window.Tech7Prices = window.Tech7Prices || {};
  window.Tech7Prices.load = loadPrices;
  window.Tech7Prices.resolve = resolvePrice;
  window.Tech7Prices.resolveBatch = resolveCatalogPricesBatch;
  window.Tech7Prices.apply = updatePrice;
  window.Tech7Prices.syncCatalog = scheduleCatalogPriceSync;
  window.Tech7Prices.parse = getNum;
  window.Tech7Prices.format = formatMoney;
  window.Tech7Prices.current = currentProduct;
  window.Tech7Prices.ready = looksLikeProduct ? resolvePrice(currentProduct).then(updatePrice) : Promise.resolve(null);

  onReady(startCatalogPriceSync);
  window.addEventListener('load', function() { scheduleCatalogPriceSync(document); }, { once: true });

  var cartReady = loadScript('cart-manager-loaded', '/cart-manager.js', 'CartManager')
    .catch(function(err) { console.error('preco-loader: erro ao carregar cart-manager.js', err); });

  if (looksLikeProduct) {
    cartReady.then(function() {
      return loadScript('produto-comprar-loaded', '/produto-comprar.js');
    }).catch(function(err) { console.error('preco-loader: erro ao carregar produto-comprar.js', err); });
  }
})();
