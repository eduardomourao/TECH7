/* Admin TECH 7 — painel administrativo */
(function () {
  'use strict';

  const API = '/api/admin';
  const TOAST = document.getElementById('toast');

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function token() { return sessionStorage.getItem('admin_session_token'); }

  function headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token(),
    };
  }

  async function api(path, opts) {
    const res = await fetch(API + path, { ...opts, headers: { ...headers(), ...(opts?.headers || {}) } });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { error: `http_${res.status}` }; }
    if (!res.ok) throw new Error(json.error || `http_${res.status}`);
    return json;
  }

  function toast(msg, type) {
    TOAST.textContent = msg;
    TOAST.className = 'toast toast-' + (type || 'success');
    requestAnimationFrame(() => { TOAST.classList.add('show'); });
    setTimeout(() => { TOAST.classList.remove('show'); }, 2500);
  }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function dateStr(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
  }

  function badge(status) {
    const cls = {
      pending: 'badge-pending',
      paid: 'badge-paid',
      cancelled: 'badge-cancelled',
      failed: 'badge-failed',
      refunded: 'badge-refunded',
    };
    return '<span class="badge ' + (cls[status] || 'badge-pending') + '">' + esc(status) + '</span>';
  }

  /* ---------------------------------------------------------------- */
  /* Login                                                             */
  /* ---------------------------------------------------------------- */
  function checkLogin() {
    if (token()) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';
      initApp();
    }
  }

  document.getElementById('loginBtn').addEventListener('click', async () => {
    const userInput = document.getElementById('usernameInput');
    const passInput = document.getElementById('passwordInput');
    const errorEl = document.getElementById('loginError');
    try {
      const res = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ username: userInput.value, password: passInput.value }),
      });
      if (res.ok) {
        sessionStorage.setItem('admin_session_token', res.sessionToken);
        errorEl.style.display = 'none';
        checkLogin();
      }
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('admin_session_token');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
  });

  /* ---------------------------------------------------------------- */
  /* Tabs                                                              */
  /* ---------------------------------------------------------------- */
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      if (tab) tab.classList.add('active');
      if (btn.dataset.tab === 'products') renderProducts();
      if (btn.dataset.tab === 'orders') renderOrders();
    });
  });

  /* ---------------------------------------------------------------- */
  /* Products                                                          */
  /* ---------------------------------------------------------------- */
  let productsPage = 0;
  const PRODUCTS_PER_PAGE = 20;

  async function renderProducts() {
    const el = document.getElementById('tab-products');
    el.innerHTML = '<div class="loading">Carregando produtos...</div>';

    try {
      const offset = productsPage * PRODUCTS_PER_PAGE;
      const data = await api('/products?limit=' + PRODUCTS_PER_PAGE + '&offset=' + offset);
      const totalPages = Math.ceil(data.total / PRODUCTS_PER_PAGE);

      let html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<h2 style="font-size:16px;color:#fff;">Produtos (' + data.total + ')</h2>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button class="btn btn-outline btn-sm" id="bulkRaiseBtn">Reajuste % (pagina)</button>' +
          '<button class="btn btn-outline btn-sm" id="bulkSetBtn">Definir preco unico (pagina)</button>' +
        '</div></div>' +
        '<div class="table-wrap"><table><thead><tr>' +
        '<th>ID</th><th>Nome</th><th>Marca</th><th>Cat.</th><th>Preço</th><th>Estoque</th><th>Ativo</th><th>Ações</th>' +
        '</tr></thead><tbody>';

      for (const p of data.items) {
        html += '<tr>' +
          '<td style="font-size:11px;color:#666;">' + esc(p.id?.slice(0, 12)) + '</td>' +
          '<td><strong>' + esc(p.name) + '</strong></td>' +
          '<td>' + esc(p.brand || '—') + '</td>' +
          '<td>' + esc(p.category || '—') + '</td>' +
          '<td>' +
            '<div class="inline-edit">' +
              '<input type="number" step="0.01" min="0" value="' + Number(p.price).toFixed(2) + '" data-field="price" data-id="' + esc(p.id) + '">' +
              '<button class="btn btn-primary btn-sm" data-save-price data-id="' + esc(p.id) + '">Salvar</button>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<div class="inline-edit">' +
              '<input type="number" min="0" value="' + (p.stock || 0) + '" data-field="stock" data-id="' + esc(p.id) + '">' +
              '<button class="btn btn-primary btn-sm" data-save-stock data-id="' + esc(p.id) + '">Salvar</button>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<button class="btn btn-sm ' + (p.active ? 'btn-success' : 'btn-outline') + '" data-toggle-active data-id="' + esc(p.id) + '" data-active="' + p.active + '">' +
            (p.active ? 'Ativo' : 'Inativo') + '</button>' +
          '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-view-product data-id="' + esc(p.id) + '">Ver</button></td>' +
          '</tr>';
      }

      html += '</tbody></table></div>';

      // Pagination
      html += '<div class="pagination">' +
        '<button ' + (productsPage === 0 ? 'disabled' : '') + ' data-products-page="prev">←</button>' +
        '<span>Página ' + (productsPage + 1) + ' de ' + (totalPages || 1) + '</span>' +
        '<button ' + (productsPage >= totalPages - 1 ? 'disabled' : '') + ' data-products-page="next">→</button>' +
        '</div>';

      el.innerHTML = html;
      bindProductEvents();
    } catch (e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">Erro: ' + esc(e.message) + '</div>';
    }
  }

  function bindProductEvents() {
    // Price save
    document.querySelectorAll('[data-save-price]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const input = document.querySelector('input[data-field="price"][data-id="' + id + '"]');
        const price = parseFloat(input.value);
        if (isNaN(price) || price < 0) return toast('Preço inválido', 'error');
        try {
          await api('/products/' + id, { method: 'PUT', body: JSON.stringify({ price }) });
          toast('Preço atualizado');
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    // Stock save
    document.querySelectorAll('[data-save-stock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const input = document.querySelector('input[data-field="stock"][data-id="' + id + '"]');
        const stock = parseInt(input.value, 10);
        if (isNaN(stock) || stock < 0) return toast('Estoque inválido', 'error');
        try {
          await api('/products/' + id, { method: 'PUT', body: JSON.stringify({ stock }) });
          toast('Estoque atualizado');
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    // Toggle active
    document.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const active = btn.dataset.active === 'true' ? false : true;
        try {
          await api('/products/' + id, { method: 'PUT', body: JSON.stringify({ active }) });
          renderProducts();
          toast(active ? 'Produto ativado' : 'Produto desativado');
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    // View product
    document.querySelectorAll('[data-view-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open('/produtos/' + btn.dataset.id, '_blank');
      });
    });

    // Pagination
    document.querySelectorAll('[data-products-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.productsPage === 'prev') productsPage = Math.max(0, productsPage - 1);
        else productsPage++;
        renderProducts();
      });
    });

    const raiseBtn = document.getElementById('bulkRaiseBtn');
    if (raiseBtn) {
      raiseBtn.addEventListener('click', async () => {
        const pctRaw = prompt('Percentual de reajuste para produtos desta pagina. Ex: 5 ou -3');
        if (pctRaw == null) return;
        const pct = parseFloat(String(pctRaw).replace(',', '.'));
        if (isNaN(pct)) return toast('Percentual invalido', 'error');
        const updates = [];
        document.querySelectorAll('input[data-field=\"price\"]').forEach((input) => {
          const base = parseFloat(input.value);
          if (!isNaN(base) && base >= 0) {
            const next = +(base * (1 + (pct / 100))).toFixed(2);
            updates.push({ id: input.dataset.id, price: next });
          }
        });
        if (!updates.length) return toast('Nenhum produto na pagina', 'error');
        try {
          await api('/prices/bulk', { method: 'POST', body: JSON.stringify({ updates }) });
          toast('Reajuste aplicado');
          renderProducts();
        } catch (e) { toast(e.message, 'error'); }
      });
    }

    const setBtn = document.getElementById('bulkSetBtn');
    if (setBtn) {
      setBtn.addEventListener('click', async () => {
        const valueRaw = prompt('Novo preco fixo para todos os produtos desta pagina (ex: 99.90)');
        if (valueRaw == null) return;
        const value = parseFloat(String(valueRaw).replace(',', '.'));
        if (isNaN(value) || value < 0) return toast('Preco invalido', 'error');
        const updates = [];
        document.querySelectorAll('input[data-field=\"price\"]').forEach((input) => {
          updates.push({ id: input.dataset.id, price: +value.toFixed(2) });
        });
        if (!updates.length) return toast('Nenhum produto na pagina', 'error');
        try {
          await api('/prices/bulk', { method: 'POST', body: JSON.stringify({ updates }) });
          toast('Preco em lote aplicado');
          renderProducts();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Orders                                                            */
  /* ---------------------------------------------------------------- */
  let ordersPage = 0;
  const ORDERS_PER_PAGE = 20;
  let selectedOrderId = null;

  async function renderOrders() {
    const el = document.getElementById('tab-orders');

    if (selectedOrderId) {
      await renderOrderDetail(selectedOrderId);
      return;
    }

    el.innerHTML = '<div class="loading">Carregando pedidos...</div>';

    try {
      const offset = ordersPage * ORDERS_PER_PAGE;
      const data = await api('/orders?limit=' + ORDERS_PER_PAGE + '&offset=' + offset);
      const totalPages = Math.ceil(data.total / ORDERS_PER_PAGE);

      let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="font-size:16px;color:#fff;">Pedidos (' + data.total + ')</h2></div>';

      if (data.items.length === 0) {
        html += '<div style="padding:40px;text-align:center;color:#666;">Nenhum pedido encontrado</div>';
        el.innerHTML = html;
        return;
      }

      html += '<div class="table-wrap"><table><thead><tr>' +
        '<th>ID</th><th>Cliente</th><th>Email</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Data</th><th></th>' +
        '</tr></thead><tbody>';

      for (const o of data.items) {
        html += '<tr>' +
          '<td style="font-size:11px;color:#666;">' + esc(o.id?.slice(0, 12)) + '</td>' +
          '<td>' + esc(o.customer_name) + '</td>' +
          '<td style="font-size:12px;">' + esc(o.customer_email) + '</td>' +
          '<td><strong>' + money(o.total) + '</strong></td>' +
          '<td>' + badge(o.status) + '</td>' +
          '<td style="font-size:12px;">' + esc(o.payment_provider || '—') + '</td>' +
          '<td style="font-size:12px;">' + dateStr(o.created_at) + '</td>' +
          '<td><button class="btn btn-sm btn-primary" data-view-order data-id="' + esc(o.id) + '">Detalhes</button></td>' +
          '</tr>';
      }

      html += '</tbody></table></div>';

      html += '<div class="pagination">' +
        '<button ' + (ordersPage === 0 ? 'disabled' : '') + ' data-orders-page="prev">←</button>' +
        '<span>Página ' + (ordersPage + 1) + ' de ' + (totalPages || 1) + '</span>' +
        '<button ' + (ordersPage >= totalPages - 1 ? 'disabled' : '') + ' data-orders-page="next">→</button>' +
        '</div>';

      el.innerHTML = html;
      bindOrderEvents();
    } catch (e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">Erro: ' + esc(e.message) + '</div>';
    }
  }

  function bindOrderEvents() {
    document.querySelectorAll('[data-view-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedOrderId = btn.dataset.id;
        renderOrders();
      });
    });

    document.querySelectorAll('[data-orders-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.ordersPage === 'prev') ordersPage = Math.max(0, ordersPage - 1);
        else ordersPage++;
        renderOrders();
      });
    });
  }

  async function renderOrderDetail(id) {
    const el = document.getElementById('tab-orders');
    el.innerHTML = '<div class="loading">Carregando pedido...</div>';

    try {
      const o = await api('/orders/' + id);

      let html = '<button class="back-btn" data-back-orders>← Voltar para pedidos</button>';

      // Order info
      html += '<div class="order-detail">' +
        '<h2>Pedido ' + esc(o.id) + '</h2>' +
        '<div class="grid">' +
          '<div class="field"><label>Cliente</label><span>' + esc(o.customer_name) + '</span></div>' +
          '<div class="field"><label>Email</label><span>' + esc(o.customer_email) + '</span></div>' +
          '<div class="field"><label>Telefone</label><span>' + esc(o.customer_phone || '—') + '</span></div>' +
          '<div class="field"><label>Documento</label><span>' + esc(o.customer_document || '—') + '</span></div>';

      if (o.shipping_address) {
        html +=
          '<div class="field"><label>Endereço</label><span>' + esc(o.shipping_address + (o.shipping_number ? ', ' + o.shipping_number : '')) + '</span></div>' +
          '<div class="field"><label>Bairro</label><span>' + esc(o.shipping_neighborhood || '—') + '</span></div>' +
          '<div class="field"><label>Cidade/UF</label><span>' + esc((o.shipping_city || '') + (o.shipping_state ? '/' + o.shipping_state : '')) + '</span></div>' +
          '<div class="field"><label>CEP</label><span>' + esc(o.shipping_zipcode || '—') + '</span></div>';
      }

      html +=
          '<div class="field"><label>Subtotal</label><span>' + money(o.subtotal) + '</span></div>' +
          '<div class="field"><label>Frete</label><span>' + money(o.shipping_total) + '</span></div>' +
          '<div class="field"><label>Total</label><span><strong>' + money(o.total) + '</strong></span></div>' +
          '<div class="field"><label>Status</label><span>' + badge(o.status) + '</span></div>' +
          '<div class="field"><label>Provedor</label><span>' + esc(o.payment_provider || '—') + '</span></div>' +
          '<div class="field"><label>Criado em</label><span>' + dateStr(o.created_at) + '</span></div>' +
        '</div>';

      // Status change
      html += '<div class="status-select">' +
        '<label style="font-size:13px;color:#888;margin-right:8px;">Alterar status:</label>' +
        '<select id="order-status-select">' +
          '<option value="pending"' + (o.status === 'pending' ? ' selected' : '') + '>Pendente</option>' +
          '<option value="paid"' + (o.status === 'paid' ? ' selected' : '') + '>Pago</option>' +
          '<option value="cancelled"' + (o.status === 'cancelled' ? ' selected' : '') + '>Cancelado</option>' +
          '<option value="failed"' + (o.status === 'failed' ? ' selected' : '') + '>Falhou</option>' +
          '<option value="refunded"' + (o.status === 'refunded' ? ' selected' : '') + '>Reembolsado</option>' +
        '</select>' +
        '<button class="btn btn-primary btn-sm" id="order-status-btn">Salvar</button>' +
      '</div>';

      html += '</div>';

      // Items
      if (o.items && o.items.length > 0) {
        html += '<div class="order-detail">' +
          '<h2>Itens (' + o.items.length + ')</h2>' +
          '<div class="table-wrap"><table><thead><tr>' +
          '<th>Produto</th><th>Qtd</th><th>Preço unit.</th><th>Total</th>' +
          '</tr></thead><tbody>';

        for (const item of o.items) {
          html += '<tr>' +
            '<td>' + esc(item.product_name) + '</td>' +
            '<td>' + item.quantity + '</td>' +
            '<td>' + money(item.unit_price) + '</td>' +
            '<td><strong>' + money(item.total_price) + '</strong></td>' +
            '</tr>';
        }

        html += '</tbody></table></div></div>';
      }

      el.innerHTML = html;

      // Bind events
      document.querySelector('[data-back-orders]').addEventListener('click', () => {
        selectedOrderId = null;
        renderOrders();
      });

      document.getElementById('order-status-btn').addEventListener('click', async () => {
        const status = document.getElementById('order-status-select').value;
        try {
          await api('/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
          toast('Status atualizado para: ' + status);
          renderOrderDetail(id);
        } catch (e) { toast(e.message, 'error'); }
      });
    } catch (e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">Erro: ' + esc(e.message) + '</div>';
    }
  }

  /* ---------------------------------------------------------------- */
  /* Init                                                              */
  /* ---------------------------------------------------------------- */
  function initApp() {
    renderProducts();
  }

  checkLogin();
})();
