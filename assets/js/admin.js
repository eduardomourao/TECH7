/* Admin TECH 7 - painel administrativo */
(function () {
  'use strict';

  const API = '/api/admin';
  const TOAST = document.getElementById('toast');
  const state = {
    activeTab: 'dashboard',
    productsPage: 0,
    ordersPage: 0,
    productsQuery: '',
    productStatus: 'all',
    productBrand: 'all',
    orderStatus: 'all',
    selectedOrderId: null,
    productsSnapshot: [],
    ordersSnapshot: [],
    lastSnapshotAt: 0,
    snapshotPromise: null,
    totals: { products: 0, orders: 0 },
    pricing: { cost: 42, logistics: 12, tax: 8, margin: 35, markup: 18 },
  };

  const PRODUCTS_PER_PAGE = 20;
  const ORDERS_PER_PAGE = 20;

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
    setTimeout(() => { TOAST.classList.remove('show'); }, 2600);
  }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function dateStr(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  }

  function pct(value) {
    const n = Math.max(0, Math.min(100, Number(value || 0)));
    return n.toFixed(n % 1 ? 1 : 0) + '%';
  }

  function badge(status) {
    const cls = {
      pending: 'badge-pending',
      paid: 'badge-paid',
      cancelled: 'badge-cancelled',
      failed: 'badge-failed',
      refunded: 'badge-refunded',
    };
    const labels = {
      pending: 'Pendente',
      paid: 'Pago',
      cancelled: 'Cancelado',
      failed: 'Falhou',
      refunded: 'Reembolsado',
    };
    return '<span class="badge ' + (cls[status] || 'badge-pending') + '">' + esc(labels[status] || status || 'pending') + '</span>';
  }

  function panel(title, subtitle, body, actions) {
    return '<section class="panel">' +
      '<div class="panel-head"><div class="panel-title"><h2>' + esc(title) + '</h2>' +
      (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div>' +
      (actions ? '<div class="panel-actions">' + actions + '</div>' : '') +
      '</div><div class="panel-body">' + body + '</div></section>';
  }

  function setMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function updateHeader(title, subtitle) {
    const titleEl = document.getElementById('adminTitle');
    const subEl = document.getElementById('adminSubtitle');
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
  }

  function updateTopMetrics() {
    setMetric('metricProducts', state.totals.products ? state.totals.products.toLocaleString('pt-BR') : '--');
    setMetric('metricPageProducts', state.productsSnapshot.length ? state.productsSnapshot.length.toLocaleString('pt-BR') : '--');
    setMetric('metricOrders', state.totals.orders ? state.totals.orders.toLocaleString('pt-BR') : '--');
    setMetric('metricStatus', token() ? 'Online' : 'Offline');
  }

  async function fetchAllProducts() {
    const out = [];
    let offset = 0;
    let total = 0;
    do {
      const data = await api('/products?limit=200&offset=' + offset);
      total = data.total || 0;
      out.push(...(data.items || []));
      offset += 200;
    } while (offset < total && offset < 10000);
    state.productsSnapshot = out;
    state.totals.products = total;
  }

  async function fetchAllOrders() {
    const out = [];
    let offset = 0;
    let total = 0;
    do {
      const data = await api('/orders?limit=200&offset=' + offset);
      total = data.total || 0;
      out.push(...(data.items || []));
      offset += 200;
    } while (offset < total && offset < 10000);
    state.ordersSnapshot = out;
    state.totals.orders = total;
  }

  async function refreshSnapshots(force) {
    if (!force && state.lastSnapshotAt && Date.now() - state.lastSnapshotAt < 30000) {
      updateTopMetrics();
      return;
    }
    if (!force && state.snapshotPromise) return state.snapshotPromise;
    state.snapshotPromise = Promise.all([fetchAllProducts(), fetchAllOrders()])
      .then(() => {
        state.lastSnapshotAt = Date.now();
        updateTopMetrics();
      })
      .finally(() => { state.snapshotPromise = null; });
    return state.snapshotPromise;
  }

  function productStats(products) {
    const total = products.length;
    const active = products.filter((p) => p.active).length;
    const inactive = total - active;
    const zeroPrice = products.filter((p) => Number(p.price || 0) <= 0).length;
    const avgPrice = total ? products.reduce((sum, p) => sum + Number(p.price || 0), 0) / total : 0;
    const brands = {};
    const cats = {};
    products.forEach((p) => {
      brands[p.brand || 'Sem marca'] = (brands[p.brand || 'Sem marca'] || 0) + 1;
      cats[p.category || 'Sem categoria'] = (cats[p.category || 'Sem categoria'] || 0) + 1;
    });
    return { total, active, inactive, zeroPrice, avgPrice, brands, cats };
  }

  function orderStats(orders) {
    const total = orders.length;
    const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const paid = orders.filter((o) => o.status === 'paid');
    const pending = orders.filter((o) => o.status === 'pending');
    const cancelled = orders.filter((o) => ['cancelled', 'failed', 'refunded'].includes(o.status));
    const avgTicket = total ? revenue / total : 0;
    return { total, revenue, paid: paid.length, pending: pending.length, cancelled: cancelled.length, avgTicket };
  }

  function topEntries(obj, limit) {
    return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
  }

  function chartRows(entries, total) {
    if (!entries.length) return '<div class="empty-state">Sem dados suficientes</div>';
    return '<div class="chart-bars">' + entries.map(([label, value]) => {
      const width = total ? (value / total) * 100 : 0;
      return '<div class="chart-row"><strong>' + esc(label) + '</strong>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct(width) + '"></div></div>' +
        '<span>' + value.toLocaleString('pt-BR') + '</span></div>';
    }).join('') + '</div>';
  }

  function alertsHtml(products, orders) {
    const ps = productStats(products);
    const os = orderStats(orders);
    const alerts = [];
    if (ps.zeroPrice) alerts.push({ type: 'warning', title: ps.zeroPrice + ' produtos sem preco', body: 'Revise antes de publicar ou vender.' });
    if (ps.inactive) alerts.push({ type: 'warning', title: ps.inactive + ' produtos inativos', body: 'Produtos inativos ficam fora da operacao comercial.' });
    if (os.pending) alerts.push({ type: 'warning', title: os.pending + ' pedidos pendentes', body: 'Acompanhe pagamento e separacao.' });
    if (os.cancelled) alerts.push({ type: 'error', title: os.cancelled + ' pedidos com falha/cancelamento', body: 'Verifique divergencias de pagamento.' });
    if (!alerts.length) alerts.push({ type: 'success', title: 'Operacao sem alertas criticos', body: 'Catalogo e pedidos estao em estado normal.' });
    return '<div class="alert-list">' + alerts.map((a) =>
      '<div class="alert-card"><div class="alert-head"><strong>' + esc(a.title) + '</strong><span class="status-pill ' + a.type + '">' + esc(a.type) + '</span></div><p>' + esc(a.body) + '</p></div>'
    ).join('') + '</div>';
  }

  async function renderDashboard() {
    state.activeTab = 'dashboard';
    updateHeader('Manufacturing Control Center', 'Visao em tempo real do backend, catalogo e ciclo de pedidos da TECH 7.');
    const el = document.getElementById('tab-dashboard');
    el.innerHTML = '<div class="loading">Carregando indicadores...</div>';
    try {
      await refreshSnapshots();
      const ps = productStats(state.productsSnapshot);
      const os = orderStats(state.ordersSnapshot);
      const activeRate = ps.total ? (ps.active / ps.total) * 100 : 0;
      const paidRate = os.total ? (os.paid / os.total) * 100 : 0;

      const kpis = '<div class="mini-grid">' +
        '<div class="mini-card"><span class="label">Produtos ativos</span><span class="value">' + ps.active.toLocaleString('pt-BR') + '</span><span class="hint">' + pct(activeRate) + ' do catalogo</span></div>' +
        '<div class="mini-card"><span class="label">Preco medio</span><span class="value">' + money(ps.avgPrice) + '</span><span class="hint">Base carregada do backend</span></div>' +
        '<div class="mini-card"><span class="label">Receita em pedidos</span><span class="value">' + money(os.revenue) + '</span><span class="hint">' + os.total + ' pedidos carregados</span></div>' +
        '<div class="mini-card"><span class="label">Pedidos pagos</span><span class="value">' + os.paid + '</span><span class="hint">' + pct(paidRate) + ' confirmados</span></div>' +
        '</div>';

      const overview = panel('Live Production Overview', 'Indicadores reais extraidos das APIs admin',
        '<div class="mini-grid">' +
          '<div class="mini-card"><span class="label">Total Orders</span><span class="value">' + os.total + '</span><span class="hint">No backend</span></div>' +
          '<div class="mini-card"><span class="label">Avg Ticket</span><span class="value">' + money(os.avgTicket) + '</span><span class="hint">Media por pedido</span></div>' +
          '<div class="mini-card"><span class="label">Pending</span><span class="value">' + os.pending + '</span><span class="hint">Aguardando acao</span></div>' +
          '<div class="mini-card"><span class="label">Inactive SKUs</span><span class="value">' + ps.inactive + '</span><span class="hint">Fora do ar</span></div>' +
        '</div>' +
        '<div class="progress-row"><div class="progress-meta"><span>Catalogo ativo</span><strong>' + pct(activeRate) + '</strong></div><div class="progress-track"><div class="progress-fill green" style="width:' + pct(activeRate) + '"></div></div></div>' +
        '<div class="progress-row"><div class="progress-meta"><span>Pedidos pagos</span><strong>' + pct(paidRate) + '</strong></div><div class="progress-track"><div class="progress-fill" style="width:' + pct(paidRate) + '"></div></div></div>' +
        '<div class="progress-row"><div class="progress-meta"><span>Produtos com preco valido</span><strong>' + pct(ps.total ? ((ps.total - ps.zeroPrice) / ps.total) * 100 : 0) + '</strong></div><div class="progress-track"><div class="progress-fill yellow" style="width:' + pct(ps.total ? ((ps.total - ps.zeroPrice) / ps.total) * 100 : 0) + '"></div></div></div>'
      );

      const alerts = panel('System Alerts', 'Prioridades calculadas do estado atual', alertsHtml(state.productsSnapshot, state.ordersSnapshot));
      const brands = panel('Catalog Nodes', 'Distribuicao por marca', chartRows(topEntries(ps.brands, 8), ps.total));
      const categories = panel('Capacity Heat Map', 'Distribuicao por categoria/secao', chartRows(topEntries(ps.cats, 8), ps.total));

      el.innerHTML = kpis + '<div class="dashboard-grid"><div>' + overview + '</div><div>' + alerts + '</div></div>' +
        '<div class="dashboard-grid"><div>' + brands + '</div><div>' + categories + '</div></div>';
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro: ' + esc(e.message) + '</div>';
    }
  }

  async function renderProducts() {
    state.activeTab = 'products';
    updateHeader('Factory Node Configuration', 'Gerencie produtos, marcas, precos, status e links de vitrine.');
    const el = document.getElementById('tab-products');
    el.innerHTML = '<div class="loading">Carregando produtos...</div>';

    try {
      const offset = state.productsPage * PRODUCTS_PER_PAGE;
      const q = state.productsQuery ? '&q=' + encodeURIComponent(state.productsQuery) : '';
      const data = await api('/products?limit=' + PRODUCTS_PER_PAGE + '&offset=' + offset + q);
      state.totals.products = data.total || 0;
      const totalPages = Math.ceil((data.total || 0) / PRODUCTS_PER_PAGE);
      let items = data.items || [];
      if (state.productStatus !== 'all') {
        const wantActive = state.productStatus === 'active';
        items = items.filter((p) => !!p.active === wantActive);
      }
      if (state.productBrand !== 'all') items = items.filter((p) => (p.brand || 'Sem marca') === state.productBrand);
      const brands = [...new Set(state.productsSnapshot.map((p) => p.brand || 'Sem marca'))].sort();

      const toolbar = '<div class="toolbar"><div class="toolbar-group">' +
        '<input type="text" id="productSearchInput" placeholder="Buscar produto, marca ou categoria" value="' + esc(state.productsQuery) + '">' +
        '<select id="productStatusFilter"><option value="all">Todos status</option><option value="active"' + (state.productStatus === 'active' ? ' selected' : '') + '>Ativos</option><option value="inactive"' + (state.productStatus === 'inactive' ? ' selected' : '') + '>Inativos</option></select>' +
        '<select id="productBrandFilter"><option value="all">Todas marcas</option>' + brands.map((b) => '<option value="' + esc(b) + '"' + (state.productBrand === b ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>' +
        '<button class="btn btn-outline btn-sm" id="clearProductFilters">Limpar</button>' +
        '</div><div class="toolbar-group">' +
        '<button class="btn btn-outline btn-sm" id="bulkRaiseBtn">Reajuste % pagina</button>' +
        '<button class="btn btn-outline btn-sm" id="bulkSetBtn">Preco unico pagina</button>' +
        '</div></div>';

      let table = '<div class="table-wrap"><table><thead><tr>' +
        '<th>ID</th><th>Nome</th><th>Marca</th><th>Cat.</th><th>Preco</th><th>Estoque</th><th>Ativo</th><th>Acoes</th>' +
        '</tr></thead><tbody>';

      for (const p of items) {
        table += '<tr>' +
          '<td class="mono-muted">' + esc(p.id?.slice(0, 12)) + '</td>' +
          '<td><strong>' + esc(p.name) + '</strong></td>' +
          '<td>' + esc(p.brand || '-') + '</td>' +
          '<td>' + esc(p.category || '-') + '</td>' +
          '<td><div class="inline-edit"><input type="number" step="0.01" min="0" value="' + Number(p.price).toFixed(2) + '" data-field="price" data-id="' + esc(p.id) + '"><button class="btn btn-primary btn-sm" data-save-price data-id="' + esc(p.id) + '">Salvar</button></div></td>' +
          '<td><div class="inline-edit"><input type="number" min="0" value="' + (p.stock || 0) + '" data-field="stock" data-id="' + esc(p.id) + '" disabled><button class="btn btn-outline btn-sm" disabled>Indisp.</button></div></td>' +
          '<td><button class="btn btn-sm ' + (p.active ? 'btn-success' : 'btn-outline') + '" data-toggle-active data-id="' + esc(p.id) + '" data-active="' + p.active + '">' + (p.active ? 'Ativo' : 'Inativo') + '</button></td>' +
          '<td><button class="btn btn-sm btn-outline" data-view-product data-id="' + esc(p.id) + '" data-url="' + esc(p.url || '') + '">Ver</button></td>' +
          '</tr>';
      }

      table += '</tbody></table></div>';
      if (!items.length) table = '<div class="empty-state">Nenhum produto encontrado para os filtros atuais</div>';

      const pagination = '<div class="pagination">' +
        '<button ' + (state.productsPage === 0 ? 'disabled' : '') + ' data-products-page="prev">Anterior</button>' +
        '<span>Pagina ' + (state.productsPage + 1) + ' de ' + (totalPages || 1) + '</span>' +
        '<button ' + (state.productsPage >= totalPages - 1 ? 'disabled' : '') + ' data-products-page="next">Proxima</button>' +
        '</div>';

      el.innerHTML = panel('Produtos (' + (data.total || 0) + ')', 'Edicao operacional do catalogo', toolbar + table + pagination);
      updateTopMetrics();
      bindProductEvents();
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro: ' + esc(e.message) + '</div>';
    }
  }

  function bindProductEvents() {
    const search = document.getElementById('productSearchInput');
    if (search) search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.productsQuery = search.value.trim();
        state.productsPage = 0;
        renderProducts();
      }
    });
    const status = document.getElementById('productStatusFilter');
    if (status) status.addEventListener('change', () => { state.productStatus = status.value; renderProducts(); });
    const brand = document.getElementById('productBrandFilter');
    if (brand) brand.addEventListener('change', () => { state.productBrand = brand.value; renderProducts(); });
    const clear = document.getElementById('clearProductFilters');
    if (clear) clear.addEventListener('click', () => {
      state.productsQuery = '';
      state.productStatus = 'all';
      state.productBrand = 'all';
      state.productsPage = 0;
      renderProducts();
    });

    document.querySelectorAll('[data-save-price]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const input = document.querySelector('input[data-field="price"][data-id="' + id + '"]');
        const price = parseFloat(input.value);
        if (isNaN(price) || price < 0) return toast('Preco invalido', 'error');
        try {
          await api('/products/' + id, { method: 'PUT', body: JSON.stringify({ price }) });
          await refreshSnapshots(true);
          toast('Preco atualizado');
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const active = btn.dataset.active === 'true' ? false : true;
        try {
          await api('/products/' + id, { method: 'PUT', body: JSON.stringify({ active }) });
          await refreshSnapshots(true);
          renderProducts();
          toast(active ? 'Produto ativado' : 'Produto desativado');
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-view-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = String(btn.dataset.url || '').trim();
        if (!url) return toast('Produto sem URL de vitrine', 'error');
        window.open(url.startsWith('/') ? url : ('/' + url), '_blank');
      });
    });

    document.querySelectorAll('[data-products-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.productsPage === 'prev') state.productsPage = Math.max(0, state.productsPage - 1);
        else state.productsPage++;
        renderProducts();
      });
    });

    const raiseBtn = document.getElementById('bulkRaiseBtn');
    if (raiseBtn) raiseBtn.addEventListener('click', () => applyBulkPrompt('percent'));
    const setBtn = document.getElementById('bulkSetBtn');
    if (setBtn) setBtn.addEventListener('click', () => applyBulkPrompt('fixed'));
  }

  async function applyBulkPrompt(mode) {
    const label = mode === 'percent' ? 'Percentual de reajuste. Ex: 5 ou -3' : 'Novo preco fixo. Ex: 99.90';
    const raw = prompt(label);
    if (raw == null) return;
    const value = parseFloat(String(raw).replace(',', '.'));
    if (!Number.isFinite(value) || (mode === 'fixed' && value < 0)) return toast('Valor invalido', 'error');
    const updates = [];
    document.querySelectorAll('input[data-field="price"]').forEach((input) => {
      const base = parseFloat(input.value);
      if (!Number.isFinite(base) || base < 0) return;
      const price = mode === 'percent' ? +(base * (1 + value / 100)).toFixed(2) : +value.toFixed(2);
      updates.push({ id: input.dataset.id, price });
    });
    if (!updates.length) return toast('Nenhum produto na pagina', 'error');
    try {
      await api('/prices/bulk', { method: 'POST', body: JSON.stringify({ updates }) });
      await refreshSnapshots(true);
      toast('Atualizacao em lote aplicada');
      renderProducts();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function renderOrders() {
    state.activeTab = 'orders';
    updateHeader('Order Lifecycle Management', 'Acompanhe pedidos, status, pagamentos e itens.');
    const el = document.getElementById('tab-orders');
    if (state.selectedOrderId) return renderOrderDetail(state.selectedOrderId);
    el.innerHTML = '<div class="loading">Carregando pedidos...</div>';

    try {
      const offset = state.ordersPage * ORDERS_PER_PAGE;
      const data = await api('/orders?limit=' + ORDERS_PER_PAGE + '&offset=' + offset);
      state.totals.orders = data.total || 0;
      const totalPages = Math.ceil((data.total || 0) / ORDERS_PER_PAGE);
      let items = data.items || [];
      if (state.orderStatus !== 'all') items = items.filter((o) => o.status === state.orderStatus);

      const os = orderStats(state.ordersSnapshot);
      const summary = '<div class="mini-grid">' +
        '<div class="mini-card"><span class="label">Active Orders</span><span class="value">' + os.total + '</span><span class="hint">Pedidos carregados</span></div>' +
        '<div class="mini-card"><span class="label">Paid</span><span class="value">' + os.paid + '</span><span class="hint">Confirmados</span></div>' +
        '<div class="mini-card"><span class="label">Pending</span><span class="value">' + os.pending + '</span><span class="hint">Aguardando</span></div>' +
        '<div class="mini-card"><span class="label">Revenue</span><span class="value">' + money(os.revenue) + '</span><span class="hint">Soma carregada</span></div>' +
        '</div>';

      const toolbar = '<div class="toolbar"><div class="toolbar-group"><select id="orderStatusFilter">' +
        '<option value="all">Todos status</option><option value="pending"' + (state.orderStatus === 'pending' ? ' selected' : '') + '>Pendente</option><option value="paid"' + (state.orderStatus === 'paid' ? ' selected' : '') + '>Pago</option><option value="cancelled"' + (state.orderStatus === 'cancelled' ? ' selected' : '') + '>Cancelado</option><option value="failed"' + (state.orderStatus === 'failed' ? ' selected' : '') + '>Falhou</option><option value="refunded"' + (state.orderStatus === 'refunded' ? ' selected' : '') + '>Reembolsado</option>' +
        '</select></div></div>';

      let table = '<div class="table-wrap"><table><thead><tr>' +
        '<th>ID</th><th>Cliente</th><th>Email</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Data</th><th></th>' +
        '</tr></thead><tbody>';
      for (const o of items) {
        table += '<tr>' +
          '<td class="mono-muted">' + esc(o.id?.slice(0, 12)) + '</td>' +
          '<td>' + esc(o.customer_name) + '</td>' +
          '<td>' + esc(o.customer_email) + '</td>' +
          '<td><strong>' + money(o.total) + '</strong></td>' +
          '<td>' + badge(o.status) + '</td>' +
          '<td>' + esc(o.payment_provider || '-') + '</td>' +
          '<td>' + dateStr(o.created_at) + '</td>' +
          '<td><button class="btn btn-sm btn-primary" data-view-order data-id="' + esc(o.id) + '">Detalhes</button></td>' +
          '</tr>';
      }
      table += '</tbody></table></div>';
      if (!items.length) table = '<div class="empty-state">Nenhum pedido encontrado</div>';

      const pagination = '<div class="pagination">' +
        '<button ' + (state.ordersPage === 0 ? 'disabled' : '') + ' data-orders-page="prev">Anterior</button>' +
        '<span>Pagina ' + (state.ordersPage + 1) + ' de ' + (totalPages || 1) + '</span>' +
        '<button ' + (state.ordersPage >= totalPages - 1 ? 'disabled' : '') + ' data-orders-page="next">Proxima</button>' +
        '</div>';

      el.innerHTML = summary + panel('Active Orders', 'Visao de ciclo e status', toolbar + table + pagination);
      updateTopMetrics();
      bindOrderEvents();
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro: ' + esc(e.message) + '</div>';
    }
  }

  function bindOrderEvents() {
    const filter = document.getElementById('orderStatusFilter');
    if (filter) filter.addEventListener('change', () => { state.orderStatus = filter.value; renderOrders(); });
    document.querySelectorAll('[data-view-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedOrderId = btn.dataset.id;
        renderOrders();
      });
    });
    document.querySelectorAll('[data-orders-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.ordersPage === 'prev') state.ordersPage = Math.max(0, state.ordersPage - 1);
        else state.ordersPage++;
        renderOrders();
      });
    });
  }

  async function renderOrderDetail(id) {
    const el = document.getElementById('tab-orders');
    el.innerHTML = '<div class="loading">Carregando pedido...</div>';
    try {
      const o = await api('/orders/' + id);
      let html = '<button class="back-btn" data-back-orders>Voltar para pedidos</button>';
      html += '<div class="order-detail"><h2>Pedido ' + esc(o.id) + '</h2><div class="grid">' +
        '<div class="field"><label>Cliente</label><span>' + esc(o.customer_name) + '</span></div>' +
        '<div class="field"><label>Email</label><span>' + esc(o.customer_email) + '</span></div>' +
        '<div class="field"><label>Telefone</label><span>' + esc(o.customer_phone || '-') + '</span></div>' +
        '<div class="field"><label>Documento</label><span>' + esc(o.customer_document || '-') + '</span></div>' +
        '<div class="field"><label>Subtotal</label><span>' + money(o.subtotal) + '</span></div>' +
        '<div class="field"><label>Frete</label><span>' + money(o.shipping_total) + '</span></div>' +
        '<div class="field"><label>Total</label><span><strong>' + money(o.total) + '</strong></span></div>' +
        '<div class="field"><label>Status</label><span>' + badge(o.status) + '</span></div>' +
        '<div class="field"><label>Provedor</label><span>' + esc(o.payment_provider || '-') + '</span></div>' +
        '<div class="field"><label>Criado em</label><span>' + dateStr(o.created_at) + '</span></div>' +
        '</div><div class="status-select"><label for="order-status-select">Alterar status:</label>' +
        '<select id="order-status-select">' +
        ['pending', 'paid', 'cancelled', 'failed', 'refunded'].map((s) => '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>').join('') +
        '</select><button class="btn btn-primary btn-sm" id="order-status-btn">Salvar</button></div></div>';

      if (o.items && o.items.length > 0) {
        let items = '<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Qtd</th><th>Preco unit.</th><th>Total</th></tr></thead><tbody>';
        for (const item of o.items) {
          items += '<tr><td>' + esc(item.product_name) + '</td><td>' + item.quantity + '</td><td>' + money(item.unit_price) + '</td><td><strong>' + money(item.total_price) + '</strong></td></tr>';
        }
        items += '</tbody></table></div>';
        html += panel('Itens (' + o.items.length + ')', 'Produtos do pedido', items);
      }
      el.innerHTML = html;
      document.querySelector('[data-back-orders]').addEventListener('click', () => {
        state.selectedOrderId = null;
        renderOrders();
      });
      document.getElementById('order-status-btn').addEventListener('click', async () => {
        const status = document.getElementById('order-status-select').value;
        try {
          await api('/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
          await refreshSnapshots(true);
          toast('Status atualizado para: ' + status);
          renderOrderDetail(id);
        } catch (e) { toast(e.message, 'error'); }
      });
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro: ' + esc(e.message) + '</div>';
    }
  }

  function calculatePrice() {
    const c = state.pricing;
    const subtotal = Number(c.cost) + Number(c.logistics) + (Number(c.cost) * Number(c.tax) / 100);
    const price = subtotal * (1 + Number(c.margin) / 100);
    const contribution = price - subtotal;
    const grossMargin = price ? (contribution / price) * 100 : 0;
    return { subtotal, price, contribution, grossMargin };
  }

  function renderPricing() {
    state.activeTab = 'pricing';
    updateHeader('Live Price Configuration Engine', 'Simule margem, custo, impostos e aplique reajustes reais no catalogo.');
    const r = calculatePrice();
    const controls = '<div class="control-stack">' +
      rangeField('cost', 'Custo base medio', 0, 500, 1, 'R$') +
      rangeField('logistics', 'Logistica estimada', 0, 100, 1, 'R$') +
      rangeField('tax', 'Impostos e taxas', 0, 30, 1, '%') +
      rangeField('margin', 'Margem alvo', 0, 80, 1, '%') +
      rangeField('markup', 'Reajuste para aplicar', -50, 100, 1, '%') +
      '</div>';
    const output = '<div class="control-stack">' +
      '<div class="result-row"><span>Custo final estimado</span><strong>' + money(r.subtotal) + '</strong></div>' +
      '<div class="result-row primary"><span>Preco sugerido</span><strong>' + money(r.price) + '</strong></div>' +
      '<div class="result-row"><span>Margem bruta</span><strong>' + r.grossMargin.toFixed(1) + '%</strong></div>' +
      '<div class="result-row"><span>Contribuicao</span><strong>' + money(r.contribution) + '</strong></div>' +
      '<button class="btn btn-primary" id="applyScenarioToPage">Aplicar reajuste nos primeiros itens carregados</button>' +
      '<button class="btn btn-outline" id="resetScenario">Resetar simulador</button>' +
      '</div>';
    const scenarios = '<div class="scenario-list">' +
      scenario('Conservador', 20, r.subtotal * 1.2) +
      scenario('Atual', state.pricing.margin, r.price, true) +
      scenario('Premium', 50, r.subtotal * 1.5) +
      '</div>';
    document.getElementById('tab-pricing').innerHTML =
      '<div class="price-engine">' + panel('Price Configuration Inputs', 'Controles em tempo real', controls) + panel('Real-Time Pricing Output', 'Calculos do simulador', output) + '</div>' +
      panel('What-If Analysis', 'Cenarios comparativos', scenarios);
    bindPricingEvents();
  }

  function rangeField(key, label, min, max, step, suffix) {
    const val = state.pricing[key];
    return '<div class="range-field"><label for="pricing-' + key + '"><span>' + esc(label) + '</span><strong>' + (suffix === 'R$' ? money(val) : val + suffix) + '</strong></label>' +
      '<input type="range" id="pricing-' + key + '" data-pricing="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
  }

  function scenario(name, margin, price, active) {
    return '<div class="scenario-card"><div class="scenario-head"><h3>' + esc(name) + '</h3>' + (active ? '<span class="badge badge-paid">Ativo</span>' : '') + '</div>' +
      '<p>Margem alvo: <strong>' + margin + '%</strong></p><p>Preco unitario: <strong>' + money(price) + '</strong></p></div>';
  }

  function bindPricingEvents() {
    document.querySelectorAll('[data-pricing]').forEach((input) => {
      input.addEventListener('input', () => {
        state.pricing[input.dataset.pricing] = Number(input.value);
        renderPricing();
      });
    });
    document.getElementById('resetScenario').addEventListener('click', () => {
      state.pricing = { cost: 42, logistics: 12, tax: 8, margin: 35, markup: 18 };
      renderPricing();
    });
    document.getElementById('applyScenarioToPage').addEventListener('click', async () => {
      const updates = state.productsSnapshot.slice(0, PRODUCTS_PER_PAGE).map((p) => ({
        id: p.id,
        price: +(Number(p.price || 0) * (1 + state.pricing.markup / 100)).toFixed(2),
      })).filter((u) => u.id && Number.isFinite(u.price) && u.price >= 0);
      if (!updates.length) return toast('Carregue produtos antes de aplicar', 'error');
      if (!confirm('Aplicar reajuste de ' + state.pricing.markup + '% nos primeiros ' + updates.length + ' produtos carregados?')) return;
      try {
        await api('/prices/bulk', { method: 'POST', body: JSON.stringify({ updates }) });
        await refreshSnapshots(true);
        toast('Cenario aplicado ao catalogo');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function renderReports() {
    state.activeTab = 'reports';
    updateHeader('Analytics & Reporting', 'Relatorios calculados a partir dos produtos e pedidos reais do backend.');
    const el = document.getElementById('tab-reports');
    el.innerHTML = '<div class="loading">Calculando relatorios...</div>';
    try {
      await refreshSnapshots();
      const ps = productStats(state.productsSnapshot);
      const os = orderStats(state.ordersSnapshot);
      const statusMap = {};
      state.ordersSnapshot.forEach((o) => { statusMap[o.status || 'pending'] = (statusMap[o.status || 'pending'] || 0) + 1; });
      el.innerHTML =
        '<div class="mini-grid">' +
          '<div class="mini-card"><span class="label">Total Revenue</span><span class="value">' + money(os.revenue) + '</span><span class="hint">Pedidos carregados</span></div>' +
          '<div class="mini-card"><span class="label">Avg Gross Margin</span><span class="value">' + (state.pricing.margin || 0) + '%</span><span class="hint">Simulador de preco</span></div>' +
          '<div class="mini-card"><span class="label">Catalog Yield</span><span class="value">' + pct(ps.total ? (ps.active / ps.total) * 100 : 0) + '</span><span class="hint">Ativos / total</span></div>' +
          '<div class="mini-card"><span class="label">Zero Price</span><span class="value">' + ps.zeroPrice + '</span><span class="hint">Precisa revisao</span></div>' +
        '</div>' +
        '<div class="dashboard-grid"><div>' + panel('SKU Distribution by Brand', 'Top marcas', chartRows(topEntries(ps.brands, 10), ps.total)) + '</div><div>' + panel('Order Status Distribution', 'Pedidos por status', chartRows(topEntries(statusMap, 8), os.total)) + '</div></div>' +
        panel('Capacity Utilization by Category', 'Categorias/secao do catalogo', chartRows(topEntries(ps.cats, 12), ps.total));
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro: ' + esc(e.message) + '</div>';
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    const target = document.getElementById('tab-' + tab);
    if (target) target.classList.add('active');
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'products') renderProducts();
    if (tab === 'orders') renderOrders();
    if (tab === 'pricing') renderPricing();
    if (tab === 'reports') renderReports();
  }

  function exportCsv() {
    const rows = state.activeTab === 'orders'
      ? [['id', 'cliente', 'email', 'total', 'status', 'pagamento', 'data'], ...state.ordersSnapshot.map((o) => [o.id, o.customer_name, o.customer_email, o.total, o.status, o.payment_provider, o.created_at])]
      : [['id', 'nome', 'marca', 'categoria', 'preco', 'ativo', 'url'], ...state.productsSnapshot.map((p) => [p.id, p.name, p.brand, p.category, p.price, p.active, p.url])];
    const csv = rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tech7-admin-' + state.activeTab + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function checkLogin() {
    if (token()) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';
      switchTab(state.activeTab || 'dashboard');
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

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await refreshSnapshots(true);
    switchTab(state.activeTab);
    toast('Dados atualizados');
  });
  document.getElementById('exportBtn').addEventListener('click', exportCsv);

  checkLogin();
})();
