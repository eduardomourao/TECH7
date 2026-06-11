/**
 * produto-comprar.js v5 â€” BotÃ£o de compra independente, zero dependÃªncia Tray.
 *
 * Fontes de dados:
 *  - Nome: <meta property="og:title">
 *  - Imagem: <meta property="og:image">
 *  - PreÃ§o: backend /api/products/resolve-prices via Supabase
 *  - ID: gerado a partir da slug da URL
 *
 * VariaÃ§Ãµes: extrai os <select> do form Tray ANTES de removÃª-lo,
 *            depois elimina o form por completo.
 */
(function () {
  'use strict';

  /* ================================================================ */
  /* UtilitÃ¡rios                                                       */
  /* ================================================================ */

  function getNum(text) {
    if (!text) return 0;
    var s = String(text).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
    return parseFloat(s) || 0;
  }

  function formatMoney(value) {
    return Number(getNum(value)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function ensureVariationStyles() {
    if (document.getElementById('t7-product-variation-styles')) return;
    var style = document.createElement('style');
    style.id = 't7-product-variation-styles';
    style.textContent = [
      '#t7-variacao-container{margin:4px 0 2px!important}',
      '#t7-variacao-container .texto_variacao h2{margin:0 0 10px!important;color:#111!important;font-size:13px!important;font-weight:800!important;line-height:1.35!important}',
      '#t7-variacao-container .texto_variacao span{display:none!important}',
      '#t7-variacao-container .lista_cor_variacao{display:flex!important;width:auto!important;max-width:100%!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;gap:10px!important;flex-wrap:wrap!important;align-items:center!important;list-style:none!important}',
      '#t7-variacao-container .lista_cor_variacao li{position:relative!important;display:inline-flex!important;width:48px!important;height:48px!important;min-width:48px!important;max-width:48px!important;margin:0!important;padding:4px!important;border:2px solid #e5e7eb!important;border-radius:12px!important;background:#fff!important;box-shadow:0 3px 12px rgba(17,17,17,.08)!important;cursor:pointer!important;transition:border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease,opacity 160ms ease!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}',
      '#t7-variacao-container .lista_cor_variacao li:hover,#t7-variacao-container .lista_cor_variacao li:focus-visible,#t7-variacao-container .lista_cor_variacao li.t7-variant-selected{border-color:#ff6a00!important;box-shadow:0 0 0 4px rgba(255,106,0,.16),0 8px 22px rgba(255,106,0,.16)!important;transform:translateY(-1px)!important;outline:0!important}',
      '#t7-variacao-container .lista_cor_variacao li.sem_estoque{opacity:.48!important}',
      '#t7-variacao-container .lista_cor_variacao li.sem_estoque:after{content:""!important;position:absolute!important;left:6px!important;right:6px!important;top:50%!important;height:2px!important;background:rgba(239,68,68,.82)!important;transform:rotate(-35deg)!important;pointer-events:none!important}',
      '#t7-variacao-container .lista_cor_variacao img{display:block!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;border:1px solid rgba(17,17,17,.08)!important;border-radius:8px!important;object-fit:cover!important}',
      '@media (max-width:767px){#t7-variacao-container .lista_cor_variacao li{width:44px!important;height:44px!important;min-width:44px!important;max-width:44px!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ================================================================ */
  /* ExtraÃ§Ã£o de dados do produto (0 Tray)                             */
  /* ================================================================ */

  function getProductId() {
    var productPath = getProductPathParts();
    var slug = productPath.slug;
    var marca = productPath.marca;
    var secao = productPath.secao;
    // Gera ID Ãºnico do produto
    var raw = (secao + '-' + marca + '-' + slug).toLowerCase().replace(/[^a-z0-9-]/g, '');
    return raw || 'prod-' + Date.now().toString(36);
  }

  function getProductPathParts() {
    var parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') {
      parts.pop();
    }
    if (parts.length === 2) {
      return {
        slug: parts[1] || '',
        marca: '',
        secao: parts[0] || ''
      };
    }
    return {
      slug: parts.pop() || '',
      marca: parts.pop() || '',
      secao: parts.pop() || ''
    };
  }

  function getProductSlug() {
    var parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') parts.pop();
    return parts.pop() || '';
  }

  function getNome() {
    var og = document.querySelector('meta[property="og:title"]');
    if (og && og.getAttribute('content')) return og.getAttribute('content').trim();
    return document.title;
  }

  function getImagem() {
    var og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content');
    var img = document.querySelector('.image-show img, .box-gallery img, [data-src]');
    if (img) return img.src || img.getAttribute('data-src') || '';
    return '';
  }

  function buildWhatsAppConsultaUrl(productName) {
    var name = normalizeText(productName || getNome() || 'Produto TECH 7');
    var text = 'Ola, vim pelo site e gostaria de saber se o produto ' + name + ' esta disponivel.';
    return 'https://wa.me/5531999454848?text=' + encodeURIComponent(text);
  }

  function criarBotaoConsultaWhatsApp(dados) {
    var link = document.createElement('a');
    var nome = normalizeText(dados && dados.nome);
    link.className = 't7-whatsapp-consulta';
    link.href = buildWhatsAppConsultaUrl(nome);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Consultar disponibilidade no WhatsApp');
    link.textContent = 'Consultar no WhatsApp';
    link.style.cssText = [
      'display:inline-flex;align-items:center;justify-content:center;',
      'min-height:48px;padding:13px 24px;border-radius:8px;',
      'background:#128c3a;color:#fff;text-decoration:none;',
      'font-size:16px;font-weight:800;line-height:1.2;',
      'box-shadow:0 8px 18px rgba(18,140,58,.18);',
      'transition:background .2s,transform .15s,box-shadow .2s;',
      'font-family:inherit;'
    ].join('');
    link.addEventListener('mouseenter', function () {
      link.style.background = '#0f7a32';
      link.style.transform = 'translateY(-1px)';
      link.style.boxShadow = '0 12px 24px rgba(18,140,58,.24)';
    });
    link.addEventListener('mouseleave', function () {
      link.style.background = '#128c3a';
      link.style.transform = '';
      link.style.boxShadow = '0 8px 18px rgba(18,140,58,.18)';
    });
    link.addEventListener('focus', function () {
      link.style.outline = '3px solid rgba(18,140,58,.28)';
      link.style.outlineOffset = '3px';
    });
    link.addEventListener('blur', function () {
      link.style.outline = '';
      link.style.outlineOffset = '';
    });
    return link;
  }

  /* ================================================================ */
  /* Preco via backend/Supabase                                         */
  /* ================================================================ */

  function getPrecoFromBackend() {
    var productPath = getProductPathParts();
    if (!productPath.slug) return Promise.resolve(null);

    if (window.Tech7Prices && typeof window.Tech7Prices.resolve === 'function') {
      return window.Tech7Prices.resolve(productPath).then(function (result) {
        return result && result.found && result.price >= 2 ? result.price : null;
      });
    }

    return fetch('/api/products/resolve-prices', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [{
          section: productPath.secao,
          brand: productPath.marca,
          slug: productPath.slug
        }]
      })
    }).then(function (response) {
      if (!response.ok) throw new Error('http_' + response.status);
      return response.json();
    }).then(function (payload) {
      var items = Array.isArray(payload && payload.items) ? payload.items : [];
      var item = items[0] || {};
      var cents = Number(item.price_cents || 0);
      var price = Number.isFinite(cents) ? cents / 100 : 0;
      return item.found && price >= 2 ? price : null;
    }).catch(function (err) {
      console.warn('produto-comprar: nao foi possivel carregar preco pelo backend', err);
      return null;
    });
  }

  function getPreco(productId) {
    return getPrecoFromBackend().then(function (precoBackend) {
      if (!precoBackend) console.warn('produto-comprar: produto sem preco valido no backend', getProductPathParts());
      return precoBackend || null;
    });
  }

  /* ================================================================ */
  /* VariaÃ§Ãµes â€” extrai do form Tray ANTES de removÃª-lo                */
  /* ================================================================ */

  var _variacaoHtml = null; // HTML dos selects de variaÃ§Ã£o
  var _variacaoSelecionada = '';
  var _insertParent = null;
  var _insertBefore = null;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getVariationLabel(target) {
    if (!target) return '';

    if (target.tagName === 'SELECT') {
      var selected = target.options[target.selectedIndex];
      var label = target.closest('label');
      var labelText = label ? normalizeText(label.querySelector('span') ? label.querySelector('span').textContent : '') : '';
      var optionText = selected ? normalizeText(selected.textContent || selected.value) : normalizeText(target.value);
      if (!target.value) return '';
      return labelText ? labelText + ': ' + optionText : optionText;
    }

    var type = normalizeText(target.getAttribute('data-variant-type'));
    var value = normalizeText(target.getAttribute('data-variant-value') || target.textContent);
    return value ? (type ? type + ': ' + value : value) : '';
  }

  function selectVariationOption(option) {
    if (!option) return;
    var container = document.getElementById('t7-variacao-container');
    if (!container) return;

    var group = option.closest('ul, .lista_cor_variacao, #menuVars') || container;
    var selectedOptions = group.querySelectorAll('[data-variant-value].t7-variant-selected, li.t7-variant-selected');
    for (var i = 0; i < selectedOptions.length; i++) {
      selectedOptions[i].classList.remove('t7-variant-selected');
      selectedOptions[i].style.outline = '';
      selectedOptions[i].style.boxShadow = '';
      selectedOptions[i].style.borderRadius = '';
    }

    option.classList.add('t7-variant-selected');
    option.style.outline = '2px solid #ff6a00';
    option.style.boxShadow = '0 0 0 4px rgba(255,106,0,.18)';
    option.style.borderRadius = '8px';
    _variacaoSelecionada = getVariationLabel(option);

    var variantId = option.getAttribute('data-id') || option.getAttribute('data-variant-id') || '';
    var hiddenVariant = document.getElementById('variant_selected');
    if (hiddenVariant && variantId) hiddenVariant.value = variantId;
  }

  function optionColorName(option) {
    if (!option) return '';
    var explicitValue = option.getAttribute('data-variant-value');
    if (explicitValue) return normalizeText(explicitValue);

    var img = option.querySelector('img');
    if (img) {
      return normalizeText(img.getAttribute('alt') || img.getAttribute('title'));
    }

    return normalizeText(option.textContent);
  }

  function colorFromName(name) {
    var key = normalizeText(name).toLowerCase();
    var map = {
      azul: '#2563eb',
      branco: '#ffffff',
      dourado: '#d4af37',
      gold: '#d4af37',
      grafite: '#3f3f46',
      lilas: '#a78bfa',
      'lilás': '#a78bfa',
      prata: '#c0c0c0',
      preto: '#050505',
      rosa: '#f9a8d4',
      rose: '#f4a6b8',
      vermelho: '#dc2626',
      verde: '#16a34a'
    };
    return map[key] || '';
  }

  function normalizeColorVariationUi(container) {
    if (!container) return;

    container.classList.add('t7-variation-ui');

    var title = container.querySelector('.texto_variacao h2');
    if (title) {
      var current = container.querySelector('.t7-variant-selected');
      var selectedName = optionColorName(current) || _variacaoSelecionada.replace(/^.*:\s*/, '');
      title.textContent = 'Cores disponiveis' + (selectedName ? ' ( ' + selectedName + ' )' : '');
    }

    var list = container.querySelector('.lista_cor_variacao');
    if (!list) return;

    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Cores disponiveis');

    var items = list.querySelectorAll('li');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var name = optionColorName(item);
      var img = item.querySelector('img');
      var fallbackColor = colorFromName(name);

      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', name || 'Cor');
      item.setAttribute('title', name || 'Cor');

      if (img) {
        img.setAttribute('alt', name || 'Cor');
        img.setAttribute('title', name || 'Cor');
        if (fallbackColor) img.style.backgroundColor = fallbackColor;
      } else if (fallbackColor) {
        item.style.backgroundColor = fallbackColor;
      }
    }
  }

  function extrairVariacao() {
    var form = document.getElementById('form_comprar');
    if (!form) return;

    var menuVars = document.getElementById('menuVars');
    if (menuVars) {
      _variacaoHtml = menuVars.outerHTML;
      return;
    }

    // Fallback: qualquer select dentro do form
    var selects = form.querySelectorAll('select[required]');
    if (selects.length > 0) {
      _variacaoHtml = '<div class="variacao-extraid">';
      for (var i = 0; i < selects.length; i++) {
        _variacaoHtml += selects[i].outerHTML;
      }
      _variacaoHtml += '</div>';
    }
  }

  function setupVariacaoListener() {
    var container = document.getElementById('t7-variacao-container');
    if (!container) return;

    container.addEventListener('change', function (e) {
      if (e.target.tagName === 'SELECT') {
        _variacaoSelecionada = getVariationLabel(e.target);
      }
    });

    container.addEventListener('click', function (e) {
      var option = e.target.closest('[data-variant-value], .lista_cor_variacao li');
      if (!option || !container.contains(option)) return;
      e.preventDefault();
      selectVariationOption(option);
      normalizeColorVariationUi(container);
    });

    container.addEventListener('keydown', function (e) {
      var option = e.target.closest('[data-variant-value], .lista_cor_variacao li');
      if (!option || !container.contains(option)) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      selectVariationOption(option);
      normalizeColorVariationUi(container);
    });

    // Marca a primeira opÃ§Ã£o selecionada se houver apenas uma
    var selects = container.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      if (selects[i].options.length === 2) { // placeholder + 1 opÃ§Ã£o
        selects[i].value = selects[i].options[1].value;
        _variacaoSelecionada = getVariationLabel(selects[i]);
      }
    }

    var options = container.querySelectorAll('[data-variant-value], .lista_cor_variacao li');
    if (!_variacaoSelecionada && options.length === 1) selectVariationOption(options[0]);
    normalizeColorVariationUi(container);
  }

  function temVariacao() {
    return !!document.getElementById('t7-variacao-container');
  }

  /* ================================================================ */
  /* Remove o form Tray completamente                                  */
  /* ================================================================ */

  function removerFormTray() {
    var form = document.getElementById('form_comprar');
    if (!form) return;

    // Extrai variaÃ§Ãµes antes de remover
    extrairVariacao();
    var stableParent = form.closest('.fixed-info') || form.closest('.product-colum-right') || form.parentNode;
    var freightBox = stableParent ? stableParent.querySelector('.box-frete, .new-frete, .produto-calcular-frete') : null;
    _insertParent = stableParent;
    _insertBefore = freightBox && freightBox.parentNode === stableParent ? freightBox : null;

    // Remove o form
    if (form.parentNode) form.parentNode.removeChild(form);

    // Remove elementos Tray adjacentes
    var qtdBlock = document.getElementById('quantidade');
    if (qtdBlock && qtdBlock.parentNode) qtdBlock.parentNode.removeChild(qtdBlock);

    var buyBlock = document.getElementById('bt_comprar');
    if (buyBlock && buyBlock.parentNode) buyBlock.parentNode.removeChild(buyBlock);

    var pfb = document.getElementById('product-form-box');
    if (pfb && pfb.parentNode) pfb.parentNode.removeChild(pfb);

    var spanErro = document.getElementById('span_erro_carrinho');
    if (spanErro && spanErro.parentNode) spanErro.parentNode.removeChild(spanErro);
  }

  /* ================================================================ */
  /* Cria o novo botÃ£o de compra                                       */
  /* ================================================================ */

  function criarUICompra(dados) {
    var container = document.createElement('div');
    container.className = 't7-buy-wrapper';
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:16px;';

    var price = document.createElement('div');
    price.className = 't7-buy-price';
    price.style.cssText = 'font-size:30px;line-height:1.15;font-weight:900;color:#ff6a00;letter-spacing:-.02em;';
    price.textContent = dados.preco >= 2 ? formatMoney(dados.preco) : 'Preco sob consulta';
    container.appendChild(price);

    if (dados.preco < 2) {
      var consultText = document.createElement('p');
      consultText.className = 't7-whatsapp-consulta-text';
      consultText.textContent = 'Este produto esta sem preco no momento. Consulte disponibilidade direto com a loja.';
      consultText.style.cssText = 'max-width:420px;margin:0;color:#444;font-size:14px;line-height:1.5;';
      container.appendChild(consultText);

      var consultRow = document.createElement('div');
      consultRow.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
      consultRow.appendChild(criarBotaoConsultaWhatsApp(dados));
      container.appendChild(consultRow);
      return container;
    }

    // VariaÃ§Ãµes
    if (_variacaoHtml) {
      var varDiv = document.createElement('div');
      varDiv.id = 't7-variacao-container';
      varDiv.innerHTML = _variacaoHtml;
      container.appendChild(varDiv);
    }

    // Linha: Qtd + BotÃ£o
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

    var lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:14px;font-weight:600;color:#0d0d0d;display:flex;align-items:center;gap:4px;';
    lbl.textContent = 'Qtd:';
    var qty = document.createElement('input');
    qty.type = 'number'; qty.min = '1'; qty.value = '1';
    qty.style.cssText = 'width:60px;padding:8px 10px;border:1px solid #dbdee1;border-radius:6px;font-size:14px;text-align:center;';
    lbl.appendChild(qty);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-comprar';
    btn.textContent = 'Comprar';
    btn.setAttribute('data-nome', dados.nome);
    btn.setAttribute('data-preco', String(dados.preco));
    btn.setAttribute('data-imagem', dados.imagem);
    btn.setAttribute('data-url', dados.url);
    btn.setAttribute('data-id', dados.id);
    btn.style.cssText = [
      'background:#ff6a00;color:#fff;border:none;border-radius:8px;',
      'padding:12px 32px;font-size:16px;font-weight:700;cursor:pointer;',
      'transition:background .2s,transform .15s;font-family:inherit;'
    ].join('');
    if (dados.preco < 2) {
      btn.disabled = true;
      btn.textContent = 'Preco sob consulta';
      btn.setAttribute('aria-disabled', 'true');
      btn.style.opacity = '.68';
      btn.style.cursor = 'not-allowed';
    }
    btn.addEventListener('mouseenter', function () { this.style.background = '#e65f00'; });
    btn.addEventListener('mouseleave', function () { this.style.background = '#ff6a00'; });

    btn.addEventListener('click', function (e) {
      e.preventDefault();

      if (dados.preco < 2) {
        feedbackErro(btn, 'Preco sob consulta');
        return;
      }

      // Validar variaÃ§Ã£o se necessÃ¡rio
      if (_variacaoHtml && !_variacaoSelecionada) {
        feedbackErro(btn, 'Selecione uma variaÃ§Ã£o');
        return;
      }

      dados.quantidade = parseInt(qty.value, 10) || 1;
      dados.variacao = _variacaoSelecionada || '';
      adicionarAoCarrinho(dados, btn);
    });

    row.appendChild(lbl);
    row.appendChild(btn);
    container.appendChild(row);
    return container;
  }

  function feedbackErro(btn, msg) {
    if (!btn) return;
    var orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u2716 ' + msg;
    btn.style.background = '#dc2626';
    btn.style.borderColor = '#dc2626';
    setTimeout(function () {
      btn.textContent = orig;
      btn.style.background = '#ff6a00';
      btn.style.borderColor = '';
      btn.disabled = false;
    }, 2000);
  }

  /* ================================================================ */
  /* Adicionar ao carrinho e redirecionar                              */
  /* ================================================================ */

  function adicionarAoCarrinho(produto, btn) {
    var api = window.CartManager || window.cartManager;
    if (!api) {
      feedbackErro(btn, 'Carrinho indisponivel');
      return;
    }
    if (getNum(produto.preco) < 2) {
      feedbackErro(btn, 'Preco sob consulta');
      return;
    }

    var dados = {
      id: produto.id,
      nome: produto.nome,
      preco: produto.preco,
      imagem: produto.imagem,
      variacao: produto.variacao || '',
      quantidade: produto.quantidade || 1,
      url: produto.url || window.location.href,
      slug: produto.slug || '',
      marca: produto.marca || '',
      section: produto.section || produto.secao || ''
    };

    var resultado = window.CartManager ? CartManager.adicionar(dados) : api.adicionar(dados);
    var sync = resultado && typeof resultado.then === 'function'
      ? resultado
      : Promise.resolve(resultado);

    // Feedback visual rÃ¡pido
    if (btn) {
      var bgOrig = btn.style.background;
      btn.disabled = true;
      btn.textContent = '\u2714 Adicionado!';
      btn.style.background = '#16a34a';
      setTimeout(function () {
        btn.style.background = bgOrig;
        btn.disabled = false;
      }, 300);
    }

    // Redireciona apenas depois da tentativa de sincronizacao.
    sync.then(function () {
      window.location.href = '/carrinho/';
    }).catch(function () {
      window.location.href = '/carrinho/';
    });
  }

  /* ================================================================ */
  /* Injetar o botÃ£o na pÃ¡gina                                         */
  /* ================================================================ */

  function inject() {
    if (document.querySelector('.t7-buy-wrapper')) return;

    // 1. Nome e imagem (fontes 100% livres de Tray)
    var nome = getNome();
    var imagem = getImagem();
    var id = getProductId();
    var url = window.location.href;

    // Verifica se estamos numa pÃ¡gina de produto (tem og:title diferente do index)
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[pathParts.length - 1] === 'index.html' || pathParts[pathParts.length - 1] === 'index.htm') pathParts.pop();
    var isProductPage = !!document.querySelector('meta[property="og:title"]') &&
      pathParts.length >= 2 &&
      !!document.querySelector('#form_comprar, [data-app="product.buy-form"], #bt_comprar, #button-buy');
    if (!isProductPage) return;

    // 2. Remove form Tray
    removerFormTray();

    // 3. Busca preÃ§o e monta UI
    getPreco(id).then(function (preco) {
      var precoFinal = preco || 0;

      var productPath = getProductPathParts();
      var dados = {
        id: id,
        nome: nome,
        preco: precoFinal,
        imagem: imagem,
        url: url,
        slug: productPath.slug,
        marca: productPath.marca,
        section: productPath.secao
      };
      var ui = criarUICompra(dados);

      // Encontra onde inserir
      var target = document.querySelector('.product-colum-right, .product-right, .box-col-product');
      if (_insertParent) {
        _insertParent.insertBefore(ui, _insertBefore);
      } else if (target) {
        target.appendChild(ui);
      } else {
        // Fallback: insere apÃ³s h1.product-name
        var h1 = document.querySelector('h1.product-name, h1[class*="product"]');
        if (h1 && h1.parentNode) {
          h1.parentNode.insertBefore(ui, h1.nextSibling);
        }
      }

      setupVariacaoListener();
    });
  }

  /* ================================================================ */
  /* Init                                                              */
  /* ================================================================ */

  function init() {
    ensureVariationStyles();

    // Carrega CSS do carrinho (cart-manager.js jÃ¡ foi carregado por preco-loader.js)
    if (!document.getElementById('cart-css-loaded')) {
      var c = document.createElement('link');
      c.id = 'cart-css-loaded';
      c.rel = 'stylesheet';
      c.href = '/_assets/css/cart.css';
      document.head.appendChild(c);
    }

    inject();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
