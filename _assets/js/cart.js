/**
 * cart.js — Gerenciador Global do Carrinho TECH 7 v2
 * Chave localStorage: "carrinho"
 * Evento: "carrinho:atualizado"
 * Carregado em TODAS as páginas
 */
(function (global) {
  'use strict';

  var LS_KEY = 'carrinho';

  /* ================================================================ */
  /* Utilitários                                                       */
  /* ================================================================ */

  function parseNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.abs(v) : 0;
    if (!v) return 0;
    var s = String(v).trim().replace(/[^\d,.-]/g, '');
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') > -1) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  }

  function fmtMoney(v) {
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function genId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  /* ================================================================ */
  /* Persistência                                                      */
  /* ================================================================ */

  function carregar() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function salvar(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function notificar() {
    var items = carregar();
    var total = items.reduce(function (s, i) { return s + (parseFloat(i.preco) || 0) * (parseInt(i.quantidade, 10) || 1); }, 0);
    var qtd  = items.reduce(function (s, i) { return s + (parseInt(i.quantidade, 10) || 1); }, 0);
    var ev;
    try { ev = new CustomEvent('carrinho:atualizado', { detail: { carrinho: items, total: total, totalItens: qtd } }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent('carrinho:atualizado', true, true); ev.detail = { carrinho: items, total: total, totalItens: qtd }; }
    document.dispatchEvent(ev);
  }

  /* ================================================================ */
  /* API pública                                                       */
  /* ================================================================ */

  var CartManager = {
    adicionar: function (p) {
      if (!p || !p.nome) return;
      var items = carregar();
      var idx = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === p.id) { idx = i; break; }
      }
      if (idx >= 0) {
        items[idx].quantidade = (parseInt(items[idx].quantidade, 10) || 1) + (parseInt(p.quantidade, 10) || 1);
      } else {
        items.push({
          id: p.id || genId(),
          nome: String(p.nome),
          preco: parseNum(p.preco),
          imagem: String(p.imagem || ''),
          quantidade: Math.max(1, parseInt(p.quantidade, 10) || 1),
          url: String(p.url || ''),
          variacao: String(p.variacao || '')
        });
      }
      salvar(items);
      notificar();
      return items;
    },

    remover: function (id) {
      var items = carregar().filter(function (i) { return i.id !== id; });
      salvar(items);
      notificar();
      return items;
    },

    atualizar: function (id, qtd) {
      qtd = Math.max(0, parseInt(qtd, 10) || 0);
      var items = carregar();
      if (qtd <= 0) return CartManager.remover(id);
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) { items[i].quantidade = qtd; break; }
      }
      salvar(items);
      notificar();
      return items;
    },

    limpar: function () { salvar([]); notificar(); return []; },

    obter: function () { return carregar().slice(); },

    total: function () {
      return carregar().reduce(function (s, i) { return s + (parseFloat(i.preco) || 0) * (parseInt(i.quantidade, 10) || 1); }, 0);
    },

    totalItens: function () {
      return carregar().reduce(function (s, i) { return s + (parseInt(i.quantidade, 10) || 1); }, 0);
    },

    salvar: function (arr) { salvar(arr); notificar(); },

    formatarMoeda: function (v) { return fmtMoney(v); }
  };

  /* ================================================================ */
  /* Migração do localStorage antigo                                   */
  /* ================================================================ */

  (function migrar() {
    try {
      var old = localStorage.getItem('carrinho_loja');
      if (old) {
        var p = JSON.parse(old);
        if (Array.isArray(p) && p.length > 0) {
          var cur = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
          if (!Array.isArray(cur) || cur.length === 0) localStorage.setItem(LS_KEY, old);
        }
        localStorage.removeItem('carrinho_loja');
      }
    } catch (e) {}
  })();

  /* ================================================================ */
  /* Auto-init em todas as páginas                                     */
  /* ================================================================ */

  function init() {
    notificar(); // Atualiza badge + dropdown
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.CartManager = CartManager;

})(window);
