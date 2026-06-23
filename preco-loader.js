(function() {
  'use strict';

  if (window.__TECH7_PRECO_LOADER_ACTIVE) return;
  window.__TECH7_PRECO_LOADER_ACTIVE = true;

  function markPricesLoading() {
    if (!document.documentElement) return;
    document.documentElement.classList.add('t7-prices-loading');
    document.documentElement.classList.remove('t7-prices-ready');
  }

  function markPricesReady() {
    if (!document.documentElement) return;
    document.documentElement.classList.add('t7-prices-ready');
    document.documentElement.classList.remove('t7-prices-loading');
  }

  markPricesLoading();

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function closestOrSelf(node, selector) {
    if (!node || node.nodeType !== 1) return null;
    if (node.matches && node.matches(selector)) return node;
    return node.closest ? node.closest(selector) : null;
  }

  function hideUnavailableFeatures() {
    var selectors = [
      '.modal-theme.email-modal',
      '.footer .newsletter',
      '.header .account',
      '.nav-mobile .header-nav a.account',
      '.nav-mobile .header-nav a.sair',
      '.nav-mobile .header-nav a.icon[href*="central-do-cliente"]',
      'a[href*="/my-account"]',
      'a[href*="/cadastro"]',
      'a[href*="/central-do-cliente"]',
      'a[href*="/loja/logout.php"]'
    ];

    selectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(removeNode);
    });

    document.querySelectorAll('form[action*="/mvc/store/newsletter/"]').forEach(function(form) {
      removeNode(closestOrSelf(form, '.newsletter, .email-modal') || form);
    });

    if (!document.body) return;
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  }

  function hydrateLazyImages() {
    document.querySelectorAll('img[data-src]').forEach(function(img) {
      var src = img.getAttribute('src');
      var dataSrc = img.getAttribute('data-src');
      if (dataSrc && (!src || src === '#' || src.indexOf('data:image/') === 0)) {
        img.setAttribute('src', dataSrc);
      }
    });

    document.querySelectorAll('source[data-srcset]').forEach(function(source) {
      if (!source.getAttribute('srcset')) {
        source.setAttribute('srcset', source.getAttribute('data-srcset'));
      }
    });
  }

  function runDomFixes() {
    hydrateLazyImages();
    hideUnavailableFeatures();
    enableStaticContactForm();
  }

  function enableStaticContactForm() {
    var form = document.getElementById('form1');
    if (!form || !form.classList || !form.classList.contains('formulario-contato') || form.dataset.tech7StaticContact === '1') return;
    form.dataset.tech7StaticContact = '1';

    function value(id) {
      var field = document.getElementById(id);
      return field ? String(field.value || '').trim() : '';
    }

    function setError(id, message) {
      var field = document.getElementById(id);
      var error = document.getElementById(id + '_erro');
      if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (error) {
        error.textContent = message || '';
        error.style.display = message ? '' : 'none';
      }
    }

    function submitContact(event) {
      if (event) event.preventDefault();

      var nome = value('nome_contato');
      var email = value('email_contato');
      var telefone = value('telefone_contato');
      var assunto = value('assunto');
      var mensagem = value('mensagem_contato');
      var hasError = false;

      setError('nome_contato', nome ? '' : 'Digite seu nome.');
      setError('email_contato', email ? '' : 'Digite seu email.');
      setError('mensagem_contato', mensagem ? '' : 'Digite a mensagem a ser enviada.');
      hasError = !nome || !email || !mensagem;
      if (hasError) return;

      var text = [
        'Contato pelo site TECH 7',
        'Nome: ' + nome,
        'Email: ' + email,
        telefone ? 'Telefone: ' + telefone : '',
        assunto ? 'Assunto: ' + assunto : '',
        'Mensagem: ' + mensagem
      ].filter(Boolean).join('\n');

      window.location.href = 'https://wa.me/5531999454848' + encodeURIComponent(text);
    }

    form.addEventListener('submit', submitContact);
    var button = document.getElementById('btn_submit');
    if (button) button.addEventListener('click', submitContact);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  onReady(runDomFixes);
  window.addEventListener('load', runDomFixes, { once: true });
  setTimeout(runDomFixes, 250);
  setTimeout(runDomFixes, 1200);

  if (window.MutationObserver) {
    onReady(function() {
      var observer = new MutationObserver(function() { runDomFixes(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function() { observer.disconnect(); }, 5000);
    });
  }

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

  var PAYMENT_LINK_FEE_RATE = 0.125;
  var INSTALLMENT_COUNT = 3;

  function installmentValue(price) {
    var base = getNum(price);
    if (base < 2) return 0;
    return base / (1 - PAYMENT_LINK_FEE_RATE) / INSTALLMENT_COUNT;
  }

  function installmentHtml(price) {
    var installment = installmentValue(price);
    if (installment < 1) return '';
    return 'em 3x de <strong>' + formatMoney(installment) + '</strong> MasterCard - Elo';
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

  function loadPrices() {
    return Promise.resolve(null);
  }

  function resolvePrice(input) {
    if (!input || !input.slug) input = getPathParts();
    var section = normalizeProductId(input.secao || input.section || '');
    var brand = normalizeProductId(input.marca || input.brand || '');
    var slug = normalizeProductId(input.slug || '');
    if (!slug) return Promise.resolve({ found: false, price: 0, secao: section, marca: brand, slug: slug });

    return resolveCatalogPricesBatch([{ secao: section, marca: brand, slug: slug }])
      .then(function(items) {
        var item = Array.isArray(items) ? (items[0] || {}) : {};
        var cents = Number(item.price_cents || 0);
        var price = Number.isFinite(cents) ? cents / 100 : 0;
        var available = !!item.found && price >= 2;
        return {
          found: !!item.found,
          price: available ? price : 0,
          secao: item.section || section,
          marca: item.brand || brand,
          slug: item.slug || slug,
          price_cents: Number.isFinite(cents) ? cents : 0,
          price_available: available,
          price_status: item.price_status || (available ? 'available' : 'consult')
        };
      })
      .catch(function(err) {
        console.warn('preco-loader: falha ao resolver preco no backend', err);
        return { found: false, price: 0, secao: section, marca: brand, slug: slug, price_cents: 0, price_available: false, price_status: 'consult' };
      });
  }

  function updateScopedText(selector, text) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) markPriceNodeReady(nodes[i], text);
  }

  function setNodesLoading(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i] || nodes[i].dataset.tech7PriceReady === '1') continue;
      nodes[i].dataset.tech7PriceLoading = '1';
      nodes[i].textContent = 'Carregando preco';
    }
  }

  function setPaymentNodesLoading(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i] || nodes[i].dataset.tech7PriceReady === '1') continue;
      nodes[i].dataset.tech7PriceLoading = '1';
      nodes[i].innerHTML = '';
    }
  }

  function markPriceNodeReady(node, text) {
    if (!node) return;
    node.dataset.tech7PriceReady = '1';
    node.dataset.tech7PriceLoading = '0';
    node.textContent = text;
  }

  function markPaymentNodeReady(node, html) {
    if (!node) return;
    node.dataset.tech7PriceReady = '1';
    node.dataset.tech7PriceLoading = '0';
    node.innerHTML = html || '';
  }

  function markVisiblePricesLoading(root) {
    var scope = root && root.querySelectorAll ? root : document;
    setNodesLoading(scope.querySelectorAll('#product-priceBox .price-off, #form_comprar .price-off, .t7-buy-price, #product-priceBox #variacaoPreco, #form_comprar #variacaoPreco, #produto_preco #variacaoPreco, .product-price .price-off, .t7-carousel-price'));
    setPaymentNodesLoading(scope.querySelectorAll('.product-payment span, .product-payment'));
  }

  function normalizeVisitedUrl(value) {
    try {
      var url = new URL(String(value || window.location.pathname || ''), window.location.href);
      return (url.pathname || '/').replace(/\/index\.html$/i, '').replace(/\/+$/g, '') || '/';
    } catch (_err) {
      return String(value || window.location.pathname || '/').replace(/\/index\.html$/i, '').replace(/\/+$/g, '') || '/';
    }
  }

  function refreshVisitedProductPrice(label) {
    window.setTimeout(function() {
      try {
        var currentRoute = normalizeVisitedUrl(window.location.pathname);
        var parsed = JSON.parse(localStorage.getItem('visitedProducts') || '[]');
        if (!Array.isArray(parsed)) return;
        var changed = false;
        for (var i = 0; i < parsed.length; i++) {
          if (!parsed[i] || normalizeVisitedUrl(parsed[i].url) !== currentRoute) continue;
          if (parsed[i].price !== label) {
            parsed[i].price = label;
            changed = true;
          }
          if (parsed[i].priceVerified !== true) {
            parsed[i].priceVerified = true;
            changed = true;
          }
        }
        if (changed) localStorage.setItem('visitedProducts', JSON.stringify(parsed));
      } catch (_err) {}
    }, 0);
    window.setTimeout(function() {
      try {
        var currentRoute = normalizeVisitedUrl(window.location.pathname);
        var parsed = JSON.parse(localStorage.getItem('visitedProducts') || '[]');
        if (!Array.isArray(parsed)) return;
        var changed = false;
        for (var i = 0; i < parsed.length; i++) {
          if (!parsed[i] || normalizeVisitedUrl(parsed[i].url) !== currentRoute) continue;
          if (parsed[i].price !== label) {
            parsed[i].price = label;
            changed = true;
          }
          if (parsed[i].priceVerified !== true) {
            parsed[i].priceVerified = true;
            changed = true;
          }
        }
        if (changed) localStorage.setItem('visitedProducts', JSON.stringify(parsed));
      } catch (_err) {}
    }, 700);
  }

  function updatePrice(result) {
    var preco = result && result.price ? getNum(result.price) : 0;
    if (preco < 2) {
      updateScopedText('#product-priceBox .price-off, #form_comprar .price-off, .t7-buy-price, #product-priceBox #variacaoPreco, #form_comprar #variacaoPreco, #produto_preco #variacaoPreco', 'Preco sob consulta');
      markPricesReady();
      refreshVisitedProductPrice('Preco sob consulta');
      document.dispatchEvent(new CustomEvent('tech7:price-loaded', { detail: result }));
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

    markPricesReady();
    refreshVisitedProductPrice(formatado);
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
          nodes: [],
          paymentNodes: []
        };
        byKey.set(key, found);
      }

      for (var n = 0; n < priceNodes.length; n++) {
        if (found.nodes.indexOf(priceNodes[n]) === -1) found.nodes.push(priceNodes[n]);
      }

      var paymentNodes = product.querySelectorAll('.product-payment span, .product-payment');
      for (var pay = 0; pay < paymentNodes.length; pay++) {
        if (found.paymentNodes.indexOf(paymentNodes[pay]) === -1) found.paymentNodes.push(paymentNodes[pay]);
      }
    }

    return Array.from(byKey.values());
  }

  var catalogPriceCache = new Map();
  var catalogItemInflight = new Map();
  var catalogBatchInflight = new Map();
  var catalogSyncInflight = null;
  var catalogSyncSignature = '';
  var catalogLastCompletedSignature = '';

  function catalogEntryKey(entry) {
    return [
      normalizeProductId(entry && (entry.secao || entry.section) || ''),
      normalizeProductId(entry && (entry.marca || entry.brand) || ''),
      normalizeProductId(entry && entry.slug || '')
    ].join('|');
  }

  function catalogSlugKey(entry) {
    return 'slug|' + normalizeProductId(entry && entry.slug || '');
  }

  function catalogCacheGet(entry) {
    return catalogPriceCache.get(catalogEntryKey(entry)) || catalogPriceCache.get(catalogSlugKey(entry));
  }

  function catalogInflightGet(entry) {
    return catalogItemInflight.get(catalogEntryKey(entry)) || catalogItemInflight.get(catalogSlugKey(entry));
  }

  function normalizeResolvedItem(item, fallback) {
    item = item || {};
    var normalized = {
      found: !!item.found,
      section: item.section || fallback.secao || '',
      brand: item.brand || fallback.marca || '',
      slug: item.slug || fallback.slug || '',
      price_cents: Number(item.price_cents || 0),
      price_available: !!item.price_available,
      price_status: item.price_status || ''
    };
    catalogPriceCache.set(catalogEntryKey(fallback), normalized);
    if (normalized.slug) catalogPriceCache.set(catalogSlugKey(normalized), normalized);
    if (normalized.slug) catalogPriceCache.set(catalogEntryKey({ secao: normalized.section, marca: normalized.brand, slug: normalized.slug }), normalized);
    return normalized;
  }

  function resolveCatalogPricesBatch(entries) {
    var requested = entries.map(function(entry) {
      return {
        secao: normalizeProductId(entry.secao || entry.section || ''),
        marca: normalizeProductId(entry.marca || entry.brand || ''),
        slug: normalizeProductId(entry.slug || '')
      };
    });
    var missing = requested.filter(function(entry) {
      var key = catalogEntryKey(entry);
      return entry.slug && !catalogCacheGet(entry) && !catalogInflightGet(entry);
    });

    if (!missing.length) {
      return Promise.all(requested.map(function(entry) {
        var key = catalogEntryKey(entry);
        var inflight = catalogInflightGet(entry);
        if (inflight) {
          return inflight.then(function() {
            return catalogCacheGet(entry) || { found: false, section: entry.secao, brand: entry.marca, slug: entry.slug, price_cents: 0, price_available: false, price_status: 'consult' };
          });
        }
        return catalogCacheGet(entry) || { found: false, section: entry.secao, brand: entry.marca, slug: entry.slug, price_cents: 0, price_available: false, price_status: 'consult' };
      }));
    }

    var batchKey = missing.map(catalogEntryKey).sort().join('||');
    if (!catalogBatchInflight.has(batchKey)) {
      var batchPromise = fetch('/api/products/resolve-prices', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: missing.map(function(entry) {
            return { section: entry.secao, brand: entry.marca, slug: entry.slug };
          })
        })
      })
        .then(function(res) {
          if (!res.ok) throw new Error('http_' + res.status);
          return res.json();
        })
        .then(function(payload) {
          var items = Array.isArray(payload && payload.items) ? payload.items : [];
          for (var i = 0; i < missing.length; i++) normalizeResolvedItem(items[i], missing[i]);
        })
        .finally(function() {
          for (var i = 0; i < missing.length; i++) {
            catalogItemInflight.delete(catalogEntryKey(missing[i]));
            catalogItemInflight.delete(catalogSlugKey(missing[i]));
          }
          catalogBatchInflight.delete(batchKey);
        });
      catalogBatchInflight.set(batchKey, batchPromise);
      for (var i = 0; i < missing.length; i++) {
        catalogItemInflight.set(catalogEntryKey(missing[i]), batchPromise);
        catalogItemInflight.set(catalogSlugKey(missing[i]), batchPromise);
      }
    }

    return catalogBatchInflight.get(batchKey).then(function() {
      return Promise.all(requested.map(function(entry) {
        var key = catalogEntryKey(entry);
        var inflight = catalogInflightGet(entry);
        if (inflight) {
          return inflight.then(function() {
            return catalogCacheGet(entry) || { found: false, section: entry.secao, brand: entry.marca, slug: entry.slug, price_cents: 0, price_available: false, price_status: 'consult' };
          });
        }
        return catalogCacheGet(entry) || { found: false, section: entry.secao, brand: entry.marca, slug: entry.slug, price_cents: 0, price_available: false, price_status: 'consult' };
      }));
    }).then(function(items) {
      return items.map(function(item, index) {
        return item || { found: false, section: requested[index].secao, brand: requested[index].marca, slug: requested[index].slug, price_cents: 0, price_available: false, price_status: 'consult' };
      });
    });
  }

  function updateCatalogPrices(root) {
    markVisiblePricesLoading(root || document);
    var entries = collectCatalogEntries(root);
    if (!entries.length) {
      markPricesReady();
      return Promise.resolve({ updated: 0, total: 0 });
    }

    var signature = entries.map(catalogEntryKey).sort().join('||');
    if (catalogSyncInflight && signature === catalogSyncSignature) return catalogSyncInflight;
    if (signature && signature === catalogLastCompletedSignature) {
      var cachedUpdated = applyCachedCatalogPrices(entries);
      markPricesReady();
      return Promise.resolve({ updated: cachedUpdated, total: entries.length, cached: true });
    }

    var byKey = new Map();
    for (var i = 0; i < entries.length; i++) {
      byKey.set([entries[i].secao, entries[i].marca, entries[i].slug].join('|'), entries[i]);
    }

    catalogSyncSignature = signature;
    catalogSyncInflight = resolveCatalogPricesBatch(entries)
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
            markPriceNodeReady(match.nodes[n], formatted);
          }
          var payment = item.found && Number.isFinite(price) && price >= 2 ? installmentHtml(price) : '';
          for (var payNode = 0; payNode < match.paymentNodes.length; payNode++) {
            markPaymentNodeReady(match.paymentNodes[payNode], payment);
          }
          updated += match.nodes.length;
        }

        markPricesReady();
        catalogLastCompletedSignature = signature;
        return { updated: updated, total: entries.length };
      })
      .catch(function(err) {
        console.warn('preco-loader: falha ao sincronizar precos de cards', err);
        for (var i = 0; i < entries.length; i++) {
          for (var n = 0; n < entries[i].nodes.length; n++) markPriceNodeReady(entries[i].nodes[n], 'Preco sob consulta');
          for (var p = 0; p < entries[i].paymentNodes.length; p++) markPaymentNodeReady(entries[i].paymentNodes[p], '');
        }
        markPricesReady();
        return { updated: 0, total: entries.length };
      })
      .finally(function() {
        catalogSyncInflight = null;
      });
    return catalogSyncInflight;
  }

  function applyCachedCatalogPrices(entries) {
    var updated = 0;
    for (var i = 0; i < entries.length; i++) {
      var item = catalogCacheGet(entries[i]) || {};
      var price = Number(item.price_cents || 0) / 100;
      var available = !!item.found && Number.isFinite(price) && price >= 2;
      var formatted = available ? formatMoney(price) : 'Preco sob consulta';
      for (var n = 0; n < entries[i].nodes.length; n++) {
        markPriceNodeReady(entries[i].nodes[n], formatted);
        updated += 1;
      }
      var payment = available ? installmentHtml(price) : '';
      for (var p = 0; p < entries[i].paymentNodes.length; p++) {
        markPaymentNodeReady(entries[i].paymentNodes[p], payment);
      }
    }
    return updated;
  }

  var catalogSyncTimer = null;
  var catalogSyncObserver = null;
  var catalogSyncRunning = false;

  function scheduleCatalogPriceSync(root, delay) {
    markVisiblePricesLoading(root || document);
    if (catalogSyncTimer) window.clearTimeout(catalogSyncTimer);
    catalogSyncTimer = window.setTimeout(function() {
      if (catalogSyncRunning) return;
      catalogSyncRunning = true;
      updateCatalogPrices(root || document).finally(function() {
        catalogSyncRunning = false;
      });
    }, Math.max(0, Number(delay || 0)));
  }

  function startCatalogPriceSync() {
    scheduleCatalogPriceSync(document, 80);
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
      if (shouldSync) scheduleCatalogPriceSync(document, 80);
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
  markVisiblePricesLoading(document);
  window.Tech7Prices.ready = looksLikeProduct ? resolvePrice(currentProduct).then(updatePrice) : Promise.resolve(null);

  onReady(startCatalogPriceSync);
  window.addEventListener('load', function() { scheduleCatalogPriceSync(document, 80); }, { once: true });

  var runtimeReady = loadScript('tech7-local-runtime-loaded', '/assets/js/tech7-local-runtime.js?v=20260523-routes-only', 'Tech7LocalRuntime')
    .then(function(runtime) {
      if (runtime && typeof runtime.refreshForms === 'function') runtime.refreshForms();
      return runtime;
    })
    .catch(function(err) { console.error('preco-loader: erro ao carregar tech7-local-runtime.js', err); });

  var cartReady = loadScript('cart-manager-loaded', '/cart-manager.js', 'CartManager')
    .catch(function(err) { console.error('preco-loader: erro ao carregar cart-manager.js', err); });

  if (looksLikeProduct) {
    Promise.all([runtimeReady, cartReady]).then(function() {
      return loadScript('produto-comprar-loaded', '/produto-comprar.js');
    }).catch(function(err) { console.error('preco-loader: erro ao carregar produto-comprar.js', err); });
  }
})();
