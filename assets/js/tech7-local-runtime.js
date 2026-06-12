(function () {
  'use strict';

  if (window.Tech7LocalRuntime && window.Tech7LocalRuntime.active) return;
  window.__TECH7_HEADER_AUTOCOMPLETE__ = true;

  var TRAY_PATH = /^(\/(?:mvc\/store|nocache|web_api)(?:\/|$))/i;
  var LOCAL_CART_API_PATH = /^\/api\/cart(?:\/|$)/i;
  var LOCAL_CART_KEY = 'carrinho';
  var LOCAL_CART_ID_KEY = 't7_cart_id';
  var T7_WHATSAPP_URL = 'https://wa.me/5531999454848';
  var T7_INSTAGRAM_URL = 'https://www.instagram.com/tech7i/';
  var T7_PAYMENT_ICON_BASE = '/_assets/images.tcdn.com.br/commerce/assets/store/img/icons/formas_pagamento/';
  var T7_PAYMENT_BADGES = [
    { label: 'PIX', alt: 'Pagamento por PIX', src: T7_PAYMENT_ICON_BASE + 'pag_peqbase__f46324de.png' },
    { label: 'Visa', alt: 'Cartao Visa', src: T7_PAYMENT_ICON_BASE + 'pag_peqcartavisatraycheckout__f46324de.png' },
    { label: 'Mastercard', alt: 'Cartao Mastercard', src: T7_PAYMENT_ICON_BASE + 'pag_peqmastercardtraycheckout__f46324de.png' },
    { label: 'Elo', alt: 'Cartao Elo', src: T7_PAYMENT_ICON_BASE + 'pag_peqelotraycheckout__f46324de.png' },
    { label: 'Deposito', alt: 'Deposito bancario', src: T7_PAYMENT_ICON_BASE + 'pag_peqdepositobancario__f46324de.png' }
  ];
  var T7_LOJA_PROTEGIDA_SEAL = '/_assets/images.tcdn.com.br/files/996644/themes/46/img/seal-lp__e4660e26.png';

  window.dataLayer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
  window.dataLayerGa4 = Array.isArray(window.dataLayerGa4) ? window.dataLayerGa4 : [];

  function parseCart() {
    try {
      var items = JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || '[]');
      return Array.isArray(items) ? items : [];
    } catch (_err) {
      return [];
    }
  }

  function parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
    var str = String(value || '').replace(/[^\d,.-]/g, '');
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.indexOf(',') > -1) str = str.replace(',', '.');
    var number = Number.parseFloat(str);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function toUrl(input) {
    try {
      if (input && typeof input === 'object' && input.url) input = input.url;
      return new URL(String(input || ''), window.location.origin);
    } catch (_err) {
      return null;
    }
  }

  function isSameOrigin(url) {
    return url && url.origin === window.location.origin;
  }

  function isTrayUrl(input) {
    var url = toUrl(input);
    return isSameOrigin(url) && TRAY_PATH.test(url.pathname);
  }

  function json(data, status) {
    return {
      status: status || 200,
      statusText: status && status >= 400 ? 'Error' : 'OK',
      type: 'application/json; charset=utf-8',
      body: JSON.stringify(data == null ? {} : data),
      data: data == null ? {} : data
    };
  }

  function html(body, status) {
    return {
      status: status || 200,
      statusText: status && status >= 400 ? 'Error' : 'OK',
      type: 'text/html; charset=utf-8',
      body: String(body == null ? '' : body),
      data: String(body == null ? '' : body)
    };
  }

  function js(body, status) {
    return {
      status: status || 200,
      statusText: status && status >= 400 ? 'Error' : 'OK',
      type: 'application/javascript; charset=utf-8',
      body: String(body == null ? '' : body),
      data: String(body == null ? '' : body)
    };
  }

  function cartSummary() {
    var items = parseCart();
    var total = 0;
    var count = 0;
    items.forEach(function (item) {
      var qty = Math.max(1, parseInt(item.quantidade || item.qty || item.quantity || 1, 10) || 1);
      count += qty;
      total += parseMoney(item.preco || item.price) * qty;
    });
    return { count: count, total: total, amount: count };
  }

  function cartApiPayload() {
    return {
      Cart: parseCart().map(function (item) {
        var qty = Math.max(1, parseInt(item.quantidade || item.qty || item.quantity || 1, 10) || 1);
        return {
          product_id: String(item.id || item.productId || ''),
          product_name: String(item.nome || item.name || 'Produto TECH 7'),
          quantity: qty,
          price: parseMoney(item.preco || item.price),
          product_url: { https: String(item.url || '') },
          product_image: { https: String(item.imagem || item.image || ''), medium: String(item.imagem || item.image || '') },
          variant_id: '0',
          additional_information: String(item.variacao || '')
        };
      })
    };
  }

  function ensureLocalCartId() {
    var id = '';
    try {
      id = localStorage.getItem(LOCAL_CART_ID_KEY) || '';
      if (!id) {
        id = 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(LOCAL_CART_ID_KEY, id);
      }
    } catch (_err) {
      id = 'local-cart';
    }
    return id;
  }

  function saveCart(items) {
    try { localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(items || [])); } catch (_err) {}
  }

  function serverCartPayload() {
    return {
      id: ensureLocalCartId(),
      status: 'open',
      items: parseCart().map(function (item) {
        var qty = Math.max(1, parseInt(item.quantidade || item.qty || item.quantity || 1, 10) || 1);
        var price = parseMoney(item.preco || item.price);
        return {
          product_id: String(item.id || item.productId || ''),
          name: String(item.nome || item.name || 'Produto TECH 7'),
          qty: qty,
          price_cents: Math.round(price * 100),
          image_url: String(item.imagem || item.image || ''),
          url: String(item.url || ''),
          product_url: String(item.url || '')
        };
      })
    };
  }

  function maybeApplyCartMutation(input, init) {
    var method = String((init && init.method) || 'GET').toUpperCase();
    if (method !== 'PUT' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return;

    var body = init && init.body;
    if (!body || typeof body !== 'string') return;

    var payload = {};
    try { payload = JSON.parse(body); } catch (_err) { return; }
    var productId = String(payload.productId || payload.product_id || '');
    if (!productId) return;

    var qty = Math.max(0, parseInt(payload.qty || payload.quantity || 0, 10) || 0);
    var product = payload.product || {};
    var items = parseCart();
    var found = -1;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === productId) {
        found = i;
        break;
      }
    }

    if (qty <= 0) {
      if (found > -1) {
        items.splice(found, 1);
        saveCart(items);
      }
      return;
    }

    var next = found > -1 ? items[found] : { id: productId };
    next.id = productId;
    next.nome = String(product.name || product.nome || next.nome || 'Produto TECH 7');
    next.preco = parseMoney(product.price || product.preco || next.preco);
    next.quantidade = qty;
    next.imagem = String(product.image_url || product.image || product.imagem || next.imagem || '');
    next.url = String(product.url || next.url || window.location.pathname);
    if (found > -1) items[found] = next;
    else items.push(next);
    saveCart(items);
  }

  function productPayload(url) {
    var parts = String(url.pathname || '').split('/').filter(Boolean);
    var id = parts.pop() || '';
    var title = document.querySelector('meta[property="og:title"]');
    var image = document.querySelector('meta[property="og:image"]');
    return {
      Product: {
        id: id,
        name: title ? title.getAttribute('content') || 'Produto TECH 7' : 'Produto TECH 7',
        available: true,
        price: window.T7_PRODUCT_PRICE || 0,
        promotional_price: window.T7_PRODUCT_PRICE || 0,
        payment_option_html: '',
        url: { https: window.location.pathname },
        ProductImage: [{
          https: image ? image.getAttribute('content') || '' : '',
          thumbs: {
            90: { https: image ? image.getAttribute('content') || '' : '' },
            180: { https: image ? image.getAttribute('content') || '' : '' }
          }
        }]
      }
    };
  }

  function localResponse(input, options) {
    var url = toUrl(input);
    if (!isSameOrigin(url) || !TRAY_PATH.test(url.pathname)) return null;

    var path = url.pathname.replace(/\/+$/, '');
    if (/\/mvc\/store\/996644\/google_tag_manager\/updateGTM\.js$/i.test(path)) return js('');
    if (/\/mvc\/store\/996644\/google_tag_manager\/updateGTM\.json$/i.test(path)) return json({});
    if (/\/mvc\/store\/cart\/count$/i.test(path)) return json(cartSummary());
    if (/\/mvc\/store\/greeting$/i.test(path)) return html('');
    if (/\/mvc\/store\/newsletter$/i.test(path)) return html('');
    if (/\/mvc\/store\/facebook_conversions\//i.test(path)) return json({ ok: true });
    if (/\/mvc\/store\/tray_searcher\/suggestion\/index$/i.test(path)) {
      return html('<div data-container="suggestion" class="suggestion-words is-hidden"></div>');
    }
    if (/\/mvc\/store\/element\/snippets\/cart_preview$/i.test(path)) return html('');
    if (/\/mvc\/store\/product\/(?:discount|payment_options|payment_options_details|shipping|variant_form|variant_price|variant_reference|loadNextVariantDropDown|unavailableLetMeKnow|add_comment|question)$/i.test(path)) return html('');
    if (/\/mvc\/store\/product\/variant_gallery$/i.test(path)) return json([]);
    if (/\/nocache\//i.test(path)) return html('');
    if (/\/web_api\/cart/i.test(path) || /\/web_api\/carts/i.test(path)) return json(cartApiPayload());
    if (/\/web_api\/variants\//i.test(path)) return json({ Variant: { VariantImage: [] } });
    if (/\/web_api\/products\//i.test(path)) return json(productPayload(url));

    return html('', options && options.status ? options.status : 204);
  }

  function localApiResponse(input, init) {
    var url = toUrl(input);
    if (!isSameOrigin(url) || !LOCAL_CART_API_PATH.test(url.pathname)) return null;
    maybeApplyCartMutation(input, init || {});
    return json(serverCartPayload());
  }

  function responseForFetch(payload) {
    return new Response(payload.body, {
      status: payload.status,
      statusText: payload.statusText,
      headers: { 'content-type': payload.type, 'cache-control': 'no-store' }
    });
  }

  function patchFetch() {
    if (!window.fetch || window.fetch.__tech7LocalRuntime) return;
    var nativeFetch = window.fetch.bind(window);
    var patched = function (input, init) {
      var payload = localResponse(input, init || {});
      if (payload) return Promise.resolve(responseForFetch(payload));
      var url = toUrl(input);
      if (isSameOrigin(url) && LOCAL_CART_API_PATH.test(url.pathname)) {
        if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
          var localDevFallback = localApiResponse(input, init || {});
          return Promise.resolve(responseForFetch(localDevFallback));
        }
        return nativeFetch(input, init).then(function (response) {
          if (response && response.status !== 404 && response.status < 500) return response;
          var fallback = localApiResponse(input, init || {});
          return responseForFetch(fallback);
        }).catch(function () {
          var fallback = localApiResponse(input, init || {});
          return responseForFetch(fallback);
        });
      }
      return nativeFetch(input, init);
    };
    patched.__tech7LocalRuntime = true;
    window.fetch = patched;
  }

  function defineReadonly(xhr, key, value) {
    try {
      Object.defineProperty(xhr, key, { configurable: true, get: function () { return value; } });
    } catch (_err) {
      try { xhr[key] = value; } catch (_ignored) {}
    }
  }

  function patchXhr() {
    if (!window.XMLHttpRequest || window.XMLHttpRequest.prototype.__tech7LocalRuntime) return;
    var proto = window.XMLHttpRequest.prototype;
    var nativeOpen = proto.open;
    var nativeSend = proto.send;

    proto.open = function (method, url) {
      this.__tech7LocalRuntimePayload = localResponse(url, { method: method });
      this.__tech7LocalRuntimeUrl = url;
      if (this.__tech7LocalRuntimePayload) return;
      return nativeOpen.apply(this, arguments);
    };

    proto.send = function () {
      var xhr = this;
      var payload = xhr.__tech7LocalRuntimePayload;
      if (!payload) return nativeSend.apply(xhr, arguments);

      window.setTimeout(function () {
        defineReadonly(xhr, 'readyState', 4);
        defineReadonly(xhr, 'status', payload.status);
        defineReadonly(xhr, 'statusText', payload.statusText);
        defineReadonly(xhr, 'responseText', payload.body);
        defineReadonly(xhr, 'response', payload.body);
        defineReadonly(xhr, 'responseURL', String(toUrl(xhr.__tech7LocalRuntimeUrl) || ''));
        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
        if (typeof xhr.onload === 'function') xhr.onload();
        try { xhr.dispatchEvent(new Event('readystatechange')); } catch (_readyErr) {}
        try { xhr.dispatchEvent(new Event('load')); } catch (_loadErr) {}
        try { xhr.dispatchEvent(new Event('loadend')); } catch (_endErr) {}
      }, 0);
    };

    proto.__tech7LocalRuntime = true;
  }

  function patchJquery() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.ajax || jq.ajax.__tech7LocalRuntime) return false;
    var nativeAjax = jq.ajax;

    jq.ajax = function (urlOrOptions, maybeOptions) {
      var options = typeof urlOrOptions === 'string'
        ? Object.assign({}, maybeOptions || {}, { url: urlOrOptions })
        : Object.assign({}, urlOrOptions || {});
      var payload = localResponse(options.url || options.href || '', options);
      if (!payload) return nativeAjax.apply(this, arguments);

      var deferred = jq.Deferred ? jq.Deferred() : null;
      var jqXhr = {
        readyState: 4,
        status: payload.status,
        statusText: payload.statusText,
        responseText: payload.body,
        getResponseHeader: function (name) {
          return String(name || '').toLowerCase() === 'content-type' ? payload.type : null;
        }
      };

      window.setTimeout(function () {
        var data = payload.data;
        if (options.dataType === 'json' && typeof data === 'string') {
          try { data = JSON.parse(data || '{}'); } catch (_err) { data = {}; }
        }
        if (typeof options.success === 'function') options.success(data, 'success', jqXhr);
        if (typeof options.complete === 'function') options.complete(jqXhr, 'success');
        if (deferred) deferred.resolveWith(options.context || window, [data, 'success', jqXhr]);
      }, 0);

      if (deferred) return deferred.promise(jqXhr);
      return jqXhr;
    };

    jq.ajax.__tech7LocalRuntime = true;
    return true;
  }

  function normalizeSearchForms() {
    var forms = document.querySelectorAll('form[data-search="suggestion"], form.search-header');
    forms.forEach(function (form) {
      form.setAttribute('action', '/busca/index.html');
      form.setAttribute('method', 'get');
      form.addEventListener('submit', function () {
        var field = form.querySelector('[name="palavra_busca"], [name="q"], [data-input="suggestion"]');
        if (field && field.name !== 'q') {
          var q = form.querySelector('input[type="hidden"][name="q"][data-t7-search-query]');
          if (!q) {
            q = document.createElement('input');
            q.type = 'hidden';
            q.name = 'q';
            q.setAttribute('data-t7-search-query', '1');
            form.appendChild(q);
          }
          q.value = field.value || '';
        }
      });
    });
  }

  var T7_SEARCH_AUTOCOMPLETE_LIMIT = 8;
  var T7_SEARCH_AUTOCOMPLETE_FETCH_LIMIT = 24;
  var T7_SEARCH_AUTOCOMPLETE_DELAY = 250;

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function searchSuggestionScore(item, term) {
    var query = normalizeSearchText(term);
    if (!query) return 0;
    var words = query.split(/\s+/).filter(Boolean);
    var name = normalizeSearchText(item && (item.name || item.title || item.slug));
    var slug = normalizeSearchText(item && item.slug);
    var brand = normalizeSearchText(item && item.brand);
    var category = normalizeSearchText(item && (item.category || item.section));
    var haystack = [name, slug, brand, category].join(' ');
    var score = 0;
    if (name === query || slug === query) score += 120;
    if (name.indexOf(query) === 0 || slug.indexOf(query) === 0) score += 80;
    if (name.indexOf(query) > -1 || slug.indexOf(query) > -1) score += 55;
    if (brand && query.indexOf(brand) > -1) score += 16;
    if (category && query.indexOf(category) > -1) score += 10;
    words.forEach(function (word) {
      if (!word) return;
      if (name.indexOf(word) === 0 || slug.indexOf(word) === 0) score += 18;
      else if (name.indexOf(word) > -1 || slug.indexOf(word) > -1) score += 12;
      else if (brand.indexOf(word) > -1 || category.indexOf(word) > -1) score += 5;
      else if (haystack.indexOf(word) > -1) score += 2;
    });
    var cents = Number(item && item.price_cents);
    if (Number.isFinite(cents) && cents >= 200) score += 4;
    if (item && (item.image || item.image_url || item.primary_image_url)) score += 2;
    return score;
  }

  function categoryLabel(value) {
    var clean = normalizeProductSegment(value);
    var labels = {
      'baterias': 'Baterias',
      'baterias-celular': 'Baterias',
      'display': 'Display',
      'display-e-lcd': 'Display',
      'tela-display-lcd': 'Display',
      'pecas-e-componentes': 'Peças e componentes',
      'tampas-e-carcacas': 'Tampas e carcaças',
      'touchs-e-visores': 'Touch e visor',
      'maquinas-e-ferramentas': 'Máquinas e ferramentas'
    };
    return labels[clean] || String(value || '').replace(/-/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function ensureHeaderSearchAutocompleteStyles() {
    if (document.getElementById('t7-header-search-autocomplete-style')) return;
    var style = document.createElement('style');
    style.id = 't7-header-search-autocomplete-style';
    style.textContent = [
      '.header .search-header{position:relative!important;z-index:70;min-width:0;overflow:visible;box-sizing:border-box;}',
      '.t7-search-suggestions{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:90;display:none;width:100%;max-width:100%;background:#fff;border:1px solid rgba(17,24,39,.12);border-radius:8px;box-shadow:0 18px 38px rgba(15,23,42,.22);overflow:hidden;text-align:left;box-sizing:border-box;}',
      '.t7-search-suggestions.is-open{display:block;}',
      '.t7-search-suggestions__list{display:block;max-height:min(66vh,520px);overflow-y:auto;overflow-x:hidden;padding:6px;}',
      '.t7-search-suggestions__item{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px;align-items:center;min-height:74px;padding:8px;border-radius:7px;color:#111827;text-decoration:none!important;background:#fff;}',
      '.t7-search-suggestions__item:hover,.t7-search-suggestions__item:focus{background:#f3f6f9;outline:none;}',
      '.t7-search-suggestions__image{width:56px;height:56px;border:1px solid #eef1f4;border-radius:7px;background:#f8fafc;object-fit:contain;}',
      '.t7-search-suggestions__body{min-width:0;display:grid;gap:3px;}',
      '.t7-search-suggestions__name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#101820;font-size:13px;font-weight:800;line-height:1.25;letter-spacing:0;}',
      '.t7-search-suggestions__meta{display:flex;align-items:center;gap:8px;min-width:0;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0;}',
      '.t7-search-suggestions__category{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.t7-search-suggestions__price{color:#0057a8;font-size:13px;font-weight:900;letter-spacing:0;}',
      '.t7-search-suggestions__state{padding:14px 16px;color:#475569;font-size:13px;font-weight:700;text-align:center;}',
      '@media (max-width:767px){.header .search-header{z-index:70;}.t7-search-suggestions{position:fixed;left:12px;right:12px;top:auto;width:auto;max-width:none;margin-top:8px;border-radius:8px;}.t7-search-suggestions__list{max-height:58vh;}.t7-search-suggestions__item{grid-template-columns:52px minmax(0,1fr);min-height:68px;padding:8px;}.t7-search-suggestions__image{width:52px;height:52px;}.t7-search-suggestions__name{font-size:12.5px;}.t7-search-suggestions__price{font-size:12.5px;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function positionMobileSearchSuggestions(form, dropdown) {
    if (!form || !dropdown || window.innerWidth > 767) {
      if (dropdown) dropdown.style.top = '';
      return;
    }
    var rect = form.getBoundingClientRect();
    dropdown.style.top = Math.max(8, Math.round(rect.bottom + 8)) + 'px';
  }

  function renderSearchSuggestionState(dropdown, message) {
    dropdown.innerHTML = '<div class="t7-search-suggestions__state">' + escapeHtml(message) + '</div>';
    dropdown.classList.add('is-open');
  }

  function renderSearchSuggestions(dropdown, items) {
    if (!items.length) {
      renderSearchSuggestionState(dropdown, 'Nenhum produto encontrado');
      return;
    }
    dropdown.innerHTML = '<div class="t7-search-suggestions__list" role="listbox">' + items.map(function (item) {
      var name = String(item && (item.name || item.title || item.slug) || 'Produto TECH 7');
      var href = backendProductUrl(item);
      var image = backendProductImage(item);
      var price = backendPriceLabel(item);
      var category = categoryLabel(item && (item.category || item.section || item.brand));
      return '<a class="t7-search-suggestions__item" role="option" href="' + escapeHtml(href) + '">' +
        '<img class="t7-search-suggestions__image" src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" loading="lazy" width="56" height="56" onerror="this.onerror=null;this.src=\'/_assets/tech7/product-placeholder.svg\';">' +
        '<span class="t7-search-suggestions__body">' +
        '<span class="t7-search-suggestions__name">' + escapeHtml(name) + '</span>' +
        '<span class="t7-search-suggestions__meta"><span class="t7-search-suggestions__category">' + escapeHtml(category) + '</span></span>' +
        '<span class="t7-search-suggestions__price">' + escapeHtml(price) + '</span>' +
        '</span>' +
        '</a>';
    }).join('') + '</div>';
    dropdown.classList.add('is-open');
  }

  function bindHeaderSearchAutocomplete() {
    ensureHeaderSearchAutocompleteStyles();
    var forms = document.querySelectorAll('form[data-search="suggestion"], form.search-header');
    forms.forEach(function (form) {
      if (form.getAttribute('data-t7-autocomplete-bound') === '1') return;
      var input = form.querySelector('[name="palavra_busca"], [name="q"], [data-input="suggestion"]');
      if (!input) return;
      form.setAttribute('data-t7-autocomplete-bound', '1');
      form.setAttribute('data-t7-suggestion-ready', 'runtime');
      form.dataset.t7SuggestionReady = 'runtime';
      var dropdown = document.createElement('div');
      dropdown.className = 't7-search-suggestions suggestion-words';
      dropdown.setAttribute('data-container', 'suggestion');
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('aria-label', 'Sugestões de produtos');
      form.appendChild(dropdown);

      var timer = 0;
      var sequence = 0;
      var controller = null;
      var lastRequestedTerm = '';

      function close() {
        dropdown.classList.remove('is-open');
        dropdown.innerHTML = '';
      }

      function requestSuggestions(term) {
        if (term === lastRequestedTerm && dropdown.classList.contains('is-open')) return;
        lastRequestedTerm = term;
        var current = ++sequence;
        if (controller && typeof controller.abort === 'function') controller.abort();
        controller = window.AbortController ? new AbortController() : null;
        renderSearchSuggestionState(dropdown, 'Buscando produtos...');
        positionMobileSearchSuggestions(form, dropdown);
        var query = new URLSearchParams();
        query.set('q', term);
        query.set('limit', String(T7_SEARCH_AUTOCOMPLETE_FETCH_LIMIT));
        window.fetch('/api/search?' + query.toString(), {
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        })
          .then(function (response) {
            if (!response.ok) throw new Error('search_' + response.status);
            return response.json();
          })
          .then(function (data) {
            if (current !== sequence) return;
            var seen = {};
            var ranked = (Array.isArray(data && data.items) ? data.items : [])
              .filter(function (item) {
                var key = String((item && (item.id || item.url || item.slug)) || '');
                if (!key || seen[key]) return false;
                seen[key] = true;
                return true;
              })
              .map(function (item) {
                item.__score = searchSuggestionScore(item, term);
                return item;
              })
              .sort(function (a, b) {
                return (b.__score || 0) - (a.__score || 0);
              })
              .slice(0, T7_SEARCH_AUTOCOMPLETE_LIMIT);
            renderSearchSuggestions(dropdown, ranked);
            positionMobileSearchSuggestions(form, dropdown);
          })
          .catch(function (error) {
            if (error && error.name === 'AbortError') return;
            if (current !== sequence) return;
            renderSearchSuggestionState(dropdown, 'Nenhum produto encontrado');
          });
      }

      input.addEventListener('input', function () {
        var term = String(input.value || '').trim();
        window.clearTimeout(timer);
        if (term.length < 2) {
          if (controller && typeof controller.abort === 'function') controller.abort();
          close();
          return;
        }
        timer = window.setTimeout(function () {
          requestSuggestions(term);
        }, T7_SEARCH_AUTOCOMPLETE_DELAY);
      });

      input.addEventListener('focus', function () {
        positionMobileSearchSuggestions(form, dropdown);
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          close();
          input.blur();
        }
      });

      form.addEventListener('submit', close);
      window.addEventListener('resize', function () { positionMobileSearchSuggestions(form, dropdown); }, { passive: true });
      document.addEventListener('click', function (event) {
        if (!form.contains(event.target)) close();
      });
    });
  }
  function normalizeMenuLinks() {
    var links = document.querySelectorAll('.header .nav a[href], .content-nav a[href]');
    links.forEach(function (link) {
      var href = String(link.getAttribute('href') || '').trim();
      if (!href) return;
      if (/^(?:[a-z]+:|\/\/|#|\?|javascript:|mailto:|tel:)/i.test(href)) return;
      if (href.charAt(0) === '/') return;
      link.setAttribute('href', '/' + href.replace(/^\.\.\//g, '').replace(/^\.?\//, ''));
    });
  }

  function normalizeNewsletterForms() {
    var forms = document.querySelectorAll('form[action*="/mvc/store/newsletter"]');
    forms.forEach(function (form) {
      form.setAttribute('action', '/api/newsletter');
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = form.querySelector('input[type="email"], input[name="email"]');
        var button = form.querySelector('button, input[type="submit"]');
        if (email && !email.value) return;
        if (button) {
          var oldText = button.textContent || button.value || '';
          if ('value' in button) button.value = 'Enviado';
          button.textContent = 'Enviado';
          window.setTimeout(function () {
            if ('value' in button) button.value = oldText;
            button.textContent = oldText;
          }, 1800);
        }
      });
    });
  }

  function normalizeUnavailableNotice() {
    if (window.__tech7UnavailableNoticeBound) return;
    window.__tech7UnavailableNoticeBound = true;
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest('#letMeKnow, [data-url*="/api/products/unavailable-let-me-know"], [data-url*="unavailableLetMeKnow"]')
        : null;
      if (!button) return;

      event.preventDefault();

      var box = document.getElementById('div_erro') || button.closest('#nao_disp');
      var email = document.getElementById('email_avise');
      if (email && !email.value.trim()) {
        if (box) {
          box.style.display = '';
          box.textContent = 'Informe seu e-mail para ser avisado quando o produto estiver disponivel.';
        }
        email.focus();
        return;
      }

      fetch('/api/products/unavailable-let-me-know', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email ? email.value.trim() : '',
          product_id: button.getAttribute('data-product-id') || ''
        })
      }).catch(function () {});

      if (box) {
        box.style.display = '';
        box.textContent = 'Cadastro recebido. Avisaremos quando o produto estiver disponivel.';
      }
    });
  }

  function normalizePaymentLabels() {
    document.querySelectorAll('.txt-forma-pagamento').forEach(function (node) {
      node.textContent = 'MasterCard - Elo';
    });

    document.querySelectorAll('[alt*="MasterCard - Vindi"], [title*="MasterCard - Vindi"], [data-variants*="MasterCard - Vindi"]').forEach(function (node) {
      ['alt', 'title', 'data-variants'].forEach(function (attr) {
        var value = node.getAttribute(attr);
        if (value && value.indexOf('MasterCard - Vindi') !== -1) {
          node.setAttribute(attr, value.split('MasterCard - Vindi').join('MasterCard - Elo'));
        }
      });
    });
  }

  function textMeta(selector) {
    var node = document.querySelector(selector);
    return node ? String(node.getAttribute('content') || '').trim() : '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoneyBRL(value) {
    var number = parseMoney(value);
    try {
      return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_err) {
      return 'R$ ' + number.toFixed(2).replace('.', ',');
    }
  }

  function absoluteUrl(value) {
    try { return new URL(String(value || ''), window.location.href).href; } catch (_err) { return ''; }
  }

  function ensureSiteShell() {
    function hasVisibleBox(node) {
      if (!node) return false;
      var rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function directChild(parent, selector) {
      if (!parent) return null;
      for (var i = 0; i < parent.children.length; i++) {
        if (parent.children[i].matches(selector)) return parent.children[i];
      }
      return null;
    }

    if (hasVisibleBox(document.querySelector('.wrapper.menu-icons.position-header')) && document.querySelector('footer.footer')) return Promise.resolve();
    if (window.__tech7ShellPromise) return window.__tech7ShellPromise;

    function normalizeShellUrls(node, basePath) {
      ['href', 'src', 'action'].forEach(function (attr) {
        node.querySelectorAll('[' + attr + ']').forEach(function (element) {
          var raw = element.getAttribute(attr);
          if (!raw || /^(?:#|javascript:|mailto:|tel:)/i.test(raw)) return;
          try {
            var url = new URL(raw, new URL(basePath, window.location.origin));
            element.setAttribute(attr, url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href);
          } catch (_err) {}
        });
      });
    }

    var shellPath = '/tampas-e-carcacas/apple/index.html';
    window.__tech7ShellPromise = fetch(shellPath, { cache: 'force-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('shell_' + response.status);
        return response.text();
      })
      .then(function (htmlText) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(htmlText, 'text/html');
        var app = document.querySelector('.application') || document.body;
        var localNav = directChild(app, '.nav-mobile');
        var localShadowCart = directChild(app, '.shadow-cart');
        var localHeaderShell = document.querySelector('.wrapper.menu-icons.position-header');
        var localFooter = document.querySelector('footer.footer');
        var sourceHeader = doc.querySelector('header.header');
        var sourceHeaderShell = sourceHeader ? sourceHeader.closest('.wrapper.menu-icons') : null;
        var sourceFooter = doc.querySelector('footer.footer');

        if ((!localHeaderShell || !hasVisibleBox(localHeaderShell)) && (sourceHeaderShell || sourceHeader)) {
          var headerShell;
          if (sourceHeaderShell) {
            headerShell = document.createElement('div');
            headerShell.className = sourceHeaderShell.className || 'wrapper menu-icons position-header';
            var sourceBarTop = sourceHeaderShell.querySelector('.bar-top');
            var sourceNav = sourceHeaderShell.querySelector('nav.nav');
            if (sourceBarTop) headerShell.appendChild(sourceBarTop.cloneNode(true));
            headerShell.appendChild(sourceHeader.cloneNode(true));
            if (sourceNav) headerShell.appendChild(sourceNav.cloneNode(true));
          } else {
            headerShell = sourceHeader.cloneNode(true);
          }
          normalizeShellUrls(headerShell, shellPath);
          if (sourceHeaderShell) headerShell.classList.add('position-header');
          if (localShadowCart && localShadowCart.parentNode === app) localShadowCart.parentNode.insertBefore(headerShell, localShadowCart.nextSibling);
          else if (localNav && localNav.parentNode === app) localNav.parentNode.insertBefore(headerShell, localNav.nextSibling);
          else app.insertBefore(headerShell, app.firstChild);
        }

        if (!localFooter && sourceFooter) {
          var footer = sourceFooter.cloneNode(true);
          normalizeShellUrls(footer, shellPath);
          var fixedContact = app.querySelector('.fixed-contact');
          if (fixedContact && fixedContact.parentNode) fixedContact.parentNode.insertBefore(footer, fixedContact);
          else app.appendChild(footer);
        }

        normalizeSearchForms();
        bindHeaderSearchAutocomplete();
        normalizeMenuLinks();
        normalizeNewsletterForms();
      })
      .catch(function () {});

    return window.__tech7ShellPromise;
  }

  function productDataFromInlineScripts() {
    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || '';
      if (text.indexOf('idProduct') === -1 || text.indexOf('nameProduct') === -1) continue;
      var start = text.indexOf('[');
      var end = text.lastIndexOf(']');
      if (start === -1 || end <= start) continue;
      try {
        var parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch (_err) {}
    }
    return null;
  }

  function catalogDataFromInlineScripts() {
    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || '';
      if (text.indexOf('listProducts') === -1) continue;
      var start = text.indexOf('[');
      var end = text.lastIndexOf(']');
      if (start === -1 || end <= start) continue;
      try {
        var parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].listProducts)) return parsed[0];
      } catch (_err) {}
    }
    return null;
  }

  function currentProductData() {
    var layer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    var product = null;
    for (var i = 0; i < layer.length; i++) {
      if (layer[i] && (layer[i].pageCategory === 'Produto' || layer[i].idProduct || layer[i].nameProduct)) {
        product = layer[i];
        break;
      }
    }
    product = product || productDataFromInlineScripts() || {};

    var path = window.location.pathname.split('/').filter(Boolean);
    if (path[path.length - 1] === 'index.html') path.pop();
    var slug = path[path.length - 1] || '';
    var section = path[0] || '';
    var brand = product.brand || product.category || path[1] || '';
    var name = product.nameProduct || textMeta('meta[property="og:title"]') || document.title || 'Produto TECH 7';
    var image = product.urlImage || textMeta('meta[property="og:image"]');
    var description = textMeta('meta[property="og:description"]') || textMeta('meta[name="description"]');

    return {
      id: String(product.idProduct || product.reference || slug || 'produto-tech7'),
      name: name,
      price: parseMoney(product.priceSell || product.price || window.T7_PRODUCT_PRICE || 0),
      image: absoluteUrl(image),
      description: description,
      brand: String(brand || '').toUpperCase(),
      section: String(section || ''),
      slug: slug,
      url: window.location.pathname,
      breadcrumbDetails: Array.isArray(product.breadcrumbDetails) ? product.breadcrumbDetails : []
    };
  }

  function productFreightErrorMessage(error) {
    var code = String(error && error.message || '');
    if (code === 'shipping_provider_not_configured') return 'Frete ainda nao configurado.';
    if (code === 'shipping_unavailable') return 'Nenhuma opcao de frete encontrada para este CEP.';
    if (code === 'invalid_destination') return 'Informe um CEP valido com 8 numeros.';
    if (code === 'product_not_found') return 'Produto indisponivel para cotacao.';
    return 'Nao foi possivel calcular o frete agora. Tente novamente.';
  }

  function productFreightFetch(url, options) {
    return window.fetch(url, options || {}).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (_err) {}
        if (!response.ok) {
          var error = new Error(payload.error || 'http_' + response.status);
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    });
  }

  function formatProductFreightCep(value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
  }

  function ensureProductFreightStyles() {
    if (document.getElementById('t7-product-freight-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-product-freight-styles';
    style.textContent = [
      '.box-frete .result.t7-freight-result{display:block;width:100%;margin-top:10px;min-height:0;font-size:13px;line-height:1.45;color:#242424;}',
      '.t7-freight-message{padding:10px 12px;border:1px solid #dedede;background:#fff;border-radius:6px;}',
      '.t7-freight-message.is-error{border-color:#c62828;color:#9b1c1c;background:#fff7f7;}',
      '.t7-freight-options{display:grid;gap:8px;margin:0;padding:0;list-style:none;}',
      '.t7-freight-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 12px;border:1px solid #dedede;background:#fff;border-radius:6px;}',
      '.t7-freight-option strong{min-width:0;overflow-wrap:anywhere;}',
      '.t7-freight-option-price{font-weight:700;color:#ff6a00;white-space:nowrap;}',
      '.t7-freight-option-time{grid-column:1/-1;color:#5f6368;font-size:12px;}',
      '.new-frete .submit-frete:disabled{opacity:.65;cursor:wait;}',
      '@media(max-width:480px){.t7-freight-option{grid-template-columns:1fr}.t7-freight-option-price{white-space:normal}.t7-freight-option-time{grid-column:auto}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function bindProductFreightCalculator() {
    var forms = document.querySelectorAll('.box-frete form.new-frete');
    if (!forms.length) return;
    ensureProductFreightStyles();

    forms.forEach(function (form) {
      if (form.getAttribute('data-t7-freight-bound') === 'true') return;
      form.setAttribute('data-t7-freight-bound', 'true');

      var input = form.querySelector('.crazy_cep, input[name="number-frete"]');
      var button = form.querySelector('.submit-frete, button');
      var result = form.parentNode && form.parentNode.querySelector('.result');
      if (!input || !button || !result) return;

      button.setAttribute('type', 'button');
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('maxlength', '9');
      input.setAttribute('minlength', '8');
      result.classList.add('t7-freight-result');
      result.setAttribute('aria-live', 'polite');

      input.addEventListener('input', function () {
        input.value = formatProductFreightCep(input.value);
        result.innerHTML = '';
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        event.stopPropagation();
        button.click();
      });

      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var zipcode = String(input.value || '').replace(/\D/g, '');
        if (zipcode.length !== 8) {
          result.innerHTML = '<div class="t7-freight-message is-error">Informe um CEP valido com 8 numeros.</div>';
          input.focus();
          return;
        }

        var product = currentProductData();
        var quantityInput = document.querySelector('#quant, [data-app="product.quantity"] input');
        var quantity = Math.max(1, parseInt(quantityInput && quantityInput.value || '1', 10) || 1);
        button.disabled = true;
        button.textContent = 'Calculando...';
        result.innerHTML = '<div class="t7-freight-message">Consultando opcoes de frete...</div>';

        productFreightFetch('/api/products/resolve-prices', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: [{ id: product.id, slug: product.slug, section: product.section, brand: product.brand }] })
        }).then(function (resolved) {
          var item = resolved && Array.isArray(resolved.items) ? resolved.items[0] : null;
          if (!item || !item.found || !item.id) throw new Error('product_not_found');
          return productFreightFetch('/api/shipping/melhor-envio/quote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              destination: { cep: zipcode },
              items: [{ id: item.id, qty: quantity }]
            })
          });
        }).then(function (quote) {
          var options = quote && Array.isArray(quote.options) ? quote.options : [];
          if (!options.length) throw new Error('shipping_unavailable');
          result.innerHTML = '<ul class="t7-freight-options">' + options.map(function (option) {
            var days = Number(option.sloInDays);
            var time = Number.isFinite(days) && days > 0 ? 'Prazo estimado: ' + days + ' dia(s)' : 'Prazo informado pela transportadora';
            return '<li class="t7-freight-option">' +
              '<strong>' + escapeHtml(option.label || 'Entrega') + '</strong>' +
              '<span class="t7-freight-option-price">' + escapeHtml(formatMoneyBRL(option.price || 0)) + '</span>' +
              '<span class="t7-freight-option-time">' + escapeHtml(time) + '</span>' +
              '</li>';
          }).join('') + '</ul>';
        }).catch(function (error) {
          result.innerHTML = '<div class="t7-freight-message is-error">' + escapeHtml(productFreightErrorMessage(error)) + '</div>';
        }).finally(function () {
          button.disabled = false;
          button.textContent = 'Calcular';
        });
      });
    });
  }

  function hasRenderedProductArea() {
    var h1 = document.querySelector('h1');
    var hasTitle = !!(h1 && h1.textContent && h1.textContent.trim().length > 3);
    var hasBuy = !!document.querySelector('#form_comprar, [data-app="product.buy-form"], #bt_comprar, #button-buy, .t7-buy-wrapper');
    var hasProductColumn = !!document.querySelector('.product-colum-right, .product-right, .box-col-product, .product-wrapper');
    return hasTitle && (hasBuy || hasProductColumn);
  }

  function breadcrumbHtml(product) {
    var parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[parts.length - 1] === 'index.html') parts.pop();
    var sectionPath = parts[0] ? '/' + parts[0] : '/';
    var brandPath = parts[0] && parts[1] ? '/' + parts[0] + '/' + parts[1] : sectionPath;
    var sectionName = product.breadcrumbDetails[0] && product.breadcrumbDetails[0].name
      ? product.breadcrumbDetails[0].name
      : product.section;
    var brandName = product.breadcrumbDetails[1] && product.breadcrumbDetails[1].name
      ? product.breadcrumbDetails[1].name
      : product.brand;

    return '<nav class="breadcrumb" aria-label="breadcrumb">' +
      '<a href="/">Pagina Inicial</a>' +
      (sectionName ? '<span> &gt; </span><a href="' + escapeHtml(sectionPath) + '">' + escapeHtml(sectionName) + '</a>' : '') +
      (brandName ? '<span> &gt; </span><a href="' + escapeHtml(brandPath) + '">' + escapeHtml(brandName) + '</a>' : '') +
      '<span> &gt; </span><span>' + escapeHtml(product.name) + '</span>' +
      '</nav>';
  }

  function addFallbackProductToCart(product, button) {
    var payload = {
      id: product.id,
      nome: product.name,
      preco: product.price,
      imagem: product.image,
      quantidade: 1,
      url: product.url,
      slug: product.slug,
      marca: product.brand,
      section: product.section
    };
    var api = window.CartManager || window.cartManager;
    var done = api && typeof api.adicionar === 'function'
      ? api.adicionar(payload)
      : (saveCart(parseCart().concat([payload])), parseCart());
    var promise = done && typeof done.then === 'function' ? done : Promise.resolve(done);

    if (button) {
      button.disabled = true;
      button.textContent = 'Adicionado';
    }

    promise.then(function () {
      try { document.dispatchEvent(new CustomEvent('carrinhoAtualizado', { detail: { items: parseCart() } })); } catch (_err) {}
      window.location.href = '/carrinho/';
    }).catch(function () {
      window.location.href = '/carrinho/';
    });
  }

  function ensureFallbackProductPage() {
    // Pages must resolve to existing static product pages or redirects.
    // Do not synthesize product markup in the browser.
  }

  function currentCatalogData() {
    var layer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    var catalog = null;
    for (var i = 0; i < layer.length; i++) {
      if (layer[i] && Array.isArray(layer[i].listProducts)) {
        catalog = layer[i];
        break;
      }
    }
    catalog = catalog || catalogDataFromInlineScripts() || {};
    var title = textMeta('meta[property="og:title"]') || document.title || 'Produtos TECH 7';
    var breadcrumb = String(catalog.breadcrumb || '');
    var breadcrumbParts = breadcrumb ? breadcrumb.split('>').map(function (part) { return part.trim(); }).filter(Boolean) : [];
    return {
      title: catalog.category || breadcrumbParts[breadcrumbParts.length - 1] || title.replace(/\s+-\s+TECH 7$/i, ''),
      description: textMeta('meta[property="og:description"]') || textMeta('meta[name="description"]') || '',
      products: Array.isArray(catalog.listProducts) ? catalog.listProducts : [],
      breadcrumb: breadcrumb
    };
  }

  function hasRenderedCatalogArea() {
    var main = document.querySelector('main');
    if (!main) return false;
    var titleNode = main.querySelector('h1, .category-name, .catalog-name');
    var hasTitle = !!(titleNode && titleNode.textContent && titleNode.textContent.trim().length > 1);
    return hasTitle;
  }

  function catalogBreadcrumbHtml(catalog) {
    var parts = catalog.breadcrumb ? catalog.breadcrumb.split('>').map(function (part) { return part.trim(); }).filter(Boolean) : [];
    if (!parts.length) parts = ['Pagina Inicial', catalog.title];
    return '<nav class="breadcrumb" aria-label="breadcrumb">' + parts.map(function (part, index) {
      if (index === 0) return '<a href="/">' + escapeHtml(part) + '</a>';
      return '<span> &gt; </span><span>' + escapeHtml(part) + '</span>';
    }).join('') + '</nav>';
  }

  function catalogProductCard(product) {
    var url = product.urlProduct || '#';
    var sourceImage = absoluteUrl(product.urlImage || '');
    var name = product.nameProduct || 'Produto TECH 7';
    var price = parseMoney(product.sellPrice || product.price);
    return '<li class="item flex">' +
      '<div class="product nb show-down">' +
      '<div class="image"><a class="space-image" href="' + escapeHtml(url) + '">' +
      '<img src="' + escapeHtml(sourceImage) + '" alt="' + escapeHtml(name) + '" class="lazyload transform" loading="lazy" width="450" height="450">' +
      '</a></div>' +
      '<a class="info-product" href="' + escapeHtml(url) + '">' +
      '<div class="product-name">' + escapeHtml(name) + '</div>' +
      '<div class="down-line"><div class="box-price"><div class="price"><div class="product-price">' +
      escapeHtml(price > 0 ? formatMoneyBRL(price) : 'Preco sob consulta') +
      '</div></div></div></div>' +
      '</a>' +
      '</div>' +
      '</li>';
  }

  function backendPriceLabel(product) {
    var cents = Number(product && product.price_cents);
    if (!Number.isFinite(cents) || cents < 200) return 'Preco sob consulta';
    return formatMoneyBRL(cents / 100);
  }

  function backendProductUrl(product) {
    var url = String(product && (product.url || product.urlProduct || product.product_url) || '').trim();
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) {
      try {
        var parsed = new URL(url);
        return parsed.pathname + parsed.search + parsed.hash;
      } catch (_err) {
        return url;
      }
    }
    return '/' + url.replace(/^\/+/, '').replace(/\/index\.html$/i, '');
  }

  function backendProductImage(product) {
    return localAssetImage(product && (product.image_url || product.image || product.urlImage) || '') || '/_assets/tech7/product-placeholder.svg';
  }

  var PAYMENT_LINK_FEE_RATE = 0.125;
  var INSTALLMENT_COUNT = 3;

  function backendInstallmentLabel(product) {
    var cents = Number(product && product.price_cents);
    if (!Number.isFinite(cents) || cents < 200) return '';
    var installment = (cents / 100) / (1 - PAYMENT_LINK_FEE_RATE) / INSTALLMENT_COUNT;
    return 'em 3x de <strong>' + escapeHtml(formatMoneyBRL(installment)) + '</strong> MasterCard - Elo';
  }

  function backendCatalogProductCard(product) {
    var url = backendProductUrl(product);
    var name = String(product && (product.name || product.nameProduct) || 'Produto TECH 7');
    var image = backendProductImage(product);
    var payment = backendInstallmentLabel(product);
    var id = String(product && (product.id || product.idProduct) || '');
    return '<li class="item flex">' +
      '<div class="product nb show-down">' +
      '<div class="image"><a class="space-image second" href="' + escapeHtml(url) + '">' +
      '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" class="lazyload transform" data-src="' + escapeHtml(image) + '" width="450" height="450" loading="lazy">' +
      '</a></div>' +
      '<a class="info-product" href="' + escapeHtml(url) + '">' +
      '<div class="product-name">' + escapeHtml(name) + '</div>' +
      '<div class="down-line"><div class="list-star flex justify-center"><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div></div>' +
      '<div class="box-price"><div class="price"><div class="product-price"><span class="price-off"><span>' + escapeHtml(backendPriceLabel(product)) + '</span></span></div></div>' +
      (payment ? '<div class="product-payment"><span>' + payment + '</span></div>' : '') +
      '</div></div>' +
      '</a>' +
      '<div class="variants hide-on-mobile"><form class="list-variants" data-api-cart="1" data-id="' + escapeHtml(id) + '" data-variants=""><div class="flex add-cart"><input required="" type="number" value="1"><button class="action">Adicionar ao carrinho</button></div></form></div>' +
      '</div>' +
      '</li>';
  }

  function textFromNode(selector, root) {
    var node = (root || document).querySelector(selector);
    return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function firstDataLayerProduct() {
    var layer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    for (var i = 0; i < layer.length; i++) {
      if (layer[i] && (layer[i].pageCategory === 'Produto' || layer[i].idProduct || layer[i].nameProduct)) return layer[i];
    }
    return null;
  }

  function normalizeVisitedUrl(value) {
    var raw = String(value || '').trim() || window.location.pathname;
    try {
      var url = new URL(raw, window.location.href);
      return (url.pathname || '/').replace(/\/index\.html$/i, '').replace(/\/+$/g, '') || '/';
    } catch (_err) {
      return '/' + raw.replace(/^\/+/, '').replace(/\/index\.html$/i, '').replace(/\/+$/g, '');
    }
  }

  function currentProductForVisited() {
    var section = document.querySelector('.visited-section');
    if (!section) return null;

    var product = firstDataLayerProduct() || {};
    var name = String(product.nameProduct || textFromNode('.product-colum-right h1.product-name, h1.product-name, h1') || '').trim();
    if (!name) return null;

    var officialPriceReady = document.documentElement.classList.contains('t7-prices-ready');
    var priceCandidates = officialPriceReady
      ? [product.priceSell, product.price, window.T7_PRODUCT_PRICE, textFromNode('#variacaoPreco, [data-app="product.price"], .PrecoPrincipal')]
      : [window.T7_PRODUCT_PRICE || 0];
    var rawPrice = 0;
    for (var priceIndex = 0; priceIndex < priceCandidates.length; priceIndex++) {
      if (parseMoney(priceCandidates[priceIndex]) > 0) {
        rawPrice = priceCandidates[priceIndex];
        break;
      }
    }
    var price = parseMoney(rawPrice) > 0
      ? formatMoneyBRL(rawPrice)
      : (officialPriceReady ? textFromNode('.product-price, #produto_preco') : '') || 'Preco sob consulta';
    var installments = textFromNode('#info_preco, .produto-formas-pagamento .product-payment, .product-payment');
    var image = currentProductVisitedImage(product);

    return {
      name: name,
      price: price,
      installments: installments,
      image: image || '/_assets/tech7/product-placeholder.svg',
      url: normalizeVisitedUrl(window.location.pathname || product.urlProduct)
    };
  }

  function isProductPlaceholderImage(value) {
    var raw = String(value || '').trim();
    return !raw || /\/?_assets\/tech7\/product-placeholder\.svg(?:[?#].*)?$/i.test(raw);
  }

  function firstImageFromNode(selector, attrs) {
    var node = document.querySelector(selector);
    if (!node) return '';
    for (var i = 0; i < attrs.length; i++) {
      var candidate = localAssetImage(node.getAttribute(attrs[i]) || '');
      if (candidate && !isProductPlaceholderImage(candidate)) return candidate;
    }
    return '';
  }

  function currentProductVisitedImage(product) {
    var image = firstImageFromNode('meta[property="og:image"], meta[name="twitter:image"]', ['content']);
    if (image) return image;

    image = firstImageFromNode('.image-show img:not(.zoomImg), .product-colum-left img:not(.zoomImg)', ['src', 'data-src', 'data-lazy']);
    if (image) return image;

    return localAssetImage(product && product.urlImage || '');
  }

  function visitedProductLookupInfo(product) {
    var url = normalizeVisitedUrl(product && product.url);
    return {
      route: normalizeCardRoute(url),
      slug: slugFromCardRoute(url),
      title: normalizeCardText(product && product.name)
    };
  }

  function indexedProductImageByInfo(info) {
    if (!info || !cardSearchIndex) return '';
    var product = productFromCardInfo(info);
    if (product && product.image) return localAssetImage(product.image);
    var indexed = (info.route && cardSearchIndex.byRoute[info.route])
      || (info.slug && cardSearchIndex.bySlug && cardSearchIndex.bySlug[info.slug])
      || (info.title && cardSearchIndex.byTitle[info.title])
      || '';
    return localAssetImage(indexed);
  }

  function resolveVisitedProductImage(product) {
    var indexed = indexedProductImageByInfo(visitedProductLookupInfo(product));
    if (indexed && !isProductPlaceholderImage(indexed)) return indexed;

    var image = localAssetImage(product && product.image || '');
    if (image && !isProductPlaceholderImage(image)) return image;

    return '';
  }

  function readVisitedProducts() {
    try {
      var parsed = JSON.parse(localStorage.getItem('visitedProducts') || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (item) {
        return item && typeof item === 'object' && item.name && item.url;
      }).map(function (item) {
        return {
          name: String(item.name || ''),
          price: String(item.price || ''),
          installments: String(item.installments || ''),
          image: resolveVisitedProductImage(item) || '/_assets/tech7/product-placeholder.svg',
          url: normalizeVisitedUrl(item.url)
        };
      });
    } catch (_err) {
      try { localStorage.setItem('visitedProducts', '[]'); } catch (_ignored) {}
      return [];
    }
  }

  function persistVisitedProducts(products) {
    try { localStorage.setItem('visitedProducts', JSON.stringify(products)); } catch (_err) {}
  }

  function saveCurrentVisitedProduct(current) {
    if (!current || !current.url) return readVisitedProducts();
    var currentRoute = normalizeVisitedUrl(current.url);
    var next = readVisitedProducts().filter(function (item) {
      return normalizeVisitedUrl(item.url) !== currentRoute;
    });
    next.unshift(current);
    next = next.slice(0, 8);
    persistVisitedProducts(next);
    return next;
  }

  function visitedProductCard(product) {
    var url = normalizeVisitedUrl(product.url);
    var image = resolveVisitedProductImage(product) || '/_assets/tech7/product-placeholder.svg';
    var name = String(product.name || 'Produto TECH 7');
    var price = String(product.price || 'Preco sob consulta');
    var installments = String(product.installments || '');
    return '<div class="item swiper-slide">' +
      '<div class="product nb show-down" data-t7-unified-card="1">' +
      '<a class="info-product t7-unified-product-card" href="' + escapeHtml(url) + '">' +
      '<div class="image"><span class="space-image second">' +
      '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" class="swiper-lazy transform" data-src="' + escapeHtml(image) + '" width="450" height="450" loading="lazy">' +
      '</span></div>' +
      '<div class="product-name">' + escapeHtml(name) + '</div>' +
      '<div class="down-line"><div class="list-star flex justify-center"><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div><div class="icon"></div></div>' +
      '<div class="box-price"><div class="price"><div class="product-price"><span class="price-off"><span>' + escapeHtml(price) + '</span></span></div></div>' +
      (installments ? '<div class="product-payment"><span>' + escapeHtml(installments) + '</span></div>' : '') +
      '</div></div>' +
      '</a>' +
      '</div>' +
      '</div>';
  }

  function renderVisitedProducts() {
    var section = document.querySelector('.visited-section');
    if (!section) return;
    var target = section.querySelector('.list-append');
    if (!target) return;

    var current = currentProductForVisited();
    var currentRoute = current ? normalizeVisitedUrl(current.url) : normalizeVisitedUrl(window.location.pathname);
    var savedProducts = saveCurrentVisitedProduct(current);
    var imageChanged = false;
    savedProducts.forEach(function (item) {
      var resolved = resolveVisitedProductImage(item);
      if (resolved && item.image !== resolved) {
        item.image = resolved;
        imageChanged = true;
      }
    });
    if (imageChanged) persistVisitedProducts(savedProducts);

    var products = savedProducts.filter(function (item) {
      return normalizeVisitedUrl(item.url) !== currentRoute;
    }).slice(0, 8);

    if (!products.length) {
      target.innerHTML = '';
      section.style.setProperty('display', 'none', 'important');
      return;
    }

    section.style.removeProperty('display');
    target.innerHTML = '<div class="swiper-wrapper list-product">' + products.map(visitedProductCard).join('') + '</div>';
    syncVisitedProductCardSize();
    bindVisitedProductsCarousel();
  }

  function catalogListNode() {
    return document.querySelector('.catalog-content .showcase-catalog ul.list') ||
      document.querySelector('.showcase-catalog ul.list') ||
      document.querySelector('main ul.list.flex.f-wrap.row');
  }

  function decodeFilterValue(value) {
    return String(value || '').replace(/\+/g, ' ').trim();
  }

  function selectedCatalogBrand(form) {
    var currentBrand = currentCatalogBrandSegment();
    if (currentBrand) return currentBrand;

    var brandInput = form.querySelector('input[name="brands[]"]:checked, input.filter__input--brand:checked');
    if (brandInput) return knownBrandFilterSegment(decodeFilterValue(brandInput.value || brandInput.id)) || decodeFilterValue(brandInput.value || brandInput.id);

    var categoryInputs = Array.prototype.slice.call(form.querySelectorAll('input[name="categories[]"]:checked, input.filter__input--category:checked'));
    for (var i = 0; i < categoryInputs.length; i++) {
      var segment = knownBrandFilterSegment(decodeFilterValue(categoryInputs[i].value || categoryInputs[i].id));
      if (segment) return segment;
    }

    return '';
  }

  function selectedPriceRange(form) {
    var inputs = Array.prototype.slice.call(form.querySelectorAll('input[name="prices[]"]:checked, input.filter__input--price:checked'));
    var min = null;
    var max = null;
    inputs.forEach(function (input) {
      var value = String(input.value || input.id || '').replace(/\s+/g, '');
      var parts = value.split(',');
      if (parts.length < 2) parts = value.split('-');
      var nextMin = parseMoney(parts[0]);
      var nextMax = parseMoney(parts[1]);
      if (Number.isFinite(nextMin) && nextMin >= 0) min = min == null ? nextMin : Math.min(min, nextMin);
      if (Number.isFinite(nextMax) && nextMax >= 0) max = max == null ? nextMax : Math.max(max, nextMax);
    });
    return { min: min, max: max };
  }

  function normalizeFilterValue(value) {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '))
      .replace(/\s+/g, '')
      .replace(',', '.')
      .toLowerCase();
  }

  function filterEventInput(target) {
    if (!target || !target.closest) return null;
    return target.closest(
      'input[name="prices[]"], input.filter__input--price, ' +
      'input[name="brands[]"], input.filter__input--brand, ' +
      'input[name="categories[]"], input.filter__input--category'
    );
  }

  function hydrateBackendFilterState(form) {
    if (!form || form.getAttribute('data-t7-filter-state-hydrated') === '1') return;
    form.setAttribute('data-t7-filter-state-hydrated', '1');

    var query = new URLSearchParams(window.location.search || '');
    var priceValues = query.getAll('prices[]').concat(query.getAll('prices'));
    var minPrice = query.get('minPrice');
    var maxPrice = query.get('maxPrice');
    var normalizedPrices = priceValues.map(normalizeFilterValue);

    Array.prototype.slice.call(form.querySelectorAll('input[name="prices[]"], input.filter__input--price')).forEach(function (input) {
      var value = normalizeFilterValue(input.value || input.id || '');
      var matchesLegacy = normalizedPrices.indexOf(value) > -1;
      var matchesBackend = false;
      if (minPrice != null || maxPrice != null) {
        var parts = String(input.value || input.id || '').replace(/\s+/g, '').split(',');
        if (parts.length < 2) parts = String(input.value || input.id || '').replace(/\s+/g, '').split('-');
        var inputMin = parseMoney(parts[0]);
        var inputMax = parseMoney(parts[1]);
        matchesBackend = (minPrice == null || inputMin === parseMoney(minPrice))
          && (maxPrice == null || inputMax === parseMoney(maxPrice));
      }
      if (matchesLegacy || matchesBackend) input.checked = true;
    });

    var brand = query.get('brand');
    if (brand) {
      Array.prototype.slice.call(form.querySelectorAll('input[name="brands[]"], input.filter__input--brand, input[name="categories[]"], input.filter__input--category')).forEach(function (input) {
        var value = knownBrandFilterSegment(decodeFilterValue(input.value || input.id));
        if (value && value === knownBrandFilterSegment(brand)) input.checked = true;
      });
    }
  }

  function hasBackendFilterState(form) {
    var query = new URLSearchParams(window.location.search || '');
    return !!(query.get('minPrice') || query.get('maxPrice') || query.get('brand') || query.getAll('prices[]').length || query.getAll('prices').length)
      || !!form.querySelector('input[name="prices[]"]:checked, input.filter__input--price:checked, input[name="brands[]"]:checked, input.filter__input--brand:checked, input[name="categories[]"]:checked, input.filter__input--category:checked');
  }

  function ensureMobileCatalogFilterStyles() {
    if (document.getElementById('t7-mobile-catalog-filter-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-mobile-catalog-filter-styles';
    style.textContent = [
      '@media (max-width: 767px) {',
      '  body.t7-filter-open{overflow:hidden!important;touch-action:none!important;}',
      '  .page-catalog .sidebar-category{display:block!important;width:auto!important;margin:0!important;padding:0!important;}',
      '  .page-catalog .box-fixed{position:fixed!important;inset:0!important;z-index:2147483000!important;display:block!important;background:rgba(0,0,0,.48)!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:opacity .18s ease,visibility .18s ease!important;}',
      '  .page-catalog .box-fixed.active{opacity:1!important;visibility:visible!important;pointer-events:auto!important;}',
      '  .page-catalog .box-fixed .center{position:absolute!important;inset:0!important;display:flex!important;align-items:stretch!important;justify-content:flex-end!important;min-height:0!important;padding:0!important;}',
      '  .page-catalog .box-fixed .box-white{position:relative!important;width:min(92vw,420px)!important;min-width:min(92vw,420px)!important;max-width:min(92vw,420px)!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;padding:0!important;border-radius:16px 0 0 16px!important;background:#fff!important;box-shadow:-18px 0 45px rgba(0,0,0,.24)!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;transform:translateX(100%)!important;transition:transform .22s ease!important;}',
      '  .page-catalog .box-fixed.active .box-white{transform:translateX(0)!important;}',
      '  .page-catalog .box-fixed .close-modal{position:absolute!important;inset:0!important;display:block!important;background:transparent!important;}',
      '  .page-catalog .box-fixed .close-box{position:sticky!important;top:12px!important;left:calc(100% - 46px)!important;z-index:4!important;width:34px!important;height:34px!important;margin:12px 12px -46px auto!important;padding:9px!important;border-radius:999px!important;background:#111!important;fill:#fff!important;box-shadow:0 8px 18px rgba(0,0,0,.18)!important;}',
      '  .page-catalog .box-fixed .title{position:sticky!important;top:0!important;z-index:3!important;display:block!important;margin:0!important;padding:18px 58px 14px 20px!important;background:#fff!important;border-bottom:1px solid #eee!important;color:#111!important;font-size:16px!important;font-weight:900!important;line-height:1.2!important;letter-spacing:0!important;text-align:left!important;text-transform:uppercase!important;}',
      '  .page-catalog .sidebar-category form.smart-filter{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:10px 16px 88px!important;}',
      '  .page-catalog .filter__block:first-child{margin-top:0!important;}',
      '  .page-catalog .filter__block{margin:0!important;border-bottom:1px solid #eee!important;}',
      '  .page-catalog .filter__title{min-height:48px!important;margin:0!important;padding:14px 2px!important;border:0!important;color:#171717!important;font-size:15px!important;font-weight:800!important;line-height:1.25!important;}',
      '  .page-catalog .filter__title:not(.active){border-bottom:0!important;margin-bottom:0!important;}',
      '  .page-catalog .filter__title.active + .filter__list{height:0!important;max-height:0!important;padding:0!important;margin:0!important;overflow:hidden!important;}',
      '  .page-catalog .filter__list{display:flex!important;flex-wrap:wrap!important;gap:8px!important;max-height:none!important;margin:0!important;padding:0 0 14px!important;overflow:visible!important;}',
      '  .page-catalog .filter__item{position:relative!important;width:auto!important;min-width:0!important;max-width:100%!important;padding:0!important;margin:0!important;}',
      '  .page-catalog .filter__item:not(.box-color){flex:1 1 100%!important;}',
      '  .page-catalog .filter__input{position:absolute!important;inset:0!important;z-index:2!important;width:100%!important;height:100%!important;min-height:44px!important;margin:0!important;opacity:0!important;cursor:pointer!important;}',
      '  .page-catalog .filter__label{position:relative!important;z-index:1!important;display:flex!important;align-items:center!important;width:100%!important;min-height:44px!important;margin:0!important;padding:10px 12px!important;border:1px solid #e5e7eb!important;border-radius:8px!important;background:#fff!important;color:#171717!important;font-size:14px!important;line-height:1.25!important;cursor:pointer!important;}',
      '  .page-catalog .filter__label .check{flex:0 0 20px!important;width:20px!important;height:20px!important;margin:0 10px 0 0!important;border:2px solid #cfd4dc!important;border-radius:5px!important;background:#fff!important;}',
      '  .page-catalog .filter__input:checked + .filter__label{border-color:#ff6a00!important;background:#fff7ed!important;color:#111!important;box-shadow:0 0 0 3px rgba(255,106,0,.12)!important;}',
      '  .page-catalog .filter__input:checked + .filter__label .check{border-color:#ff6a00!important;background:#ff6a00!important;}',
      '  .page-catalog .filter__input:checked + .filter__label .check::before{background:#fff!important;opacity:1!important;width:8px!important;height:8px!important;border-radius:2px!important;}',
      '  .page-catalog .filter__label .filter__name{display:inline!important;min-width:0!important;margin:0!important;white-space:normal!important;overflow-wrap:anywhere!important;font-size:14px!important;font-weight:700!important;}',
      '  .page-catalog .filter__label .filter__text{display:inline!important;margin-left:auto!important;padding-left:8px!important;color:#777!important;font-size:12px!important;white-space:nowrap!important;}',
      '  .page-catalog .filter__item.box-color{flex:0 0 44px!important;width:44px!important;height:44px!important;margin:0!important;}',
      '  .page-catalog .filter__item.box-color .filter__label{width:44px!important;height:44px!important;min-height:44px!important;padding:3px!important;border-radius:9px!important;justify-content:center!important;}',
      '  .page-catalog .filter__item.box-color img{display:block!important;width:36px!important;height:36px!important;border-radius:7px!important;object-fit:cover!important;}',
      '  .page-catalog .filter__button{position:sticky!important;bottom:0!important;z-index:3!important;display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;max-width:100%!important;min-height:56px!important;margin:14px 0 0!important;box-sizing:border-box!important;border-radius:8px!important;background:#ff6a00!important;color:#fff!important;font-size:15px!important;font-weight:900!important;line-height:1.2!important;text-align:center!important;text-transform:uppercase!important;box-shadow:0 -12px 24px rgba(255,255,255,.92)!important;}',
      '  .page-catalog .button-filter{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:44px!important;padding:0 18px!important;border-radius:8px!important;background:#111!important;color:#fff!important;font-size:14px!important;font-weight:900!important;line-height:1!important;}',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function labelTextWithoutCount(label) {
    if (!label) return '';
    var clone = label.cloneNode(true);
    Array.prototype.slice.call(clone.querySelectorAll('.filter__text, img, .check')).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    return normalizeCardText(clone.textContent || '');
  }

  function normalizePriceFilterLabel(input, label) {
    if (!input || !label || labelTextWithoutCount(label)) return;
    var value = String(input.value || input.id || '').replace(/\s+/g, '');
    var parts = value.split(',');
    if (parts.length < 2) parts = value.split('-');
    var min = parseMoney(parts[0]);
    var max = parseMoney(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    var name = label.querySelector('.filter__name') || label;
    name.textContent = formatMoneyBRL(min) + ' a ' + formatMoneyBRL(max);
  }

  function normalizeMobileCatalogFilterControls() {
    if (!document.documentElement.classList.contains('page-catalog')) return;
    document.querySelectorAll('form.smart-filter .filter__item').forEach(function (item) {
      var input = item.querySelector('input.filter__input');
      var label = item.querySelector('label.filter__label');
      if (!input || !label) return;
      if (!input.id) input.id = 't7-filter-' + Math.random().toString(36).slice(2);
      if (label.getAttribute('for') !== input.id) label.setAttribute('for', input.id);
      if (input.matches('input[name="prices[]"], input.filter__input--price')) normalizePriceFilterLabel(input, label);
    });
  }

  function syncMobileCatalogFilterOpenState() {
    var active = !!document.querySelector('.page-catalog .box-fixed.active');
    document.body.classList.toggle('t7-filter-open', active);
  }

  function bindMobileCatalogFilterPanel() {
    if (!document.documentElement.classList.contains('page-catalog')) return;
    if (document.documentElement.getAttribute('data-t7-mobile-filter-bound') === '1') {
      syncMobileCatalogFilterOpenState();
      return;
    }
    document.documentElement.setAttribute('data-t7-mobile-filter-bound', '1');
    document.addEventListener('click', function (event) {
      if (event.target.closest('.button-filter, .box-fixed .close-modal, .box-fixed .close-box, .filter__button')) {
        window.setTimeout(syncMobileCatalogFilterOpenState, 30);
      }
    }, true);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') window.setTimeout(syncMobileCatalogFilterOpenState, 30);
    }, true);
    var observer = new MutationObserver(syncMobileCatalogFilterOpenState);
    document.querySelectorAll('.page-catalog .box-fixed').forEach(function (panel) {
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    });
    syncMobileCatalogFilterOpenState();
  }

  function scheduleBackendCatalogFilter(form) {
    if (!form) return;
    window.clearTimeout(form.__tech7BackendFilterTimer);
    form.__tech7BackendFilterTimer = window.setTimeout(function () {
      applyBackendCatalogFilter(form);
    }, 80);
  }

  function selectedCatalogSort(form) {
    var select = document.querySelector('.catalogo-form-filtros select[name="order"], .catalogo-form-filtros select[name="ordem"], .catalogo-form-filtros select.select') ||
      form.querySelector('select[name="order"], select[name="ordem"], select.select');
    var text = select ? String(select.value || select.options[select.selectedIndex] && select.options[select.selectedIndex].text || '') : '';
    var normalized = normalizeCardText(text).replace(/\s+/g, '-');
    if (normalized.indexOf('menor-preco') > -1) return 'price-asc';
    if (normalized.indexOf('maior-preco') > -1) return 'price-desc';
    if (normalized.indexOf('nome') > -1) return 'name-asc';
    return 'recent';
  }

  function updateCatalogUrlState(params) {
    if (!window.history || !window.history.replaceState) return;
    var next = new URL(window.location.href);
    ['brand', 'minPrice', 'maxPrice', 'sort'].forEach(function (key) { next.searchParams.delete(key); });
    if (params.brand) next.searchParams.set('brand', params.brand);
    if (params.minPrice != null) next.searchParams.set('minPrice', String(params.minPrice));
    if (params.maxPrice != null) next.searchParams.set('maxPrice', String(params.maxPrice));
    if (params.sort && params.sort !== 'recent') next.searchParams.set('sort', params.sort);
    window.history.replaceState(null, '', next.pathname + next.search + next.hash);
  }

  function renderBackendCatalog(items, state) {
    var list = catalogListNode();
    if (!list) return;
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<li class="item flex"><div class="product nb show-down"><a class="info-product"><div class="product-name">Nenhum produto encontrado para este filtro.</div></a></div></li>';
    } else {
      list.innerHTML = items.map(backendCatalogProductCard).join('');
    }
    list.setAttribute('data-t7-backend-filtered', '1');
    var pagination = document.querySelector('.catalog-footer.pagination, .pagination');
    if (pagination && state && state.filtered) pagination.style.display = 'none';
    ensureProductCardImagesVisible();
    if (window.Tech7Prices && typeof window.Tech7Prices.syncCatalog === 'function') {
      window.Tech7Prices.syncCatalog(list);
    }
  }

  function backendCatalogParams(form) {
    var section = currentCatalogSectionSegment();
    var brand = selectedCatalogBrand(form);
    var range = selectedPriceRange(form);
    var sort = selectedCatalogSort(form);
    return {
      category: section,
      brand: brand,
      minPrice: range.min,
      maxPrice: range.max,
      sort: sort
    };
  }

  function fetchBackendCatalog(params) {
    var query = new URLSearchParams();
    query.set('limit', '100');
    if (params.category) query.set('category', params.category);
    if (params.brand) query.set('brand', params.brand);
    if (params.minPrice != null) query.set('minPrice', String(params.minPrice));
    if (params.maxPrice != null) query.set('maxPrice', String(params.maxPrice));
    if (params.sort) query.set('sort', params.sort);
    return fetch('/api/products?' + query.toString(), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('products_' + response.status);
        return response.json();
      });
  }

  function applyBackendCatalogFilter(form) {
    var params = backendCatalogParams(form);
    var list = catalogListNode();
    if (list) {
      list.setAttribute('aria-busy', 'true');
      Array.prototype.slice.call(list.querySelectorAll('.product-price .price-off, .product-price')).forEach(function (node) {
        node.textContent = 'Preco sob consulta';
      });
    }
    return fetchBackendCatalog(params)
      .then(function (payload) {
        renderBackendCatalog(payload && payload.items || [], { filtered: true });
        updateCatalogUrlState(params);
      })
      .catch(function (err) {
        console.warn('tech7-local-runtime: falha ao filtrar pelo backend', err);
        if (list) {
          list.innerHTML = '<li class="item flex"><div class="product nb show-down"><a class="info-product"><div class="product-name">Nao foi possivel carregar os produtos do backend agora.</div><div class="down-line"><div class="box-price"><div class="price"><div class="product-price">Preco sob consulta</div></div></div></div></a></div></li>';
        }
      })
      .finally(function () {
        if (list) list.removeAttribute('aria-busy');
      });
  }

  function bindBackendCatalogFilters() {
    if (!document.documentElement.classList.contains('page-catalog')) return;
    document.querySelectorAll('form.smart-filter').forEach(function (form) {
      hydrateBackendFilterState(form);
      if (form.getAttribute('data-t7-backend-filter') === '1') return;
      form.setAttribute('data-t7-backend-filter', '1');
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        applyBackendCatalogFilter(form);
      });

      ['click', 'change', 'input'].forEach(function (eventName) {
        form.addEventListener(eventName, function (event) {
          var input = filterEventInput(event.target);
          if (!input || !form.contains(input)) return;

          event.stopImmediatePropagation();
          event.stopPropagation();
          if (eventName !== 'click' && event.cancelable) event.preventDefault();
          scheduleBackendCatalogFilter(form);
        }, true);
      });

      if (hasBackendFilterState(form)) {
        scheduleBackendCatalogFilter(form);
      }
    });
  }

  function ensureFallbackCatalogPage() {
    // Pages must resolve to existing static category pages or redirects.
    // Do not synthesize category/card markup in the browser.
  }

  function currentCatalogBrandSegment() {
    if (!document.documentElement.classList.contains('page-catalog')) return '';
    var parts = window.location.pathname
      .split(/[?#]/)[0]
      .split('/')
      .filter(Boolean);
    if (parts[parts.length - 1] === 'index.html') parts.pop();
    if (parts.length !== 2) return '';
    return normalizeCardText(parts[1]).replace(/\s+/g, '-');
  }

  function currentCatalogSectionSegment() {
    if (!document.documentElement.classList.contains('page-catalog')) return '';
    var parts = window.location.pathname
      .split(/[?#]/)[0]
      .split('/')
      .filter(Boolean);
    if (parts[parts.length - 1] === 'index.html') parts.pop();
    return parts[0] ? normalizeCardText(parts[0]).replace(/\s+/g, '-') : '';
  }

  function linkBrandSegment(href) {
    try {
      var url = new URL(href, window.location.href);
      var parts = url.pathname.split('/').filter(Boolean);
      if (parts[parts.length - 1] === 'index.html') parts.pop();
      if (parts.length !== 2) return '';
      return normalizeCardText(parts[1]).replace(/\s+/g, '-');
    } catch (_err) {
      return '';
    }
  }

  function knownBrandFilterSegment(value) {
    var segment = normalizeCardText(value).replace(/\s+/g, '-');
    var brands = {
      apple: true,
      samsung: true,
      motorola: true,
      lg: true,
      realme: true,
      'xiaomi-redmi': true,
      'xiaomi': true,
      'redmi': true,
      'outras': true
    };
    return brands[segment] ? segment : '';
  }

  function knownSectionFilterSegment(value) {
    var segment = normalizeCardText(value).replace(/\s+/g, '-');
    var sections = {
      bateria: true,
      baterias: true,
      'bateria-celular': true,
      'baterias-celular': true,
      display: true,
      'display-lcd': true,
      'display-e-lcd': true,
      'tela-display-lcd': true,
      'telas-display-lcd': true,
      peca: true,
      pecas: true,
      componente: true,
      componentes: true,
      'pecas-componentes': true,
      'pecas-e-componentes': true,
      tampa: true,
      tampas: true,
      carcaca: true,
      carcacas: true,
      'tampas-carcacas': true,
      'tampas-e-carcacas': true,
      'touch-e-visor': true,
      'touch-visor': true,
      touch: true,
      touchs: true,
      'touchs-e-visores': true,
      'touchs-visores': true,
      ferramenta: true,
      ferramentas: true,
      'maquinas-ferramentas': true,
      'maquinas-e-ferramentas': true
    };
    return sections[segment] ? segment : '';
  }

  function hideFilterItem(element) {
    if (!element || element.getAttribute('data-t7-current-brand-hidden') === '1') return;
    element.setAttribute('data-t7-current-brand-hidden', '1');
    element.style.setProperty('display', 'none', 'important');
    element.setAttribute('aria-hidden', 'true');
  }

  function hideEmptyFilterBlocks() {
    document.querySelectorAll('.filter__block--brands').forEach(function (block) {
      hideFilterItem(block);
    });

    document.querySelectorAll('.filter__block').forEach(function (block) {
      var items = Array.prototype.slice.call(block.querySelectorAll('.filter__item'));
      if (!items.length) return;
      var visibleItems = items.filter(function (item) {
        return item.getAttribute('data-t7-current-brand-hidden') !== '1'
          && window.getComputedStyle(item).display !== 'none';
      });
      if (!visibleItems.length) hideFilterItem(block);
    });
  }

  function normalizeCurrentBrandFilters() {
    var currentSection = currentCatalogSectionSegment();
    var currentBrand = currentCatalogBrandSegment();
    if (!currentSection && !currentBrand) return;

    var filterSelectors = [
      '.list-line-sub a[href]',
      '.list-nav a[href]',
      '.filter a[href]',
      '.filters a[href]',
      '.sidebar a[href]',
      '.side-bar a[href]',
      '.catalogo-form-filtros a[href]',
      '.smart-filter a[href]'
    ];

    if (currentBrand) {
      document.querySelectorAll(filterSelectors.join(', ')).forEach(function (link) {
        if (link.getAttribute('data-t7-current-brand-hidden') === '1') return;
        if (linkBrandSegment(link.getAttribute('href')) !== currentBrand) return;

        hideFilterItem(link.closest('li') || link);
      });

      document.querySelectorAll('input[name="brands[]"], input.filter__input--brand').forEach(function (input) {
        hideFilterItem(input.closest('.filter__item, li, label, div') || input);
      });
    }

    document.querySelectorAll('input[name="categories[]"], input.filter__input--category').forEach(function (input) {
      var value = input.value || input.id || '';
      var item = input.closest('.filter__item, li, label, div') || input;
      var labelText = item.innerText || input.getAttribute('aria-label') || '';
      if (knownSectionFilterSegment(value) || knownSectionFilterSegment(labelText.replace(/\([^)]*\)/g, ''))) {
        hideFilterItem(item);
        return;
      }
      if (!currentBrand || !knownBrandFilterSegment(value)) return;
      hideFilterItem(item);
    });

    hideEmptyFilterBlocks();
  }

  function revealProductGalleryImage(img) {
    if (!img) return;
    if (img.classList.contains('zoomImg')) {
      img.style.setProperty('display', 'none', 'important');
      img.style.setProperty('visibility', 'hidden', 'important');
      return;
    }

    var dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy') || '';
    var src = img.getAttribute('src') || '';
    if ((!src || src === 'undefined' || src === 'null') && dataSrc) {
      img.setAttribute('src', dataSrc);
    }

    var markVisible = function () {
      img.classList.add('swiper-lazy-loaded');
      img.classList.add('lazyloaded');
      img.classList.remove('swiper-lazy-loading');
      img.classList.remove('loading');
      if (window.getComputedStyle(img).opacity === '0') {
        img.style.setProperty('opacity', '1', 'important');
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      markVisible();
      return;
    }

    img.addEventListener('load', markVisible, { once: true });
  }

  function ensureProductImagesVisible() {
    var productRoot = document.querySelector('#product-container, .page-product .box-col-product, .box-col-product');
    if (!productRoot) return;

    productRoot.querySelectorAll('img.zoomImg, .zoomContainer, .zoomWindowContainer, .zoomWindow, .zoomLens').forEach(function (element) {
      element.style.setProperty('display', 'none', 'important');
      element.style.setProperty('visibility', 'hidden', 'important');
      element.style.setProperty('pointer-events', 'none', 'important');
    });

    var images = productRoot.querySelectorAll(
      '.product-colum-left .image-show img, ' +
      '.product-colum-left .nav-images img, ' +
      '.product-colum-left img.swiper-lazy, ' +
      '.product-colum-left img[data-src]'
    );

    images.forEach(revealProductGalleryImage);
  }

  var cardSearchIndex = null;
  var cardSearchIndexLoading = false;

  function normalizeCardRoute(value) {
    return String(value || '')
      .split(/[?#]/)[0]
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/\/index\.html$/i, '')
      .replace(/\/+$/g, '');
  }

  function normalizeCardText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeProductSegment(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function slugFromCardRoute(route) {
    var parts = String(route || '')
      .split('/')
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part && part !== '.' && part !== '..' && part.toLowerCase() !== 'index.html'; });
    return normalizeProductSegment(parts[parts.length - 1] || '');
  }

  function localAssetImage(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var assetIndex = raw.replace(/\\/g, '/').indexOf('_assets/');
    if (assetIndex > -1) return '/' + raw.replace(/\\/g, '/').slice(assetIndex).replace(/^\/+/, '');
    if (/^\/_assets\//i.test(raw)) return raw;
    if (/^_assets\//i.test(raw)) return '/' + raw.replace(/^\/+/, '');
    try {
      var url = new URL(raw, window.location.href);
      if (/images\.tcdn\.com\.br$/i.test(url.hostname)) {
        return '/_assets/images.tcdn.com.br' + url.pathname;
      }
      if (url.origin === window.location.origin) return url.pathname;
    } catch (_err) {
      if (/^_assets\//i.test(raw)) return '/' + raw.replace(/^\/+/, '');
    }
    return raw;
  }

  function cardInfoFromImage(img) {
    var card = img && img.closest && img.closest('.product, .product-card, .t7-product-card, .result-card');
    if (!card) return null;
    var href = '';
    var link = card.querySelector('a.space-image[href], a.info-product[href], a[href]');
    if (link) href = link.getAttribute('href') || '';
    var titleNode = card.querySelector('.product-name, .name, .title');
    var title = titleNode ? titleNode.textContent || '' : img.getAttribute('alt') || '';
    return {
      route: normalizeCardRoute(href),
      slug: slugFromCardRoute(href),
      title: normalizeCardText(title),
      card: card
    };
  }

  function cardInfoFromCard(card) {
    if (!card) return null;
    var href = '';
    var link = card.querySelector('a.space-image[href], a.info-product[href], a[href]');
    if (link) href = link.getAttribute('href') || '';
    var titleNode = card.querySelector('.product-name, .name, .title');
    var title = titleNode ? titleNode.textContent || '' : '';
    return {
      route: normalizeCardRoute(href),
      title: normalizeCardText(title),
      slug: slugFromCardRoute(href),
      card: card
    };
  }

  function catalogProductsByCardInfo(info) {
    var layer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    for (var i = 0; i < layer.length; i++) {
      var list = layer[i] && layer[i].listProducts;
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        var product = list[j];
        if (!product) continue;
        if (info.route && normalizeCardRoute(product.urlProduct) === info.route) return product;
        if (info.title && normalizeCardText(product.nameProduct) === info.title) return product;
      }
    }
    return null;
  }

  function buildCardSearchIndex(payload) {
    var index = { byRoute: {}, byTitle: {}, bySlug: {}, productsByRoute: {}, productsByTitle: {}, productsBySlug: {} };
    var items = payload && Array.isArray(payload.items) ? payload.items : [];
    items.forEach(function (item) {
      if (!item) return;
      var route = item.url ? normalizeCardRoute('/' + String(item.url).replace(/^\/+/, '')) : '';
      var title = item.title ? normalizeCardText(item.title) : '';
      var slug = normalizeProductSegment(item.slug);

      if (item.image) {
        if (route) index.byRoute[route] = item.image;
        if (title) index.byTitle[title] = item.image;
        if (slug && !index.bySlug[slug]) index.bySlug[slug] = item.image;
      }
      if (route) index.productsByRoute[route] = item;
      if (title) index.productsByTitle[title] = item;
      if (slug && !index.productsBySlug[slug]) index.productsBySlug[slug] = item;
    });
    return index;
  }

  function loadCardSearchIndex() {
    if (cardSearchIndex || cardSearchIndexLoading || !window.fetch) return;
    cardSearchIndexLoading = true;
    window.fetch('/_assets/tech7/search-index.json', { cache: 'force-cache' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) {
        cardSearchIndex = buildCardSearchIndex(payload);
        ensureProductCardLinks();
        ensureProductCardImagesVisible();
        renderVisitedProducts();
      })
      .catch(function () {
        cardSearchIndex = { byRoute: {}, byTitle: {}, bySlug: {}, productsByRoute: {}, productsByTitle: {}, productsBySlug: {} };
      })
      .finally(function () {
        cardSearchIndexLoading = false;
      });
  }

  function productFromCardInfo(info) {
    if (!info || !cardSearchIndex) return null;
    return (info.route && cardSearchIndex.productsByRoute[info.route])
      || (info.slug && cardSearchIndex.productsBySlug[info.slug])
      || (info.title && cardSearchIndex.productsByTitle[info.title])
      || null;
  }

  function canonicalProductHref(product, card) {
    var category = normalizeProductSegment(product && (product.categoria || product.category || product.section));
    var slug = normalizeProductSegment(product && product.slug);
    if (!category || !slug) {
      if (card && card.getAttribute('data-t7-link-warning') !== '1') {
        card.setAttribute('data-t7-link-warning', '1');
        console.warn('[Tech7LocalRuntime] Product card missing category or slug; href removed.', product || {});
      }
      return '';
    }
    return '/' + category + '/' + slug;
  }

  function directProductChild(parent, selector) {
    if (!parent) return null;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].matches(selector)) return parent.children[i];
    }
    return null;
  }

  function replaceImageOnlyLink(imageWrap) {
    if (!imageWrap) return '';
    var imageLink = directProductChild(imageWrap, 'a.space-image');
    if (!imageLink) return '';
    var href = imageLink.getAttribute('href') || '';
    var visual = document.createElement('span');
    visual.className = imageLink.className;
    Array.prototype.slice.call(imageLink.attributes).forEach(function (attr) {
      if (attr.name !== 'href' && attr.name !== 'target' && attr.name !== 'rel') visual.setAttribute(attr.name, attr.value);
    });
    while (imageLink.firstChild) visual.appendChild(imageLink.firstChild);
    imageLink.parentNode.replaceChild(visual, imageLink);
    return href;
  }

  function normalizeRelatedProductCards() {
    var cards = document.querySelectorAll('.product-related .product, .visited-section .product');
    cards.forEach(function (card) {
      if (!card) return;
      if (card.getAttribute('data-t7-unified-card') === '1') {
        if (card.querySelector(':scope > a.info-product.t7-unified-product-card')) return;
      }
      var infoLink = directProductChild(card, 'a.info-product');
      var imageWrap = directProductChild(card, '.image');
      if (!infoLink || !imageWrap) return;

      var imageHref = replaceImageOnlyLink(imageWrap);
      if (!infoLink.getAttribute('href') && imageHref) infoLink.setAttribute('href', imageHref);
      infoLink.classList.add('t7-unified-product-card');
      infoLink.setAttribute('data-t7-unified-card-link', '1');
      infoLink.insertBefore(imageWrap, infoLink.firstChild);
      card.setAttribute('data-t7-unified-card', '1');
    });
  }

  function removeRelatedInlinePurchaseControls() {
    document.querySelectorAll('.product-related .product').forEach(function (card) {
      card.querySelectorAll('.variants, .list-variants, form, select, input, button, .add-cart').forEach(function (node) {
        node.remove();
      });
    });
  }

  function ensureRelatedShowcaseCardStyles() {
    if (document.getElementById('t7-related-showcase-clean-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-related-showcase-clean-styles';
    style.textContent = [
      '.product-related{position:relative!important;z-index:1!important;isolation:isolate!important;overflow:visible!important;}',
      '.product-related .section-showcase,.product-related .showcase,.product-related .swiper-container{position:relative!important;overflow:visible!important;}',
      '.product-related .list-product,.product-related .swiper-wrapper{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))!important;gap:18px!important;align-items:stretch!important;transform:none!important;width:100%!important;height:auto!important;overflow:visible!important;padding:8px 0 18px!important;box-sizing:border-box!important;}',
      '.product-related .item,.product-related .swiper-slide{display:flex!important;width:auto!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:0!important;flex:initial!important;padding:0!important;margin:0!important;box-sizing:border-box!important;overflow:visible!important;}',
      '.product-related .product{position:relative!important;z-index:1!important;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:420px!important;max-width:none!important;overflow:hidden!important;box-sizing:border-box!important;background:#1a1a1a!important;color:#fff!important;border:1px solid #2a2a2a!important;border-radius:12px!important;box-shadow:0 4px 20px rgba(17,17,17,.06)!important;padding:12px!important;}',
      '.product-related .product:hover{z-index:2!important;}',
      '.product-related .product .variants,.product-related .product .list-variants,.product-related .product form,.product-related .product select,.product-related .product input,.product-related .product button,.product-related .product .add-cart{display:none!important;visibility:hidden!important;pointer-events:none!important;}',
      '.product-related .product .t7-unified-product-card{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:10px!important;width:100%!important;height:100%!important;min-height:0!important;background:#1a1a1a!important;color:inherit!important;text-decoration:none!important;overflow:hidden!important;position:relative!important;z-index:2!important;}',
      '.product-related .product .image{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;aspect-ratio:1/1!important;margin:0!important;padding:0!important;overflow:hidden!important;flex:0 0 auto!important;}',
      '.product-related .product .space-image{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;height:100%!important;max-width:none!important;margin:0!important;overflow:hidden!important;}',
      '.product-related .product .image img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;margin:0 auto!important;}',
      '.product-related .product .second-image{display:none!important;}',
      '.product-related .product .product-name{display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;min-height:44px!important;max-height:44px!important;overflow:hidden!important;margin:0!important;text-align:center!important;font-size:.9375rem!important;font-weight:600!important;line-height:1.35!important;color:#fff!important;}',
      '.product-related .product .down-line{display:flex!important;flex-direction:column!important;gap:8px!important;width:100%!important;margin-top:auto!important;text-align:center!important;overflow:hidden!important;}',
      '.product-related .product .box-price,.product-related .product .price,.product-related .product .product-price{width:100%!important;margin:0!important;text-align:center!important;}',
      '.product-related .product .product-price,.product-related .product .product-price p,.product-related .product .price-off{display:block!important;margin:0!important;color:var(--color_price,var(--tech-accent,#ff6a00))!important;font-weight:700!important;line-height:1.35!important;}',
      '.product-related .product .product-payment{display:block!important;min-height:34px!important;max-height:48px!important;overflow:hidden!important;margin:0!important;color:#aaa!important;font-size:.8125rem!important;line-height:1.25!important;text-align:center!important;}',
      '.product-related .prev.arrow-icon,.product-related .next.arrow-icon{display:none!important;}',
      '@media (max-width:767px){.product-related .list-product,.product-related .swiper-wrapper{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;}.product-related .product{min-height:330px!important;padding:10px!important;border-radius:10px!important;}.product-related .product .product-name{min-height:40px!important;max-height:40px!important;font-size:.8125rem!important;}.product-related .product .product-payment{font-size:.75rem!important;max-height:38px!important;}}',
      '@media (max-width:380px){.product-related .list-product,.product-related .swiper-wrapper{grid-template-columns:1fr!important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function bindUnifiedProductCardClicks() {
    if (document.documentElement.getAttribute('data-t7-unified-card-clicks') === '1') return;
    document.documentElement.setAttribute('data-t7-unified-card-clicks', '1');
    document.addEventListener('click', function (event) {
      var target = event.target;
      var card = target && target.closest ? target.closest('.product-related .product[data-t7-unified-card="1"], .visited-section .product[data-t7-unified-card="1"]') : null;
      if (!card) return;

      var interactive = target.closest('a,button,input,select,textarea,label,form,[role="button"]');
      if (interactive) return;

      var link = card.querySelector(':scope > a.info-product.t7-unified-product-card[href]');
      var href = link && link.getAttribute('href');
      if (!href) return;
      event.preventDefault();
      window.location.href = href;
    }, true);
  }

  function syncVisitedProductCardSize() {
    var visitedList = document.querySelector('.visited-section .list-append');
    if (!visitedList) return;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    var cardsPerView = viewportWidth <= 380 ? 1 : (viewportWidth <= 767 ? 2 : 4);
    var gap = viewportWidth <= 767 ? 12 : 18;
    var listWidth = Math.round(visitedList.getBoundingClientRect().width || visitedList.clientWidth || 0);
    if (!listWidth || listWidth < 120) {
      var relatedList = document.querySelector('.product-related .list-product, .product-related .swiper-wrapper');
      listWidth = relatedList ? Math.round(relatedList.getBoundingClientRect().width || relatedList.clientWidth || 0) : 0;
    }
    if (!listWidth || listWidth < 120) listWidth = Math.min(viewportWidth - 32, 1280);
    var width = Math.floor((listWidth - (gap * (cardsPerView - 1))) / cardsPerView);
    if (!width || width < 120) width = cardsPerView === 1 ? Math.max(240, listWidth) : 160;
    visitedList.style.setProperty('--t7-visited-card-width', width + 'px');
    visitedList.style.setProperty('--t7-visited-gap', gap + 'px');
    Array.prototype.slice.call(visitedList.querySelectorAll('.item, .swiper-slide')).forEach(function (item) {
      item.style.setProperty('width', width + 'px', 'important');
      item.style.setProperty('max-width', width + 'px', 'important');
      item.style.setProperty('flex', '0 0 ' + width + 'px', 'important');
    });
    updateVisitedCarouselArrows(visitedList.closest('.visited-section'));
  }

  function updateVisitedCarouselArrows(section) {
    if (!section) return;
    var list = section.querySelector('.list-append');
    var prev = section.querySelector('.prev.arrow-icon');
    var next = section.querySelector('.next.arrow-icon');
    if (!list || !prev || !next) return;
    var maxScroll = Math.max(0, list.scrollWidth - list.clientWidth - 2);
    var canScroll = maxScroll > 4;
    prev.style.setProperty('display', canScroll ? 'flex' : 'none', 'important');
    next.style.setProperty('display', canScroll ? 'flex' : 'none', 'important');
    prev.setAttribute('aria-disabled', String(!canScroll || list.scrollLeft <= 2));
    next.setAttribute('aria-disabled', String(!canScroll || list.scrollLeft >= maxScroll));
  }

  function bindVisitedProductsCarousel() {
    Array.prototype.slice.call(document.querySelectorAll('.visited-section')).forEach(function (section) {
      var list = section.querySelector('.list-append');
      var prev = section.querySelector('.prev.arrow-icon');
      var next = section.querySelector('.next.arrow-icon');
      if (!list || !prev || !next) return;

      prev.setAttribute('role', 'button');
      prev.setAttribute('tabindex', '0');
      prev.setAttribute('aria-label', 'Produtos visitados anteriores');
      next.setAttribute('role', 'button');
      next.setAttribute('tabindex', '0');
      next.setAttribute('aria-label', 'Proximos produtos visitados');

      if (section.getAttribute('data-t7-visited-carousel') === '1') {
        updateVisitedCarouselArrows(section);
        return;
      }
      section.setAttribute('data-t7-visited-carousel', '1');

      function move(direction) {
        var amount = Math.max(160, list.clientWidth || 0);
        list.scrollBy({ left: direction * amount, behavior: 'smooth' });
        window.setTimeout(function () { updateVisitedCarouselArrows(section); }, 320);
      }

      prev.addEventListener('click', function (event) {
        event.preventDefault();
        move(-1);
      });
      next.addEventListener('click', function (event) {
        event.preventDefault();
        move(1);
      });
      [prev, next].forEach(function (control) {
        control.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          move(control === prev ? -1 : 1);
        });
      });
      list.addEventListener('scroll', function () {
        window.requestAnimationFrame(function () { updateVisitedCarouselArrows(section); });
      }, { passive: true });
      updateVisitedCarouselArrows(section);
    });
  }

  function ensureProductCardLinks() {
    if (!cardSearchIndex) {
      loadCardSearchIndex();
      normalizeRelatedProductCards();
      return;
    }

    var cards = document.querySelectorAll('.product, .product-card, .t7-product-card, .result-card');
    cards.forEach(function (card) {
      if (!card || card.closest('#product-container')) return;
      var info = cardInfoFromCard(card);
      var product = productFromCardInfo(info);
      if (!product) return;

      var href = canonicalProductHref(product, card);
      var links = card.querySelectorAll('a.space-image, a.info-product, a.t7-unified-product-card');
      links.forEach(function (link) {
        if (href) {
          if (link.getAttribute('href') !== href) link.setAttribute('href', href);
        } else {
          link.removeAttribute('href');
        }
      });
    });
    normalizeRelatedProductCards();
  }

  function cardImageCandidate(img) {
    var info = cardInfoFromImage(img);
    if (!info) return '';

    if (cardSearchIndex) {
      var indexed = (info.route && cardSearchIndex.byRoute[info.route])
        || (info.slug && cardSearchIndex.bySlug && cardSearchIndex.bySlug[info.slug])
        || (info.title && cardSearchIndex.byTitle[info.title])
        || '';
      if (indexed) return localAssetImage(indexed);
    } else {
      loadCardSearchIndex();
    }

    var product = catalogProductsByCardInfo(info);
    return product && product.urlImage ? localAssetImage(product.urlImage) : '';
  }

  function ensureProductCardImagesVisible() {
    var placeholder = '/_assets/tech7/product-placeholder.svg';
    var images = document.querySelectorAll(
      '.product .image img, ' +
      '.product .space-image img, ' +
      '.product-card img, ' +
      '.t7-product-card img, ' +
      '.showcase .product img, ' +
      '.result-card .pic img'
    );

    images.forEach(function (img) {
      if (!img || img.closest('#product-container')) return;

      var src = img.getAttribute('src') || '';
      var dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy') || '';
      var nextSrc = src && src !== 'undefined' && src !== 'null' ? src : dataSrc;
      var failedSrc = img.getAttribute('data-t7-card-image-failed') || '';

      if (nextSrc && /^_assets\//i.test(nextSrc)) {
        nextSrc = '/' + nextSrc.replace(/^\/+/, '');
      }

      if (!nextSrc || nextSrc === placeholder || nextSrc === 'undefined' || nextSrc === 'null') {
        var candidate = cardImageCandidate(img);
        if (candidate && candidate !== failedSrc) {
          nextSrc = candidate;
        }
      }

      if (!nextSrc || nextSrc === 'undefined' || nextSrc === 'null') {
        nextSrc = placeholder;
      }

      if (img.getAttribute('src') !== nextSrc) {
        img.setAttribute('src', nextSrc);
        img.setAttribute('data-src', nextSrc);
      }

      var markVisible = function () {
        img.classList.add('lazyloaded');
        img.classList.remove('loading');
        img.style.setProperty('opacity', '1', 'important');
      };

      if (img.getAttribute('data-t7-card-image-fallback') !== '1') {
        img.setAttribute('data-t7-card-image-fallback', '1');
        img.addEventListener('error', function () {
          img.setAttribute('data-t7-card-image-failed', img.getAttribute('src') || '');
          var candidate = cardImageCandidate(img);
          if (candidate && candidate !== img.getAttribute('data-t7-card-image-failed')) {
            img.setAttribute('src', candidate);
            img.setAttribute('data-src', candidate);
          } else if (img.getAttribute('src') !== placeholder) {
            img.setAttribute('src', placeholder);
            img.setAttribute('data-src', placeholder);
          }
          markVisible();
        });
        img.addEventListener('load', markVisible);
      }

      if (img.complete && img.naturalWidth > 0) {
        markVisible();
      } else if (img.complete && img.naturalWidth === 0) {
        var candidate = cardImageCandidate(img);
        img.setAttribute('src', candidate || placeholder);
        img.setAttribute('data-src', candidate || placeholder);
        markVisible();
      }
    });
  }

  function activeGalleryImage(productRoot) {
    return productRoot.querySelector('.image-show .swiper-slide-active .zoom > img:not(.zoomImg)') ||
      productRoot.querySelector('.image-show .swiper-slide-active img.swiper-lazy:not(.zoomImg)');
  }

  function galleryImageSrc(img) {
    if (!img) return '';
    return img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.currentSrc || '';
  }

  function normalizeGalleryImageKey(src) {
    var file = String(src || '')
      .replace(/^https?:\/\/[^/]+/i, '')
      .split('?')[0]
      .split('#')[0]
      .split('/')
      .pop()
      .toLowerCase();

    if (!file) return '';

    var base = file.replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '');
    base = base.replace(/^\d{2,4}_/, '');
    base = base.replace(/-[a-f0-9]{6,}$/i, '');
    base = base.replace(/_[a-f0-9]{16,}$/i, '');
    base = base.replace(/(_\d+)(?:_[a-z0-9]{2,}|_[0-9]{3,4})$/i, '$1');
    base = base.replace(/_variac$/i, '_variacao');
    return base;
  }

  function galleryImageSize(src) {
    var file = String(src || '').split('?')[0].split('#')[0].split('/').pop() || '';
    var match = file.match(/^(\d{2,4})_/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function gallerySlideImage(slide) {
    return slide && (slide.querySelector('.zoom > img:not(.zoomImg)') || slide.querySelector('img:not(.zoomImg)') || slide.querySelector('img'));
  }

  function gallerySlideScore(item, mode) {
    var size = item.size || 0;
    if (mode === 'main') {
      return size ? 1000 + size : 10000;
    }
    if (size === 90) return 10000;
    if (size === 180) return 9000;
    if (size) return 8000 - size;
    return 1000;
  }

  function galleryProductTokens() {
    var pathParts = String(window.location.pathname || '').split('/').filter(Boolean);
    var slug = (pathParts[pathParts.length - 1] || '').toLowerCase();
    var title = String((document.querySelector('h1') || {}).textContent || '').toLowerCase();
    var source = slug || title;
    if (!source) return [];

    var stop = {
      tela: true, display: true, lcd: true, oled: true, frontal: true, bateria: true, battery: true,
      samsung: true, apple: true, iphone: false, ipad: false, xiaomi: true, redmi: true, motorola: true,
      moto: false, realme: true, lg: true, asus: true, original: true, retirada: true, nacional: true,
      amazon: true, vip: true, sem: true, com: true, aro: true, borda: true, fina: true, incell: true,
      flex: true, conector: true, carga: true, placa: true, peca: true, pecas: true, componentes: true,
      touch: true, visor: true, vidro: true, traseira: true, tampa: true, carcaca: true, carcaça: true,
      troca: true, chip: true, ci: true, jk: true, pro: false, plus: false, ultra: false, max: false,
      power: false, edge: false, note: false, tab: false, core: false, lite: false, fe: false
    };

    var tokens = source
      .normalize ? source.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : source;
    tokens = tokens
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(function (token) {
        if (!token || stop[token]) return false;
        if (/^\d$/.test(token)) return false;
        return /[0-9]/.test(token) || token.length >= 3;
      });

    var unique = [];
    tokens.forEach(function (token) {
      if (unique.indexOf(token) === -1) unique.push(token);
    });
    return unique;
  }

  function galleryImageTokenScore(src, tokens) {
    var key = normalizeGalleryImageKey(src).replace(/[^a-z0-9]+/g, ' ');
    if (!key || !tokens.length) return 0;
    var padded = ' ' + key + ' ';
    var score = 0;
    tokens.forEach(function (token) {
      if (padded.indexOf(' ' + token + ' ') !== -1 || key.indexOf(token) !== -1) score += 1;
    });
    return score;
  }

  function galleryProductKind() {
    var path = String(window.location.pathname || '').toLowerCase();
    var title = String((document.querySelector('h1') || {}).textContent || '').toLowerCase();
    var source = path + ' ' + title;
    if (/\/(?:display|display-e-lcd|tela-display-lcd|telas-display-lcd)\//.test(path) || /\b(?:tela|display|lcd|oled|frontal)\b/.test(title)) return 'display';
    if (/\/(?:baterias|baterias-celular|bateria|bateria-celular)\//.test(path) || /\b(?:bateria|battery)\b/.test(title)) return 'battery';
    if (/\/(?:tampas|tampas-e-carcacas|tampas-carcacas|carcacas)\//.test(path) || /\b(?:tampa|traseira|carcaca|carcaça|back cover)\b/.test(title)) return 'cover';
    if (/\/(?:pecas|pecas-e-componentes|pecas-componentes|componentes)\//.test(path) || /\b(?:flex|placa|conector|campainha|alto falante|camera|câmera|sensor|lente|mainboard|nfc|sim card|gaveta)\b/.test(source)) return 'part';
    return '';
  }

  function galleryImageKindMatches(src, kind) {
    var key = ' ' + normalizeGalleryImageKey(src).replace(/[^a-z0-9]+/g, ' ') + ' ';
    if (!kind || !key.trim()) return false;

    var hasDisplay = /\b(?:tela|display|lcd|oled|frontal)\b/.test(key);
    var hasBattery = /\b(?:bateria|battery|bs\d+|eb\d+|bm\d+)\b/.test(key);
    var hasCover = /\b(?:tampa|traseira|carcaca|back cover)\b/.test(key);
    var hasPart = /\b(?:flex|placa|conector|campainha|alto falante|camera|sensor|lente|mainboard|nfc|sim card|gaveta|pcb)\b/.test(key);

    if (kind === 'display') return hasDisplay && !hasBattery && !hasCover && !hasPart;
    if (kind === 'battery') return hasBattery && !hasDisplay && !hasCover && !hasPart;
    if (kind === 'cover') return hasCover && !hasDisplay && !hasBattery && !hasPart;
    if (kind === 'part') return hasPart && !hasDisplay && !hasBattery && !hasCover;
    return false;
  }

  function filterWrongKindGallerySlides(productRoot, selector) {
    var kind = galleryProductKind();
    if (!kind) return false;

    var slides = Array.prototype.slice.call(productRoot.querySelectorAll(selector));
    if (slides.length < 2) return false;

    var rows = slides.map(function (slide) {
      var img = gallerySlideImage(slide);
      var src = galleryImageSrc(img);
      return {
        slide: slide,
        src: src,
        matches: galleryImageKindMatches(src, kind)
      };
    }).filter(function (row) { return row.src; });

    var matching = rows.filter(function (row) { return row.matches; });
    if (!matching.length || matching.length === rows.length) return false;

    var removed = false;
    rows.forEach(function (row) {
      if (row.matches) return;
      if (row.slide && row.slide.parentNode) {
        row.slide.parentNode.removeChild(row.slide);
        removed = true;
      }
    });
    return removed;
  }

  function filterMismatchedGallerySlides(productRoot, selector) {
    var tokens = galleryProductTokens();
    if (tokens.length < 2) return false;

    var slides = Array.prototype.slice.call(productRoot.querySelectorAll(selector));
    if (slides.length < 2) return false;

    var required = Math.min(2, tokens.length);
    var rows = slides.map(function (slide, order) {
      var img = gallerySlideImage(slide);
      var src = galleryImageSrc(img);
      return {
        slide: slide,
        src: src,
        order: order,
        score: galleryImageTokenScore(src, tokens)
      };
    }).filter(function (row) { return row.src; });

    var matching = rows.filter(function (row) { return row.score >= required; });
    if (!matching.length || matching.length === rows.length) return false;

    var removed = false;
    rows.forEach(function (row) {
      if (row.score >= required) return;
      if (row.slide && row.slide.parentNode) {
        row.slide.parentNode.removeChild(row.slide);
        removed = true;
      }
    });
    return removed;
  }

  function shouldDedupeGalleryGroup(items) {
    if (items.length < 2) return false;
    var sizes = {};
    var hasSized = false;
    var hasFull = false;
    var srcs = {};

    items.forEach(function (item) {
      if (item.size) {
        hasSized = true;
        sizes[item.size] = true;
      } else {
        hasFull = true;
      }
      if (item.src) srcs[item.src] = true;
    });

    return items.length > 1 ||
      Object.keys(srcs).length < items.length ||
      (hasFull && hasSized) ||
      Object.keys(sizes).length > 1;
  }

  function dedupeGallerySlides(productRoot, selector, mode) {
    var slides = Array.prototype.slice.call(productRoot.querySelectorAll(selector));
    var groups = {};
    var removed = false;

    slides.forEach(function (slide, order) {
      var img = gallerySlideImage(slide);
      var src = galleryImageSrc(img);
      var key = normalizeGalleryImageKey(src);
      if (!key) return;

      if (!groups[key]) groups[key] = [];
      groups[key].push({
        slide: slide,
        src: src,
        size: galleryImageSize(src),
        order: order
      });
    });

    Object.keys(groups).forEach(function (key) {
      var items = groups[key];
      if (!shouldDedupeGalleryGroup(items)) return;

      items.sort(function (a, b) {
        var scoreDiff = gallerySlideScore(b, mode) - gallerySlideScore(a, mode);
        return scoreDiff || a.order - b.order;
      });

      items.slice(1).forEach(function (item) {
        if (item.slide && item.slide.parentNode) {
          item.slide.parentNode.removeChild(item.slide);
          removed = true;
        }
      });
    });

    return removed;
  }

  function reindexGallerySlides(productRoot) {
    ['.nav-images .swiper-slide', '.image-show .swiper-slide'].forEach(function (selector) {
      Array.prototype.slice.call(productRoot.querySelectorAll(selector)).forEach(function (slide, index) {
        var nextIndex = String(index + 1);
        slide.setAttribute('data-index', nextIndex);
        var box = slide.querySelector('.box-img');
        if (box) box.setAttribute('data-index', nextIndex);
      });
    });
  }

  function updateGallerySwiper(list) {
    var swiper = list && list.swiper;
    if (swiper && typeof swiper.update === 'function') {
      swiper.update();
    }
  }

  function syncGalleryThumbsToMain(productRoot) {
    var navSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide'));
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
    if (!navSlides.length || !mainSlides.length || navSlides.length <= mainSlides.length) return false;

    var removed = false;
    navSlides.slice(mainSlides.length).forEach(function (slide) {
      if (slide && slide.parentNode) {
        slide.parentNode.removeChild(slide);
        removed = true;
      }
    });
    return removed;
  }

  function alignMainGalleryToThumbs(productRoot) {
    var navWrapper = productRoot.querySelector('.nav-images .swiper-wrapper');
    var mainWrapper = productRoot.querySelector('.image-show .swiper-wrapper');
    if (!navWrapper || !mainWrapper) return false;

    var navSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide'));
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
    if (navSlides.length < 2 || mainSlides.length < 2) return false;

    var mainByKey = {};
    mainSlides.forEach(function (slide) {
      var key = normalizeGalleryImageKey(galleryImageSrc(gallerySlideImage(slide)));
      if (!key) return;
      if (!mainByKey[key]) mainByKey[key] = [];
      mainByKey[key].push(slide);
    });

    var ordered = [];
    var used = [];
    navSlides.forEach(function (slide) {
      var key = normalizeGalleryImageKey(galleryImageSrc(gallerySlideImage(slide)));
      var match = key && mainByKey[key] && mainByKey[key].shift();
      if (match && used.indexOf(match) === -1) {
        ordered.push(match);
        used.push(match);
      }
    });

    mainSlides.forEach(function (slide) {
      if (used.indexOf(slide) === -1) ordered.push(slide);
    });

    var changed = ordered.some(function (slide, index) {
      return mainSlides[index] !== slide;
    });
    if (!changed) return false;

    ordered.forEach(function (slide) {
      mainWrapper.appendChild(slide);
    });
    return true;
  }

  function dedupeProductGallery(productRoot) {
    var navList = productRoot.querySelector('.nav-images .list');
    var mainList = productRoot.querySelector('.image-show .list');
    if (!navList || !mainList) return;

    var signature = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide img, .image-show .swiper-slide img:not(.zoomImg)'))
      .map(function (img) { return galleryImageSrc(img); })
      .join('|');
    if (!signature || productRoot.getAttribute('data-t7-gallery-dedupe-signature') === signature) return;

    var removed = filterWrongKindGallerySlides(productRoot, '.nav-images .swiper-slide');
    removed = filterWrongKindGallerySlides(productRoot, '.image-show .swiper-slide') || removed;
    removed = filterMismatchedGallerySlides(productRoot, '.nav-images .swiper-slide') || removed;
    removed = filterMismatchedGallerySlides(productRoot, '.image-show .swiper-slide') || removed;
    removed = dedupeGallerySlides(productRoot, '.nav-images .swiper-slide', 'nav') || removed;
    removed = dedupeGallerySlides(productRoot, '.image-show .swiper-slide', 'main') || removed;
    removed = syncGalleryThumbsToMain(productRoot) || removed;
    removed = alignMainGalleryToThumbs(productRoot) || removed;

    if (!removed) {
      productRoot.setAttribute('data-t7-gallery-dedupe-signature', signature);
      return;
    }

    reindexGallerySlides(productRoot);
    updateGallerySwiper(navList);
    updateGallerySwiper(mainList);

    Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide, .image-show .swiper-slide, .nav-images .box-img, .image-show .box-img')).forEach(function (item) {
      item.classList.remove('active', 'swiper-slide-active', 'swiper-slide-prev', 'swiper-slide-next');
    });

    var firstNavSlide = productRoot.querySelector('.nav-images .swiper-slide');
    var firstNavBox = productRoot.querySelector('.nav-images .box-img');
    var firstMainSlide = productRoot.querySelector('.image-show .swiper-slide');
    var firstMainBox = productRoot.querySelector('.image-show .box-img');

    if (firstNavSlide) firstNavSlide.classList.add('swiper-slide-active', 'active');
    if (firstNavBox) firstNavBox.classList.add('active');
    if (firstMainSlide) firstMainSlide.classList.add('swiper-slide-active', 'active');
    if (firstMainBox) firstMainBox.classList.add('active');

    productRoot.setAttribute('data-t7-gallery-index', '0');
    productRoot.setAttribute('data-t7-gallery-dedupe-signature', Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide img, .image-show .swiper-slide img:not(.zoomImg)'))
      .map(function (img) { return galleryImageSrc(img); })
      .join('|'));
  }

  function normalizeProductGalleryLayout(productRoot) {
    dedupeProductGallery(productRoot);

    var navList = productRoot.querySelector('.nav-images .list');
    var navWrapper = productRoot.querySelector('.nav-images .swiper-wrapper');
    var navSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide'));
    var mainList = productRoot.querySelector('.image-show .list');
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));

    if (navList && navWrapper && navSlides.length > 1) {
      navList.style.setProperty('height', '575px', 'important');
      navList.style.setProperty('max-height', '575px', 'important');
      navList.style.setProperty('overflow', 'hidden', 'important');
      navWrapper.style.setProperty('display', 'flex', 'important');
      navWrapper.style.setProperty('flex-direction', 'column', 'important');
      navWrapper.style.setProperty('align-items', 'stretch', 'important');

      navSlides.forEach(function (slide) {
        slide.style.setProperty('height', '100px', 'important');
        slide.style.setProperty('margin-bottom', '15px', 'important');
        slide.style.setProperty('width', '100%', 'important');
        slide.style.setProperty('flex-shrink', '0', 'important');
      });

      if (!productRoot.querySelector('.nav-images .swiper-slide-active')) {
        navSlides[0].classList.add('swiper-slide-active', 'active');
      }
    }

    if (mainList && mainSlides.length > 1 && !mainList.swiper) {
      var width = Math.round(mainList.getBoundingClientRect().width);
      if (width > 0) {
        mainSlides.forEach(function (slide) {
          slide.style.setProperty('width', width + 'px', 'important');
          slide.style.setProperty('flex-shrink', '0', 'important');
        });
      }

      if (!productRoot.querySelector('.image-show .swiper-slide-active')) {
        mainSlides[0].classList.add('swiper-slide-active', 'active');
      }
    }

    if (mainList) {
      mainList.style.setProperty('overflow', 'hidden', 'important');
    }

    Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide, .image-show .box-img, .image-show .zoom')).forEach(function (node) {
      node.style.setProperty('height', '100%', 'important');
      node.style.setProperty('min-height', '0', 'important');
      node.style.setProperty('display', 'flex', 'important');
      node.style.setProperty('align-items', 'center', 'important');
      node.style.setProperty('justify-content', 'center', 'important');
    });

    Array.prototype.slice.call(productRoot.querySelectorAll('.image-show img:not(.zoomImg)')).forEach(function (img) {
      img.style.setProperty('width', 'auto', 'important');
      img.style.setProperty('height', 'auto', 'important');
      img.style.setProperty('max-width', '100%', 'important');
      img.style.setProperty('max-height', '100%', 'important');
      img.style.setProperty('object-fit', 'contain', 'important');
    });

    if (mainList && window.matchMedia && !window.matchMedia('(max-width: 767px)').matches) {
      var desktopGalleryHeight = Math.round(mainList.getBoundingClientRect().height);
      if (desktopGalleryHeight > 0) {
        Array.prototype.slice.call(productRoot.querySelectorAll('.image-show img:not(.zoomImg)')).forEach(function (img) {
          img.style.setProperty('max-height', desktopGalleryHeight + 'px', 'important');
        });
      }
    }

    if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
      if (navList && navWrapper && navSlides.length > 1) {
        navList.style.setProperty('height', '82px', 'important');
        navList.style.setProperty('max-height', '82px', 'important');
        navList.style.setProperty('overflow-x', 'auto', 'important');
        navList.style.setProperty('overflow-y', 'hidden', 'important');
        navWrapper.style.setProperty('display', 'flex', 'important');
        navWrapper.style.setProperty('flex-direction', 'row', 'important');
        navWrapper.style.setProperty('align-items', 'stretch', 'important');

        navSlides.forEach(function (slide) {
          slide.style.setProperty('width', '72px', 'important');
          slide.style.setProperty('height', '72px', 'important');
          slide.style.setProperty('margin-right', '8px', 'important');
          slide.style.setProperty('margin-bottom', '0', 'important');
          slide.style.setProperty('flex', '0 0 72px', 'important');
        });
      }

      if (mainList) {
        mainList.style.setProperty('height', 'min(calc(100vw - 22px), 380px)', 'important');
        mainList.style.setProperty('max-height', '380px', 'important');
        mainList.style.setProperty('overflow', 'hidden', 'important');
      }

      Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide, .image-show .box-img, .image-show .zoom')).forEach(function (node) {
        node.style.setProperty('height', '100%', 'important');
        node.style.setProperty('min-height', '0', 'important');
        node.style.setProperty('max-height', '380px', 'important');
        node.style.setProperty('display', 'flex', 'important');
        node.style.setProperty('align-items', 'center', 'important');
        node.style.setProperty('justify-content', 'center', 'important');
      });

      Array.prototype.slice.call(productRoot.querySelectorAll('.image-show img:not(.zoomImg)')).forEach(function (img) {
        img.style.setProperty('width', 'auto', 'important');
        img.style.setProperty('height', 'auto', 'important');
        img.style.setProperty('max-width', '100%', 'important');
        img.style.setProperty('max-height', '380px', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
      });
    }
  }

  function forceGalleryMainPosition(productRoot, target) {
    var mainList = productRoot.querySelector('.image-show .list');
    var mainWrapper = productRoot.querySelector('.image-show .swiper-wrapper');
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
    if (!mainWrapper || !mainList || !mainSlides.length) return;

    var width = Math.round(mainList.getBoundingClientRect().width || (mainSlides[0] && mainSlides[0].getBoundingClientRect().width) || 0);
    if (width > 0) {
      if (isMobileGalleryViewport()) {
        mainWrapper.style.setProperty('width', (width * mainSlides.length) + 'px', 'important');
        mainWrapper.style.setProperty('display', 'flex', 'important');
        mainWrapper.style.setProperty('flex-wrap', 'nowrap', 'important');
        mainWrapper.style.setProperty('align-items', 'stretch', 'important');
        mainWrapper.style.setProperty('height', '100%', 'important');
        mainSlides.forEach(function (slide) {
          slide.style.setProperty('width', width + 'px', 'important');
          slide.style.setProperty('min-width', width + 'px', 'important');
          slide.style.setProperty('max-width', width + 'px', 'important');
          slide.style.setProperty('flex', '0 0 ' + width + 'px', 'important');
          slide.style.setProperty('height', '100%', 'important');
          slide.style.setProperty('overflow', 'hidden', 'important');
        });
      }
      mainWrapper.style.setProperty('transform', 'translate3d(' + (-target * width) + 'px, 0px, 0px)', 'important');
      mainWrapper.style.setProperty('transition-duration', '250ms', 'important');
    }

    mainSlides.forEach(function (slide, slideIndex) {
      slide.classList.toggle('active', slideIndex === target);
      slide.classList.toggle('swiper-slide-active', slideIndex === target);
      slide.classList.toggle('swiper-slide-prev', slideIndex === target - 1);
      slide.classList.toggle('swiper-slide-next', slideIndex === target + 1);
      var box = slide.querySelector('.box-img');
      if (box) box.classList.toggle('active', slideIndex === target);
    });
  }

  function applyGalleryThumbAccent(productRoot) {
    Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .box-img')).forEach(function (box) {
      var active = box.classList.contains('active') || (box.parentElement && box.parentElement.classList.contains('swiper-slide-active'));
      box.style.setProperty('border-color', '#ff6a00', 'important');
      box.style.setProperty('border-width', '2px', 'important');
      box.style.setProperty('border-style', 'solid', 'important');
      box.style.setProperty('border-radius', '8px', 'important');
      if (active) {
        box.style.setProperty('box-shadow', '0 0 0 4px rgba(255, 106, 0, 0.16), 0 8px 22px rgba(255, 106, 0, 0.16)', 'important');
        box.style.setProperty('transform', 'translateY(-1px)', 'important');
      } else {
        box.style.removeProperty('box-shadow');
        box.style.removeProperty('transform');
      }
    });
  }

  function updateGalleryArrowState(productRoot) {
    var mainList = productRoot.querySelector('.image-show .list');
    var mainSwiper = mainList && mainList.swiper;
    var mainSlides = productRoot.querySelectorAll('.image-show .swiper-slide');
    var prev = productRoot.querySelector('.nav-images .controls .prev');
    var next = productRoot.querySelector('.nav-images .controls .next');
    if (!prev || !next) return;

    if (!isMobileGalleryViewport()) {
      var controls = productRoot.querySelector('.nav-images .controls');
      if (controls) {
        controls.style.setProperty('position', 'absolute', 'important');
        controls.style.setProperty('inset', '0', 'important');
        controls.style.setProperty('width', '100%', 'important');
        controls.style.setProperty('height', '100%', 'important');
        controls.style.setProperty('z-index', '20', 'important');
        controls.style.setProperty('pointer-events', 'none', 'important');
      }
      prev.style.setProperty('top', '8px', 'important');
      prev.style.setProperty('bottom', 'auto', 'important');
      next.style.setProperty('top', 'auto', 'important');
      next.style.setProperty('bottom', '8px', 'important');
      [prev, next].forEach(function (button) {
        button.style.setProperty('display', 'flex', 'important');
        button.style.setProperty('align-items', 'center', 'important');
        button.style.setProperty('justify-content', 'center', 'important');
        button.style.setProperty('width', '32px', 'important');
        button.style.setProperty('height', '32px', 'important');
        button.style.setProperty('left', '50%', 'important');
        button.style.setProperty('right', 'auto', 'important');
        button.style.setProperty('transform', 'translateX(-50%) rotate(90deg)', 'important');
        button.style.setProperty('z-index', '21', 'important');
        button.style.setProperty('pointer-events', 'auto', 'important');
      });
    }

    var total = mainSwiper && mainSwiper.slides ? mainSwiper.slides.length : mainSlides.length;
    var index = mainSwiper ? mainSwiper.activeIndex || 0 : parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10);
    var prevDisabled = index <= 0;
    var nextDisabled = total <= 1 || index >= total - 1;

    [[prev, prevDisabled], [next, nextDisabled]].forEach(function (pair) {
      var button = pair[0];
      var disabled = pair[1];
      button.classList.toggle('swiper-button-disabled', disabled);
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.setAttribute('tabindex', disabled ? '-1' : '0');
    });
  }

  function isMobileGalleryViewport() {
    return !window.matchMedia || window.matchMedia('(max-width: 767px)').matches;
  }

  function ensureMobileGalleryControls(productRoot) {
    if (!isMobileGalleryViewport()) return;

    var productLeft = productRoot.querySelector('.product-colum-left');
    var boxGallery = productRoot.querySelector('.box-gallery');
    var navImages = productRoot.querySelector('.nav-images');
    var imageShow = productRoot.querySelector('.image-show');
    var navList = productRoot.querySelector('.nav-images .list');
    var navWrapper = productRoot.querySelector('.nav-images .swiper-wrapper');
    var mainList = productRoot.querySelector('.image-show .list');
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
    if (!imageShow || !mainList || mainSlides.length < 2) return;

    if (productLeft) {
      productLeft.style.setProperty('width', '100%', 'important');
      productLeft.style.setProperty('max-width', '100%', 'important');
      productLeft.style.setProperty('min-width', '0', 'important');
    }
    if (boxGallery) {
      boxGallery.style.setProperty('display', 'flex', 'important');
      boxGallery.style.setProperty('flex-direction', 'column', 'important');
      boxGallery.style.setProperty('position', 'relative', 'important');
      boxGallery.style.setProperty('width', '100%', 'important');
      boxGallery.style.setProperty('max-width', '100%', 'important');
      boxGallery.style.setProperty('min-width', '0', 'important');
      boxGallery.style.setProperty('overflow', 'visible', 'important');
    }
    imageShow.style.setProperty('position', 'relative', 'important');
    imageShow.style.setProperty('display', 'block', 'important');
    imageShow.style.setProperty('overflow', 'hidden', 'important');
    imageShow.style.setProperty('order', '1', 'important');
    imageShow.style.setProperty('width', '100%', 'important');
    imageShow.style.setProperty('max-width', '100%', 'important');
    imageShow.style.setProperty('min-width', '0', 'important');
    imageShow.style.setProperty('height', 'min(380px, calc(100vw - 20px))', 'important');
    imageShow.style.setProperty('min-height', '280px', 'important');
    imageShow.style.setProperty('max-height', '380px', 'important');
    mainList.style.setProperty('display', 'block', 'important');
    mainList.style.setProperty('position', 'relative', 'important');
    mainList.style.setProperty('width', '100%', 'important');
    mainList.style.setProperty('max-width', '100%', 'important');
    mainList.style.setProperty('height', '100%', 'important');
    mainList.style.setProperty('overflow', 'hidden', 'important');
    mainList.style.setProperty('touch-action', 'pan-y', 'important');

    var mainWidth = Math.round(mainList.getBoundingClientRect().width || imageShow.getBoundingClientRect().width || 0);
    var mainWrapper = productRoot.querySelector('.image-show .swiper-wrapper');
    if (mainWrapper && mainWidth > 0) {
      mainWrapper.style.setProperty('display', 'flex', 'important');
      mainWrapper.style.setProperty('flex-wrap', 'nowrap', 'important');
      mainWrapper.style.setProperty('align-items', 'stretch', 'important');
      mainWrapper.style.setProperty('width', (mainWidth * mainSlides.length) + 'px', 'important');
      mainWrapper.style.setProperty('height', '100%', 'important');
      mainWrapper.style.setProperty('overflow', 'visible', 'important');
      mainSlides.forEach(function (slide) {
        slide.style.setProperty('width', mainWidth + 'px', 'important');
        slide.style.setProperty('min-width', mainWidth + 'px', 'important');
        slide.style.setProperty('max-width', mainWidth + 'px', 'important');
        slide.style.setProperty('flex', '0 0 ' + mainWidth + 'px', 'important');
        slide.style.setProperty('height', '100%', 'important');
        slide.style.setProperty('overflow', 'hidden', 'important');
        slide.style.setProperty('display', 'flex', 'important');
        slide.style.setProperty('align-items', 'center', 'important');
        slide.style.setProperty('justify-content', 'center', 'important');
      });
      Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .box-img, .image-show .zoom')).forEach(function (node) {
        node.style.setProperty('width', '100%', 'important');
        node.style.setProperty('height', '100%', 'important');
        node.style.setProperty('max-width', '100%', 'important');
        node.style.setProperty('overflow', 'hidden', 'important');
        node.style.setProperty('display', 'flex', 'important');
        node.style.setProperty('align-items', 'center', 'important');
        node.style.setProperty('justify-content', 'center', 'important');
      });
      Array.prototype.slice.call(productRoot.querySelectorAll('.image-show img:not(.zoomImg)')).forEach(function (img) {
        img.style.setProperty('width', '100%', 'important');
        img.style.setProperty('height', '100%', 'important');
        img.style.setProperty('max-width', '100%', 'important');
        img.style.setProperty('max-height', '100%', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
      });
    }

    if (navImages) {
      navImages.style.setProperty('order', '2', 'important');
      navImages.style.setProperty('position', 'static', 'important');
      navImages.style.setProperty('left', 'auto', 'important');
      navImages.style.setProperty('right', 'auto', 'important');
      navImages.style.setProperty('top', 'auto', 'important');
      navImages.style.setProperty('bottom', 'auto', 'important');
      navImages.style.setProperty('width', '100%', 'important');
      navImages.style.setProperty('max-width', '100%', 'important');
      navImages.style.setProperty('height', 'auto', 'important');
      navImages.style.setProperty('min-height', '92px', 'important');
      navImages.style.setProperty('margin', '10px 0 0', 'important');
      navImages.style.setProperty('padding', '0', 'important');
      navImages.style.setProperty('overflow', 'hidden', 'important');
      navImages.style.setProperty('transform', 'none', 'important');
      navImages.style.setProperty('box-sizing', 'border-box', 'important');
    }
    if (navList) {
      navList.style.setProperty('width', '100%', 'important');
      navList.style.setProperty('max-width', '100%', 'important');
      navList.style.setProperty('height', '92px', 'important');
      navList.style.setProperty('max-height', '92px', 'important');
      navList.style.setProperty('overflow-x', 'auto', 'important');
      navList.style.setProperty('overflow-y', 'hidden', 'important');
      navList.style.setProperty('padding', '3px 4px 8px', 'important');
      navList.style.setProperty('box-sizing', 'border-box', 'important');
      navList.style.setProperty('scroll-padding-inline', '4px', 'important');
      navList.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
    }
    if (navWrapper) {
      navWrapper.style.setProperty('display', 'flex', 'important');
      navWrapper.style.setProperty('flex-direction', 'row', 'important');
      navWrapper.style.setProperty('flex-wrap', 'nowrap', 'important');
      navWrapper.style.setProperty('align-items', 'center', 'important');
      navWrapper.style.setProperty('gap', '10px', 'important');
      navWrapper.style.setProperty('width', 'max-content', 'important');
      navWrapper.style.setProperty('max-width', 'none', 'important');
      navWrapper.style.setProperty('height', '78px', 'important');
      navWrapper.style.setProperty('margin', '0', 'important');
      navWrapper.style.setProperty('padding', '0', 'important');
      navWrapper.style.setProperty('transform', 'none', 'important');
      navWrapper.style.setProperty('overflow', 'visible', 'important');
      navWrapper.style.setProperty('box-sizing', 'border-box', 'important');
    }
    Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide')).forEach(function (slide) {
      slide.style.setProperty('position', 'relative', 'important');
      slide.style.setProperty('display', 'flex', 'important');
      slide.style.setProperty('align-items', 'center', 'important');
      slide.style.setProperty('justify-content', 'center', 'important');
      slide.style.setProperty('width', '78px', 'important');
      slide.style.setProperty('min-width', '78px', 'important');
      slide.style.setProperty('max-width', '78px', 'important');
      slide.style.setProperty('height', '78px', 'important');
      slide.style.setProperty('flex', '0 0 78px', 'important');
      slide.style.setProperty('margin', '0', 'important');
      slide.style.setProperty('padding', '0', 'important');
      slide.style.setProperty('transform', 'none', 'important');
      slide.style.setProperty('overflow', 'visible', 'important');
      slide.style.setProperty('box-sizing', 'border-box', 'important');
    });
    Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .box-img')).forEach(function (box) {
      box.style.setProperty('position', 'relative', 'important');
      box.style.setProperty('display', 'flex', 'important');
      box.style.setProperty('align-items', 'center', 'important');
      box.style.setProperty('justify-content', 'center', 'important');
      box.style.setProperty('width', '72px', 'important');
      box.style.setProperty('min-width', '72px', 'important');
      box.style.setProperty('max-width', '72px', 'important');
      box.style.setProperty('height', '72px', 'important');
      box.style.setProperty('min-height', '72px', 'important');
      box.style.setProperty('max-height', '72px', 'important');
      box.style.setProperty('margin', '0', 'important');
      box.style.setProperty('padding', '3px', 'important');
      box.style.setProperty('overflow', 'hidden', 'important');
      box.style.setProperty('box-sizing', 'border-box', 'important');
    });
    Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .box-img img')).forEach(function (img) {
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('width', '100%', 'important');
      img.style.setProperty('height', '100%', 'important');
      img.style.setProperty('max-width', '100%', 'important');
      img.style.setProperty('max-height', '100%', 'important');
      img.style.setProperty('object-fit', 'contain', 'important');
    });

    if (!productRoot.querySelector('.t7-gallery-mobile-arrow')) {
      ['prev', 'next'].forEach(function (direction) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 't7-gallery-mobile-arrow t7-gallery-mobile-' + direction;
        button.setAttribute('aria-label', direction === 'next' ? 'Proxima imagem do produto' : 'Imagem anterior do produto');
        button.textContent = direction === 'next' ? '›' : '‹';
        imageShow.appendChild(button);
      });
    }

    Array.prototype.slice.call(productRoot.querySelectorAll('.t7-gallery-mobile-arrow')).forEach(function (button) {
      button.style.setProperty('position', 'absolute', 'important');
      button.style.setProperty('z-index', '12', 'important');
      button.style.setProperty('top', '50%', 'important');
      button.style.setProperty('display', 'flex', 'important');
      button.style.setProperty('align-items', 'center', 'important');
      button.style.setProperty('justify-content', 'center', 'important');
      button.style.setProperty('width', '38px', 'important');
      button.style.setProperty('height', '38px', 'important');
      button.style.setProperty('margin', '0', 'important');
      button.style.setProperty('padding', '0', 'important');
      button.style.setProperty('border', '0', 'important');
      button.style.setProperty('border-radius', '999px', 'important');
      button.style.setProperty('background', 'rgba(0,0,0,.58)', 'important');
      button.style.setProperty('color', '#fff', 'important');
      button.style.setProperty('font-size', '32px', 'important');
      button.style.setProperty('line-height', '1', 'important');
      button.style.setProperty('transform', 'translateY(-50%)', 'important');
      button.style.setProperty('box-shadow', '0 8px 22px rgba(0,0,0,.24)', 'important');
      button.style.setProperty('cursor', 'pointer', 'important');
      if (button.classList.contains('t7-gallery-mobile-prev')) {
        button.style.setProperty('left', '8px', 'important');
        button.style.setProperty('right', 'auto', 'important');
      } else {
        button.style.setProperty('right', '8px', 'important');
        button.style.setProperty('left', 'auto', 'important');
      }
    });

    if (mainList.getAttribute('data-t7-mobile-swipe') === '1') return;

    var startX = 0;
    var startY = 0;
    var tracking = false;

    function goBySwipe(deltaX, deltaY) {
      if (Math.abs(deltaX) < 36 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
      var current = parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10) || 0;
      setActiveGalleryIndex(productRoot, deltaX < 0 ? current + 1 : current - 1);
    }

    mainList.addEventListener('touchstart', function (event) {
      var touch = event.touches && event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }, { passive: true });

    mainList.addEventListener('touchend', function (event) {
      if (!tracking) return;
      tracking = false;
      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      goBySwipe(touch.clientX - startX, touch.clientY - startY);
    }, { passive: true });

    var pointerStartX = 0;
    var pointerStartY = 0;
    var pointerTracking = false;

    mainList.addEventListener('pointerdown', function (event) {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen' && event.pointerType !== 'mouse') return;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerTracking = true;
    }, { passive: true });

    mainList.addEventListener('pointerup', function (event) {
      if (!pointerTracking) return;
      pointerTracking = false;
      goBySwipe(event.clientX - pointerStartX, event.clientY - pointerStartY);
    }, { passive: true });

    mainList.setAttribute('data-t7-mobile-swipe', '1');
  }

  function setActiveGalleryIndex(productRoot, index) {
    var mainList = productRoot.querySelector('.image-show .list');
    var mainWrapper = productRoot.querySelector('.image-show .swiper-wrapper');
    var navList = productRoot.querySelector('.nav-images .list');
    var navWrapper = productRoot.querySelector('.nav-images .swiper-wrapper');
    var mainSwiper = mainList && mainList.swiper;
    var navSwiper = navList && navList.swiper;
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
    var navSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide'));
    var total = mainSwiper && mainSwiper.slides ? mainSwiper.slides.length : mainSlides.length;
    if (!total) return;

    var preserveScroll = isMobileGalleryViewport();
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var target = Math.max(0, Math.min(index, total - 1));
    productRoot.setAttribute('data-t7-gallery-index', String(target));

    if (mainSwiper) {
      mainSwiper.slideTo(target);
    }
    forceGalleryMainPosition(productRoot, target);

    if (isMobileGalleryViewport() && navList && navWrapper && navSlides.length > 1) {
      navWrapper.style.setProperty('transform', 'none', 'important');
      navWrapper.style.setProperty('transition-duration', '0ms', 'important');
      var targetThumb = navSlides[target];
      if (targetThumb && typeof navList.scrollTo === 'function') {
        navList.scrollTo({ left: Math.max(0, targetThumb.offsetLeft - 12), behavior: 'smooth' });
      } else if (targetThumb) {
        navList.scrollLeft = Math.max(0, targetThumb.offsetLeft - 12);
      }
    } else if (navSwiper && navSwiper.slides && navSwiper.slides.length > target) {
      navSwiper.slideTo(target);
    } else if (navWrapper && navSlides.length > 1) {
      var visibleThumbs = 5;
      var firstSlide = navSlides[0];
      var rect = firstSlide.getBoundingClientRect();
      var marginBottom = parseFloat(window.getComputedStyle(firstSlide).marginBottom || '0') || 0;
      var step = rect.height + marginBottom;
      var offset = target >= visibleThumbs ? (target - visibleThumbs + 1) * step : 0;
      navWrapper.style.setProperty('transform', 'translate3d(0px, ' + (-offset) + 'px, 0px)', 'important');
      navWrapper.style.setProperty('transition-duration', '250ms', 'important');
    }

    navSlides.forEach(function (slide, slideIndex) {
      var isActive = slideIndex === target;
      slide.classList.toggle('active', isActive);
      slide.classList.toggle('swiper-slide-active', isActive);
      slide.classList.toggle('swiper-slide-prev', slideIndex === target - 1);
      slide.classList.toggle('swiper-slide-next', slideIndex === target + 1);
      var box = slide.querySelector('.box-img');
      if (box) box.classList.toggle('active', isActive);
    });
    mainSlides.forEach(function (slide, slideIndex) {
      var isActive = slideIndex === target;
      slide.classList.toggle('active', isActive);
      var box = slide.querySelector('.box-img');
      if (box) box.classList.toggle('active', isActive);
    });

    applyGalleryThumbAccent(productRoot);
    revealProductGalleryImage(activeGalleryImage(productRoot));
    Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .zoomImg')).forEach(function (img) {
      img.style.setProperty('pointer-events', 'none', 'important');
    });
    updateGalleryArrowState(productRoot);
    if (preserveScroll && typeof window.scrollTo === 'function') {
      window.requestAnimationFrame(function () { window.scrollTo(scrollX, scrollY); });
    }
  }

  function syncGalleryFromMainSwiper(productRoot) {
    var mainList = productRoot.querySelector('.image-show .list');
    var mainSwiper = mainList && mainList.swiper;
    var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
    var navSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .swiper-slide'));
    var total = mainSwiper && mainSwiper.slides ? mainSwiper.slides.length : mainSlides.length;
    if (!total) return;

    var target = Math.max(0, Math.min(mainSwiper ? mainSwiper.activeIndex || 0 : parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10) || 0, total - 1));
    productRoot.setAttribute('data-t7-gallery-index', String(target));
    forceGalleryMainPosition(productRoot, target);

    navSlides.forEach(function (slide, slideIndex) {
      var isActive = slideIndex === target;
      slide.classList.toggle('active', isActive);
      slide.classList.toggle('swiper-slide-active', isActive);
      slide.classList.toggle('swiper-slide-prev', slideIndex === target - 1);
      slide.classList.toggle('swiper-slide-next', slideIndex === target + 1);
      var box = slide.querySelector('.box-img');
      if (box) box.classList.toggle('active', isActive);
    });

    applyGalleryThumbAccent(productRoot);
    revealProductGalleryImage(activeGalleryImage(productRoot));
    updateGalleryArrowState(productRoot);
  }

  function attachGallerySwiperSync(productRoot) {
    var mainList = productRoot.querySelector('.image-show .list');
    var mainSwiper = mainList && mainList.swiper;
    if (!mainSwiper || typeof mainSwiper.on !== 'function' || mainList.getAttribute('data-t7-gallery-swiper-sync') === '1') return;

    ['slideChange', 'slideChangeTransitionEnd', 'transitionEnd'].forEach(function (eventName) {
      mainSwiper.on(eventName, function () {
        window.requestAnimationFrame(function () { syncGalleryFromMainSwiper(productRoot); });
      });
    });
    mainList.setAttribute('data-t7-gallery-swiper-sync', '1');
  }

  function ensureProductGalleryControls() {
    var productRoot = document.querySelector('#product-container, .page-product .box-col-product, .box-col-product');
    if (!productRoot) return;
    normalizeProductGalleryLayout(productRoot);
    if (productRoot.getAttribute('data-t7-gallery-controls') === '1') {
      var currentIndex = parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10) || 0;
      forceGalleryMainPosition(productRoot, currentIndex);
      ensureMobileGalleryControls(productRoot);
      attachGallerySwiperSync(productRoot);
      applyGalleryThumbAccent(productRoot);
      updateGalleryArrowState(productRoot);
      return;
    }
    if (!productRoot.querySelector('.image-show .list') || !productRoot.querySelector('.nav-images .list')) return;

    productRoot.setAttribute('data-t7-gallery-controls', '1');
    setActiveGalleryIndex(productRoot, parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10) || 0);

    productRoot.addEventListener('click', function (event) {
      var mobileArrow = event.target.closest && event.target.closest('.t7-gallery-mobile-arrow');
      if (mobileArrow && productRoot.contains(mobileArrow)) {
        var currentMobile = parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10) || 0;
        event.preventDefault();
        event.stopPropagation();
        setActiveGalleryIndex(productRoot, mobileArrow.classList.contains('t7-gallery-mobile-next') ? currentMobile + 1 : currentMobile - 1);
        return;
      }

      var thumb = event.target.closest && event.target.closest('.nav-images .box-img');
      if (thumb && productRoot.contains(thumb)) {
        var thumbBoxes = Array.prototype.slice.call(productRoot.querySelectorAll('.nav-images .box-img'));
        var index = thumbBoxes.indexOf(thumb);
        if (index >= 0) {
          event.preventDefault();
          setActiveGalleryIndex(productRoot, index);
        }
        return;
      }

      var next = event.target.closest && event.target.closest('.nav-images .controls .next');
      var prev = event.target.closest && event.target.closest('.nav-images .controls .prev');
      if (!next && !prev) return;

      var mainList = productRoot.querySelector('.image-show .list');
      var mainSwiper = mainList && mainList.swiper;
      var mainSlides = Array.prototype.slice.call(productRoot.querySelectorAll('.image-show .swiper-slide'));
      var total = mainSwiper && mainSwiper.slides ? mainSwiper.slides.length : mainSlides.length;
      if (total <= 1) return;

      var current = mainSwiper ? mainSwiper.activeIndex || 0 : parseInt(productRoot.getAttribute('data-t7-gallery-index') || '0', 10) || 0;
      var target = next ? current + 1 : current - 1;
      if (target < 0 || target >= total) {
        updateGalleryArrowState(productRoot);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveGalleryIndex(productRoot, target);
    }, true);

    window.setTimeout(function () { updateGalleryArrowState(productRoot); }, 0);
    ensureMobileGalleryControls(productRoot);
    attachGallerySwiperSync(productRoot);
  }

  function ensureVisitedProductCardStyles() {
    if (document.getElementById('t7-visited-product-card-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-visited-product-card-styles';
    style.textContent = [
      '.visited-section,.visited-section .section-showcase,.visited-section .showcase,.visited-section .swiper-container,.visited-section .swiper,.visited-section .swiper-wrapper,.visited-section .list-product{overflow:visible!important;}',
      '.visited-section .list-append{position:relative!important;z-index:2!important;clear:both!important;margin-top:0!important;padding:8px 0 18px!important;overflow-x:hidden!important;overflow-y:visible!important;scroll-behavior:smooth!important;box-sizing:border-box!important;}',
      '.visited-section .swiper-container,.visited-section .list-product{padding-top:8px!important;padding-right:8px!important;padding-bottom:6px!important;box-sizing:border-box!important;}',
      '.visited-section .list-append .swiper-wrapper.list-product{display:flex!important;flex-wrap:nowrap!important;align-items:stretch!important;gap:var(--t7-visited-gap,18px)!important;width:max-content!important;max-width:none!important;overflow:visible!important;transform:none!important;}',
      '.visited-section .list-append .item,.visited-section .list-append .swiper-slide{display:flex!important;width:var(--t7-visited-card-width,260px)!important;max-width:var(--t7-visited-card-width,260px)!important;flex:0 0 var(--t7-visited-card-width,260px)!important;height:auto!important;padding:0 10px 0 0!important;box-sizing:border-box!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important;}',
      '.visited-section .list-append .product{width:100%!important;min-height:420px!important;height:100%!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;background:#1a1a1a!important;color:#fff!important;border:1px solid #2a2a2a!important;border-radius:12px!important;box-shadow:0 4px 20px rgba(17,17,17,.06)!important;padding:12px!important;overflow:hidden!important;box-sizing:border-box!important;transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease!important;}',
      '.visited-section .list-append .product:hover,.visited-section .list-append .product:focus-within{transform:translateY(-6px)!important;border-color:#ff6a00!important;box-shadow:0 12px 40px rgba(255,106,0,.25)!important;}',
      '.product-related .product[data-t7-unified-card="1"],.visited-section .product[data-t7-unified-card="1"]{cursor:pointer!important;}',
      '.product-related .product .t7-unified-product-card,.visited-section .product .t7-unified-product-card{position:relative!important;z-index:2!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;width:100%!important;min-height:100%!important;color:inherit!important;text-decoration:none!important;}',
      '.product-related .product .t7-unified-product-card .image,.visited-section .product .t7-unified-product-card .image{pointer-events:none!important;}',
      '.product-related .product .t7-unified-product-card .space-image,.visited-section .product .t7-unified-product-card .space-image{pointer-events:none!important;}',
      '.visited-section .list-append .product .image{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;aspect-ratio:1/1!important;margin:0!important;padding:0!important;overflow:hidden!important;flex:0 0 auto!important;}',
      '.visited-section .list-append .product .space-image{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;height:100%!important;max-width:none!important;margin:0!important;overflow:hidden!important;}',
      '.visited-section .list-append .product .image img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;margin:0 auto!important;}',
      '.visited-section .list-append .product .info-product{position:relative!important;z-index:2!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:10px!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#1a1a1a!important;color:inherit!important;padding:12px 14px!important;text-decoration:none!important;text-align:center!important;}',
      '.visited-section .list-append .product .product-name{display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;min-height:44px!important;max-height:44px!important;overflow:hidden!important;margin:0!important;color:#fff!important;font-size:.9375rem!important;font-weight:600!important;line-height:1.35!important;text-align:center!important;}',
      '.visited-section .list-append .product .down-line{display:flex!important;flex-direction:column!important;gap:8px!important;width:100%!important;margin-top:auto!important;background:#1a1a1a!important;border-top:1px solid #2a2a2a!important;color:#ff6a00!important;overflow:hidden!important;text-align:center!important;}',
      '.visited-section .list-append .product .down-line p,.visited-section .list-append .product .product-price,.visited-section .list-append .product .price-off{display:block!important;margin:0!important;color:#ff6a00!important;font-weight:700!important;line-height:1.35!important;}',
      '.visited-section .list-append .product .product-payment{display:block!important;min-height:34px!important;max-height:48px!important;overflow:hidden!important;margin:0!important;color:#aaa!important;font-size:.8125rem!important;line-height:1.25!important;text-align:center!important;}',
      '.visited-section .list-append .product .second-image{display:none!important;}',
      '.visited-section .prev.arrow-icon,.visited-section .next.arrow-icon{position:absolute!important;z-index:8!important;top:58%!important;display:flex!important;align-items:center!important;justify-content:center!important;width:44px!important;height:44px!important;margin:0!important;padding:0!important;border:1px solid rgba(255,106,0,.32)!important;border-radius:999px!important;background:#ff6a00!important;box-shadow:0 10px 26px rgba(255,106,0,.28)!important;cursor:pointer!important;opacity:1!important;transform:translateY(-50%)!important;}',
      '.visited-section .prev.arrow-icon{left:-22px!important;}.visited-section .next.arrow-icon{right:-22px!important;}',
      '.visited-section .prev.arrow-icon:before,.visited-section .next.arrow-icon:before{content:""!important;display:block!important;width:11px!important;height:11px!important;border-top:3px solid #fff!important;border-right:3px solid #fff!important;}',
      '.visited-section .prev.arrow-icon:before{transform:rotate(-135deg)!important;margin-left:4px!important;}.visited-section .next.arrow-icon:before{transform:rotate(45deg)!important;margin-right:4px!important;}',
      '.visited-section .prev.arrow-icon[aria-disabled="true"],.visited-section .next.arrow-icon[aria-disabled="true"]{opacity:.38!important;pointer-events:none!important;}',
      '@media (max-width:767px){.visited-section .list-append{padding:8px 0 16px!important;}.visited-section .list-append .swiper-wrapper.list-product{gap:var(--t7-visited-gap,12px)!important;}.visited-section .list-append .item,.visited-section .list-append .swiper-slide{padding:0 8px 0 0!important;}.visited-section .list-append .product{min-height:330px!important;border-radius:10px!important;padding:10px!important;}.visited-section .list-append .product .product-name{min-height:40px!important;max-height:40px!important;font-size:.8125rem!important;}.visited-section .list-append .product .product-payment{max-height:38px!important;font-size:.75rem!important;}.visited-section .prev.arrow-icon,.visited-section .next.arrow-icon{width:40px!important;height:40px!important;}.visited-section .prev.arrow-icon{left:-8px!important;}.visited-section .next.arrow-icon{right:-8px!important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureProductRailHoverOverflowStyles() {
    if (document.getElementById('t7-card-hover-overflow-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-card-hover-overflow-styles';
    style.textContent = [
      '.product-related,.product-related .container,.product-related .section-showcase,.product-related .showcase,.product-related .swiper-container,.product-related .swiper,.product-related .swiper-wrapper,.product-related .list-product,.visited-section,.visited-section .container,.visited-section .section-showcase,.visited-section .showcase,.visited-section .swiper-container,.visited-section .swiper,.visited-section .swiper-wrapper,.visited-section .list-product{overflow:visible!important;}',
      '.product-related .swiper-container,.product-related .list-product,.visited-section .swiper-container,.visited-section .list-product{padding-top:8px!important;padding-right:8px!important;padding-bottom:6px!important;box-sizing:border-box!important;}',
      '.product-related .item,.product-related .swiper-slide{padding-top:8px!important;padding-right:12px!important;box-sizing:border-box!important;}',
      '@media (max-width:767px){.product-related .swiper-container{width:100%!important;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important;}.product-related .list-product,.product-related .swiper-wrapper{width:100%!important;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important;}.product-related .item,.product-related .swiper-slide{padding-top:8px!important;padding-left:0!important;padding-right:0!important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureVisitedHeadingLayoutStyles() {
    if (document.getElementById('t7-visited-heading-layout-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-visited-heading-layout-styles';
    style.textContent = [
      '.product-related{position:relative!important;z-index:1!important;margin-bottom:0!important;padding-bottom:4px!important;isolation:isolate!important;}',
      '.product-related .swiper-container{height:auto!important;min-height:0!important;margin-bottom:0!important;}',
      '.visited-section{position:relative!important;z-index:3!important;clear:both!important;margin-top:8px!important;padding-top:4px!important;background:#fff!important;overflow:visible!important;transform:none!important;isolation:isolate!important;}',
      '.visited-section .container,.visited-section .section-showcase,.visited-section .showcase{position:relative!important;z-index:3!important;background:#fff!important;overflow:visible!important;transform:none!important;}',
      '.visited-section .section-showcase{margin-top:0!important;margin-bottom:24px!important;}',
      '.visited-section .title-section,.visited-section h2{position:relative!important;z-index:6!important;display:block!important;visibility:visible!important;opacity:1!important;min-height:42px!important;margin:0 0 22px!important;padding:0!important;background:#fff!important;color:var(--tech-text,#111)!important;transform:none!important;}',
      '.visited-section .title-section span{position:relative!important;z-index:7!important;display:inline-block!important;color:var(--tech-text,#111)!important;}',
      '.visited-section .list-append{position:relative!important;z-index:2!important;clear:both!important;margin-top:0!important;padding:8px 0 18px!important;overflow-x:hidden!important;overflow-y:visible!important;scroll-behavior:smooth!important;box-sizing:border-box!important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureProductCodeVisibilityStyles() {
    if (document.getElementById('t7-product-code-visibility-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-product-code-visibility-styles';
    style.textContent = [
      '#product-reference,.line-info .ref,[data-t7-hide-product-code="1"]{display:none!important;visibility:hidden!important;}',
      'tr[data-t7-hide-product-code="1"],li[data-t7-hide-product-code="1"],dl[data-t7-hide-product-code="1"],div[data-t7-hide-product-code="1"]{display:none!important;visibility:hidden!important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureFooterSocialContactStyles() {
    if (document.getElementById('t7-footer-social-contact-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-footer-social-contact-styles';
    style.textContent = [
      '.footer{position:relative!important;left:50%!important;width:100vw!important;max-width:100vw!important;margin-top:32px!important;margin-left:-50vw!important;margin-right:0!important;padding:24px 0 0!important;box-sizing:border-box!important;}',
      '[data-t7-footer-shell="1"]{padding-bottom:0!important;margin-bottom:0!important;}',
      '.footer .container{width:min(1320px,calc(100vw - 64px))!important;max-width:none!important;margin-left:auto!important;margin-right:auto!important;}',
      '.footer .newsletter{min-height:0!important;margin-bottom:16px!important;padding:14px 18px!important;}',
      '.footer .newsletter .ic-news{width:52px!important;height:auto!important;}',
      '.footer .newsletter .first{margin-bottom:2px!important;font-size:.95rem!important;line-height:1.2!important;}',
      '.footer .newsletter .last{font-size:.8125rem!important;line-height:1.35!important;}',
      '.footer .newsletter form{gap:8px!important;}',
      '.footer .newsletter input,.footer .newsletter button,.footer .newsletter .news-button{min-height:40px!important;}',
      '.footer .cols{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:16px!important;align-items:start!important;}',
      '.footer .box{min-height:0!important;padding:16px!important;}',
      '.footer .box[data-t7-footer-social-box="1"]{height:auto!important;overflow:visible!important;}',
      '.footer .box[data-t7-footer-social-box="1"]>.t7-footer-social-contact{transform:none!important;}',
      '.footer .box .title{margin-bottom:10px!important;font-size:.875rem!important;line-height:1.25!important;letter-spacing:0!important;}',
      '.footer .box .overflow,.footer .box .list{margin:0!important;padding:0!important;}',
      '.footer .box .list li{margin:0 0 6px!important;}',
      '.footer .box a,.footer .box .text,.footer .box .v{font-size:.8125rem!important;line-height:1.4!important;}',
      '.footer .payment-list{gap:6px!important;}',
      '.footer .payment-list .payment-form img{width:38px!important;height:auto!important;}',
      '.t7-footer-payment-badges{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;width:100%!important;}',
      '.t7-footer-payment-badges .payment-form{display:block!important;margin:0!important;}',
      '.t7-footer-payment-badge{display:flex!important;align-items:center!important;gap:8px!important;min-height:42px!important;padding:7px 8px!important;border:1px solid rgba(255,106,0,.24)!important;border-radius:8px!important;background:rgba(255,255,255,.045)!important;color:#fff!important;box-sizing:border-box!important;}',
      '.t7-footer-payment-badge img{display:block!important;width:42px!important;max-width:42px!important;height:30px!important;object-fit:contain!important;padding:3px!important;border-radius:5px!important;background:#fff!important;box-sizing:border-box!important;}',
      '.t7-footer-payment-badge span{display:block!important;min-width:0!important;color:#e5e5e5!important;font-size:.75rem!important;font-weight:700!important;line-height:1.15!important;white-space:normal!important;}',
      '.footer .box[data-t7-footer-trust-box="1"] .overflow{display:block!important;height:auto!important;max-height:none!important;visibility:visible!important;opacity:1!important;overflow:visible!important;transform:none!important;transform-origin:top left!important;}',
      '.t7-footer-security-badges{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;width:100%!important;margin:0!important;padding:0!important;}',
      '.t7-footer-security-badges li{display:block!important;margin:0!important;padding:0!important;}',
      '.t7-footer-security-badge{display:flex!important;align-items:center!important;gap:9px!important;min-height:44px!important;padding:8px 10px!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:8px!important;background:rgba(255,255,255,.045)!important;color:#fff!important;text-decoration:none!important;box-sizing:border-box!important;}',
      '.t7-footer-security-badge:hover,.t7-footer-security-badge:focus{border-color:rgba(255,106,0,.65)!important;background:rgba(255,106,0,.1)!important;}',
      '.t7-footer-security-badge svg{display:block!important;width:28px!important;height:28px!important;min-width:28px!important;fill:#ff6a00!important;}',
      '.t7-footer-security-badge img{display:block!important;width:92px!important;max-width:92px!important;height:auto!important;object-fit:contain!important;}',
      '.t7-footer-security-badge span{display:block!important;color:#e5e5e5!important;font-size:.75rem!important;font-weight:700!important;line-height:1.2!important;}',
      '.copy{padding:10px 0!important;}',
      '.footer .copy{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;}',
      '.copy .text{font-size:.75rem!important;line-height:1.35!important;}',
      '.page-home .section-avaliacoes{width:min(1320px,calc(100vw - 64px))!important;max-width:none!important;margin-left:auto!important;margin-right:auto!important;padding:32px 0 40px!important;box-sizing:border-box!important;}',
      '.section-avaliacoes .relative{overflow:visible!important;}',
      '.section-avaliacoes .dep_lista{transform:none!important;transition-duration:0ms!important;}',
      '.section-avaliacoes .dep_item{box-sizing:border-box!important;}',
      '.t7-footer-social-contact{margin-top:14px!important;padding-top:14px!important;border-top:1px solid rgba(255,255,255,.1)!important;}',
      '.t7-footer-social-title{margin-bottom:10px!important;color:#fff!important;font-size:.8125rem!important;font-weight:800!important;line-height:1.25!important;}',
      '.t7-footer-social-actions{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;}',
      '.t7-footer-social-button{display:grid!important;grid-template-columns:34px 1fr!important;grid-template-areas:"icon label" "icon value"!important;column-gap:10px!important;align-items:center!important;min-height:48px!important;padding:8px 10px!important;border:1px solid rgba(255,106,0,.32)!important;border-radius:8px!important;background:rgba(255,106,0,.08)!important;color:#fff!important;text-decoration:none!important;transition:background 180ms ease,border-color 180ms ease,transform 180ms ease!important;}',
      '.t7-footer-social-button:hover,.t7-footer-social-button:focus{background:rgba(255,106,0,.16)!important;border-color:#ff6a00!important;transform:translateY(-1px)!important;}',
      '.t7-footer-social-button svg{grid-area:icon!important;display:block!important;width:34px!important;height:34px!important;min-width:34px!important;max-width:34px!important;min-height:34px!important;max-height:34px!important;padding:7px!important;border-radius:999px!important;background:#ff6a00!important;fill:#fff!important;box-sizing:border-box!important;}',
      '.t7-footer-social-button span{grid-area:label!important;color:#fff!important;font-size:.8125rem!important;font-weight:700!important;line-height:1.15!important;}',
      '.t7-footer-social-button strong{grid-area:value!important;color:#aaa!important;font-size:.75rem!important;font-weight:600!important;line-height:1.2!important;}',
      '@media (min-width:1024px){.section-avaliacoes .dep_lista{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:20px!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;}.section-avaliacoes .dep_item{display:block!important;width:auto!important;max-width:none!important;min-height:150px!important;margin:0!important;padding:20px!important;border:1px solid #e5e7eb!important;border-radius:10px!important;background:#fff!important;box-shadow:0 10px 26px rgba(17,17,17,.06)!important;}.section-avaliacoes .dep_dados{display:grid!important;gap:8px!important;margin:0!important;padding:0!important;}.section-avaliacoes .dep_dados li{margin:0!important;line-height:1.35!important;}}',
      '@media (min-width:1200px){.footer .cols{grid-template-columns:minmax(190px,.85fr) minmax(260px,1.1fr) minmax(280px,1.05fr) minmax(280px,1.05fr)!important;gap:28px!important;}.footer .box{padding:18px!important;}.footer .payment-list{gap:10px!important;}.t7-footer-security-badge{max-width:100%!important;}}',
      '@media (max-width:900px){.footer .cols{grid-template-columns:repeat(2,minmax(0,1fr))!important;}}',
      '@media (max-width:767px){.footer{left:50%!important;width:100vw!important;max-width:100vw!important;margin-top:24px!important;margin-left:-50vw!important;margin-right:0!important;padding-top:18px!important;box-sizing:border-box!important;}.footer .container{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important;}.footer .newsletter{display:grid!important;gap:12px!important;padding:14px!important;}.footer .newsletter form{display:grid!important;grid-template-columns:1fr auto!important;width:100%!important;}.footer .cols{grid-template-columns:1fr!important;gap:10px!important;}.footer .box{padding:14px!important;}.page-home .section-avaliacoes{width:auto!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;padding:28px 14px 34px!important;}.footer .box .t7-footer-payment-badges{width:100%!important;max-width:none!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;}.t7-footer-payment-badges .payment-form{width:100%!important;min-width:0!important;}.t7-footer-payment-badge{display:grid!important;width:100%!important;grid-template-columns:52px minmax(0,1fr)!important;gap:9px!important;min-height:58px!important;padding:8px 10px!important;}.footer .payment-list .payment-form .t7-footer-payment-badge img{width:52px!important;max-width:52px!important;height:40px!important;padding:5px!important;}.t7-footer-payment-badge span{font-size:.8125rem!important;line-height:1.2!important;white-space:nowrap!important;overflow-wrap:normal!important;}.t7-footer-security-badges{gap:10px!important;}.t7-footer-security-badge{width:100%!important;min-height:62px!important;padding:10px 12px!important;gap:12px!important;}.t7-footer-security-badge svg{width:38px!important;height:38px!important;min-width:38px!important;}.t7-footer-security-badge img{width:140px!important;max-width:42vw!important;height:auto!important;}.t7-footer-security-badge span{font-size:.8125rem!important;line-height:1.25!important;}}',
      '@media (max-width:360px){.footer .box .t7-footer-payment-badges{grid-template-columns:1fr!important;}.t7-footer-payment-badge{grid-template-columns:58px minmax(0,1fr)!important;}.footer .payment-list .payment-form .t7-footer-payment-badge img{width:58px!important;max-width:58px!important;height:42px!important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function footerBoxByTitle(footer, title) {
    var wanted = normalizeCardText(title);
    var boxes = Array.prototype.slice.call(footer.querySelectorAll('.box'));
    for (var i = 0; i < boxes.length; i++) {
      if (normalizeCardText(textFromNode('.title', boxes[i])) === wanted) return boxes[i];
    }
    return null;
  }

  function createPaymentBadge(item) {
    var li = document.createElement('li');
    li.className = 'payment-form';

    var badge = document.createElement('span');
    badge.className = 't7-footer-payment-badge';

    var img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt;
    img.width = 45;
    img.height = 36;
    img.loading = 'lazy';

    var label = document.createElement('span');
    label.textContent = item.label;

    badge.appendChild(img);
    badge.appendChild(label);
    li.appendChild(badge);
    return li;
  }

  function ensureFooterTrustBadges() {
    ensureFooterSocialContactStyles();

    var footer = document.querySelector('footer.footer, .footer');
    if (!footer) return;
    var footerShell = footer.closest('.section-showcase');
    if (footerShell) footerShell.setAttribute('data-t7-footer-shell', '1');

    var paymentBox = footerBoxByTitle(footer, 'Formas de pagamento');
    var paymentList = paymentBox && paymentBox.querySelector('.payment-list');
    if (paymentList && !paymentList.classList.contains('t7-footer-payment-badges')) {
      paymentList.classList.add('t7-footer-payment-badges');
      paymentList.innerHTML = '';
      T7_PAYMENT_BADGES.forEach(function (item) {
        paymentList.appendChild(createPaymentBadge(item));
      });
    }

    var sealsBox = footerBoxByTitle(footer, 'Selos de Segurança') || footerBoxByTitle(footer, 'Selos de Seguranca');
    var sealsList = sealsBox && sealsBox.querySelector('.foo-seals');
    if (sealsList && !sealsList.classList.contains('t7-footer-security-badges')) {
      var googleHref = 'https://transparencyreport.google.com/safe-browsing/search?url=' + encodeURIComponent(window.location.origin);
      var protectedHref = 'https://www.lojaprotegida.com.br/996644';
      var existingGoogle = sealsList.querySelector('a[href*="transparencyreport.google"]');
      var existingProtected = sealsList.querySelector('a[href*="lojaprotegida"]');
      if (existingGoogle && existingGoogle.href) googleHref = existingGoogle.href;
      if (existingProtected && existingProtected.href) protectedHref = existingProtected.href;

      sealsBox.setAttribute('data-t7-footer-trust-box', '1');
      sealsList.classList.add('t7-footer-security-badges');
      sealsList.innerHTML = [
        '<li><a class="t7-footer-security-badge" href="' + googleHref + '" rel="noreferrer noopener" target="_blank" aria-label="Verificar Google Safe Browsing da TECH 7">',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 5.2v5.9c0 4.7 3.1 9.1 7.5 10.4 4.4-1.3 7.5-5.7 7.5-10.4V5.2L12 2Zm3.7 7.8-4.4 4.4-2-2a1 1 0 0 0-1.4 1.4l2.7 2.7a1 1 0 0 0 1.4 0l5.1-5.1a1 1 0 1 0-1.4-1.4Z"/></svg>',
        '<span>Google Safe Browsing</span>',
        '</a></li>',
        '<li><a class="t7-footer-security-badge" href="' + protectedHref + '" rel="noreferrer noopener" target="_blank" aria-label="Ver selo Loja Protegida da TECH 7">',
        '<img src="' + T7_LOJA_PROTEGIDA_SEAL + '" alt="Loja Protegida" width="145" height="42" loading="lazy">',
        '<span>Loja Protegida</span>',
        '</a></li>'
      ].join('');
    }

    if (paymentBox) paymentBox.setAttribute('data-t7-footer-trust-box', '1');
  }

  function ensureTestimonialsDesktopGrid() {
    var section = document.querySelector('.section-avaliacoes');
    var list = section && section.querySelector('.dep_lista');
    if (!section || !list) return;

    list.classList.remove('swiper-wrapper');
    list.style.setProperty('transform', 'none', 'important');
    list.style.setProperty('transition-duration', '0ms', 'important');

    var seen = {};
    Array.prototype.slice.call(list.querySelectorAll('.dep_item')).forEach(function (item) {
      var name = textFromNode('.dep_nome', item);
      var message = textFromNode('.dep_msg', item);
      var key = normalizeCardText(name + '|' + message);
      if (seen[key]) {
        item.remove();
        return;
      }
      seen[key] = true;
      item.classList.remove('swiper-slide', 'swiper-slide-duplicate', 'swiper-slide-prev', 'swiper-slide-next', 'swiper-slide-active');
      item.removeAttribute('data-swiper-slide-index');
      item.style.setProperty('display', 'block', 'important');
      item.style.setProperty('transform', 'none', 'important');
    });

    Array.prototype.slice.call(list.querySelectorAll('.swiper-slide-duplicate')).forEach(function (node) {
      node.remove();
    });
  }

  function ensureFooterSocialContacts() {
    ensureFooterSocialContactStyles();

    var footer = document.querySelector('footer.footer, .footer');
    if (!footer || footer.querySelector('.t7-footer-social-contact')) return;

    var boxes = Array.prototype.slice.call(footer.querySelectorAll('.box'));
    var atendimentoBox = boxes.find(function (box) {
      return normalizeCardText(textFromNode('.title', box)) === 'atendimento';
    }) || boxes[1] || boxes[0];
    if (!atendimentoBox) return;

    atendimentoBox.setAttribute('data-t7-footer-social-box', '1');
    var block = document.createElement('div');
    block.className = 't7-footer-social-contact';
    block.innerHTML = [
      '<div class="t7-footer-social-title">Fale com a TECH 7</div>',
      '<div class="t7-footer-social-actions">',
      '<a class="t7-footer-social-button t7-footer-social-button--instagram" href="' + T7_INSTAGRAM_URL + '" target="_blank" rel="noreferrer noopener" aria-label="Abrir Instagram da TECH 7">',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm4.2 3.2A4.8 4.8 0 1 1 7.2 12 4.8 4.8 0 0 1 12 7.2Zm0 2A2.8 2.8 0 1 0 14.8 12 2.8 2.8 0 0 0 12 9.2Zm5.05-2.55a1.15 1.15 0 1 1-1.15 1.15 1.15 1.15 0 0 1 1.15-1.15Z"/></svg>',
      '<span>Instagram</span>',
      '<strong>@tech7i</strong>',
      '</a>',
      '<a class="t7-footer-social-button t7-footer-social-button--whatsapp" href="' + T7_WHATSAPP_URL + '" target="_blank" rel="noreferrer noopener" aria-label="Abrir WhatsApp da TECH 7">',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.85 9.85 0 0 1 8.48 14.86l1.28 4.67-4.78-1.25A9.93 9.93 0 0 1 2.17 11.9 9.87 9.87 0 0 1 12.04 2Zm0 1.94a7.92 7.92 0 0 0-6.76 12.06l.24.38-.76 2.76 2.84-.74.36.22a7.91 7.91 0 1 0 4.08-14.68Zm-3.3 3.96c.17 0 .35 0 .5.01.13.01.31-.05.49.38.18.43.62 1.49.67 1.6.05.11.09.24.02.39-.07.14-.11.23-.22.36-.11.13-.23.29-.33.39-.11.11-.23.23-.1.45.13.22.58.96 1.24 1.55.85.76 1.57 1 1.79 1.11.22.11.35.09.48-.05.13-.14.55-.64.7-.86.14-.22.29-.18.49-.11.2.07 1.27.6 1.49.71.22.11.36.16.42.25.05.09.05.53-.13 1.04-.18.51-1.04.98-1.45 1.04-.37.05-.84.07-1.36-.09-.31-.1-.72-.23-1.24-.46-2.18-.94-3.6-3.13-3.71-3.28-.11-.14-.89-1.19-.89-2.27 0-1.08.56-1.61.76-1.83.2-.22.44-.27.58-.27h.18Z"/></svg>',
      '<span>WhatsApp</span>',
      '<strong>(31) 99945-4848</strong>',
      '</a>',
      '</div>'
    ].join('');
    atendimentoBox.appendChild(block);
  }

  function hideProductCodeNode(node) {
    if (!node || node.getAttribute && node.getAttribute('data-t7-hide-product-code') === '1') return;
    if (node.setAttribute) {
      node.setAttribute('data-t7-hide-product-code', '1');
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('hidden', 'hidden');
    }
    if (node.style) {
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  function hideCustomerVisibleProductCodes() {
    ensureProductCodeVisibilityStyles();

    Array.prototype.slice.call(document.querySelectorAll('#product-reference, .line-info .ref')).forEach(function (node) {
      hideProductCodeNode(node);
    });

    Array.prototype.slice.call(document.querySelectorAll('table tr')).forEach(function (row) {
      var cells = row.querySelectorAll('td, th');
      if (!cells || !cells.length) return;
      var label = normalizeCardText(cells[0].textContent || '');
      if (label === 'codigo') hideProductCodeNode(row);
    });
  }

  function startProductCodeVisibilityObserver() {
    if (!window.MutationObserver || document.documentElement.getAttribute('data-t7-product-code-observer') === '1') return;
    document.documentElement.setAttribute('data-t7-product-code-observer', '1');
    var timer = null;
    var observer = new MutationObserver(function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(hideCustomerVisibleProductCodes, 50);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function normalizeCartHeaderNavigation() {
    if (document.documentElement.getAttribute('data-t7-cart-header-navigation') === '1') return;
    document.documentElement.setAttribute('data-t7-cart-header-navigation', '1');
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('.cart-header .area, .cart-header') : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (window.location.pathname.replace(/\/+$/, '') !== '/carrinho') {
        window.location.href = '/carrinho/';
      }
    }, true);
  }

  function ensureMobileConsentStyles() {
    if (document.getElementById('t7-mobile-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-mobile-consent-styles';
    style.textContent = [
      '.banner-info .item.t7-benefit-clone{display:none!important;}',
      '@keyframes t7-benefits-marquee-right{from{transform:translate3d(calc(-1 * var(--t7-benefits-loop-width, 0px)),0,0);}to{transform:translate3d(0,0,0);}}',
      '@media (max-width:767px){',
      '#cookie-banner[class*="adopt-"]{left:8px!important;right:8px!important;bottom:8px!important;top:auto!important;width:auto!important;max-width:calc(100vw - 16px)!important;max-height:none!important;padding:8px 10px!important;border-radius:12px!important;overflow:visible!important;box-shadow:0 12px 30px rgba(17,17,17,.22)!important;}',
      '#cookie-banner[class*="adopt-"]>div,#cookie-banner[class*="adopt-"]>div>div{width:auto!important;height:auto!important;min-height:0!important;max-height:none!important;}',
      '#cookie-banner[class*="adopt-"] *{max-width:100%!important;}',
      '#cookie-banner[class*="adopt-"] button{min-height:32px!important;padding:0 10px!important;font-size:12px!important;line-height:1.2!important;}',
      '#cookie-banner[class*="adopt-"]{padding:6px 8px!important;max-height:108px!important;overflow:hidden!important;}',
      '#cookie-banner[class*="adopt-"]>div{padding:0!important;}',
      '#cookie-banner-title{margin:0!important;font-size:11px!important;line-height:1.1!important;}',
      '#cookie-banner-content{display:none!important;}',
      '#cookie-banner[class*="adopt-"] small,#cookie-banner[class*="adopt-"] span,#cookie-banner[class*="adopt-"] a{font-size:10px!important;line-height:1.15!important;}',
      '#cookie-banner[class*="adopt-"] [class*="ljQBSt"]{gap:6px!important;margin-top:4px!important;align-items:center!important;justify-content:flex-end!important;}',
      '#cookie-banner[class*="adopt-"] button{min-height:28px!important;padding:0 8px!important;font-size:11px!important;}',
      '#adopt-controller-button[class*="adopt-"]{display:none!important;}',
      '.nav-mobile{display:none!important;position:fixed!important;top:0!important;bottom:0!important;left:0!important;width:min(305px,86vw)!important;max-width:86vw!important;transform:translateX(-100%)!important;transition:transform 220ms ease,opacity 220ms ease!important;will-change:transform!important;z-index:2147483000!important;pointer-events:auto!important;}',
      '.nav-mobile.active,body.menu-open .nav-mobile,body.nav-open .nav-mobile,.nav-mobile[style*="opacity: 1"],.nav-mobile[style*="left: 0"],.nav-mobile[style*="left:0"]{display:flex!important;transform:translateX(0)!important;}',
      '.nav-mobile .header-nav,.nav-mobile .content-nav,.nav-mobile .close-nav,.nav-mobile button,.nav-mobile a{position:relative!important;z-index:2147483001!important;pointer-events:auto!important;}',
      'body.menu-open .wrapper.menu-icons,body.nav-open .wrapper.menu-icons{pointer-events:none!important;}',
      '.page-search .info,.page-busca .info,.page-content .info{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;padding:18px 16px!important;box-sizing:border-box!important;flex-direction:column!important;align-items:stretch!important;overflow-wrap:anywhere!important;}',
      '.page-search .info li,.page-busca .info li,.page-content .info li{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important;}',
      '.page-search .info .title-info,.page-busca .info .title-info,.page-content .info .title-info{width:auto!important;max-width:100%!important;overflow-wrap:anywhere!important;white-space:normal!important;}',
      'html.page-home .banner-info{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;box-sizing:border-box!important;background:#fff!important;}',
      'html.page-home .banner-info,html.page-home .banner-info .open_desk,html.page-home .banner-info .item{height:auto!important;min-height:0!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .open_desk{display:flex!important;flex-wrap:nowrap!important;justify-content:flex-start!important;align-items:center!important;width:max-content!important;min-width:max-content!important;gap:0!important;animation:t7-benefits-marquee-right 12s linear infinite!important;animation-play-state:running!important;animation-delay:0s!important;will-change:transform!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .item{display:flex!important;flex:0 0 252px!important;width:252px!important;max-width:252px!important;padding:0 10px!important;box-sizing:border-box!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .item.t7-benefit-clone{display:flex!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .line{width:100%!important;justify-content:flex-start!important;gap:8px!important;margin:6px 0!important;min-height:48px!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .line .icon{flex:0 0 auto!important;max-height:40px!important;width:auto!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .line .text{display:block!important;min-width:0!important;white-space:normal!important;font-size:11px!important;line-height:1.15!important;}',
      'html.page-home .banner-info.t7-benefits-marquee-ready .line .featured{display:block!important;white-space:nowrap!important;font-size:11px!important;line-height:1.1!important;}',
      'a[href*="/carrinho"],a[href*="carrinho"],.t7-cart-link,[data-cart-trigger],footer a,.footer a,.page-search .info a,.page-busca .info a,.page-content .info a,.checkout a,.checkout-page a,.page-checkout a{min-height:36px!important;display:inline-flex!important;align-items:center!important;}',
      'select,input[type="search"],input[type="text"],input[type="email"],input[type="tel"],button{min-height:36px!important;}',
      '}',
      '@media (max-width:767px) and (prefers-reduced-motion:reduce){html.page-home .banner-info.t7-benefits-marquee-ready .open_desk{animation:t7-benefits-marquee-right 18s linear infinite!important;animation-play-state:running!important;}html.page-home .banner-info.t7-benefits-marquee-ready .item.t7-benefit-clone{display:flex!important;}}',
      '@media (min-width:768px){.header .nav .sub-line-category{max-width:calc(100vw - 24px)!important;}.header .nav .list>li:nth-last-child(-n+2)>.sub-line-category{left:auto!important;right:0!important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureMobileBenefitsMarquee() {
    var banner = document.querySelector('html.page-home .banner-info');
    var track = banner && banner.querySelector('.open_desk');
    if (!banner || !track || banner.getAttribute('data-t7-benefits-marquee') === '1') return;

    var items = Array.prototype.slice.call(track.children).filter(function (child) {
      return child && child.classList && child.classList.contains('item') && !child.classList.contains('t7-benefit-clone');
    });
    if (items.length < 2) return;

    items.forEach(function (item) {
      var clone = item.cloneNode(true);
      clone.classList.add('t7-benefit-clone');
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });

    function updateLoopWidth() {
      var originals = Array.prototype.slice.call(track.children).filter(function (child) {
        return child && child.classList && child.classList.contains('item') && !child.classList.contains('t7-benefit-clone');
      });
      if (!originals.length) return;
      var firstRect = originals[0].getBoundingClientRect();
      var lastRect = originals[originals.length - 1].getBoundingClientRect();
      var width = Math.max(0, lastRect.right - firstRect.left);
      if (width > 0) {
        track.style.setProperty('--t7-benefits-loop-width', width.toFixed(3) + 'px');
      }
    }

    var marqueeFrame = 0;
    var marqueeX = 0;
    var marqueeLastTime = 0;

    function isMobileBenefitsViewport() {
      return !window.matchMedia || window.matchMedia('(max-width: 767px)').matches;
    }

    function getLoopWidth() {
      var width = parseFloat(track.style.getPropertyValue('--t7-benefits-loop-width'));
      return Number.isFinite(width) && width > 0 ? width : track.scrollWidth / 2;
    }

    function stopMarqueeTicker() {
      if (marqueeFrame) {
        window.cancelAnimationFrame(marqueeFrame);
        marqueeFrame = 0;
      }
      marqueeLastTime = 0;
    }

    function tickMarquee(now) {
      if (!isMobileBenefitsViewport()) {
        stopMarqueeTicker();
        track.style.removeProperty('animation');
        track.style.transform = '';
        return;
      }

      var loopWidth = getLoopWidth();
      if (!loopWidth) {
        marqueeFrame = window.requestAnimationFrame(tickMarquee);
        return;
      }

      track.style.setProperty('animation', 'none', 'important');
      if (!marqueeLastTime) {
        marqueeLastTime = now;
        marqueeX = -loopWidth;
      }

      var elapsed = Math.min(64, now - marqueeLastTime);
      marqueeLastTime = now;
      var speed = loopWidth / 12000;
      marqueeX += elapsed * speed;
      while (marqueeX >= 0) {
        marqueeX -= loopWidth;
      }
      track.style.transform = 'translate3d(' + marqueeX.toFixed(2) + 'px,0,0)';
      marqueeFrame = window.requestAnimationFrame(tickMarquee);
    }

    function startMarqueeTicker() {
      stopMarqueeTicker();
      marqueeX = -getLoopWidth();
      marqueeFrame = window.requestAnimationFrame(tickMarquee);
    }

    banner.classList.add('t7-benefits-marquee-ready');
    banner.setAttribute('data-t7-benefits-marquee', '1');
    updateLoopWidth();
    window.setTimeout(function () { updateLoopWidth(); startMarqueeTicker(); }, 120);
    window.setTimeout(function () { updateLoopWidth(); startMarqueeTicker(); }, 800);
    startMarqueeTicker();
    window.addEventListener('resize', function () {
      updateLoopWidth();
      startMarqueeTicker();
    }, { passive: true });
    window.addEventListener('orientationchange', function () {
      window.setTimeout(function () { updateLoopWidth(); startMarqueeTicker(); }, 180);
    }, { passive: true });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      if (document.body) window.setTimeout(fn, 0);
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  patchFetch();
  patchXhr();

  var jqueryPatchTimer = window.setInterval(function () {
    if (patchJquery()) window.clearInterval(jqueryPatchTimer);
  }, 25);
  window.setTimeout(function () { window.clearInterval(jqueryPatchTimer); }, 8000);

  onReady(function () {
    ensureMobileConsentStyles();
    ensureMobileBenefitsMarquee();
    normalizeSearchForms();
    bindHeaderSearchAutocomplete();
    normalizeMenuLinks();
    normalizeCartHeaderNavigation();
    normalizeNewsletterForms();
    normalizeUnavailableNotice();
    normalizePaymentLabels();
    ensureVisitedProductCardStyles();
    ensureRelatedShowcaseCardStyles();
    ensureProductRailHoverOverflowStyles();
    ensureVisitedHeadingLayoutStyles();
    ensureFooterSocialContacts();
    ensureFooterTrustBadges();
    ensureTestimonialsDesktopGrid();
    ensureMobileCatalogFilterStyles();
    normalizeMobileCatalogFilterControls();
    bindMobileCatalogFilterPanel();
    hideCustomerVisibleProductCodes();
    startProductCodeVisibilityObserver();
    ensureFallbackProductPage();
    bindProductFreightCalculator();
    ensureFallbackCatalogPage();
    bindBackendCatalogFilters();
    normalizeCurrentBrandFilters();
    ensureProductCardLinks();
    normalizeRelatedProductCards();
    removeRelatedInlinePurchaseControls();
    bindUnifiedProductCardClicks();
    renderVisitedProducts();
    syncVisitedProductCardSize();
    bindVisitedProductsCarousel();
    ensureProductImagesVisible();
    ensureProductCardImagesVisible();
    ensureProductGalleryControls();

    var imageFixRuns = 0;
    var imageFixTimer = window.setInterval(function () {
      imageFixRuns += 1;
      ensureProductImagesVisible();
      ensureProductCardImagesVisible();
      ensureProductGalleryControls();
      bindProductFreightCalculator();
      normalizePaymentLabels();
      ensureVisitedProductCardStyles();
      ensureRelatedShowcaseCardStyles();
      ensureProductRailHoverOverflowStyles();
      ensureVisitedHeadingLayoutStyles();
      ensureFooterSocialContacts();
      ensureFooterTrustBadges();
      ensureTestimonialsDesktopGrid();
      ensureMobileCatalogFilterStyles();
      normalizeMobileCatalogFilterControls();
      bindMobileCatalogFilterPanel();
      hideCustomerVisibleProductCodes();
      bindBackendCatalogFilters();
      normalizeCurrentBrandFilters();
      ensureProductCardLinks();
      bindHeaderSearchAutocomplete();
      normalizeRelatedProductCards();
      removeRelatedInlinePurchaseControls();
      syncVisitedProductCardSize();
      bindVisitedProductsCarousel();
      if (imageFixRuns >= 60) window.clearInterval(imageFixTimer);
    }, 250);

    window.addEventListener('load', function () {
      ensureProductCardLinks();
      bindHeaderSearchAutocomplete();
      normalizeRelatedProductCards();
      removeRelatedInlinePurchaseControls();
      renderVisitedProducts();
      syncVisitedProductCardSize();
      bindVisitedProductsCarousel();
      ensureProductImagesVisible();
      ensureProductCardImagesVisible();
      bindProductFreightCalculator();
      ensureVisitedProductCardStyles();
      ensureRelatedShowcaseCardStyles();
      ensureProductRailHoverOverflowStyles();
      ensureVisitedHeadingLayoutStyles();
      ensureFooterSocialContacts();
      ensureFooterTrustBadges();
      ensureTestimonialsDesktopGrid();
      ensureMobileCatalogFilterStyles();
      normalizeMobileCatalogFilterControls();
      bindMobileCatalogFilterPanel();
      hideCustomerVisibleProductCodes();
      normalizePaymentLabels();
      bindBackendCatalogFilters();
      normalizeCurrentBrandFilters();
    }, { once: true });

    document.addEventListener('tech7:price-loaded', function () {
      renderVisitedProducts();
      syncVisitedProductCardSize();
      bindVisitedProductsCarousel();
    });

    window.addEventListener('resize', function () {
      window.clearTimeout(window.__t7VisitedResizeTimer);
      window.__t7VisitedResizeTimer = window.setTimeout(function () {
        syncVisitedProductCardSize();
        bindVisitedProductsCarousel();
      }, 120);
    });
  });

  window.Tech7LocalRuntime = {
    active: true,
    isTrayUrl: isTrayUrl,
    localResponse: localResponse,
    refreshForms: function () {
      normalizeSearchForms();
      bindHeaderSearchAutocomplete();
      normalizeMenuLinks();
      normalizeNewsletterForms();
      normalizeUnavailableNotice();
      normalizePaymentLabels();
      ensureVisitedProductCardStyles();
      ensureProductRailHoverOverflowStyles();
      ensureVisitedHeadingLayoutStyles();
      ensureFooterSocialContacts();
      ensureFooterTrustBadges();
      ensureTestimonialsDesktopGrid();
      ensureMobileCatalogFilterStyles();
      normalizeMobileCatalogFilterControls();
      bindMobileCatalogFilterPanel();
      hideCustomerVisibleProductCodes();
      startProductCodeVisibilityObserver();
      ensureFallbackProductPage();
      bindProductFreightCalculator();
      ensureFallbackCatalogPage();
      bindBackendCatalogFilters();
      normalizeCurrentBrandFilters();
      ensureProductCardLinks();
      normalizeRelatedProductCards();
      removeRelatedInlinePurchaseControls();
      bindUnifiedProductCardClicks();
      renderVisitedProducts();
      syncVisitedProductCardSize();
      bindVisitedProductsCarousel();
      ensureProductImagesVisible();
      ensureProductCardImagesVisible();
      ensureProductGalleryControls();
    }
  };
})();
