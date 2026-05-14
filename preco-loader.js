(function() {
  function removeAvisoModal() {
    var modal = document.querySelector('.modal-theme.email-modal');
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    if (!document.body) return;
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeAvisoModal, { once: true });
  } else {
    removeAvisoModal();
  }
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

  var cartReady = loadScript('cart-manager-loaded', '/cart-manager.js', 'CartManager')
    .catch(function(err) { console.error('preco-loader: erro ao carregar cart-manager.js', err); });

  var path = window.location.pathname;
  var parts = path.replace(/\/+$/, '').split('/').filter(Boolean);

  if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') {
    parts.pop();
  }

  var slug = parts[parts.length - 1] || '';
  var marca = parts.length >= 3 ? parts[parts.length - 2] : '';
  var secao = parts.length >= 3 ? parts[parts.length - 3] : (parts[parts.length - 2] || '');
  var hasProductForm = !!document.querySelector('#form_comprar, [data-app="product.buy-form"], #bt_comprar, #button-buy');
  var looksLikeProduct = parts.length >= 3 || (parts.length >= 2 && slug.indexOf('-') !== -1) || hasProductForm;

  // Carrega filtro de categoria em páginas de listagem
  if (!looksLikeProduct && document.querySelector('form.smart-filter')) {
    loadScript('category-filter-loaded', '/_assets/tech7/category-filter.js');
  }

  if (looksLikeProduct) {
    cartReady.then(function() {
      return loadScript('produto-comprar-loaded', '/produto-comprar.js');
    }).catch(function(err) { console.error('preco-loader: erro ao carregar produto-comprar.js', err); });
  }

  if (!looksLikeProduct || !slug || !secao) return;

  function getNum(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var str = String(value || '').replace(/[^\d,.-]/g, '');
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.indexOf(',') > -1) str = str.replace(',', '.');
    var n = Number.parseFloat(str);
    return Number.isFinite(n) ? n : 0;
  }

  function findJsonPrice(data) {
    if (!data) return 0;
    var preco;

    if (marca && data[secao] && data[secao][marca] && typeof data[secao][marca][slug] !== 'undefined') {
      preco = data[secao][marca][slug];
    }

    if (typeof preco === 'undefined' && data[secao]) {
      var marcas = Object.keys(data[secao]);
      for (var i = 0; i < marcas.length; i++) {
        if (typeof data[secao][marcas[i]][slug] !== 'undefined') {
          preco = data[secao][marcas[i]][slug];
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
            break;
          }
        }
        if (typeof preco !== 'undefined') break;
      }
    }

    return getNum(preco);
  }

  function updatePrice(preco) {
    preco = getNum(preco);
    if (preco <= 0) return;

    window.T7_PRODUCT_PRICE = preco;
    var formatado = Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    var elPrecoAtual = document.getElementById('preco_atual');
    if (elPrecoAtual) {
      if (elPrecoAtual.tagName === 'INPUT') elPrecoAtual.value = preco;
      else elPrecoAtual.innerText = formatado;
    }

    var elsPriceOff = document.querySelectorAll('.price-off');
    elsPriceOff.forEach(function(el) { el.innerHTML = formatado; });

    var outrosEls = document.querySelectorAll('.current-price, .woocommerce-Price-amount');
    outrosEls.forEach(function(el) { el.innerText = formatado; });

    var elVariacao = document.getElementById('variacaoPreco');
    if (elVariacao) {
      elVariacao.innerText = Number(preco).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    if (typeof dataLayer !== 'undefined') {
      for (var i = 0; i < dataLayer.length; i++) {
        if (dataLayer[i].priceSell) dataLayer[i].priceSell = String(preco);
        if (dataLayer[i].price) dataLayer[i].price = String(preco);
      }
    }
  }

  function fetchJsonPrice() {
    return fetch('/precos.json?nocache=' + Date.now(), { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(findJsonPrice)
      .catch(function(err) {
        console.error('preco-loader: erro ao carregar precos.json', err);
        return 0;
      });
  }

  function fetchApiPrice() {
    return fetch('/api/products?limit=20&q=' + encodeURIComponent(slug), { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].slug === slug && items[i].price_cents > 0) {
            return Number(items[i].price_cents) / 100;
          }
        }
        return 0;
      })
      .catch(function() { return 0; });
  }

  function getEmbeddedPrice() {
    var html = document.documentElement ? document.documentElement.innerHTML : '';
    var match = html.match(/"priceSell"\s*:\s*"([^"]+)"/) ||
      html.match(/"priceSell"\s*:\s*([0-9]+(?:[.,][0-9]+)?)/) ||
      html.match(/"price"\s*:\s*"([^"]+)"/) ||
      html.match(/"price"\s*:\s*([0-9]+(?:[.,][0-9]+)?)/);
    return match ? getNum(match[1]) : 0;
  }

  fetchJsonPrice()
    .then(function(preco) { return preco > 0 ? preco : fetchApiPrice(); })
    .then(function(preco) { return preco > 0 ? preco : getEmbeddedPrice(); })
    .then(updatePrice);
})();
