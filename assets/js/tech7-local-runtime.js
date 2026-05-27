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
      title: normalizeCardText(title),
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
    var index = { byRoute: {}, byTitle: {} };
    var items = payload && Array.isArray(payload.items) ? payload.items : [];
    items.forEach(function (item) {
      if (!item || !item.image) return;
      if (item.url) index.byRoute[normalizeCardRoute('/' + String(item.url).replace(/^\/+/, ''))] = item.image;
      if (item.title) index.byTitle[normalizeCardText(item.title)] = item.image;
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
        ensureProductCardImagesVisible();
      })
      .catch(function () {
        cardSearchIndex = { byRoute: {}, byTitle: {} };
      })
      .finally(function () {
        cardSearchIndexLoading = false;
      });
  }

  function cardImageCandidate(img) {
    var info = cardInfoFromImage(img);
    if (!info) return '';

    if (cardSearchIndex) {
      var indexed = (info.route && cardSearchIndex.byRoute[info.route]) || (info.title && cardSearchIndex.byTitle[info.title]) || '';
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

    return Object.keys(srcs).length < items.length ||
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
  }

  function updateGalleryArrowState(productRoot) {
    var mainList = productRoot.querySelector('.image-show .list');
    var mainSwiper = mainList && mainList.swiper;
    var mainSlides = productRoot.querySelectorAll('.image-show .swiper-slide');
    var prev = productRoot.querySelector('.nav-images .controls .prev');
    var next = productRoot.querySelector('.nav-images .controls .next');
    if (!prev || !next) return;

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

    var target = Math.max(0, Math.min(index, total - 1));
    productRoot.setAttribute('data-t7-gallery-index', String(target));

    if (mainSwiper) {
      mainSwiper.slideTo(target);
    } else if (mainWrapper && mainList) {
      var width = Math.round(mainList.getBoundingClientRect().width || (mainSlides[0] && mainSlides[0].getBoundingClientRect().width) || 0);
      if (width > 0) {
        mainWrapper.style.setProperty('transform', 'translate3d(' + (-target * width) + 'px, 0px, 0px)', 'important');
        mainWrapper.style.setProperty('transition-duration', '250ms', 'important');
      }
      mainSlides.forEach(function (slide, slideIndex) {
        slide.classList.toggle('swiper-slide-active', slideIndex === target);
        slide.classList.toggle('swiper-slide-prev', slideIndex === target - 1);
        slide.classList.toggle('swiper-slide-next', slideIndex === target + 1);
      });
    }

    if (navSwiper && navSwiper.slides && navSwiper.slides.length > target) {
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

    productRoot.querySelectorAll('.nav-images .box-img, .image-show .box-img, .nav-images .swiper-slide, .image-show .swiper-slide').forEach(function (box) {
      var boxIndex = box.getAttribute('data-index') || String(Array.prototype.indexOf.call(box.parentNode ? box.parentNode.children : [], box) + 1);
      box.classList.toggle('active', String(boxIndex) === String(target + 1));
    });

    revealProductGalleryImage(activeGalleryImage(productRoot));
    updateGalleryArrowState(productRoot);
  }

  function ensureProductGalleryControls() {
    var productRoot = document.querySelector('#product-container, .page-product .box-col-product, .box-col-product');
    if (!productRoot) return;
    normalizeProductGalleryLayout(productRoot);
    if (productRoot.getAttribute('data-t7-gallery-controls') === '1') {
      updateGalleryArrowState(productRoot);
      return;
    }
    if (!productRoot.querySelector('.image-show .list') || !productRoot.querySelector('.nav-images .list')) return;

    productRoot.setAttribute('data-t7-gallery-controls', '1');

    productRoot.addEventListener('click', function (event) {
      var thumb = event.target.closest && event.target.closest('.nav-images .box-img[data-index]');
      if (thumb && productRoot.contains(thumb)) {
        var index = parseInt(thumb.getAttribute('data-index'), 10) - 1;
        if (Number.isFinite(index)) {
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
      if (!mainSwiper || !mainSwiper.slides || mainSwiper.slides.length <= 1) return;

      var current = mainSwiper.activeIndex || 0;
      var target = next ? current + 1 : current - 1;
      if (target < 0 || target >= mainSwiper.slides.length) {
        updateGalleryArrowState(productRoot);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveGalleryIndex(productRoot, target);
    }, true);

    window.setTimeout(function () { updateGalleryArrowState(productRoot); }, 0);
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
    normalizeSearchForms();
    normalizeMenuLinks();
    normalizeNewsletterForms();
    normalizeUnavailableNotice();
    normalizePaymentLabels();
    ensureFallbackProductPage();
    ensureFallbackCatalogPage();
    bindBackendCatalogFilters();
    normalizeCurrentBrandFilters();
    ensureProductImagesVisible();
    ensureProductCardImagesVisible();
    ensureProductGalleryControls();

    var imageFixRuns = 0;
    var imageFixTimer = window.setInterval(function () {
      imageFixRuns += 1;
      ensureProductImagesVisible();
      ensureProductCardImagesVisible();
      ensureProductGalleryControls();
      normalizePaymentLabels();
      bindBackendCatalogFilters();
      normalizeCurrentBrandFilters();
      if (imageFixRuns >= 60) window.clearInterval(imageFixTimer);
    }, 250);

    window.addEventListener('load', function () {
      ensureProductImagesVisible();
      ensureProductCardImagesVisible();
      normalizePaymentLabels();
      bindBackendCatalogFilters();
      normalizeCurrentBrandFilters();
    }, { once: true });
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
      normalizePaymentLabels();
      ensureFallbackProductPage();
      ensureFallbackCatalogPage();
      bindBackendCatalogFilters();
      normalizeCurrentBrandFilters();
      ensureProductImagesVisible();
      ensureProductCardImagesVisible();
      ensureProductGalleryControls();
    }
  };
})();
