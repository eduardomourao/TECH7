/**
 * checkout.js - Checkout 3 etapas TECH 7
 * Etapa 1: Identificacao | Etapa 2: Entrega | Etapa 3: Pagamento
 * Depende de: cart.js + ui.js
 */
(function () {
  'use strict';

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function maskTel(input) {
    var v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length <= 2) input.value = '(' + v;
    else if (v.length <= 7) input.value = '(' + v.slice(0,2) + ') ' + v.slice(2);
    else input.value = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
  }

  function atualizarStepper(step) {
    var stepper = document.querySelector('.stepper');
    if (!stepper) return;
    var steps = stepper.querySelectorAll('.step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.remove('is-active', 'is-done');
      if (i + 1 < step) steps[i].classList.add('is-done');
      if (i + 1 === step) steps[i].classList.add('is-active');
    }
  }

  function mostrarStep(step) {
    document.getElementById('step-dados').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('step-entrega').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('step-pagamento').style.display = step === 3 ? 'block' : 'none';
    atualizarStepper(step);
  }

  function validarStep1() {
    var nome = (document.getElementById('co-nome') || {}).value || '';
    var tel = (document.getElementById('co-tel') || {}).value || '';
    var email = (document.getElementById('co-email') || {}).value || '';
    var err = [];
    if (nome.trim().length < 3) err.push('Nome completo');
    if (tel.replace(/\D/g,'').length < 10) err.push('Telefone/WhatsApp');
    if (email.indexOf('@') === -1) err.push('E-mail');
    var box = document.getElementById('co-erro-step1');
    if (box) {
      box.textContent = err.length ? 'Preencha: ' + err.join(', ') : '';
      box.style.display = err.length ? 'block' : 'none';
    }
    return err.length === 0;
  }

  function validarStep2() {
    var entrega = document.querySelector('input[name="co-entrega"]:checked');
    if (!entrega) return false;
    if (entrega.value === 'retirada') return true;
    var rua = (document.getElementById('co-rua') || {}).value || '';
    var bairro = (document.getElementById('co-bairro') || {}).value || '';
    var cidade = (document.getElementById('co-cidade') || {}).value || '';
    var err = [];
    if (!rua.trim()) err.push('Rua e numero');
    if (!bairro.trim()) err.push('Bairro');
    if (!cidade.trim()) err.push('Cidade');
    var box = document.getElementById('co-erro-step2');
    if (box) {
      box.textContent = err.length ? 'Preencha: ' + err.join(', ') : '';
      box.style.display = err.length ? 'block' : 'none';
    }
    return err.length === 0;
  }

  function toggleEntrega() {
    var selected = document.querySelector('input[name="co-entrega"]:checked');
    var uberFields = document.getElementById('co-uber-fields');
    var lojaInfo = document.getElementById('co-loja-info');
    if (!uberFields || !lojaInfo) return;
    if (selected && selected.value === 'uber') {
      uberFields.style.display = 'block';
      lojaInfo.style.display = 'none';
    } else {
      uberFields.style.display = 'none';
      lojaInfo.style.display = 'block';
    }
  }

  function renderOrder() {
    if (!window.CartManager) return;
    var items = CartManager.obter();
    var emptyGuard = document.getElementById('empty-guard');
    var orderContent = document.getElementById('order-content');

    if (items.length === 0) {
      if (emptyGuard) emptyGuard.style.display = 'block';
      if (orderContent) orderContent.style.display = 'none';
      return;
    }
    if (emptyGuard) emptyGuard.style.display = 'none';
    if (orderContent) orderContent.style.display = 'block';

    var listEl = document.getElementById('co-item-list');
    if (listEl) {
      listEl.innerHTML = '';
      items.forEach(function (it) {
        var sub = (parseFloat(it.preco) || 0) * (parseInt(it.quantidade, 10) || 1);
        var div = document.createElement('div');
        div.className = 'order-item';
        div.innerHTML =
          '<div class="order-thumb">' + (it.imagem ? '<img src="' + esc(it.imagem) + '" alt="" loading="lazy">' : '') + '</div>' +
          '<div><div class="order-name">' + esc(it.nome) + '</div><div class="order-qty">Qtd: ' + it.quantidade + (it.variacao ? ' - ' + esc(it.variacao) : '') + '</div></div>' +
          '<div class="order-sub">' + CartManager.formatarMoeda(sub) + '</div>';
        listEl.appendChild(div);
      });
    }

    var total = CartManager.total();
    var fmt = CartManager.formatarMoeda(total);
    var totalEls = document.querySelectorAll('#co-subtotal, #co-total, #co-subtotal2, #co-total2, #co-total3');
    for (var i = 0; i < totalEls.length; i++) totalEls[i].textContent = fmt;
  }

  function confirmarPedido() {
    if (!validarStep2()) return;
    if (!window.CartManager || CartManager.totalItens() === 0) return;

    var nome = (document.getElementById('co-nome') || {}).value || '';
    var tel = (document.getElementById('co-tel') || {}).value || '';
    var email = (document.getElementById('co-email') || {}).value || '';
    var entrega = (document.querySelector('input[name="co-entrega"]:checked') || {}).value || 'retirada';

    var endereco = {};
    if (entrega === 'uber') {
      endereco = {
        rua: (document.getElementById('co-rua') || {}).value || '',
        bairro: (document.getElementById('co-bairro') || {}).value || '',
        cidade: (document.getElementById('co-cidade') || {}).value || '',
        complemento: (document.getElementById('co-complemento') || {}).value || '',
        referencia: (document.getElementById('co-ref') || {}).value || ''
      };
    }

    var btn2 = document.getElementById('co-btn-step2');
    if (btn2) {
      btn2.disabled = true;
      btn2.textContent = 'Gerando pagamento...';
    }

    mostrarStep(3);
    document.getElementById('co-pedido-id').textContent = 'Processando...';

    var sync = (window.CartManager.sincronizarServidor ? window.CartManager.sincronizarServidor() : Promise.resolve());
    sync.then(function (cart) {
      var cartId = (cart && cart.id) || (window.CartManager.obterCarrinhoId ? window.CartManager.obterCarrinhoId() : '');
      if (!cartId) throw new Error('Carrinho nao encontrado');
      return fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cartId: cartId,
          customer: { nome: nome, telefone: tel, email: email },
          shipping: { tipo: entrega, endereco: endereco }
        })
      });
    }).then(function (res) {
      if (!res.ok) throw new Error('Falha ao criar pedido');
      return res.json();
    }).then(function (order) {
      if (!order || !order.id) throw new Error('Pedido invalido');
      document.getElementById('co-pedido-id').textContent = order.id;
      return fetch('/api/payments/woovi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          customer: { nome: nome, telefone: tel, email: email }
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('Falha ao gerar pagamento');
        return res.json();
      });
    }).then(function (payment) {
      var spinner = document.getElementById('pix-spinner');
      if (spinner) spinner.style.display = 'none';
      if (payment && payment.brCode) {
        var pixCode = document.getElementById('pix-codigo');
        var qrBox = document.getElementById('pix-qrcode-container');
        if (pixCode) pixCode.value = payment.brCode;
        if (qrBox) {
          qrBox.innerHTML = '';
          if (payment.qrCodeImage) {
            var img = document.createElement('img');
            img.src = payment.qrCodeImage;
            img.alt = 'QR Code PIX';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            qrBox.appendChild(img);
          } else {
            qrBox.textContent = 'PIX gerado. Use o codigo copia e cola.';
          }
        }
        return;
      }
      throw new Error('PIX indisponivel');
    }).catch(function (err) {
      var spinner = document.getElementById('pix-spinner');
      if (spinner) spinner.style.display = 'none';
      var errBox = document.getElementById('co-erro-step2');
      if (errBox) {
        errBox.textContent = (err && err.message) ? err.message : 'Falha ao iniciar pagamento';
        errBox.style.display = 'block';
      }
      mostrarStep(2);
    }).finally(function () {
      if (btn2) {
        btn2.disabled = false;
        btn2.textContent = 'Ir para pagamento';
      }
    });
  }

  function init() {
    renderOrder();

    var telInput = document.getElementById('co-tel');
    if (telInput) telInput.addEventListener('input', function () { maskTel(this); });

    var radios = document.querySelectorAll('input[name="co-entrega"]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', toggleEntrega);
    toggleEntrega();

    var btn1 = document.getElementById('co-btn-step1');
    if (btn1) btn1.addEventListener('click', function () {
      if (validarStep1()) mostrarStep(2);
    });

    var btn2 = document.getElementById('co-btn-step2');
    if (btn2) btn2.addEventListener('click', confirmarPedido);

    var btnsVoltar = document.querySelectorAll('[data-action="voltar"]');
    for (var j = 0; j < btnsVoltar.length; j++) {
      btnsVoltar[j].addEventListener('click', function () {
        var target = parseInt(this.getAttribute('data-step'), 10) || 1;
        mostrarStep(target);
      });
    }

    document.addEventListener('carrinho:atualizado', renderOrder);
    document.addEventListener('carrinhoAtualizado', renderOrder);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
