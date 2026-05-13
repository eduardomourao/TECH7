/**
 * produto-comprar.js v5 â€” BotÃ£o de compra independente, zero dependÃªncia Tray.
 *
 * Fontes de dados:
 *  - Nome: <meta property="og:title">
 *  - Imagem: <meta property="og:image">
 *  - PreÃ§o: precos.json (jÃ¡ carregado por preco-loader.js via fetch)
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

  /* ================================================================ */
  /* ExtraÃ§Ã£o de dados do produto (0 Tray)                             */
  /* ================================================================ */

  function getProductId() {
    // Gera um ID a partir do pathname: /categoria/marca/slug
    var parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // Remove index.html do final se existir
    if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') {
      parts.pop();
    }
    // Pega as 3 Ãºltimas partes: secao / marca / slug
    var slug = parts.pop() || '';
    var marca = parts.pop() || '';
    var secao = parts.pop() || '';
    // Gera ID Ãºnico do produto
    var raw = (secao + '-' + marca + '-' + slug).toLowerCase().replace(/[^a-z0-9-]/g, '');
    return raw || 'prod-' + Date.now().toString(36);
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

  /* ================================================================ */
  /* PreÃ§o via precos.json                                             */
  /* ================================================================ */

  // precos.json tem formato: { secao: { marca: { slug: preco } } }
  // O JSON jÃ¡ foi carregado por preco-loader.js via fetch e cacheado
  var _precoCache = null;

  function getPrecoFromApi(productId) {
    return fetch('/api/products/' + encodeURIComponent(productId), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data || data.price_cents == null) return null;
        return Number(data.price_cents) / 100;
      })
      .catch(function () { return null; });
  }

  /* ================================================================ */
  /* VariaÃ§Ãµes â€” extrai do form Tray ANTES de removÃª-lo                */
  /* ================================================================ */

  var _variacaoHtml = null; // HTML dos selects de variaÃ§Ã£o
  var _variacaoSelecionada = '';

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
        _variacaoSelecionada = e.target.value || '';
      }
    });

    // Marca a primeira opÃ§Ã£o selecionada se houver apenas uma
    var selects = container.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      if (selects[i].options.length === 2) { // placeholder + 1 opÃ§Ã£o
        selects[i].value = selects[i].options[1].value;
        _variacaoSelecionada = selects[i].value;
      }
    }
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
    btn.addEventListener('mouseenter', function () { this.style.background = '#e65f00'; });
    btn.addEventListener('mouseleave', function () { this.style.background = '#ff6a00'; });

    btn.addEventListener('click', function (e) {
      e.preventDefault();

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
    btn.textContent = 'âœ— ' + msg;
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
    if (!api) return;

    var dados = {
      id: produto.id,
      nome: produto.nome,
      preco: produto.preco,
      imagem: produto.imagem,
      variacao: produto.variacao || '',
      quantidade: produto.quantidade || 1,
      url: produto.url || window.location.href
    };

    if (window.CartManager) CartManager.adicionar(dados);
    else api.adicionar(dados);

    // Feedback visual rÃ¡pido
    if (btn) {
      var bgOrig = btn.style.background;
      btn.disabled = true;
      btn.textContent = 'âœ“ Adicionado!';
      btn.style.background = '#16a34a';
      setTimeout(function () {
        btn.style.background = bgOrig;
        btn.disabled = false;
      }, 300);
    }

    // Redireciona
    setTimeout(function () { window.location.href = 'carrinho/'; }, 150);
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
    var isProductPage = !!document.querySelector('meta[property="og:title"]') &&
      window.location.pathname.split('/').filter(Boolean).length >= 3;
    if (!isProductPage) return;

    // 2. Remove form Tray
    removerFormTray();

    // 3. Busca preÃ§o e monta UI
    getPrecoFromApi(id).then(function (preco) {
      var precoFinal = preco || 0;

      // Fallback: tenta ler o preÃ§o do DOM (Ãºltimo recurso)
      if (precoFinal === 0) {
        var pi = document.getElementById('preco_atual');
        if (pi && pi.value) { var n = getNum(pi.value); if (n > 0) precoFinal = n; }
      }
      if (precoFinal === 0) {
        var vp = document.getElementById('variacaoPreco');
        if (vp) { var n = getNum(vp.textContent); if (n > 0) precoFinal = n; }
      }

      var dados = { id: id, nome: nome, preco: precoFinal, imagem: imagem, url: url };
      var ui = criarUICompra(dados);

      // Encontra onde inserir
      var target = document.querySelector('.product-colum-right, .product-right, .box-col-product');
      if (target) {
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
    // Carrega scripts necessÃ¡rios
    if (!document.getElementById('cart-js-loaded')) {
      var s = document.createElement('script');
      s.id = 'cart-js-loaded';
      s.src = '_assets/js/cart.js';
      document.head.appendChild(s);
    }
    if (!document.getElementById('cart-css-loaded')) {
      var c = document.createElement('link');
      c.id = 'cart-css-loaded';
      c.rel = 'stylesheet';
      c.href = '_assets/css/cart.css';
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


