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
    var found = typeof preco !== 'undefined' && price > 0;
    if (!found) console.warn('preco-loader: produto sem preco mapeado em precos.json', warnKey || slug || input);

    return { found: found, price: found ? price : 0, secao: foundSecao, marca: foundMarca, slug: slug };
  }

  function resolvePrice(input) {
    if (!input || !input.slug) input = getPathParts();
    return loadPrices().then(function(data) { return lookupPrice(data, input); });
  }

  function updateScopedText(selector, text) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
  }

  function updatePrice(result) {
    var preco = result && result.price ? getNum(result.price) : 0;
    if (preco <= 0) return result;

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

  var currentProduct = getPathParts();
  var hasProductForm = !!document.querySelector('#form_comprar, [data-app="product.buy-form"], #bt_comprar, #button-buy');
  var looksLikeProduct = currentProduct.slug && (currentProduct.secao && currentProduct.marca || hasProductForm);

  window.Tech7Prices = window.Tech7Prices || {};
  window.Tech7Prices.load = loadPrices;
  window.Tech7Prices.resolve = resolvePrice;
  window.Tech7Prices.apply = updatePrice;
  window.Tech7Prices.parse = getNum;
  window.Tech7Prices.format = formatMoney;
  window.Tech7Prices.current = currentProduct;
  window.Tech7Prices.ready = looksLikeProduct ? resolvePrice(currentProduct).then(updatePrice) : Promise.resolve(null);

  var cartReady = loadScript('cart-manager-loaded', '/cart-manager.js', 'CartManager')
    .catch(function(err) { console.error('preco-loader: erro ao carregar cart-manager.js', err); });

  if (looksLikeProduct) {
    cartReady.then(function() {
      return loadScript('produto-comprar-loaded', '/produto-comprar.js');
    }).catch(function(err) { console.error('preco-loader: erro ao carregar produto-comprar.js', err); });
  }
})();
