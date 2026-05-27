/**
 * ui.js — Componentes reutilizáveis TECH 7 (dropdown, toast, badge)
 * Depende de: cart.js
 */
(function () {
  'use strict';

  var dropdown = null;
  var dropdownVisible = false;

  /* ================================================================ */
  /* TOAST                                                             */
  /* ================================================================ */

  function mostrarToast(msg, tipo, link) {
    tipo = tipo || 'success';
    var toast = document.createElement('div');
    toast.className = 't7-toast t7-toast--' + tipo;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<span>' + msg + '</span>';
    if (link) {
      var a = document.createElement('a');
      a.href = link;
      a.textContent = 'Ver carrinho →';
      a.style.cssText = 'color:#fff;font-weight:800;text-decoration:underline;margin-left:8px;white-space:nowrap;';
      toast.appendChild(a);
    }
    if (!document.getElementById('t7-toast-style')) injectToastStyles();
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { toast.classList.add('t7-toast--in'); });
    });
    setTimeout(function () {
      toast.classList.remove('t7-toast--in');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
    }, 3000);
  }

  function injectToastStyles() {
    var s = document.createElement('style');
    s.id = 't7-toast-style';
    s.textContent = [
      '.t7-toast{position:fixed;bottom:24px;right:24px;z-index:99999;',
      'padding:14px 22px;border-radius:10px;font-family:Inter,Arial,sans-serif;',
      'font-size:14px;font-weight:700;color:#fff;',
      'box-shadow:0 8px 28px rgba(0,0,0,.22);display:flex;align-items:center;gap:6px;',
      'transform:translateY(12px);opacity:0;',
      'transition:transform .3s ease,opacity .3s ease;pointer-events:auto;max-width:420px;}',
      '.t7-toast--success{background:#16a34a;}',
      '.t7-toast--error{background:#dc2626;}',
      '.t7-toast.t7-toast--in{transform:translateY(0);opacity:1;}',
      '@media(max-width:600px){.t7-toast{left:16px;right:16px;bottom:16px;max-width:none;}}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ================================================================ */
  /* DROPDOWN                                                          */
  /* ================================================================ */

  function buildDropdown() {
    var d = document.createElement('div');
    d.id = 't7-dropdown';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Carrinho');
    d.style.cssText = [
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.92);',
      'z-index:99998;width:380px;max-width:calc(100vw-32px);max-height:80vh;overflow-y:auto;',
      'background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.18);',
      'font-family:Inter,Arial,sans-serif;color:#0d0d0d;font-size:14px;line-height:1.4;',
      'opacity:0;visibility:hidden;transition:transform .25s ease,opacity .25s ease,visibility .25s ease;',
    ].join('');
    return d;
  }

  function showDropdown() {
    dropdownVisible = true;
    renderDropdown();
    dropdown.style.opacity = '1';
    dropdown.style.visibility = 'visible';
    dropdown.style.transform = 'translate(-50%,-50%) scale(1)';
    if (overlayEl) overlayEl.style.display = 'block';
  }

  function hideDropdown() {
    dropdownVisible = false;
    dropdown.style.opacity = '0';
    dropdown.style.visibility = 'hidden';
    dropdown.style.transform = 'translate(-50%,-50%) scale(.92)';
    if (overlayEl) overlayEl.style.display = 'none';
  }

  var overlayEl = null;

  function createOverlay() {
    var o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.35);display:none;';
    o.addEventListener('click', hideDropdown);
    document.body.appendChild(o);
    return o;
  }

  function renderDropdown() {
    if (!dropdown) return;
    var items = window.CartManager ? CartManager.obter() : [];
    var total = window.CartManager ? CartManager.total() : 0;
    var count = items.reduce(function (s, i) { return s + (parseInt(i.quantidade, 10) || 1); }, 0);

    if (count === 0) {
      dropdown.innerHTML =
        '<div style="padding:40px 20px;text-align:center;">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
          '<p style="font-weight:700;font-size:16px;margin:12px 0 4px;">Seu carrinho está vazio</p>' +
          '<p style="color:#6b7280;font-size:13px;margin:0;">Adicione produtos para continuar.</p>' +
        '</div>';
      return;
    }

    var recent = items.slice(-3).reverse();
    var html = '<div style="padding:18px 20px 14px;border-bottom:1px solid #e5e7eb;font-weight:800;font-size:16px;">' +
      'Meu Carrinho (' + count + ' ' + (count === 1 ? 'item' : 'itens') + ')</div>';

    for (var i = 0; i < recent.length; i++) {
      var it = recent[i];
      html += '<div style="display:grid;grid-template-columns:56px 1fr auto;gap:12px;padding:12px 20px;' +
        'border-bottom:1px solid #f3f4f6;align-items:center;">' +
        '<div style="width:56px;height:56px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#f9fafb;">' +
        (it.imagem ? '<img src="' + esc(it.imagem) + '" style="width:100%;height:100%;object-fit:contain;">' : '') +
        '</div>' +
        '<div style="min-width:0;"><div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        esc(it.nome) + '</div>' +
        '<div style="font-size:12px;color:#6b7280;">' +
        fmt(it.preco) + ' x ' + it.quantidade + '</div></div>' +
        '<div style="font-weight:800;font-size:15px;color:#ff6a00;white-space:nowrap;">' +
        (window.CartManager ? CartManager.formatarMoeda(it.preco * it.quantidade) : '') + '</div></div>';
    }

    html += '<div style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">' +
      '<div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px;">' +
      '<span>Total</span><span style="color:#ff6a00;">' + (window.CartManager ? CartManager.formatarMoeda(total) : '') + '</span></div></div>' +
      '<div style="display:grid;gap:8px;padding:16px 20px;">' +
      '<a href="carrinho/" onclick="hideDropdown()" style="display:block;text-align:center;padding:12px;border-radius:8px;background:#ff6a00;color:#fff;font-weight:800;text-decoration:none;font-size:14px;">Ver meu carrinho</a>' +
      '<a href="checkout/" onclick="hideDropdown()" style="display:block;text-align:center;padding:12px;border-radius:8px;background:#0d0d0d;color:#fff;font-weight:800;text-decoration:none;font-size:14px;">Finalizar Compra</a>' +
      '</div>';

    dropdown.innerHTML = html;
  }

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(v) { return window.CartManager ? CartManager.formatarMoeda(v) : ('R$ ' + Number(v).toFixed(2)); }

  /* ================================================================ */
  /* Badge                                                             */
  /* ================================================================ */

  function atualizarBadge(count) {
    var badges = document.querySelectorAll('[data-cart-count]');
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      b.textContent = count >= 10 ? '9+' : String(count);
      b.style.display = count === 0 ? 'none' : 'inline-flex';
    }
  }

  /* ================================================================ */
  /* Injetar trigger no header se não existir                          */
  /* ================================================================ */

  function ensureTrigger() {
    if (document.querySelector('[data-cart-trigger]')) return;
    var existing = document.querySelector('.t7-cart-link, a[href*="carrinho"], a[href*="cart"]');
    if (existing) { existing.setAttribute('data-cart-trigger', ''); return; }
    var nav = document.querySelector('nav.t7-actions, .t7-actions, header [class*="actions"]');
    if (!nav) nav = document.querySelector('header .flex:last-child, header nav:last-child');
    if (!nav) return;
    var a = document.createElement('a');
    a.href = '#';
    a.setAttribute('data-cart-trigger', '');
    a.setAttribute('aria-label', 'Meu carrinho');
    a.style.cssText = 'position:relative;display:inline-flex;align-items:center;gap:6px;cursor:pointer;text-decoration:none;';
    a.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/>' +
      '<path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
      '<span data-cart-count style="display:none;min-width:20px;height:20px;border-radius:6px;padding:0 5px;background:#ff6a00;color:#fff;font-size:11px;font-weight:800;align-items:center;justify-content:center;">0</span>';
    nav.appendChild(a);
  }

  /* ================================================================ */
  /* Eventos                                                           */
  /* ================================================================ */

  document.addEventListener('carrinho:atualizado', function (e) {
    var count = (e.detail && e.detail.totalItens) || (CartManager ? CartManager.totalItens() : 0);
    atualizarBadge(count);
    if (dropdownVisible) renderDropdown();
  });

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-cart-trigger]');
    if (trigger) {
      e.preventDefault();
      if (!dropdown || !overlayEl) return;
      if (dropdownVisible) { hideDropdown(); } else { showDropdown(); }
      return;
    }
    if (dropdownVisible && dropdown && !dropdown.contains(e.target) && !e.target.closest('[data-cart-trigger]')) {
      hideDropdown();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dropdownVisible) hideDropdown();
  });

  /* ================================================================ */
  /* Init                                                              */
  /* ================================================================ */

  function init() {
    dropdown = buildDropdown();
    overlayEl = createOverlay();
    document.body.appendChild(dropdown);
    ensureTrigger();
    atualizarBadge(window.CartManager ? CartManager.totalItens() : 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load', function () {
    ensureTrigger();
    atualizarBadge(window.CartManager ? CartManager.totalItens() : 0);
  });

  // Expor para uso externo
  window.mostrarToast = mostrarToast;
  window.hideDropdown = hideDropdown;

})();
