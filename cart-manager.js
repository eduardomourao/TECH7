/**
 * cart-manager.js v3 — Gerenciador Global do Carrinho TECH 7
 * Chave localStorage: "carrinho"
 * Evento: "carrinhoAtualizado"
 * Auto-injeta dropdown no header em qualquer página
 */
(function (global) {
  'use strict';

  var LS_KEY = 'carrinho';
  var CART_ID_KEY = 't7_cart_id';
  var LOCAL_CHANGED_KEY = 't7_cart_local_changed_at';
  var LOCAL_CHANGE_WINDOW_MS = 5 * 60 * 1000;
  var CART_PRICE_STATUS_EVENT = 'tech7:cart-prices-sync';

  /* ------------------------------------------------------------------ */
  /* Utilitários                                                         */
  /* ------------------------------------------------------------------ */

  function _parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
    if (!value) return 0;
    var str = String(value).trim().replace(/[^\d,.-]/g, '');
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.indexOf(',') > -1) str = str.replace(',', '.');
    var n = parseFloat(str);
    return Number.isFinite(n) ? Math.abs(n) : 0;
  }

  function _formatMoney(value) {
    return Number(_parseMoney(value)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function _cartPriceLabel(value) {
    if (global.T7_CART_PRICES_STATUS === 'pending') return 'Atualizando preco';
    if (global.T7_CART_PRICES_STATUS === 'error') return 'Preco indisponivel';
    return _formatMoney(value);
  }

  function _normalizeItem(raw, idx) {
    var id = String(raw.id || raw.productId || raw.sku || 'prod-' + idx);
    return {
      id:        id,
      nome:      String(raw.nome || raw.name || raw.titulo || 'Produto TECH 7'),
      preco:     _parseMoney(raw.preco != null ? raw.preco : (raw.price != null ? raw.price : 0)),
      quantidade: Math.max(1, Math.abs(parseInt(raw.quantidade || raw.qty || raw.quantity || 1, 10) || 1)),
      imagem:    String(raw.imagem || raw.img || raw.image || ''),
      variacao:  String(raw.variacao || raw.variant || raw.opcao || ''),
      url:       String(raw.url || ''),
    };
  }

  function _cartLookup(produto) {
    var slug = produto.slug || '';
    if (!slug && produto.url) {
      var path = String(produto.url).replace(/^https?:\/\/[^/]+/i, '').split('?')[0].replace(/\/+$/, '');
      var parts = path.split('/').filter(Boolean);
      if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') parts.pop();
      slug = parts[parts.length - 1] || '';
      if (!produto.marca && parts.length >= 3) produto.marca = parts[parts.length - 2] || '';
      if (!produto.section && !produto.secao && parts.length >= 3) produto.section = parts[parts.length - 3] || '';
    }
    return {
      id: produto.id || produto.productId || '',
      slug: slug,
      marca: produto.marca || produto.brand || '',
      secao: produto.section || produto.secao || produto.categoria || ''
    };
  }

  function _applyOfficialPrice(produto, result) {
    if (result && result.found && result.price > 0) {
      produto.preco = result.price;
      produto.price = result.price;
    } else {
      produto.preco = 0;
      produto.price = 0;
      console.warn('[cartManager] produto sem preco valido no backend', produto);
    }
    return produto;
  }

  function _resultFromResolveItem(item, fallback) {
    item = item || {};
    var cents = Number(item.price_cents || 0);
    var price = Number.isFinite(cents) ? cents / 100 : 0;
    return {
      found: !!item.found,
      price: price >= 2 ? price : 0,
      secao: item.section || fallback.secao,
      marca: item.brand || fallback.marca,
      slug: item.slug || fallback.slug
    };
  }

  function _resultFromResolvePayload(payload, fallback) {
    var items = Array.isArray(payload && payload.items) ? payload.items : [];
    return _resultFromResolveItem(items[0], fallback);
  }

  function _resolveOfficialPrice(produto) {
    if (!produto) return Promise.resolve(produto);

    var lookup = _cartLookup(produto);
    if (!lookup.slug && !lookup.id) return Promise.resolve(produto);

    var resolver = global.Tech7Prices && typeof global.Tech7Prices.resolve === 'function'
      ? global.Tech7Prices.resolve(lookup)
      : _fetchJson('/api/products/resolve-prices', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            items: [{
              id: lookup.id,
              productId: lookup.id,
              slug: lookup.slug,
              section: lookup.secao,
              brand: lookup.marca
            }]
          })
        }).then(function (payload) {
          return _resultFromResolvePayload(payload, lookup);
        });

    return resolver.then(function (result) {
      return _applyOfficialPrice(produto, result);
    }).catch(function (err) {
      produto.preco = 0;
      produto.price = 0;
      console.warn('[cartManager] falha ao resolver preco no backend', err);
      return produto;
    });
  }

  function _resolveOfficialPrices(produtos) {
    if (!Array.isArray(produtos) || !produtos.length) return Promise.resolve([]);

    var lookups = produtos.map(function (produto) {
      return _cartLookup(produto || {});
    });
    var requestItems = lookups.map(function (lookup) {
      return {
        id: lookup.id,
        productId: lookup.id,
        slug: lookup.slug,
        section: lookup.secao,
        brand: lookup.marca,
        secao: lookup.secao,
        marca: lookup.marca
      };
    });

    var canUseFrontendBatch = requestItems.every(function (item) { return !!item.slug; });
    var resolver = canUseFrontendBatch && global.Tech7Prices && typeof global.Tech7Prices.resolveBatch === 'function'
      ? global.Tech7Prices.resolveBatch(requestItems)
      : _fetchJson('/api/products/resolve-prices', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: requestItems })
        }).then(function (payload) {
          return Array.isArray(payload && payload.items) ? payload.items : [];
        });

    return resolver.then(function (results) {
      results = Array.isArray(results) ? results : [];
      return produtos.map(function (produto, index) {
        var lookup = lookups[index] || {};
        var hasLookup = !!(lookup.slug || lookup.id);
        return _applyOfficialPrice(produto, hasLookup ? _resultFromResolveItem(results[index], lookup) : { found: false, price: 0 });
      });
    }).catch(function (err) {
      console.warn('[cartManager] falha ao resolver precos em lote no backend', err);
      return produtos.map(function (produto) {
        produto.preco = 0;
        produto.price = 0;
        return produto;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Persistência                                                        */
  /* ------------------------------------------------------------------ */

  function _load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(_normalizeItem) : [];
    } catch (e) { return []; }
  }

  function _save(items) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch (e) {}
  }

  function _setCartPriceStatus(status) {
    global.T7_CART_PRICES_STATUS = status;
    try {
      document.dispatchEvent(new CustomEvent(CART_PRICE_STATUS_EVENT, { detail: { status: status }, bubbles: true }));
    } catch (e) {}
  }

  function _refreshOfficialCartPrices() {
    var items = _load();
    if (!items.length) {
      _setCartPriceStatus('ready');
      return Promise.resolve(items);
    }

    _setCartPriceStatus('pending');
    return _resolveOfficialPrices(items).then(function (resolved) {
      _save(resolved);
      _dispatch(resolved);
      _setCartPriceStatus('ready');
      return resolved;
    }).catch(function (err) {
      console.warn('[cartManager] falha ao atualizar precos oficiais do carrinho', err);
      _setCartPriceStatus('error');
      return items;
    });
  }

  function _markLocalChanged() {
    try { localStorage.setItem(LOCAL_CHANGED_KEY, String(Date.now())); } catch (e) {}
  }

  function _hasRecentLocalChange() {
    try {
      var value = parseInt(localStorage.getItem(LOCAL_CHANGED_KEY) || '0', 10) || 0;
      return value > 0 && Date.now() - value < LOCAL_CHANGE_WINDOW_MS;
    } catch (e) {
      return false;
    }
  }

  function _getCartId() {
    try { return localStorage.getItem(CART_ID_KEY) || ''; } catch (e) { return ''; }
  }

  function _setCartId(id) {
    try {
      if (id) localStorage.setItem(CART_ID_KEY, id);
      else localStorage.removeItem(CART_ID_KEY);
    } catch (e) {}
  }

  function _isLocalCartId(id) {
    id = String(id || '');
    return id === 'local-cart' || /^local-/i.test(id);
  }

  function _sanitizeCartId(value) {
    var id = String(value || '').trim();
    return /^[a-z0-9_-]{4,120}$/i.test(id) ? id : '';
  }

  function _getCartIdFromUrl() {
    try {
      var params = new URLSearchParams(global.location.search || '');
      return _sanitizeCartId(params.get('cart') || params.get('cart_id') || '');
    } catch (e) {
      return '';
    }
  }

  function _removeCartIdFromUrl() {
    try {
      if (!global.history || !global.location) return;
      var url = new URL(global.location.href);
      if (!url.searchParams.has('cart') && !url.searchParams.has('cart_id')) return;
      url.searchParams.delete('cart');
      url.searchParams.delete('cart_id');
      global.history.replaceState(global.history.state, document.title, url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function _adoptCartIdFromUrl() {
    var cartId = _getCartIdFromUrl();
    if (!cartId) return '';
    _setCartId(cartId);
    try { localStorage.removeItem(LOCAL_CHANGED_KEY); } catch (e) {}
    _removeCartIdFromUrl();
    return cartId;
  }

  function _productUrlFromServer(item) {
    if (!item || !item.slug) return '';
    var parts = [];
    var section = String(item.section || '').replace(/^\/+|\/+$/g, '');
    var brand = String(item.brand || '').replace(/^\/+|\/+$/g, '');
    var slug = String(item.slug || '').replace(/^\/+|\/+$/g, '');
    if (section) parts.push(section);
    if (brand && brand !== section && brand !== 'tech7' && brand !== 'catalogo') parts.push(brand);
    if (slug) parts.push(slug);
    if (!parts.length) return '';
    parts.push('index.html');
    return parts.join('/');
  }

  function _normalizeProductUrl(value) {
    var clean = String(value || '').trim().replace(/\\/g, '/');
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) {
      try {
        var parsed = new URL(clean, global.location && global.location.origin ? global.location.origin : undefined);
        clean = parsed.pathname || '';
      } catch (e) {
        return '';
      }
    }
    clean = clean.split('#')[0].split('?')[0].replace(/^\/+|\/+$/g, '');
    if (!clean || /['"<>\s]|(?:\+)|(?:productUrl\()/i.test(clean)) return '';
    if (!/^[a-z0-9._~/%-]+$/i.test(clean)) return '';
    if (!/\.html$/i.test(clean)) clean += '/index.html';
    return clean;
  }

  function _mapServerItem(item) {
    return {
      id: String(item.product_id || item.id || ''),
      nome: String(item.name || item.nome || 'Produto TECH 7'),
      preco: Number((item.price_cents || 0) / 100),
      quantidade: Math.max(1, Number(item.qty || item.quantidade || 1)),
      imagem: String(item.image_url || item.imagem || ''),
      variacao: '',
      url: _normalizeProductUrl(item.url || item.product_url) || _productUrlFromServer(item)
    };
  }

  function _localServerCart(id) {
    return {
      id: id || 'local-cart',
      status: 'open',
      items: _load().map(function (item) {
        return {
          product_id: String(item.id || ''),
          name: String(item.nome || item.name || 'Produto TECH 7'),
          qty: Math.max(1, parseInt(item.quantidade || item.qty || item.quantity || 1, 10) || 1),
          price_cents: Math.round(_parseMoney(item.preco != null ? item.preco : item.price) * 100),
          image_url: String(item.imagem || item.image || ''),
          url: String(item.url || ''),
          product_url: String(item.url || '')
        };
      })
    };
  }

  function _fetchJson(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (txt) {
        var json = {};
        try { json = txt ? JSON.parse(txt) : {}; } catch (e) {}
        if (!res.ok) {
          var err = new Error('http_' + res.status);
          err.status = res.status;
          err.body = json;
          throw err;
        }
        return json;
      });
    });
  }

  function _syncFromServerCart(cart, preserveLocalWhenServerEmpty) {
    if (!cart || !Array.isArray(cart.items)) return [];
    var local = _load();
    if (preserveLocalWhenServerEmpty && _hasRecentLocalChange()) {
      _dispatch(local);
      return local;
    }
    if (preserveLocalWhenServerEmpty && cart.items.length === 0 && local.length > 0) {
      _dispatch(local);
      return local;
    }
    var byId = {};
    for (var i = 0; i < local.length; i++) {
      byId[local[i].id] = local[i];
    }
    var next = cart.items.map(function (item) {
      var mapped = _mapServerItem(item);
      var current = byId[mapped.id];
      if (current) {
        if (current.url) mapped.url = current.url;
        if (current.variacao) mapped.variacao = current.variacao;
        if (current.imagem && !mapped.imagem) mapped.imagem = current.imagem;
      }
      return mapped;
    }).filter(function (it) { return !!it.id; });
    _save(next);
    _dispatch(next);
    return next;
  }

  function _ensureServerCart(options) {
    var forceServer = !!(options && options.forceServer);
    var cid = _getCartId();
    if (cid) {
      if (_isLocalCartId(cid)) {
        var localCart = _localServerCart(cid);
        _syncFromServerCart(localCart, !forceServer);
        return Promise.resolve(localCart);
      }
      return _fetchJson('/api/cart/' + encodeURIComponent(cid), { cache: 'no-store' })
        .then(function (cart) {
          _setCartId(cart.id);
          _syncFromServerCart(cart, !forceServer);
          return cart;
        })
        .catch(function () {
          _setCartId('');
          return _fetchJson('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' } })
            .then(function (cart) {
              _setCartId(cart.id);
              _syncFromServerCart(cart, true);
              return cart;
            });
        });
    }
    return _fetchJson('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (cart) {
        _setCartId(cart.id);
        _syncFromServerCart(cart, true);
        return cart;
      });
  }

  function _syncItemServer(productId, qty, retry, productSnapshot) {
    return _ensureServerCart().then(function (cart) {
      return _fetchJson('/api/cart/' + encodeURIComponent(cart.id) + '/items', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: String(productId), qty: Number(qty), product: productSnapshot || null })
      });
    }).then(function (updatedCart) {
      _syncFromServerCart(updatedCart);
      return updatedCart;
    }).catch(function (err) {
      var code = err && err.body && err.body.error;
      if (!retry && (code === 'cart_closed' || code === 'cart_not_found')) {
        _setCartId('');
        return _syncItemServer(productId, qty, true, productSnapshot);
      }
      throw err;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Notificação                                                        */
  /* ------------------------------------------------------------------ */

  function _dispatch(items) {
    var event;
    try {
      event = new CustomEvent('carrinhoAtualizado', { detail: { items: items }, bubbles: true });
    } catch (e) {
      event = document.createEvent('Event');
      event.initEvent('carrinhoAtualizado', true, true);
      event.detail = { items: items };
    }
    document.dispatchEvent(event);
  }

  function _mutate(updater) {
    var items = _load();
    var next  = updater(items);
    _markLocalChanged();
    _save(next);
    _dispatch(next);
    return next;
  }

  /* ------------------------------------------------------------------ */
  /* API pública                                                        */
  /* ------------------------------------------------------------------ */

  var cartManager = {
    adicionar: function (produto) {
      if (!produto || !produto.id) { console.warn('[cartManager] adicionar: invalido', produto); return; }
      return _resolveOfficialPrice(produto).then(function (produtoResolvido) {
        produto = produtoResolvido || produto;
      if (_parseMoney(produto.preco != null ? produto.preco : produto.price) < 2) {
        console.warn('[cartManager] adicionar: preco indisponivel no backend', produto);
        return _load();
      }
      var nextItems = _mutate(function (items) {
        var existing = null;
        for (var i = 0; i < items.length; i++) {
          if (items[i].id === String(produto.id)) { existing = items[i]; break; }
        }
        if (existing) {
          existing.quantidade += (parseInt(produto.quantidade || produto.qty || 1, 10) || 1);
          var novoPreco = _parseMoney(produto.preco != null ? produto.preco : produto.price);
          if (novoPreco > 0) existing.preco = novoPreco;
          if (produto.imagem || produto.image) existing.imagem = String(produto.imagem || produto.image || '');
          if (produto.url) existing.url = String(produto.url || '');
        } else {
          items.push(_normalizeItem(produto, items.length));
        }
        return items;
      });
      var finalQty = 1;
      for (var j = 0; j < nextItems.length; j++) {
        if (nextItems[j].id === String(produto.id)) { finalQty = nextItems[j].quantidade; break; }
      }
      return _syncItemServer(String(produto.id), finalQty, false, {
        name: produto.nome || produto.name || produto.titulo || 'Produto TECH 7',
        slug: produto.slug || '',
        brand: produto.marca || produto.brand || 'TECH 7',
        section: produto.section || produto.categoria || 'catalogo',
        image_url: produto.imagem || produto.image || '',
        price: _parseMoney(produto.preco != null ? produto.preco : produto.price)
      }).then(function () {
        return nextItems;
      }).catch(function () {
        return nextItems;
      });
      });
    },

    remover: function (id) {
      var nextItems = _mutate(function (items) { return items.filter(function (it) { return it.id !== String(id); }); });
      _syncItemServer(String(id), 0).catch(function () {});
      return nextItems;
    },

    atualizar: function (id, novaQuantidade) {
      var qty = parseInt(novaQuantidade, 10) || 0;
      var nextItems = _mutate(function (items) {
        if (qty <= 0) return items.filter(function (it) { return it.id !== String(id); });
        return items.map(function (it) {
          if (it.id === String(id)) it.quantidade = qty;
          return it;
        });
      });
      var snap = null;
      if (qty > 0) {
        for (var k = 0; k < nextItems.length; k++) {
          if (nextItems[k].id === String(id)) {
            snap = {
              name: nextItems[k].nome,
              slug: '',
              brand: 'TECH 7',
              section: 'catalogo',
              image_url: nextItems[k].imagem,
              price: _parseMoney(nextItems[k].preco)
            };
            break;
          }
        }
      }
      _syncItemServer(String(id), Math.max(0, qty), false, snap).catch(function () {});
      return nextItems;
    },

    obter: function () { return _load().slice(); },

    total: function () {
      return _load().reduce(function (sum, it) { return sum + it.preco * it.quantidade; }, 0);
    },

    contar: function () {
      return _load().reduce(function (sum, it) { return sum + it.quantidade; }, 0);
    },
    totalItens: function () {
      return _load().reduce(function (sum, it) { return sum + it.quantidade; }, 0);
    },

    limpar: function () {
      var items = _load();
      for (var i = 0; i < items.length; i++) _syncItemServer(String(items[i].id), 0).catch(function () {});
      return _mutate(function () { return []; });
    },

    formatarMoeda: function (value) { return _formatMoney(value); },
    obterCarrinhoId: function () { return _getCartId(); },
    sincronizarServidor: function () { return _ensureServerCart(); },

    mostrarToast: function (msg, tipo) {
      tipo = tipo || 'success';
      var toast = document.createElement('div');
      toast.className = 'cm-toast cm-toast--' + tipo;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.textContent = msg;
      if (!document.getElementById('cm-toast-style')) {
        var style = document.createElement('style');
        style.id = 'cm-toast-style';
        style.textContent = [
          '.cm-toast{position:fixed;top:18px;right:18px;z-index:9999;padding:14px 22px;',
          'border-radius:10px;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:700;',
          'color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.22);',
          'transform:translateY(-12px);opacity:0;',
          'transition:transform .28s ease,opacity .28s ease;pointer-events:none;}',
          '.cm-toast--success{background:#ff6a00;}',
          '.cm-toast--error{background:#dc2626;}',
          '.cm-toast.cm-toast--in{transform:translateY(0);opacity:1;}',
          '@keyframes cm-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}',
          '.cart-badge--bounce{animation:cm-bounce .3s ease;}',
        ].join('');
        document.head.appendChild(style);
      }
      document.body.appendChild(toast);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { toast.classList.add('cm-toast--in'); });
      });
      setTimeout(function () {
        toast.classList.remove('cm-toast--in');
        setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
      }, 3000);
    },
  };

  /* ------------------------------------------------------------------ */
  /* Badge auto-update                                                    */
  /* ------------------------------------------------------------------ */

  function _updateBadges(count) {
    var badges = document.querySelectorAll('[data-cart-count]');
    for (var i = 0; i < badges.length; i++) {
      var badge = badges[i];
      var display = count >= 10 ? '9+' : String(count);
      badge.textContent = display;
      badge.style.display = count === 0 ? 'none' : '';
    }
  }

  document.addEventListener('carrinhoAtualizado', function (e) {
    var items = (e.detail && e.detail.items) ? e.detail.items : cartManager.obter();
    var count = 0;
    for (var i = 0; i < items.length; i++) count += items[i].quantidade;
    _updateBadges(count);
    _updateDropdown(count, items);
  });

  /* ------------------------------------------------------------------ */
  /* Dropdown do carrinho no header                                       */
  /* ------------------------------------------------------------------ */

  var _dropdown = null;
  var _dropdownVisible = false;

  function _buildDropdown() {
    var d = document.createElement('div');
    d.id = 't7-cart-dropdown';
    d.setAttribute('aria-label', 'Carrinho');
    d.style.cssText = [
      'position:absolute;top:100%;right:0;z-index:99999;',
      'width:340px;max-height:480px;overflow-y:auto;',
      'background:#fff;border:1px solid #e5e7eb;border-radius:10px;',
      'box-shadow:0 12px 40px rgba(0,0,0,.15);',
      'display:none;font-family:Inter,Arial,sans-serif;',
      'color:#0d0d0d;font-size:14px;line-height:1.4;',
    ].join('');
    return d;
  }

  function _attachDropdown() {
    if (document.getElementById('t7-cart-dropdown')) return;

    _dropdown = _buildDropdown();
    document.body.appendChild(_dropdown);

    // Fecha ao clicar fora
    document.addEventListener('click', function (e) {
      if (_dropdownVisible && !e.target.closest('#t7-cart-dropdown') &&
          !e.target.closest('.t7-cart-link') && !e.target.closest('[data-cart-trigger]')) {
        _dropdown.style.display = 'none';
        _dropdownVisible = false;
      }
    });

    // Toggle no clique do carrinho
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('.t7-cart-link, [data-cart-trigger]');
      if (!trigger) return;
      e.preventDefault();
      _dropdownVisible = !_dropdownVisible;
      _dropdown.style.display = _dropdownVisible ? 'block' : 'none';
      if (_dropdownVisible) _renderDropdown();
    });

    // Injeta trigger se não existir
    _ensureCartTrigger();
  }

  function _ensureCartTrigger() {
    if (document.querySelector('.t7-cart-link, [data-cart-trigger]')) return;

    // Tenta encontrar o link do carrinho no Tray header
    var existing = document.querySelector('a[href*="carrinho"], a[href*="cart"], [data-app="product.buy-form"] ~ *');
    if (existing && existing.closest('nav, .t7-actions, .flex')) {
      existing.classList.add('t7-cart-link');
      return;
    }

    // Injeta um trigger no header
    var actions = document.querySelector('nav.t7-actions, .t7-actions, .header-actions, [class*="actions"]');
    if (!actions) actions = document.querySelector('header .flex:last-child, header nav:last-child');
    if (!actions) return;

    var a = document.createElement('a');
    a.href = '#';
    a.className = 't7-cart-link';
    a.setAttribute('aria-label', 'Meu carrinho');
    a.style.cssText = 'position:relative;display:inline-flex;align-items:center;gap:6px;cursor:pointer;';
    a.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor"',
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>',
      '<line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
      '<span class="cart-badge" data-cart-count aria-live="polite" style="display:none;',
      'min-width:20px;height:20px;border-radius:6px;padding:0 5px;background:#ff6a00;color:#fff;',
      'font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center;">0</span>',
    ].join('');
    actions.appendChild(a);
  }

  function _renderDropdown() {
    if (!_dropdown) return;
    var items = cartManager.obter();
    var count = items.reduce(function (s, it) { return s + it.quantidade; }, 0);

    if (count === 0) {
      _dropdown.innerHTML = '<div style="padding:32px 20px;text-align:center;color:#6b7280;">' +
        '<div style="font-size:36px;margin-bottom:10px;">🛒</div>' +
        '<strong style="font-size:16px;">Seu carrinho está vazio</strong></div>';
      return;
    }

    // Últimos 3 itens
    var recent = items.slice(-3).reverse();
    var html = '<div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:15px;">' +
      'Carrinho (' + count + ' ' + (count === 1 ? 'item' : 'itens') + ')</div>';

    for (var i = 0; i < recent.length; i++) {
      var it = recent[i];
      html += '<div style="display:grid;grid-template-columns:48px 1fr auto;gap:10px;padding:10px 16px;' +
        'border-bottom:1px solid #f3f4f6;">' +
        '<div style="width:48px;height:48px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#f9fafb;">' +
        (it.imagem ? '<img src="' + it.imagem.replace(/"/g,'&quot;') + '" style="width:100%;height:100%;object-fit:contain;">' : '') +
        '</div>' +
        '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;' +
        'text-overflow:ellipsis;">' + it.nome + '</div>' +
        '<div style="font-size:12px;color:#6b7280;">Qtd: ' + it.quantidade + '</div></div>' +
        '<div style="font-weight:800;font-size:14px;color:#ff6a00;white-space:nowrap;">' +
        _cartPriceLabel(it.preco * it.quantidade) + '</div></div>';
    }

    // Total
    html += '<div style="display:flex;justify-content:space-between;padding:14px 16px;' +
      'font-weight:800;font-size:16px;border-bottom:1px solid #e5e7eb;">' +
      '<span>Total</span><span style="color:#ff6a00;">' + _cartPriceLabel(cartManager.total()) + '</span></div>';

    // Ações
    html += '<div style="display:grid;gap:8px;padding:14px 16px;">' +
      '<a href="/carrinho/" style="display:block;text-align:center;padding:10px;border-radius:8px;' +
      'background:#ff6a00;color:#fff;font-weight:800;text-decoration:none;font-size:14px;">Ver meu carrinho</a>' +
      '<a href="/checkout/" style="display:block;text-align:center;padding:10px;border-radius:8px;' +
      'background:#0d0d0d;color:#fff;font-weight:800;text-decoration:none;font-size:14px;">Finalizar Compra</a>' +
      '</div>';

    _dropdown.innerHTML = html;
  }

  function _updateDropdown(count, items) {
    if (!_dropdown) return;
    if (!_dropdownVisible) return;
    _renderDropdown();
  }

  // Migra dados do key antigo para o novo
  function _migrate() {
    try {
      var old = localStorage.getItem('carrinho_loja');
      if (old) {
        var parsed = JSON.parse(old);
        if (Array.isArray(parsed) && parsed.length > 0) {
          var current = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          if (!Array.isArray(current)) current = [];
          if (current.length === 0) {
            localStorage.setItem(LS_KEY, old);
          }
        }
        localStorage.removeItem('carrinho_loja');
      }
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */

  function init() {
    _migrate();
    var importedCartId = _adoptCartIdFromUrl();
    var initial = _load();
    var initialCount = initial.reduce(function (s, it) { return s + it.quantidade; }, 0);
    _setCartPriceStatus(initial.length ? 'pending' : 'ready');
    _updateBadges(initialCount);
    _attachDropdown();
    _ensureServerCart({ forceServer: !!importedCartId })
      .then(_refreshOfficialCartPrices)
      .catch(function () {
        _setCartPriceStatus(initial.length ? 'error' : 'ready');
      });
  }

  // Dispara em páginas carregadas via fetch/ajax também
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Re-tenta após load completo para capturar headers gerados dinamicamente
  if (document.readyState !== 'complete') {
    window.addEventListener('load', function () {
      _ensureCartTrigger();
      _updateBadges(cartManager.contar());
    });
  }

  global.cartManager = cartManager;
  global.CartManager = cartManager;

})(window);
