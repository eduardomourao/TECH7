/**
 * carrinho.js — Página do carrinho TECH 7 (usa CartManager)
 * Depende de: cart.js + ui.js
 */
(function () {
  'use strict';

  var cartList   = document.getElementById('cart-list');
  var emptyState = document.getElementById('empty-state');
  var itemCount  = document.getElementById('item-count');
  var subtotalEl = document.getElementById('subtotal');
  var totalEl    = document.getElementById('total');
  var checkoutBtn = document.getElementById('checkout-btn');

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function render() {
    if (!cartList || !window.CartManager) return;
    var items = CartManager.obter();
    cartList.innerHTML = '';
    if (emptyState) emptyState.classList.toggle('is-visible', items.length === 0);
    if (checkoutBtn) checkoutBtn.disabled = items.length === 0;

    var totalQty = 0;

    items.forEach(function (item, idx) {
      totalQty += (parseInt(item.quantidade, 10) || 1);
      var subtotalItem = (parseFloat(item.preco) || 0) * (parseInt(item.quantidade, 10) || 1);

      var article = document.createElement('article');
      article.className = 'cart-item';
      article.dataset.id = item.id;
      var link = item.url ? ' style="cursor:pointer;" onclick="window.location.href=\'' + esc(item.url) + '\';return false;"' : '';

      article.innerHTML =
        '<div class="cart-thumb"' + link + '>' +
          (item.imagem ? '<img src="' + esc(item.imagem) + '" alt="" loading="lazy">' : '') +
        '</div>' +
        '<div class="cart-item-body">' +
          '<div class="cart-item-top">' +
            '<h2 class="cart-item-name"></h2>' +
            '<div class="cart-item-variant"></div>' +
            '<div class="unit-price"></div>' +
          '</div>' +
          '<div class="cart-item-actions">' +
            '<div class="qty-control" aria-label="Quantidade">' +
              '<button type="button" data-action="decrease" aria-label="Diminuir">−</button>' +
              '<input type="number" min="1" max="99" inputmode="numeric" aria-label="Quantidade">' +
              '<button type="button" data-action="increase" aria-label="Aumentar">+</button>' +
            '</div>' +
            '<span class="subtotal-price" id="sub-' + idx + '"></span>' +
            '<button class="remove-btn" type="button" data-action="remove">Remover</button>' +
          '</div>' +
        '</div>';

      article.querySelector('.cart-item-name').textContent   = item.nome;
      var varEl = article.querySelector('.cart-item-variant');
      if (varEl) varEl.textContent = item.variacao || '';
      article.querySelector('.unit-price').textContent        = CartManager.formatarMoeda(item.preco) + ' /un.';
      article.querySelector('#sub-' + idx).textContent        = CartManager.formatarMoeda(subtotalItem);

      var qtyInput = article.querySelector('input');
      qtyInput.value = item.quantidade;

      var decBtn = article.querySelector('[data-action="decrease"]');
      if (item.quantidade <= 1) decBtn.disabled = true;

      cartList.appendChild(article);
    });

    var total = CartManager.total();
    if (itemCount) itemCount.textContent = totalQty + (totalQty === 1 ? ' item' : ' itens');
    if (subtotalEl) subtotalEl.textContent = CartManager.formatarMoeda(total);
    if (totalEl) totalEl.textContent = CartManager.formatarMoeda(total);
  }

  if (cartList) {
    cartList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var itemEl = btn.closest('.cart-item');
      var id = itemEl && itemEl.dataset.id;
      if (!id) return;

      switch (btn.dataset.action) {
        case 'increase': {
          var items = CartManager.obter();
          for (var i = 0; i < items.length; i++) {
            if (items[i].id === id) { CartManager.atualizar(id, (parseInt(items[i].quantidade, 10) || 1) + 1); break; }
          }
          break;
        }
        case 'decrease': {
          var items2 = CartManager.obter();
          for (var j = 0; j < items2.length; j++) {
            if (items2[j].id === id) {
              var q = parseInt(items2[j].quantidade, 10) || 1;
              if (q <= 1) return;
              CartManager.atualizar(id, q - 1);
              break;
            }
          }
          break;
        }
        case 'remove': {
          itemEl.style.transition = 'opacity .25s, transform .25s';
          itemEl.style.opacity = '0';
          itemEl.style.transform = 'translateX(20px)';
          setTimeout(function () { CartManager.remover(id); render(); }, 240);
          return;
        }
      }
      render();
    });

    cartList.addEventListener('change', function (e) {
      if (!e.target.matches('input[type="number"]')) return;
      var itemEl = e.target.closest('.cart-item');
      var id = itemEl && itemEl.dataset.id;
      if (!id) return;
      CartManager.atualizar(id, Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)));
      render();
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function () {
      if (CartManager.totalItens() === 0) return;
      window.location.href = '../checkout/';
    });
  }

  document.addEventListener('carrinho:atualizado', render);
  render();
})();
