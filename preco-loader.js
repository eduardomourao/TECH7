(function() {
  // Remove popup de newsletter/cupom em todas as páginas
  function removeAvisoModal() {
    var modal = document.querySelector('.modal-theme.email-modal');
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeAvisoModal, { once: true });
  } else {
    removeAvisoModal();
  }
  window.addEventListener('load', removeAvisoModal, { once: true });

  // Carrega o gerenciador global do carrinho em TODAS as páginas
  function loadScript(id, src) {
    if (document.getElementById(id)) return;
    var s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
  }
  loadScript('cart-manager-loaded', '/cart-manager.js');

  var path = window.location.pathname;
  var parts = path.replace(/\/+$/, '').split('/').filter(Boolean);

  if (parts[parts.length - 1] === 'index.html' || parts[parts.length - 1] === 'index.htm') {
    parts.pop();
  }

  if (parts.length < 3) return;

  // Em páginas de produto, carrega o botão de compra customizado
  loadScript('produto-comprar-loaded', '/produto-comprar.js');

  var slug  = parts.pop();
  var marca = parts.pop();
  var secao = parts.pop();

  var targetStr = '/' + secao + '/' + marca + '/' + slug;
  var idx = path.lastIndexOf(targetStr);
  var basePath = idx !== -1 ? path.substring(0, idx) + '/' : '/';

  var jsonUrl = basePath + 'precos.json?nocache=' + Date.now();

  fetch(jsonUrl, { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data[secao] || !data[secao][marca]) return;
      var preco = data[secao][marca][slug];
      if (typeof preco === 'undefined') return;

      var formatado = Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // #preco_atual pode ser input[hidden] — usa .value; outros elementos usam innerText
      var elPrecoAtual = document.getElementById('preco_atual');
      if (elPrecoAtual) {
        if (elPrecoAtual.tagName === 'INPUT') {
          elPrecoAtual.value = preco;
        } else {
          elPrecoAtual.innerText = formatado;
        }
      }

      // .price-off tem spans aninhados — substitui todo innerHTML pelo preco formatado
      var elsPriceOff = document.querySelectorAll('.price-off');
      elsPriceOff.forEach(function(el) {
        el.innerHTML = formatado;
      });

      // Outros elementos de preço visível
      var outrosEls = document.querySelectorAll('.current-price, .woocommerce-Price-amount');
      outrosEls.forEach(function(el) {
        el.innerText = formatado;
      });

      // #variacaoPreco - preço principal visível na página do produto
      var elVariacao = document.getElementById('variacaoPreco');
      if (elVariacao) {
        elVariacao.innerText = Number(preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      // Atualiza dataLayer se existir
      if (typeof dataLayer !== 'undefined') {
        for (var i = 0; i < dataLayer.length; i++) {
          if (dataLayer[i].priceSell) dataLayer[i].priceSell = String(preco);
          if (dataLayer[i].price)     dataLayer[i].price     = String(preco);
        }
      }
    })
    .catch(function(err) { console.error('preco-loader: erro ao carregar precos.json', err); });
})();
