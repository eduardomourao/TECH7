(function () {
  'use strict';

  if (window.Tech7LocalRuntime && window.Tech7LocalRuntime.active) return;

  var TRAY_PATH = /^(\/(?:mvc\/store|nocache|web_api)(?:\/|$))/i;
  var LOCAL_CART_API_PATH = /^\/api\/cart(?:\/|$)/i;
  var LOCAL_CART_KEY = 'carrinho';
  var LOCAL_CART_ID_KEY = 't7_cart_id';

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
      var payload = localResponse(input, init || {}) || localApiResponse(input, init || {});
      if (payload) return Promise.resolve(responseForFetch(payload));
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
          var q = document.createElement('input');
          q.type = 'hidden';
          q.name = 'q';
          q.value = field.value || '';
          form.appendChild(q);
        }
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

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  patchFetch();
  patchXhr();

  var jqueryPatchTimer = window.setInterval(function () {
    if (patchJquery()) window.clearInterval(jqueryPatchTimer);
  }, 25);
  window.setTimeout(function () { window.clearInterval(jqueryPatchTimer); }, 8000);

  onReady(function () {
    normalizeSearchForms();
    normalizeMenuLinks();
    normalizeNewsletterForms();
    normalizeUnavailableNotice();
  });

  window.Tech7LocalRuntime = {
    active: true,
    isTrayUrl: isTrayUrl,
    localResponse: localResponse,
    refreshForms: function () {
      normalizeSearchForms();
      normalizeMenuLinks();
      normalizeNewsletterForms();
      normalizeUnavailableNotice();
    }
  };
})();
