/* Admin TECH 7 - painel administrativo */
(function () {
  'use strict';

  function resolveApiBase() {
    const override = String(window.TECH7_ADMIN_API_BASE || '').trim();
    if (override) return override.replace(/\/+$/, '');

    return '/api/admin';
  }

  const API = resolveApiBase();
  const TOAST = document.getElementById('toast');
  const state = {
    tab: 'dashboard',
    metrics: null,
    productsPage: 0,
    ordersPage: 0,
    serviceOrdersPage: 0,
    products: [],
    orders: [],
    serviceOrders: [],
    categories: [],
    categoriesLoaded: false,
    productFilters: { q: '', active: '', brand: '', category: '', alert: '', sort: 'updated_desc' },
    dirtyProducts: new Set(),
    theme: localStorage.getItem('tech7-admin-theme') || 'dark',
    editingProduct: null,
    orderStatus: '',
    selectedOrderId: null,
    serviceOrderStatus: '',
    serviceOrderSearch: '',
    selectedServiceOrderId: null,
    editingServiceOrder: null,
    pricing: { cost: 45, freight: 12, tax: 8, margin: 35, adjustment: 10 },
  };

  const PRODUCTS_PER_PAGE = 20;
  const ORDERS_PER_PAGE = 20;
  const SERVICE_ORDERS_PER_PAGE = 20;
  const OS_STATUSES = [
    ['aberta', 'Aberta'],
    ['em_analise', 'Em análise'],
    ['aguardando_peca', 'Aguardando peça'],
    ['em_servico', 'Em serviço'],
    ['pronta', 'Pronta'],
    ['entregue', 'Entregue'],
    ['cancelada', 'Cancelada']
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function headers() {
    return { 'Content-Type': 'application/json' };
  }

  async function api(path, opts) {
    const res = await fetch(API + path, {
      ...opts,
      credentials: 'same-origin',
      headers: { ...headers(), ...(opts?.headers || {}) }
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { error: `http_${res.status}` }; }
    if (!res.ok) throw new Error(json.message || friendlyError(json.error) || `http_${res.status}`);
    return json;
  }

  function friendlyError(code) {
    const productErrors = {
      slug_duplicate: 'Slug ja existe nesta categoria/marca',
      category_required: 'Categoria obrigatoria',
      brand_required: 'Marca obrigatoria',
      name_required: 'Nome obrigatorio',
      invalid_price: 'Preco invalido'
    };
    if (code === 'http_404') return 'Rota da API nao encontrada. Reinicie o servidor ou publique a API atual.';
    if (code === 'order_not_found') return 'Pedido origem nao encontrado. Deixe o campo vazio para OS manual.';
    if (productErrors[code]) return productErrors[code];
    return {
      username_incorrect: 'Usuário incorreto',
      password_incorrect: 'Senha incorreta',
      database_connection_error: 'Falha de conexão com o banco',
      admin_not_configured: 'Administrador não configurado',
      missing_session: 'Sessão expirada',
      invalid_session: 'Sessão inválida'
    }[code] || '';
  }

  function toast(message, type) {
    TOAST.textContent = message;
    TOAST.className = 'toast toast-' + (type || 'success');
    requestAnimationFrame(() => TOAST.classList.add('show'));
    setTimeout(() => TOAST.classList.remove('show'), 2600);
  }

  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.adminTheme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
    localStorage.setItem('tech7-admin-theme', state.theme);
    const button = document.getElementById('themeToggle');
    if (button) {
      button.textContent = state.theme === 'light' ? 'Modo noturno' : 'Modo claro';
      button.setAttribute('aria-pressed', state.theme === 'light' ? 'true' : 'false');
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function number(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function percent(value) {
    const n = Math.max(0, Math.min(100, Number(value || 0)));
    return n.toFixed(n % 1 ? 1 : 0) + '%';
  }

  function dateStr(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  }

  function statusLabel(status) {
    return {
      pending: 'Pendente',
      paid: 'Pago',
      cancelled: 'Cancelado',
      failed: 'Falhou',
      refunded: 'Reembolsado'
    }[status] || status || '-';
  }

  function serviceStatusLabel(status) {
    const found = OS_STATUSES.find((row) => row[0] === status);
    return found ? found[1] : status || '-';
  }

  function serviceBadge(status) {
    const cls = status === 'entregue' || status === 'pronta'
      ? 'badge-paid'
      : status === 'cancelada'
        ? 'badge-bad'
        : status === 'aguardando_peca'
          ? 'badge-pending'
          : 'badge-info';
    return '<span class="badge ' + cls + '">' + esc(serviceStatusLabel(status)) + '</span>';
  }

  function badge(status) {
    const bad = ['cancelled', 'failed', 'refunded'];
    const cls = status === 'paid' ? 'badge-paid' : bad.includes(status) ? 'badge-bad' : status === 'pending' ? 'badge-pending' : 'badge-info';
    return '<span class="badge ' + cls + '">' + esc(statusLabel(status)) + '</span>';
  }

  function setHead(title, subtitle) {
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle;
  }

  function panel(title, subtitle, body, actions) {
    return '<section class="panel"><div class="panel-head"><div><h2>' + esc(title) + '</h2>' +
      (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div>' +
      (actions ? '<div class="toolbar-group">' + actions + '</div>' : '') +
      '</div><div class="panel-body">' + body + '</div></section>';
  }

  function metric(title, value, hint, icon, tone) {
    return '<div class="metric"><div class="metric-icon">' + icon + '</div><small>' + esc(title) + '</small><strong>' +
      esc(value) + '</strong><span class="' + (tone || '') + '">' + esc(hint || '') + '</span></div>';
  }

  function icon(kind) {
    const icons = {
      box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>',
      cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h8.76a2 2 0 0 0 1.95-1.57L21 8H5.12"/></svg>',
      money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
      trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>',
      alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
      file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>',
      wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-3-3Z"/></svg>'
    };
    return icons[kind] || icons.trend;
  }

  async function loadMetrics(force) {
    if (state.metrics && !force) return state.metrics;
    state.metrics = await api('/metrics');
    document.getElementById('lastSync').textContent = 'Atualizado ' + new Date(state.metrics.generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return state.metrics;
  }

  async function loadCategories(force) {
    if (state.categoriesLoaded && !force) return state.categories;
    try {
      const data = await api('/categories');
      state.categories = data.items || [];
    } catch (_) {
      state.categories = [
        { slug: 'display-e-lcd', name: 'Display e LCD' },
        { slug: 'baterias-celular', name: 'Baterias celular' },
        { slug: 'pecas-e-componentes', name: 'Pecas e componentes' },
        { slug: 'tampas-e-carcacas', name: 'Tampas e carcacas' },
        { slug: 'touchs-e-visores', name: 'Touchs e visores' },
        { slug: 'maquinas-e-ferramentas', name: 'Maquinas e ferramentas' }
      ];
    }
    state.categoriesLoaded = true;
    return state.categories;
  }

  function ratio(part, total) {
    return total ? (Number(part || 0) / Number(total || 1)) * 100 : 0;
  }

  function bars(rows, total, moneyValue) {
    if (!rows || !rows.length) return '<div class="empty">Sem dados suficientes</div>';
    const max = Math.max(...rows.map((r) => Number(r.value || 0)), 1);
    return '<div class="bars">' + rows.map((r, idx) => {
      const width = (Number(r.value || 0) / max) * 100;
      const fill = idx % 3 === 1 ? 'green' : idx % 3 === 2 ? 'yellow' : '';
      const right = moneyValue && r.revenue != null ? money(r.revenue) : number(r.value);
      const share = total ? ' (' + percent(ratio(r.value, total)) + ')' : '';
      return '<div class="bar-row"><strong>' + esc(r.label) + '</strong><div class="bar-track"><div class="bar-fill ' + fill + '" style="width:' + percent(width) + '"></div></div><span>' + esc(right + share) + '</span></div>';
    }).join('') + '</div>';
  }

  function compactMetric(label, value, hint) {
    return '<div class="compact-metric"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong><span>' + esc(hint || '') + '</span></div>';
  }

  function renderDashboard() {
    setHead('Painel de controle', 'Métricas reais do catálogo, pedidos, pagamentos e preços da TECH 7.');
    const el = document.getElementById('tab-dashboard');
    el.innerHTML = '<div class="loading">Carregando métricas...</div>';
    loadMetrics().then((m) => {
      const p = m.products;
      const o = m.orders;
      const activeRate = ratio(p.active, p.total);
      const paidRate = ratio(o.paid, o.total);
      const priceRate = ratio(p.total - p.zero_price, p.total);

      const metrics = '<div class="grid-4">' +
        metric('Produtos ativos', number(p.active), percent(activeRate) + ' do catálogo', icon('box')) +
        metric('Faturamento total', money(o.revenue), number(o.paid) + ' vendas concluídas', icon('money')) +
        metric('Pedidos hoje', number(o.today), money(o.today_revenue) + ' hoje', icon('cart')) +
        metric('Ticket médio', money(o.avg_ticket), 'Média das vendas concluídas', icon('trend')) +
        '</div>';

      const overview = panel('Visão operacional', 'Indicadores de saúde do negócio',
        '<div class="sub-grid">' +
          '<div class="sub-card"><small>Preços inválidos</small><strong>' + number(p.zero_price) + '</strong></div>' +
          '<div class="sub-card"><small>Produtos inativos</small><strong>' + number(p.inactive) + '</strong></div>' +
          '<div class="sub-card"><small>Pedidos pendentes</small><strong>' + number(o.pending) + '</strong></div>' +
          '<div class="sub-card"><small>Pedidos com problema</small><strong>' + number(o.problem) + '</strong></div>' +
        '</div>' +
        progress('Catálogo ativo', activeRate, 'green') +
        progress('Pedidos pagos', paidRate, '') +
        progress('Produtos com preço válido', priceRate, 'yellow')
      );

      const alerts = panel('Alertas do sistema', 'Prioridades calculadas automaticamente', alertList(m));
      const brands = panel('Distribuição por marca', 'Top marcas do catálogo', bars(p.by_brand, p.total));
      const categories = panel('Distribuição por categoria', 'Top seções do catálogo', bars(p.by_category, p.total));
      const topProducts = panel('Produtos mais vendidos', 'Ranking por receita em vendas concluídas', renderTopProducts(m.top_products));

      el.innerHTML = metrics + '<div class="grid-wide"><div>' + overview + '</div><div>' + alerts + '</div></div>' +
        '<div class="grid-2"><div>' + brands + '</div><div>' + categories + '</div></div>' + topProducts;
    }).catch((e) => {
      el.innerHTML = '<div class="error-state">Erro ao carregar métricas: ' + esc(e.message) + '</div>';
    });
  }

  function renderDashboardV2() {
    setHead('Painel de controle', 'Metricas reais de catalogo, pedidos, servicos, frete e operacao diaria.');
    const el = document.getElementById('tab-dashboard');
    el.innerHTML = '<div class="loading">Carregando metricas...</div>';
    loadMetrics().then((m) => {
      const p = m.products || {};
      const o = m.orders || {};
      const s = m.service_orders || {};
      const activeRate = ratio(p.active, p.total);
      const paidRate = ratio(o.paid, o.total);
      const priceRate = ratio((p.total || 0) - (p.zero_price || 0), p.total);
      const alertCount = (p.zero_price || 0) + (p.no_image || 0) + (p.low_stock || 0) + (o.pending || 0);
      const serviceRate = ratio(s.completed || 0, s.total || 0);
      const problemRate = ratio(o.problem || 0, o.total || 0);
      const revenueTotal = (o.revenue || 0) + (s.total_revenue || 0);

      const hero = '<div class="dashboard-hero">' +
        '<div><small>Resumo executivo</small><strong>' + money(revenueTotal) + '</strong><span>Receita total combinada de pedidos e ordens de servico.</span></div>' +
        '<div class="hero-metrics">' +
          compactMetric('Pedidos hoje', number(o.today || 0), money(o.today_revenue || 0)) +
          compactMetric('Ticket medio', money(o.avg_ticket || 0), 'vendas concluidas') +
          compactMetric('OS abertas', number(s.open || 0), number(s.ready || 0) + ' prontas') +
          compactMetric('Alertas', number(alertCount), 'acoes pendentes') +
        '</div>' +
      '</div>';

      const healthCharts = '<div class="dashboard-chart-grid">' +
        ringChart('Catalogo ativo', activeRate, number(p.active || 0) + ' de ' + number(p.total || 0), 'green') +
        ringChart('Preco valido', priceRate, number((p.total || 0) - (p.zero_price || 0)) + ' itens OK', 'yellow') +
        ringChart('Pedidos pagos', paidRate, number(o.paid || 0) + ' de ' + number(o.total || 0), '') +
        ringChart('OS concluidas', serviceRate, number(s.completed || 0) + ' de ' + number(s.total || 0), 'green') +
      '</div>';

      const overview = panel('Visao operacional', 'Indicadores de saude do negocio',
        '<div class="sub-grid">' +
          dashboardCard('invalid_prices', 'Precos invalidos', p.zero_price, 'Filtrar produtos sem preco valido') +
          dashboardCard('missing_images', 'Sem imagem', p.no_image || 0, 'Filtrar produtos sem imagem') +
          dashboardCard('low_stock', 'Estoque baixo', p.low_stock || 0, 'Filtrar produtos com estoque baixo') +
          dashboardCard('inactive_products', 'Produtos inativos', p.inactive, 'Filtrar produtos inativos') +
          dashboardCard('pending_orders', 'Pedidos pendentes', o.pending, 'Abrir pedidos pendentes') +
          dashboardCard('open_service_orders', 'OS abertas', s.open || 0, 'Abrir OS em andamento') +
          dashboardCard('completed_services', 'Servicos concluidos', s.completed || 0, 'Abrir OS concluidas') +
          dashboardCard('duplicate_products', 'Produtos duplicados', p.duplicated || 0, 'Filtrar produtos duplicados') +
        '</div>' +
        progress('Catalogo ativo', activeRate, 'green') +
        progress('Pedidos pagos', paidRate, '') +
        progress('Produtos com preco valido', priceRate, 'yellow')
      );

      const alerts = panel('Alertas do sistema', 'Prioridades calculadas automaticamente', alertListV2(m));
      const health = panel('Saude geral', 'Leitura rapida de catalogo, vendas e servicos', healthCharts);
      const catalogMix = panel('Composicao do catalogo', 'Ativos, inativos e principais alertas',
        stackedBars([
          ['Ativos', p.active || 0, 'green'],
          ['Inativos', p.inactive || 0, 'muted'],
          ['Preco invalido', p.zero_price || 0, 'orange'],
          ['Sem imagem', p.no_image || 0, 'red']
        ], p.total || 1)
      );
      const orderMix = panel('Risco em pedidos', 'Pendencias e falhas no fluxo de venda',
        stackedBars([
          ['Pagos', o.paid || 0, 'green'],
          ['Pendentes', o.pending || 0, 'orange'],
          ['Problema', o.problem || 0, 'red']
        ], o.total || 1) +
        '<div class="dashboard-note">Taxa de problema: <strong>' + percent(problemRate) + '</strong></div>'
      );
      const brands = panel('Distribuicao por marca', 'Top marcas do catalogo', bars(p.by_brand, p.total));
      const categories = panel('Categorias mais vendidas', 'Ranking por quantidade vendida', bars(m.top_categories_sold || [], null, true));
      const delivery = panel('Entrega e frete', 'Metodos mais usados', bars(o.by_delivery_method || [], null, true));
      const customers = panel('Clientes recorrentes', 'Compradores com mais de um pedido', bars(o.recurring_customers || [], null, true));
      const topProducts = panel('Produtos mais vendidos', 'Ranking por receita em vendas concluidas', renderTopProducts(m.top_products));
      const serviceOrders = panel('Ordens de servico', 'Status e receita de servico', bars(s.by_status || [], s.total, true));

      el.innerHTML = hero + '<div class="grid-wide"><div>' + overview + '</div><div>' + alerts + '</div></div>' +
        '<div class="grid-2"><div>' + health + '</div><div>' + catalogMix + orderMix + '</div></div>' +
        '<div class="grid-2"><div>' + brands + '</div><div>' + categories + '</div></div>' +
        '<div class="grid-2"><div>' + delivery + '</div><div>' + customers + '</div></div>' +
        '<div class="grid-2"><div>' + serviceOrders + '</div><div>' + topProducts + '</div></div>';
      bindDashboardCards();
    }).catch((e) => {
      el.innerHTML = '<div class="error-state">Erro ao carregar metricas: ' + esc(e.message) + '</div>';
    });
  }

  function dashboardCard(action, label, value, hint) {
    return '<button class="sub-card dashboard-card" type="button" data-dashboard-action="' + esc(action) + '" title="' + esc(hint || '') + '">' +
      '<small>' + esc(label) + '</small><strong>' + number(value || 0) + '</strong></button>';
  }

  function ringChart(label, value, hint, tone) {
    const clamped = Math.max(0, Math.min(100, Number(value || 0)));
    return '<div class="ring-card"><div class="ring ' + esc(tone || '') + '" style="--value:' + clamped.toFixed(1) + '"><span>' + percent(clamped) + '</span></div><div><strong>' + esc(label) + '</strong><small>' + esc(hint || '') + '</small></div></div>';
  }

  function stackedBars(rows, total) {
    const safeTotal = Math.max(1, Number(total || 1));
    return '<div class="stacked-chart">' + rows.map((row) => {
      const width = Math.max(3, Math.min(100, (Number(row[1] || 0) / safeTotal) * 100));
      return '<div class="stacked-row"><div><strong>' + esc(row[0]) + '</strong><span>' + number(row[1] || 0) + '</span></div><div class="stacked-track"><span class="' + esc(row[2] || '') + '" style="width:' + width.toFixed(1) + '%"></span></div></div>';
    }).join('') + '</div>';
  }

  function bindDashboardCards() {
    document.querySelectorAll('[data-dashboard-action]').forEach((card) => {
      card.addEventListener('click', () => openDashboardTarget(card.dataset.dashboardAction));
    });
  }

  function resetProductFilters(overrides) {
    state.productFilters = { q: '', active: '', brand: '', category: '', alert: '', sort: 'updated_desc', ...(overrides || {}) };
    state.productsPage = 0;
    state.editingProduct = null;
  }

  function openDashboardTarget(action) {
    if (action === 'invalid_prices') {
      resetProductFilters({ alert: 'missing_price' });
      return switchTab('products');
    }
    if (action === 'missing_images') {
      resetProductFilters({ alert: 'missing_image' });
      return switchTab('products');
    }
    if (action === 'low_stock') {
      resetProductFilters({ alert: 'low_stock' });
      return switchTab('products');
    }
    if (action === 'inactive_products') {
      resetProductFilters({ active: 'false' });
      return switchTab('products');
    }
    if (action === 'duplicate_products') {
      resetProductFilters({ alert: 'duplicate' });
      return switchTab('products');
    }
    if (action === 'pending_orders') {
      state.orderStatus = 'pending';
      state.ordersPage = 0;
      state.selectedOrderId = null;
      return switchTab('orders');
    }
    if (action === 'open_service_orders') {
      state.serviceOrderStatus = 'open';
      state.serviceOrderSearch = '';
      state.serviceOrdersPage = 0;
      state.selectedServiceOrderId = null;
      return switchTab('service-orders');
    }
    if (action === 'completed_services') {
      state.serviceOrderStatus = 'completed';
      state.serviceOrderSearch = '';
      state.serviceOrdersPage = 0;
      state.selectedServiceOrderId = null;
      return switchTab('service-orders');
    }
  }

  function progress(label, value, color) {
    return '<div style="margin-top:14px"><div class="bar-row" style="grid-template-columns:1fr auto"><span>' + esc(label) + '</span><strong>' + percent(value) + '</strong></div><div class="bar-track"><div class="bar-fill ' + (color || '') + '" style="width:' + percent(value) + '"></div></div></div>';
  }

  function alertList(m) {
    const alerts = [];
    if (m.products.zero_price) alerts.push(['warning', m.products.zero_price + ' produtos com preço inválido', 'Revise itens vazios ou abaixo de R$ 2,00.']);
    if (m.products.inactive) alerts.push(['warning', m.products.inactive + ' produtos inativos', 'Verifique se devem voltar para a vitrine.']);
    if (m.orders.pending) alerts.push(['warning', m.orders.pending + ' pedidos pendentes', 'Acompanhe pagamento e separação.']);
    if (m.orders.problem) alerts.push(['error', m.orders.problem + ' pedidos com falha/cancelamento', 'Revise pagamentos e atendimento.']);
    if (!alerts.length) alerts.push(['success', 'Sem alertas críticos', 'Operação em estado normal.']);
    return '<div class="bars">' + alerts.map((a) => '<div class="sub-card"><span class="badge ' + (a[0] === 'error' ? 'badge-bad' : a[0] === 'success' ? 'badge-paid' : 'badge-pending') + '">' + esc(a[0]) + '</span><strong style="margin-top:9px">' + esc(a[1]) + '</strong><small>' + esc(a[2]) + '</small></div>').join('') + '</div>';
  }

  function alertListV2(m) {
    const p = m.products || {};
    const o = m.orders || {};
    const s = m.service_orders || {};
    const alerts = [];
    if (p.zero_price) alerts.push(['warning', p.zero_price + ' produtos sem preco valido', 'Revise itens vazios ou abaixo de R$ 2,00.']);
    if (p.no_image) alerts.push(['warning', p.no_image + ' produtos sem imagem', 'Priorize itens ativos e mais buscados.']);
    if (p.low_stock) alerts.push(['warning', p.low_stock + ' produtos com estoque baixo', 'Comprar ou inativar antes de vender no balcao.']);
    if (p.duplicated) alerts.push(['warning', p.duplicated + ' grupos duplicados', 'Checar slug/marca/categoria repetidos.']);
    if (o.pending) alerts.push(['warning', o.pending + ' pedidos pendentes', 'Acompanhar pagamento e separacao.']);
    if (s.open) alerts.push(['info', s.open + ' OS abertas', 'Manter status atualizado para atendimento.']);
    if (!alerts.length) alerts.push(['success', 'Sem alertas criticos', 'Operacao em estado normal.']);
    return '<div class="bars">' + alerts.map((a) => '<div class="sub-card"><span class="badge ' + (a[0] === 'error' ? 'badge-bad' : a[0] === 'success' ? 'badge-paid' : a[0] === 'info' ? 'badge-info' : 'badge-pending') + '">' + esc(a[0]) + '</span><strong style="margin-top:9px">' + esc(a[1]) + '</strong><small>' + esc(a[2]) + '</small></div>').join('') + '</div>';
  }

  function renderTopProducts(rows) {
    if (!rows || !rows.length) return '<div class="empty">Ainda nao ha itens suficientes em pedidos.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Marca</th><th>Qtd</th><th>Receita</th></tr></thead><tbody>' +
      rows.map((p) => '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + esc(p.brand || '-') + '</td><td>' + number(p.qty) + '</td><td><strong>' + money(p.revenue) + '</strong></td></tr>').join('') +
      '</tbody></table></div>';
  }

  async function renderProducts() {
    setHead('Produtos', 'Edite nome, marca, categoria, preço, status e aplique reajustes em lote.');
    const el = document.getElementById('tab-products');
    el.innerHTML = '<div class="loading">Carregando produtos...</div>';
    try {
      const params = new URLSearchParams({ limit: PRODUCTS_PER_PAGE, offset: state.productsPage * PRODUCTS_PER_PAGE });
      if (state.productFilters.q) params.set('q', state.productFilters.q);
      if (state.productFilters.brand) params.set('brand', state.productFilters.brand);
      if (state.productFilters.category) params.set('category', state.productFilters.category);
      if (state.productFilters.active) params.set('active', state.productFilters.active);
      if (state.productFilters.alert) params.set('alert', state.productFilters.alert);
      if (state.productFilters.sort) params.set('sort', state.productFilters.sort);
      const [data, m] = await Promise.all([api('/products?' + params.toString()), loadMetrics(), loadCategories()]);
      state.products = data.items || [];
      state.dirtyProducts.clear();
      const totalPages = Math.max(1, Math.ceil((data.total || 0) / PRODUCTS_PER_PAGE));
      el.innerHTML = panel('Catálogo (' + number(data.total || 0) + ')', 'Tabela editável com filtros e ações rápidas',
        productToolbar(m) + productEditor() + productTableV2(state.products) + pagination('products', state.productsPage, totalPages)
      );
      bindProductEvents();
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro ao carregar produtos: ' + esc(e.message) + '</div>';
    }
  }

  function productToolbar(m) {
    return '<div class="toolbar"><div class="toolbar-group">' +
      '<input id="productSearch" type="text" placeholder="Buscar produto, marca ou categoria" value="' + esc(state.productFilters.q) + '">' +
      '<select id="productActive"><option value="">Todos status</option><option value="true"' + selected(state.productFilters.active, 'true') + '>Ativos</option><option value="false"' + selected(state.productFilters.active, 'false') + '>Inativos</option></select>' +
      '<select id="productBrand"><option value="">Todas marcas</option>' + options(m.products.by_brand, state.productFilters.brand) + '</select>' +
      '<select id="productCategory"><option value="">Todas categorias</option>' + categoryOptions(state.productFilters.category, true) + '</select>' +
      '<select id="productAlertStatus"><option value="">Todos alertas</option><option value="ok"' + selected(state.productFilters.alert, 'ok') + '>Sem alerta</option><option value="missing_image"' + selected(state.productFilters.alert, 'missing_image') + '>Sem imagem</option><option value="missing_price"' + selected(state.productFilters.alert, 'missing_price') + '>Sem preco</option><option value="low_stock"' + selected(state.productFilters.alert, 'low_stock') + '>Estoque baixo</option><option value="missing_category"' + selected(state.productFilters.alert, 'missing_category') + '>Sem categoria</option><option value="duplicate"' + selected(state.productFilters.alert, 'duplicate') + '>Duplicados</option></select>' +
      '<select id="productSort"><option value="updated_desc"' + selected(state.productFilters.sort, 'updated_desc') + '>Mais recentes</option><option value="price_asc"' + selected(state.productFilters.sort, 'price_asc') + '>Preco menor</option><option value="price_desc"' + selected(state.productFilters.sort, 'price_desc') + '>Preco maior</option><option value="name_asc"' + selected(state.productFilters.sort, 'name_asc') + '>Nome A-Z</option><option value="name_desc"' + selected(state.productFilters.sort, 'name_desc') + '>Nome Z-A</option></select>' +
      '<button class="btn btn-primary btn-sm" id="applyProductSearch">Buscar</button>' +
      '<button class="btn btn-outline btn-sm" id="clearProductFilters">Limpar</button>' +
      '</div><div class="toolbar-group">' +
      '<button class="btn btn-primary btn-sm" id="newProduct">Adicionar produto</button>' +
      '<button class="btn btn-green btn-sm" id="saveAllProducts">Salvar todas as alteracoes</button>' +
      '<button class="btn btn-outline btn-sm" id="bulkPercent">Reajuste % da página</button>' +
      '<button class="btn btn-outline btn-sm" id="bulkFixed">Preço fixo da página</button>' +
      '</div></div>';
  }

  function emptyProduct() {
    return {
      id: '',
      name: '',
      slug: '',
      brand: '',
      category: 'display-e-lcd',
      price: 0,
      stock: 0,
      active: true,
      image_url: '',
      images: [],
      description_short: '',
      description_full: '',
      featured: false,
      launch: false
    };
  }

  function categoryOptions(current, includeCurrent) {
    const rows = state.categories.length
      ? state.categories.map((row) => [row.slug, row.name || row.slug])
      : [
      ['display-e-lcd', 'Display e LCD'],
      ['baterias-celular', 'Baterias celular'],
      ['pecas-e-componentes', 'Pecas e componentes'],
      ['tampas-e-carcacas', 'Tampas e carcacas'],
      ['touchs-e-visores', 'Touchs e visores'],
      ['maquinas-e-ferramentas', 'Maquinas e ferramentas']
    ];
    const seen = new Set(rows.map((row) => String(row[0])));
    const extra = includeCurrent && current && !seen.has(String(current))
      ? [[current, String(current) + ' (atual)']]
      : [];
    return extra.concat(rows).map((row) => '<option value="' + esc(row[0]) + '"' + selected(current, row[0]) + '>' + esc(row[1]) + '</option>').join('');
  }

  function productEditor() {
    const p = state.editingProduct;
    if (!p) return '';
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []);
    const previewImage = images[0] || '/_assets/tech7/product-placeholder.svg';
    const mode = p.id ? 'Editar produto' : 'Adicionar produto';
    return '<div class="sub-card" style="margin:16px 0 18px">' +
      '<div class="panel-head" style="padding:0 0 14px"><div><h2>' + esc(mode) + '</h2><p>Campos salvos no Supabase e usados pela vitrine, busca, filtros e carrinho.</p></div><button class="btn btn-outline btn-sm" id="cancelProductEdit">Fechar</button></div>' +
      '<form id="productEditorForm" class="grid-2" autocomplete="off">' +
      '<label>Nome<input id="editName" required value="' + esc(p.name) + '"></label>' +
      '<label>Slug<input id="editSlug" required value="' + esc(p.slug) + '"></label>' +
      '<label>Marca<input id="editBrand" required placeholder="apple, samsung, motorola" value="' + esc(p.brand) + '"></label>' +
      '<label>Categoria<select id="editCategory" required>' + categoryOptions(p.category || p.section, true) + '</select></label>' +
      '<label>Preco em reais<input id="editPrice" required type="number" step="0.01" min="0" value="' + Number(p.price || 0).toFixed(2) + '"></label>' +
      '<label>Estoque<input id="editStock" type="number" step="1" min="0" value="' + esc(p.stock == null ? 0 : p.stock) + '"></label>' +
      '<label>Imagem principal<input id="editPrimaryImage" placeholder="/_assets/... ou https://..." value="' + esc(previewImage === '/_assets/tech7/product-placeholder.svg' ? '' : previewImage) + '"></label>' +
      '<label>Status<select id="editActive"><option value="true"' + selected(String(p.active), 'true') + '>Ativo</option><option value="false"' + selected(String(p.active), 'false') + '>Inativo</option></select></label>' +
      '<label style="grid-column:1/-1">Galeria (uma URL por linha)<textarea id="editImages" rows="4">' + esc(images.join('\n')) + '</textarea></label>' +
      '<label style="grid-column:1/-1">Descricao curta<textarea id="editDescriptionShort" rows="3">' + esc(p.description_short || p.description_text || '') + '</textarea></label>' +
      '<label style="grid-column:1/-1">Descricao completa<textarea id="editDescriptionFull" rows="5">' + esc(p.description_full || '') + '</textarea></label>' +
      '<label><input id="editFeatured" type="checkbox"' + (p.featured ? ' checked' : '') + '> Destaque</label>' +
      '<label><input id="editLaunch" type="checkbox"' + (p.launch ? ' checked' : '') + '> Lancamento</label>' +
      '<div class="toolbar-group" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">Salvar produto</button>' +
      (p.id ? '<button class="btn btn-red" type="button" id="deactivateProduct">Excluir definitivamente</button>' : '') +
      '<button class="btn btn-outline" type="button" id="previewProductPage">Preview pagina</button></div>' +
      '</form>' +
      '<div class="grid-2" style="margin-top:16px"><div><h3>Preview card</h3><div class="sub-card"><img id="previewCardImage" src="' + esc(previewImage) + '" alt="" style="width:100%;max-height:190px;object-fit:contain;background:#fff;border-radius:8px"><strong id="previewCardName" style="display:block;margin-top:10px">' + esc(p.name || 'Nome do produto') + '</strong><small id="previewCardMeta">' + esc((p.category || '') + ' / ' + (p.brand || '')) + '</small><div id="previewCardPrice" style="margin-top:8px;color:#ff6a00;font-weight:900">' + money(p.price || 0) + '</div></div></div>' +
      '<div><h3>Preview pagina</h3><div class="sub-card"><strong id="previewPageTitle">' + esc(p.name || 'Nome do produto') + '</strong><p id="previewPageDescription">' + esc(p.description_short || 'Descricao curta do produto') + '</p><small>URL: <span id="previewPageUrl">' + esc(productPreviewUrl(p)) + '</span></small></div></div></div>' +
      '</div>';
  }

  function productPreviewUrl(p) {
    const category = document.getElementById('editCategory')?.value || p.category || p.section || 'display-e-lcd';
    const brand = document.getElementById('editBrand')?.value || p.brand || '';
    const slug = document.getElementById('editSlug')?.value || p.slug || '';
    return '/' + [category, brand, slug].filter(Boolean).join('/');
  }

  function options(rows, current) {
    return (rows || []).map((r) => '<option value="' + esc(r.label) + '"' + selected(current, r.label) + '>' + esc(r.label) + '</option>').join('');
  }

  function selected(current, value) {
    return String(current || '') === String(value || '') ? ' selected' : '';
  }

  function productTable(items) {
    if (!items.length) return '<div class="empty">Nenhum produto encontrado.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Nome</th><th>Marca</th><th>Categoria</th><th>Preço</th><th>Status</th><th>Ações</th></tr></thead><tbody>' +
      items.map((p) => '<tr data-product-row="' + esc(p.id) + '">' +
        '<td class="mono">' + esc((p.id || '').slice(0, 12)) + '</td>' +
        '<td><input class="cell-input name-input" data-edit="name" value="' + esc(p.name) + '"></td>' +
        '<td><input class="cell-input" data-edit="brand" value="' + esc(p.brand || '') + '"></td>' +
        '<td><select class="cell-input category-input" data-edit="category">' + categoryOptions(p.category || p.section, true) + '</select></td>' +
        '<td><input class="cell-input price-input" type="number" step="0.01" min="0" data-edit="price" value="' + Number(p.price || 0).toFixed(2) + '"' + (p.price_status === 'consult' ? ' title="Preço sob consulta ou abaixo de R$ 2,00"' : '') + '></td>' +
        '<td><button class="btn btn-sm ' + (p.active ? 'btn-green' : 'btn-outline') + '" data-toggle-active="' + esc(p.id) + '" data-active="' + p.active + '">' + (p.active ? 'Ativo' : 'Inativo') + '</button></td>' +
        '<td><div class="toolbar-group"><button class="btn btn-primary btn-sm" data-save-product="' + esc(p.id) + '">Salvar</button><button class="btn btn-outline btn-sm" data-edit-product="' + esc(p.id) + '">Editar</button><button class="btn btn-outline btn-sm" data-view-product="' + esc(p.url || '') + '">Ver</button><button class="btn btn-red btn-sm" data-delete-product="' + esc(p.id) + '">Excluir definitivo</button></div></td>' +
      '</tr>').join('') + '</tbody></table></div>';
  }

  function productTableV2(items) {
    if (!items.length) return '<div class="empty">Nenhum produto encontrado.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Nome</th><th>Marca</th><th>Categoria</th><th>Preco</th><th>Alertas</th><th>Status</th><th>Acoes</th></tr></thead><tbody>' +
      items.map((p) => '<tr data-product-row="' + esc(p.id) + '">' +
        '<td class="mono">' + esc((p.id || '').slice(0, 12)) + '</td>' +
        '<td><input class="cell-input name-input" data-edit="name" value="' + esc(p.name) + '"></td>' +
        '<td><input class="cell-input" data-edit="brand" value="' + esc(p.brand || '') + '"></td>' +
        '<td><select class="cell-input category-input" data-edit="category" data-original="' + esc(p.category || '') + '">' + categoryOptions(p.category || p.section, true) + '</select></td>' +
        '<td><input class="cell-input price-input" type="number" step="0.01" min="0" data-edit="price" value="' + Number(p.price || 0).toFixed(2) + '"' + (p.price_status === 'consult' ? ' title="Preco sob consulta ou abaixo de R$ 2,00"' : '') + '></td>' +
        '<td>' + productAlerts(p) + '</td>' +
        '<td><button class="btn btn-sm ' + (p.active ? 'btn-green' : 'btn-outline') + '" data-toggle-active="' + esc(p.id) + '" data-active="' + p.active + '">' + (p.active ? 'Ativo' : 'Inativo') + '</button></td>' +
        '<td><div class="toolbar-group"><button class="btn btn-primary btn-sm" data-save-product="' + esc(p.id) + '">Salvar</button><button class="btn btn-outline btn-sm" data-edit-product="' + esc(p.id) + '">Editar</button><button class="btn btn-outline btn-sm" data-view-product="' + esc(p.url || '') + '">Ver</button><button class="btn btn-red btn-sm" data-delete-product="' + esc(p.id) + '">Excluir definitivo</button></div></td>' +
      '</tr>').join('') + '</tbody></table></div>';
  }

  function productAlerts(p) {
    const alerts = [];
    if (!p.image_url && !(p.images || []).length) alerts.push('sem imagem');
    if (!p.price_available || Number(p.price || 0) < 2) alerts.push('sem preco');
    if (p.stock != null && Number(p.stock) <= 2) alerts.push('estoque baixo');
    if (!p.category) alerts.push('sem categoria');
    return alerts.length ? alerts.map((text) => '<span class="warning-chip">' + esc(text) + '</span>').join('') : '<span class="badge badge-paid">ok</span>';
  }

  function bindProductEvents() {
    const search = document.getElementById('productSearch');
    if (search) search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.productFilters.q = search.value.trim();
        state.productsPage = 0;
        renderProducts();
      }
    });
    document.getElementById('applyProductSearch')?.addEventListener('click', () => {
      state.productFilters.q = search ? search.value.trim() : '';
      state.productsPage = 0;
      renderProducts();
    });
    bindFilter('productActive', 'active');
    bindFilter('productBrand', 'brand');
    bindFilter('productCategory', 'category');
    bindFilter('productAlertStatus', 'alert');
    bindFilter('productSort', 'sort');
    document.getElementById('newProduct')?.addEventListener('click', () => {
      state.editingProduct = emptyProduct();
      renderProducts();
    });
    bindProductEditor();
    document.getElementById('clearProductFilters')?.addEventListener('click', () => {
      state.productFilters = { q: '', active: '', brand: '', category: '', alert: '', sort: 'updated_desc' };
      state.productsPage = 0;
      renderProducts();
    });
    document.querySelectorAll('[data-product-row] [data-edit]').forEach((input) => {
      input.addEventListener('input', () => markProductDirty(input.closest('[data-product-row]')));
      input.addEventListener('change', () => markProductDirty(input.closest('[data-product-row]')));
    });
    document.querySelectorAll('[data-save-product]').forEach((btn) => btn.addEventListener('click', () => saveProductNoReload(btn.dataset.saveProduct)));
    document.querySelectorAll('[data-edit-product]').forEach((btn) => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
    document.querySelectorAll('[data-toggle-active]').forEach((btn) => btn.addEventListener('click', () => toggleProduct(btn.dataset.toggleActive, btn.dataset.active !== 'true')));
    document.querySelectorAll('[data-delete-product]').forEach((btn) => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct)));
    document.querySelectorAll('[data-view-product]').forEach((btn) => btn.addEventListener('click', () => {
      const url = String(btn.dataset.viewProduct || '').trim();
      if (!url) return toast('Produto sem URL de vitrine', 'error');
      window.open(url.startsWith('/') ? url : '/' + url, '_blank');
    }));
    document.getElementById('saveAllProducts')?.addEventListener('click', saveAllProducts);
    document.getElementById('bulkPercent')?.addEventListener('click', () => bulkPrice('percent'));
    document.getElementById('bulkFixed')?.addEventListener('click', () => bulkPrice('fixed'));
    bindPagination('products');
  }

  function markProductDirty(row) {
    if (!row) return;
    const id = row.dataset.productRow;
    if (!id) return;
    state.dirtyProducts.add(id);
    row.classList.add('row-dirty');
    const button = row.querySelector('[data-save-product]');
    if (button) button.textContent = 'Salvar*';
  }

  function bindFilter(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.productFilters[key] = el.value;
      state.productsPage = 0;
      renderProducts();
    });
  }

  function slugify(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function syncProductPreview() {
    const p = collectProductEditor(false);
    if (!p) return;
    const img = p.images[0] || '/_assets/tech7/product-placeholder.svg';
    const cardImg = document.getElementById('previewCardImage');
    if (cardImg) cardImg.src = img;
    const cardName = document.getElementById('previewCardName');
    if (cardName) cardName.textContent = p.name || 'Nome do produto';
    const cardMeta = document.getElementById('previewCardMeta');
    if (cardMeta) cardMeta.textContent = [p.category, p.brand].filter(Boolean).join(' / ');
    const cardPrice = document.getElementById('previewCardPrice');
    if (cardPrice) cardPrice.textContent = money(p.price || 0);
    const pageTitle = document.getElementById('previewPageTitle');
    if (pageTitle) pageTitle.textContent = p.name || 'Nome do produto';
    const pageDescription = document.getElementById('previewPageDescription');
    if (pageDescription) pageDescription.textContent = p.description_short || 'Descricao curta do produto';
    const pageUrl = document.getElementById('previewPageUrl');
    if (pageUrl) pageUrl.textContent = productPreviewUrl(p);
  }

  function bindProductEditor() {
    const form = document.getElementById('productEditorForm');
    if (!form) return;
    const name = document.getElementById('editName');
    const slug = document.getElementById('editSlug');
    name?.addEventListener('input', () => {
      if (!slug.value.trim() || slug.dataset.auto === '1') {
        slug.value = slugify(name.value);
        slug.dataset.auto = '1';
      }
      syncProductPreview();
    });
    slug?.addEventListener('input', () => {
      slug.dataset.auto = '0';
      slug.value = slugify(slug.value);
      syncProductPreview();
    });
    ['editBrand', 'editCategory', 'editPrice', 'editStock', 'editPrimaryImage', 'editImages', 'editDescriptionShort', 'editDescriptionFull', 'editActive', 'editFeatured', 'editLaunch'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', syncProductPreview);
      document.getElementById(id)?.addEventListener('change', syncProductPreview);
    });
    document.getElementById('cancelProductEdit')?.addEventListener('click', () => {
      state.editingProduct = null;
      renderProducts();
    });
    document.getElementById('previewProductPage')?.addEventListener('click', () => {
      const p = collectProductEditor(false);
      if (!p) return;
      window.open(productPreviewUrl(p), '_blank');
    });
    document.getElementById('deactivateProduct')?.addEventListener('click', () => deactivateProduct());
    form.addEventListener('submit', saveEditorProduct);
    syncProductPreview();
  }

  function collectProductEditor(validate) {
    const current = state.editingProduct || emptyProduct();
    const imagesRaw = document.getElementById('editImages')?.value || '';
    const primary = document.getElementById('editPrimaryImage')?.value.trim() || '';
    const images = [primary].concat(imagesRaw.split(/\r?\n|,/)).map((v) => v.trim()).filter(Boolean);
    const deduped = Array.from(new Map(images.map((url) => [url.toLowerCase(), url])).values());
    const payload = {
      id: current.id || '',
      name: document.getElementById('editName')?.value.trim() || '',
      slug: slugify(document.getElementById('editSlug')?.value || ''),
      brand: slugify(document.getElementById('editBrand')?.value || ''),
      category: document.getElementById('editCategory')?.value || '',
      price: Number(document.getElementById('editPrice')?.value || 0),
      stock: Number(document.getElementById('editStock')?.value || 0),
      active: document.getElementById('editActive')?.value === 'true',
      image_url: deduped[0] || '',
      primary_image_url: deduped[0] || '',
      images: deduped,
      description_short: document.getElementById('editDescriptionShort')?.value.trim() || '',
      description_full: document.getElementById('editDescriptionFull')?.value.trim() || '',
      featured: !!document.getElementById('editFeatured')?.checked,
      launch: !!document.getElementById('editLaunch')?.checked
    };
    if (validate) {
      if (!payload.name) throw new Error('Nome obrigatorio');
      if (!payload.slug) throw new Error('Slug obrigatorio');
      if (!payload.brand) throw new Error('Marca obrigatoria');
      if (!payload.category) throw new Error('Categoria obrigatoria');
      if (!Number.isFinite(payload.price) || payload.price < 0) throw new Error('Preco invalido');
      if (!Number.isFinite(payload.stock) || payload.stock < 0) throw new Error('Estoque invalido');
    }
    return payload;
  }

  async function editProduct(id) {
    try {
      state.editingProduct = await api('/products/' + encodeURIComponent(id));
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveEditorProduct(event) {
    event.preventDefault();
    let payload;
    try {
      payload = collectProductEditor(true);
    } catch (e) {
      return toast(e.message, 'error');
    }
    const editingId = state.editingProduct?.id;
    try {
      const saved = await api(editingId ? '/products/' + encodeURIComponent(editingId) : '/products', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      state.editingProduct = saved;
      state.metrics = null;
      toast(editingId ? 'Produto atualizado' : 'Produto criado');
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function deactivateProduct() {
    const id = state.editingProduct?.id;
    if (!id) return;
    if (!confirm('Excluir definitivamente este produto do banco de dados? Esta acao nao pode ser desfeita.')) return;
    try {
      state.editingProduct = await api('/products/' + encodeURIComponent(id), { method: 'DELETE' });
      state.metrics = null;
      toast('Produto excluido do banco');
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveProduct(id, options) {
    const row = document.querySelector('[data-product-row="' + CSS.escape(id) + '"]');
    if (!row) return null;
    const payload = {};
    row.querySelectorAll('[data-edit]').forEach((input) => {
      const key = input.dataset.edit;
      payload[key] = key === 'price' ? Number(input.value) : input.value.trim();
    });
    if (!Number.isFinite(payload.price) || payload.price < 0) return toast('Preço inválido', 'error');
    try {
      await api('/products/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) });
      state.metrics = null;
      toast('Produto salvo');
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveProductNoReload(id, options) {
    const row = document.querySelector('[data-product-row="' + CSS.escape(id) + '"]');
    if (!row) return null;
    const payload = {};
    row.querySelectorAll('[data-edit]').forEach((input) => {
      const key = input.dataset.edit;
      payload[key] = key === 'price' ? Number(input.value) : input.value.trim();
    });
    if (!payload.category) {
      if (!options?.silent) toast('Categoria obrigatoria', 'error');
      return null;
    }
    if (!Number.isFinite(payload.price) || payload.price < 0) {
      if (!options?.silent) toast('Preco invalido', 'error');
      return null;
    }
    const button = row.querySelector('[data-save-product]');
    if (button) button.disabled = true;
    try {
      const saved = await api('/products/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) });
      const index = state.products.findIndex((p) => String(p.id) === String(id));
      if (index >= 0) state.products[index] = { ...state.products[index], ...saved };
      state.metrics = null;
      state.dirtyProducts.delete(id);
      row.classList.remove('row-dirty');
      if (button) button.textContent = 'Salvar';
      if (!options?.silent) toast('Produto salvo sem recarregar');
      return saved;
    } catch (e) {
      if (!options?.silent) toast(e.message, 'error');
      throw e;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function saveAllProducts() {
    const ids = Array.from(state.dirtyProducts);
    if (!ids.length) return toast('Nenhuma alteracao pendente');
    const button = document.getElementById('saveAllProducts');
    if (button) button.disabled = true;
    let saved = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await saveProductNoReload(id, { silent: true });
        saved += 1;
      } catch (_) {
        failed.push((id || '').slice(0, 12));
      }
    }
    if (button) button.disabled = false;
    if (failed.length) return toast(saved + ' salvos; falha em ' + failed.join(', '), 'error');
    toast(saved + ' produto(s) salvos sem recarregar');
  }

  async function deleteProduct(id) {
    if (!id) return;
    if (!confirm('Excluir definitivamente este produto do banco de dados? Esta acao nao pode ser desfeita.')) return;
    try {
      await api('/products/' + encodeURIComponent(id), { method: 'DELETE' });
      state.metrics = null;
      state.products = state.products.filter((p) => String(p.id) !== String(id));
      document.querySelector('[data-product-row="' + CSS.escape(id) + '"]')?.remove();
      state.dirtyProducts.delete(id);
      toast('Produto excluido do banco');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function toggleProduct(id, active) {
    try {
      await api('/products/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ active }) });
      state.metrics = null;
      toast(active ? 'Produto ativado' : 'Produto inativado');
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function bulkPrice(mode) {
    if (!state.products.length) return toast('Nenhum produto na página', 'error');
    const raw = prompt(mode === 'percent' ? 'Percentual de reajuste. Ex: 5 ou -3' : 'Preço fixo para a página. Ex: 99.90');
    if (raw == null) return;
    const value = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(value) || (mode === 'fixed' && value < 0)) return toast('Valor inválido', 'error');
    const updates = state.products.map((p) => ({
      id: p.id,
      price: mode === 'percent'
        ? Math.max(0, +(Number(p.price || 0) * (1 + value / 100)).toFixed(2))
        : +value.toFixed(2)
    }));
    if (!confirm('Aplicar em ' + updates.length + ' produtos desta página?')) return;
    try {
      await api('/prices/bulk', { method: 'POST', body: JSON.stringify({ updates }) });
      state.metrics = null;
      toast('Preços atualizados em lote');
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function renderOrders() {
    setHead('Pedidos', 'Acompanhe status, pagamento, totais e detalhes dos pedidos.');
    const el = document.getElementById('tab-orders');
    if (state.selectedOrderId) return renderOrderDetail(state.selectedOrderId);
    el.innerHTML = '<div class="loading">Carregando pedidos...</div>';
    try {
      const params = new URLSearchParams({ limit: ORDERS_PER_PAGE, offset: state.ordersPage * ORDERS_PER_PAGE });
      if (state.orderStatus) params.set('status', state.orderStatus);
      const [data, m] = await Promise.all([api('/orders?' + params.toString()), loadMetrics()]);
      state.orders = data.items || [];
      const totalPages = Math.max(1, Math.ceil((data.total || 0) / ORDERS_PER_PAGE));
      const summary = '<div class="grid-4">' +
        metric('Pedidos totais', number(m.orders.total), money(m.orders.revenue), icon('cart')) +
        metric('Pendentes', number(m.orders.pending), 'Aguardando ação', icon('alert')) +
        metric('Pagos', number(m.orders.paid), percent(ratio(m.orders.paid, m.orders.total)), icon('trend')) +
        metric('Últimos 7 dias', number(m.orders.last_7_days), money(m.orders.last_7_days_revenue), icon('money')) +
        '</div>';
      el.innerHTML = summary + panel('Lista de pedidos', 'Filtre por status e abra os detalhes',
        orderToolbar() + orderTable(state.orders) + pagination('orders', state.ordersPage, totalPages)
      );
      bindOrderEvents();
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro ao carregar pedidos: ' + esc(e.message) + '</div>';
    }
  }

  function orderToolbar() {
    return '<div class="toolbar"><div class="toolbar-group"><select id="orderStatus"><option value="">Todos status</option>' +
      ['pending', 'paid', 'cancelled', 'failed', 'refunded'].map((s) => '<option value="' + s + '"' + selected(state.orderStatus, s) + '>' + statusLabel(s) + '</option>').join('') +
      '</select></div></div>';
  }

  function orderTable(items) {
    if (!items.length) return '<div class="empty">Nenhum pedido encontrado.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Cliente</th><th>Email</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Data</th><th>Ações</th></tr></thead><tbody>' +
      items.map((o) => '<tr><td class="mono">' + esc((o.id || '').slice(0, 12)) + '</td><td>' + esc(o.customer_name || '-') + '</td><td>' + esc(o.customer_email || '-') + '</td><td><strong>' + money(o.total) + '</strong></td><td>' + badge(o.status) + '</td><td>' + esc(o.payment_provider || '-') + '</td><td>' + dateStr(o.created_at) + '</td><td><button class="btn btn-primary btn-sm" data-view-order="' + esc(o.id) + '">Detalhes</button></td></tr>').join('') +
      '</tbody></table></div>';
  }

  function orderTableWithShipping(items) {
    if (!items.length) return '<div class="empty">Nenhum pedido encontrado.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Cliente</th><th>Email</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Entrega</th><th>Tracking</th><th>Data</th><th>Acoes</th></tr></thead><tbody>' +
      items.map((o) => '<tr><td class="mono">' + esc((o.id || '').slice(0, 12)) + '</td><td>' + esc(o.customer_name || '-') + '</td><td>' + esc(o.customer_email || '-') + '</td><td><strong>' + money(o.total) + '</strong></td><td>' + badge(o.status) + '</td><td>' + esc(o.payment_provider || '-') + '</td><td>' + esc(o.shipping_status || o.shipping_service_label || o.shipping_provider || '-') + '</td><td class="mono">' + esc(o.tracking_code || '-') + '</td><td>' + dateStr(o.created_at) + '</td><td><div class="toolbar-group"><button class="btn btn-primary btn-sm" data-view-order="' + esc(o.id) + '">Detalhes</button><button class="btn btn-red btn-sm" data-delete-order="' + esc(o.id) + '">Excluir</button></div></td></tr>').join('') +
      '</tbody></table></div>';
  }

  orderTable = orderTableWithShipping;

  function bindOrderEvents() {
    document.getElementById('orderStatus')?.addEventListener('change', (e) => {
      state.orderStatus = e.target.value;
      state.ordersPage = 0;
      renderOrders();
    });
    document.querySelectorAll('[data-view-order]').forEach((btn) => btn.addEventListener('click', () => {
      state.selectedOrderId = btn.dataset.viewOrder;
      renderOrders();
    }));
    document.querySelectorAll('[data-delete-order]').forEach((btn) => btn.addEventListener('click', () => deleteOrder(btn.dataset.deleteOrder)));
    bindPagination('orders');
  }

  async function deleteOrder(id) {
    if (!id) return;
    if (!confirm('Cancelar este pedido? O historico sera preservado.')) return;
    try {
      await api('/orders/' + encodeURIComponent(id), { method: 'DELETE' });
      state.metrics = null;
      state.orders = state.orders.filter((order) => String(order.id) !== String(id));
      toast('Pedido cancelado');
      renderOrders();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function renderOrderDetail(id) {
    const el = document.getElementById('tab-orders');
    el.innerHTML = '<div class="loading">Carregando pedido...</div>';
    try {
      const o = await api('/orders/' + encodeURIComponent(id));
      const detail = '<div class="toolbar"><div class="toolbar-group"><button class="btn btn-outline btn-sm" id="backOrders">Voltar</button><button class="btn btn-primary btn-sm" id="createOsFromOrder">Criar OS deste pedido</button></div></div>' +
        '<div style="height:12px"></div>' +
        panel('Pedido ' + o.id, 'Dados e atualização de status',
          '<div class="order-detail">' +
            field('Cliente', o.customer_name) + field('Email', o.customer_email) + field('Telefone', o.customer_phone) + field('Documento', o.customer_document) +
            field('Subtotal', money(o.subtotal)) + field('Frete', money(o.shipping_total)) + field('Total', money(o.total)) + field('Status', statusLabel(o.status)) +
            field('Pagamento', o.payment_provider || '-') + field('Criado em', dateStr(o.created_at)) +
          '</div><div class="toolbar" style="margin-top:14px"><div class="toolbar-group"><select id="detailStatus">' +
          ['pending', 'paid', 'cancelled', 'failed', 'refunded'].map((s) => '<option value="' + s + '"' + selected(o.status, s) + '>' + statusLabel(s) + '</option>').join('') +
          '</select><button class="btn btn-primary btn-sm" id="saveOrderStatus">Salvar status</button></div></div>'
        ) +
        panel('Itens do pedido', '', orderItems(o.items || []));
      el.innerHTML = detail;
      document.getElementById('backOrders').addEventListener('click', () => {
        state.selectedOrderId = null;
        renderOrders();
      });
      document.getElementById('createOsFromOrder')?.addEventListener('click', () => createServiceOrderFromOrder(id));
      document.getElementById('saveOrderStatus').addEventListener('click', async () => {
        const status = document.getElementById('detailStatus').value;
        try {
          await api('/orders/' + encodeURIComponent(id) + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
          state.metrics = null;
          toast('Status atualizado');
          renderOrderDetail(id);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro ao carregar pedido: ' + esc(e.message) + '</div>';
    }
  }

  async function renderOrderDetailWithShipping(id) {
    const el = document.getElementById('tab-orders');
    el.innerHTML = '<div class="loading">Carregando pedido...</div>';
    try {
      const o = await api('/orders/' + encodeURIComponent(id));
      const shipment = o.shipment || {};
      const trackingUrl = shipment.tracking_code ? 'https://www.loggi.com/rastreador/' + encodeURIComponent(shipment.tracking_code) : '';
      const link = (href, text) => href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(text) + '</a>' : '-';
      const detail = '<div class="toolbar"><div class="toolbar-group"><button class="btn btn-outline btn-sm" id="backOrders">Voltar</button><button class="btn btn-primary btn-sm" id="createOsFromOrder">Criar OS deste pedido</button></div></div>' +
        '<div style="height:12px"></div>' +
        panel('Pedido ' + o.id, 'Dados e atualizacao de status',
          '<div class="order-detail">' +
            field('Cliente', o.customer_name) + field('Email', o.customer_email) + field('Telefone', o.customer_phone) + field('Documento', o.customer_document) +
            field('Subtotal', money(o.subtotal)) + field('Frete', money(o.shipping_total)) + field('Total', money(o.total)) + field('Status', statusLabel(o.status)) +
            field('Pagamento', o.payment_provider || '-') + field('Criado em', dateStr(o.created_at)) +
          '</div><div class="toolbar" style="margin-top:14px"><div class="toolbar-group"><select id="detailStatus">' +
          ['pending', 'paid', 'cancelled', 'failed', 'refunded'].map((s) => '<option value="' + s + '"' + selected(o.status, s) + '>' + statusLabel(s) + '</option>').join('') +
          '</select><button class="btn btn-primary btn-sm" id="saveOrderStatus">Salvar status</button></div></div>'
        ) +
        panel('Entrega', 'Frete calculado e rastreio quando existir',
          '<div class="order-detail">' +
            field('Entrega', o.shipping_service_label || o.shipping_provider || '-') +
            field('Status envio', shipment.status || '-') +
            field('Tracking', shipment.tracking_code || '-') +
            field('Chave envio', shipment.loggi_key || '-') +
            field('Etiqueta', link(shipment.label_url, 'Abrir etiqueta')) +
            field('Rastreio', link(trackingUrl, 'Abrir rastreio')) +
          '</div>'
        ) +
        panel('Itens do pedido', '', orderItems(o.items || []));
      el.innerHTML = detail;
      document.getElementById('backOrders').addEventListener('click', () => {
        state.selectedOrderId = null;
        renderOrders();
      });
      document.getElementById('createOsFromOrder')?.addEventListener('click', () => createServiceOrderFromOrder(id));
      document.getElementById('saveOrderStatus').addEventListener('click', async () => {
        const status = document.getElementById('detailStatus').value;
        try {
          await api('/orders/' + encodeURIComponent(id) + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
          state.metrics = null;
          toast('Status atualizado');
          renderOrderDetail(id);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro ao carregar pedido: ' + esc(e.message) + '</div>';
    }
  }

  renderOrderDetail = renderOrderDetailWithShipping;

  function field(label, value) {
    return '<div class="field"><label>' + esc(label) + '</label><span>' + esc(value || '-') + '</span></div>';
  }

  function fieldWithSafeLinks(label, value) {
    const raw = String(value || '-');
    const html = /<a\s/i.test(raw) ? raw : esc(raw);
    return '<div class="field"><label>' + esc(label) + '</label><span>' + html + '</span></div>';
  }

  field = fieldWithSafeLinks;

  function orderItems(items) {
    if (!items.length) return '<div class="empty">Pedido sem itens registrados.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Qtd</th><th>Preço unit.</th><th>Total</th></tr></thead><tbody>' +
      items.map((it) => '<tr><td><strong>' + esc(it.product_name) + '</strong></td><td>' + number(it.quantity) + '</td><td>' + money(it.unit_price) + '</td><td><strong>' + money(it.total_price) + '</strong></td></tr>').join('') +
      '</tbody></table></div>';
  }

  function emptyServiceOrder() {
    return { id: '', status: 'aberta', customer_name: '', customer_phone: '', customer_document: '', customer_address: '', customer_email: '', device_brand: '', device_model: '', device_color: '', device_serial: '', device_password: '', intake_condition: '', reported_issue: '', diagnosis: '', services_done: '', labor: 0, technician: '', internal_notes: '', customer_notes: '', discount: 0, payment_method: '', payment_status: 'pendente', warranty_days: 90, warranty_terms: 'Garantia sobre o servico executado, sem cobrir mau uso, queda, liquido ou violacao.', warranty_notes: '', items: [] };
  }

  async function renderServiceOrders() {
    setHead('Ordens de servico', 'Atendimento tecnico, pecas usadas, mao de obra, garantia e PDF para cliente.');
    const el = document.getElementById('tab-service-orders');
    if (state.selectedServiceOrderId) return renderServiceOrderDetail(state.selectedServiceOrderId);
    el.innerHTML = '<div class="loading">Carregando ordens de servico...</div>';
    try {
      const params = new URLSearchParams({ limit: SERVICE_ORDERS_PER_PAGE, offset: state.serviceOrdersPage * SERVICE_ORDERS_PER_PAGE });
      if (state.serviceOrderStatus) params.set('status', state.serviceOrderStatus);
      if (state.serviceOrderSearch) params.set('q', state.serviceOrderSearch);
      const [data, m] = await Promise.all([api('/service-orders?' + params.toString()), loadMetrics()]);
      state.serviceOrders = data.items || [];
      const s = m.service_orders || {};
      const totalPages = Math.max(1, Math.ceil((data.total || 0) / SERVICE_ORDERS_PER_PAGE));
      const summary = '<div class="grid-4">' +
        metric('OS abertas', number(s.open || 0), number(s.ready || 0) + ' prontas', icon('file')) +
        metric('Concluidas', number(s.completed || 0), number(s.delivered || 0) + ' entregues', icon('wrench')) +
        metric('Receita mao de obra', money(s.labor_revenue || 0), 'Servicos prontos/entregues', icon('money')) +
        metric('Receita pecas em OS', money(s.product_revenue || 0), 'Produtos usados em OS', icon('box')) +
        '</div>';
      el.innerHTML = summary + panel('Fila de OS', 'Use para atendimento rapido no balcao', serviceOrderToolbar() + serviceOrderTable(state.serviceOrders) + pagination('serviceOrders', state.serviceOrdersPage, totalPages));
      bindServiceOrderEvents();
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro ao carregar OS: ' + esc(e.message) + '</div>';
    }
  }

  function serviceOrderToolbar() {
    return '<div class="toolbar"><div class="toolbar-group">' +
      '<input id="serviceOrderSearch" type="text" placeholder="Buscar cliente, telefone, aparelho ou defeito" value="' + esc(state.serviceOrderSearch) + '">' +
      '<select id="serviceOrderStatus"><option value="">Todos status</option><option value="open"' + selected(state.serviceOrderStatus, 'open') + '>OS abertas</option><option value="completed"' + selected(state.serviceOrderStatus, 'completed') + '>Concluidas</option>' + OS_STATUSES.map((s) => '<option value="' + s[0] + '"' + selected(state.serviceOrderStatus, s[0]) + '>' + esc(s[1]) + '</option>').join('') + '</select>' +
      '<button class="btn btn-primary btn-sm" id="applyServiceOrderSearch">Buscar</button><button class="btn btn-outline btn-sm" id="clearServiceOrderSearch">Limpar</button>' +
      '</div><div class="toolbar-group"><button class="btn btn-primary btn-sm" id="newServiceOrder">Criar OS manual</button></div></div>';
  }

  function serviceOrderTable(items) {
    if (!items.length) return '<div class="empty">Nenhuma OS encontrada.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Telefone</th><th>Aparelho</th><th>Status</th><th>Total</th><th>Atualizada</th><th>Acoes</th></tr></thead><tbody>' +
      items.map((o) => '<tr><td class="mono">' + esc(o.code || o.id) + '</td><td><strong>' + esc(o.customer_name || '-') + '</strong></td><td>' + esc(o.customer_phone || '-') + '</td><td>' + esc([o.device_brand, o.device_model].filter(Boolean).join(' ') || '-') + '</td><td>' + serviceBadge(o.status) + '</td><td><strong>' + money(o.total) + '</strong></td><td>' + dateStr(o.updated_at || o.created_at) + '</td><td><div class="toolbar-group"><button class="btn btn-primary btn-sm" data-view-service-order="' + esc(o.id) + '">Abrir</button><button class="btn btn-outline btn-sm" data-pdf-service-order="' + esc(o.id) + '">PDF</button><button class="btn btn-red btn-sm" data-delete-service-order="' + esc(o.id) + '">Excluir</button></div></td></tr>').join('') +
      '</tbody></table></div>';
  }

  function bindServiceOrderEvents() {
    const search = document.getElementById('serviceOrderSearch');
    search?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.serviceOrderSearch = search.value.trim(); state.serviceOrdersPage = 0; renderServiceOrders(); } });
    document.getElementById('applyServiceOrderSearch')?.addEventListener('click', () => { state.serviceOrderSearch = search ? search.value.trim() : ''; state.serviceOrdersPage = 0; renderServiceOrders(); });
    document.getElementById('clearServiceOrderSearch')?.addEventListener('click', () => { state.serviceOrderSearch = ''; state.serviceOrderStatus = ''; state.serviceOrdersPage = 0; renderServiceOrders(); });
    document.getElementById('serviceOrderStatus')?.addEventListener('change', (e) => { state.serviceOrderStatus = e.target.value; state.serviceOrdersPage = 0; renderServiceOrders(); });
    document.getElementById('newServiceOrder')?.addEventListener('click', () => { state.editingServiceOrder = emptyServiceOrder(); state.selectedServiceOrderId = 'new'; renderServiceOrders(); });
    document.querySelectorAll('[data-view-service-order]').forEach((btn) => btn.addEventListener('click', () => { state.selectedServiceOrderId = btn.dataset.viewServiceOrder; renderServiceOrders(); }));
    document.querySelectorAll('[data-pdf-service-order]').forEach((btn) => btn.addEventListener('click', () => downloadServiceOrderPdf(btn.dataset.pdfServiceOrder)));
    document.querySelectorAll('[data-delete-service-order]').forEach((btn) => btn.addEventListener('click', () => deleteServiceOrder(btn.dataset.deleteServiceOrder)));
    bindPagination('serviceOrders');
  }

  async function deleteServiceOrder(id) {
    if (!id) return;
    if (!confirm('Cancelar esta OS? O historico e itens serao preservados.')) return;
    try {
      await api('/service-orders/' + encodeURIComponent(id), { method: 'DELETE' });
      state.metrics = null;
      state.serviceOrders = state.serviceOrders.filter((order) => String(order.id) !== String(id));
      toast('OS cancelada');
      renderServiceOrders();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function renderServiceOrderDetail(id) {
    const el = document.getElementById('tab-service-orders');
    el.innerHTML = '<div class="loading">Carregando OS...</div>';
    try {
      const o = id === 'new' ? (state.editingServiceOrder || emptyServiceOrder()) : await api('/service-orders/' + encodeURIComponent(id));
      state.editingServiceOrder = o;
      const actions = '<div class="toolbar"><div class="toolbar-group"><button class="btn btn-outline btn-sm" id="backServiceOrders">Voltar</button>' + (o.id ? '<button class="btn btn-outline btn-sm" id="downloadServiceOrderPdf">Baixar PDF</button><button class="btn btn-outline btn-sm" id="printServiceOrderPdf">Imprimir</button><button class="btn btn-green btn-sm" id="whatsappServiceOrder">WhatsApp</button>' : '') + '</div></div>';
      el.innerHTML = actions + serviceOrderForm(o);
      bindServiceOrderForm(o);
    } catch (e) {
      el.innerHTML = '<div class="error-state">Erro ao carregar OS: ' + esc(e.message) + '</div>';
    }
  }

  function serviceOrderForm(o) {
    return panel(o.id ? 'Editar ' + (o.code || 'OS') : 'Criar OS manual', 'Dados salvos no Supabase e usados no PDF do cliente',
      '<form id="serviceOrderForm" class="os-form" autocomplete="off">' +
      '<label>Status<select id="osStatus">' + OS_STATUSES.map((s) => '<option value="' + s[0] + '"' + selected(o.status, s[0]) + '>' + esc(s[1]) + '</option>').join('') + '</select></label>' +
      '<label>Pedido origem<input id="osOrderId" value="' + esc(o.order_id || '') + '" placeholder="opcional"></label>' +
      '<label>Cliente<input id="osCustomerName" required value="' + esc(o.customer_name || '') + '"></label><label>Telefone/WhatsApp<input id="osCustomerPhone" value="' + esc(o.customer_phone || '') + '"></label>' +
      '<label>CPF/CNPJ opcional<input id="osCustomerDocument" value="' + esc(o.customer_document || '') + '"></label><label>E-mail opcional<input id="osCustomerEmail" value="' + esc(o.customer_email || '') + '"></label>' +
      '<label class="full">Endereco opcional<input id="osCustomerAddress" value="' + esc(o.customer_address || '') + '"></label>' +
      '<label>Marca<input id="osDeviceBrand" value="' + esc(o.device_brand || '') + '"></label><label>Modelo<input id="osDeviceModel" value="' + esc(o.device_model || '') + '"></label>' +
      '<label>Cor<input id="osDeviceColor" value="' + esc(o.device_color || '') + '"></label><label>IMEI/serial opcional<input id="osDeviceSerial" value="' + esc(o.device_serial || '') + '"></label>' +
      '<label class="full">Senha/padrao informado opcional<input id="osDevicePassword" value="' + esc(o.device_password || '') + '"></label>' +
      '<label class="full">Estado de entrada<textarea id="osIntakeCondition">' + esc(o.intake_condition || '') + '</textarea></label>' +
      '<label class="full">Defeito relatado<textarea id="osReportedIssue">' + esc(o.reported_issue || '') + '</textarea></label>' +
      '<label class="full">Diagnostico<textarea id="osDiagnosis">' + esc(o.diagnosis || '') + '</textarea></label>' +
      '<label class="full">Servicos feitos<textarea id="osServicesDone">' + esc(o.services_done || '') + '</textarea></label>' +
      '<label>Mao de obra (R$)<input id="osLabor" type="number" min="0" step="0.01" value="' + Number(o.labor || 0).toFixed(2) + '"></label><label>Tecnico responsavel<input id="osTechnician" value="' + esc(o.technician || '') + '"></label>' +
      '<label>Desconto (R$)<input id="osDiscount" type="number" min="0" step="0.01" value="' + Number(o.discount || 0).toFixed(2) + '"></label><label>Forma de pagamento<input id="osPaymentMethod" value="' + esc(o.payment_method || '') + '"></label>' +
      '<label>Status pagamento<input id="osPaymentStatus" value="' + esc(o.payment_status || 'pendente') + '"></label><label>Garantia (dias)<input id="osWarrantyDays" type="number" min="0" step="1" value="' + Number(o.warranty_days || 90) + '"></label>' +
      '<div class="full os-product-picker">' +
        '<label>Buscar produto do site<input id="osProductSearch" type="search" placeholder="Digite nome, marca ou codigo do produto"></label>' +
        '<div class="toolbar-group"><button class="btn btn-primary btn-sm" type="button" id="searchOsProduct">Buscar produto</button><button class="btn btn-outline btn-sm" type="button" id="addManualOsItem">Adicionar item manual</button></div>' +
        '<div id="osProductResults" class="os-product-results"></div>' +
      '</div>' +
      '<div class="full"><div class="table-wrap"><table id="osItemsTable"><thead><tr><th>Produto/peca</th><th>Qtd</th><th>Valor unit.</th><th>Total</th><th></th></tr></thead><tbody>' + serviceItemsRows(o.items || []) + '</tbody></table></div></div>' +
      '<label class="full">Condicoes de garantia<textarea id="osWarrantyTerms">' + esc(o.warranty_terms || '') + '</textarea></label>' +
      '<label class="full">Observacoes para cliente<textarea id="osCustomerNotes">' + esc(o.customer_notes || '') + '</textarea></label>' +
      '<label class="full">Observacoes internas<textarea id="osInternalNotes">' + esc(o.internal_notes || '') + '</textarea></label>' +
      '<div class="os-actions full"><button class="btn btn-primary" type="submit">Salvar OS</button><span class="badge badge-info" id="osLiveTotal">Total atual: ' + money(o.total || 0) + '</span></div></form>'
    );
  }

  function serviceItemsRows(items) {
    return (items || []).map((it) => serviceItemRow({
      product_id: it.product_id || '',
      product_name: it.product_name || it.name || 'Peca/Produto',
      quantity: it.quantity || it.qty || 1,
      unit_price: it.unit_price || it.price || 0
    })).join('');
  }

  function serviceItemRow(item) {
    const qty = Math.max(1, Number(item.quantity || item.qty || 1));
    const unit = Math.max(0, Number(item.unit_price || item.price || 0));
    const total = qty * unit;
    return '<tr data-os-item data-product-id="' + esc(item.product_id || '') + '">' +
      '<td><input class="cell-input os-item-name" value="' + esc(item.product_name || item.name || 'Peca/Produto') + '"' + (item.product_id ? ' readonly' : '') + '></td>' +
      '<td><input class="cell-input os-item-qty" type="number" min="1" step="1" value="' + qty + '"></td>' +
      '<td><input class="cell-input os-item-price" type="number" min="0" step="0.01" value="' + unit.toFixed(2) + '"' + (item.product_id ? ' readonly title="Preco puxado do catalogo no servidor"' : '') + '></td>' +
      '<td><strong class="os-item-total">' + money(total) + '</strong></td>' +
      '<td><button class="btn btn-outline btn-sm" type="button" data-remove-os-item>Remover</button></td>' +
      '</tr>';
  }

  function addServiceOrderItem(item) {
    const tbody = document.querySelector('#osItemsTable tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', serviceItemRow(item));
    bindServiceItemRows();
    updateServiceOrderLiveTotal();
  }

  function readServiceItems() {
    return Array.from(document.querySelectorAll('[data-os-item]')).map((row) => ({
      product_id: row.dataset.productId || '',
      product_name: row.querySelector('.os-item-name')?.value.trim() || 'Peca/Produto',
      quantity: Number(row.querySelector('.os-item-qty')?.value || 1),
      unit_price: Number(row.querySelector('.os-item-price')?.value || 0)
    })).filter((item) => item.product_name);
  }

  function updateServiceOrderLiveTotal() {
    document.querySelectorAll('[data-os-item]').forEach((row) => {
      const qty = Math.max(1, Number(row.querySelector('.os-item-qty')?.value || 1));
      const unit = Math.max(0, Number(row.querySelector('.os-item-price')?.value || 0));
      const target = row.querySelector('.os-item-total');
      if (target) target.textContent = money(qty * unit);
    });
    const productTotal = readServiceItems().reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)) * Math.max(0, Number(item.unit_price || 0)), 0);
    const labor = Number(document.getElementById('osLabor')?.value || 0);
    const discount = Number(document.getElementById('osDiscount')?.value || 0);
    const total = Math.max(0, productTotal + labor - discount);
    const badge = document.getElementById('osLiveTotal');
    if (badge) badge.textContent = 'Total atual: ' + money(total);
  }

  function bindServiceItemRows() {
    document.querySelectorAll('[data-remove-os-item]').forEach((btn) => {
      btn.onclick = () => { btn.closest('[data-os-item]')?.remove(); updateServiceOrderLiveTotal(); };
    });
    document.querySelectorAll('.os-item-qty, .os-item-price, #osLabor, #osDiscount').forEach((input) => {
      input.oninput = updateServiceOrderLiveTotal;
    });
  }

  async function searchServiceOrderProducts() {
    const input = document.getElementById('osProductSearch');
    const results = document.getElementById('osProductResults');
    const q = input ? input.value.trim() : '';
    if (!results) return;
    if (q.length < 2) {
      results.innerHTML = '<div class="empty">Digite pelo menos 2 caracteres.</div>';
      return;
    }
    results.innerHTML = '<div class="loading">Buscando produtos...</div>';
    try {
      const params = new URLSearchParams({ q, limit: 8, offset: 0, active: 'true' });
      const data = await api('/products?' + params.toString());
      const items = data.items || [];
      results.innerHTML = items.length
        ? '<div class="bars">' + items.map((p) => '<div class="sub-card os-product-result"><strong>' + esc(p.name) + '</strong><small>' + esc([p.brand, p.category].filter(Boolean).join(' / ')) + '</small><span>' + money(p.price || 0) + '</span><button class="btn btn-primary btn-sm" type="button" data-add-os-product="' + esc(p.id) + '">Adicionar</button></div>').join('') + '</div>'
        : '<div class="empty">Nenhum produto encontrado.</div>';
      items.forEach((p) => {
        results.querySelector('[data-add-os-product="' + CSS.escape(String(p.id)) + '"]')?.addEventListener('click', () => {
          addServiceOrderItem({ product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price || 0) });
          results.innerHTML = '';
          if (input) input.value = '';
          toast('Produto adicionado na OS');
        });
      });
    } catch (e) {
      results.innerHTML = '<div class="error-state">Erro ao buscar produto: ' + esc(e.message) + '</div>';
    }
  }

  function collectServiceOrder() {
    return {
      order_id: document.getElementById('osOrderId')?.value.trim() || '', status: document.getElementById('osStatus')?.value || 'aberta',
      customer_name: document.getElementById('osCustomerName')?.value.trim() || '', customer_phone: document.getElementById('osCustomerPhone')?.value.trim() || '',
      customer_document: document.getElementById('osCustomerDocument')?.value.trim() || '', customer_address: document.getElementById('osCustomerAddress')?.value.trim() || '', customer_email: document.getElementById('osCustomerEmail')?.value.trim() || '',
      device_brand: document.getElementById('osDeviceBrand')?.value.trim() || '', device_model: document.getElementById('osDeviceModel')?.value.trim() || '', device_color: document.getElementById('osDeviceColor')?.value.trim() || '', device_serial: document.getElementById('osDeviceSerial')?.value.trim() || '', device_password: document.getElementById('osDevicePassword')?.value.trim() || '',
      intake_condition: document.getElementById('osIntakeCondition')?.value.trim() || '', reported_issue: document.getElementById('osReportedIssue')?.value.trim() || '', diagnosis: document.getElementById('osDiagnosis')?.value.trim() || '', services_done: document.getElementById('osServicesDone')?.value.trim() || '',
      labor: Number(document.getElementById('osLabor')?.value || 0), technician: document.getElementById('osTechnician')?.value.trim() || '', internal_notes: document.getElementById('osInternalNotes')?.value.trim() || '', customer_notes: document.getElementById('osCustomerNotes')?.value.trim() || '',
      discount: Number(document.getElementById('osDiscount')?.value || 0), payment_method: document.getElementById('osPaymentMethod')?.value.trim() || '', payment_status: document.getElementById('osPaymentStatus')?.value.trim() || 'pendente', warranty_days: Number(document.getElementById('osWarrantyDays')?.value || 90), warranty_terms: document.getElementById('osWarrantyTerms')?.value.trim() || '',
      items: readServiceItems()
    };
  }

  function bindServiceOrderForm(o) {
    document.getElementById('backServiceOrders')?.addEventListener('click', () => { state.selectedServiceOrderId = null; state.editingServiceOrder = null; renderServiceOrders(); });
    document.getElementById('downloadServiceOrderPdf')?.addEventListener('click', () => downloadServiceOrderPdf(o.id));
    document.getElementById('printServiceOrderPdf')?.addEventListener('click', () => printServiceOrderPdf(o.id));
    document.getElementById('whatsappServiceOrder')?.addEventListener('click', () => whatsappServiceOrder(o));
    bindServiceItemRows();
    updateServiceOrderLiveTotal();
    document.getElementById('searchOsProduct')?.addEventListener('click', searchServiceOrderProducts);
    document.getElementById('osProductSearch')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchServiceOrderProducts();
      }
    });
    document.getElementById('addManualOsItem')?.addEventListener('click', () => addServiceOrderItem({ product_name: 'Peca/Produto', quantity: 1, unit_price: 0 }));
    document.getElementById('serviceOrderForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = collectServiceOrder();
      if (!payload.customer_name) return toast('Nome do cliente obrigatorio', 'error');
      try {
        const saved = await api(o.id ? '/service-orders/' + encodeURIComponent(o.id) : '/service-orders', { method: o.id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        state.metrics = null; state.selectedServiceOrderId = saved.id; state.editingServiceOrder = saved;
        toast('OS salva'); renderServiceOrderDetail(saved.id);
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function createServiceOrderFromOrder(orderId) {
    try {
      const saved = await api('/service-orders/from-order/' + encodeURIComponent(orderId), { method: 'POST' });
      state.metrics = null; state.selectedOrderId = null; state.selectedServiceOrderId = saved.id;
      switchTab('service-orders'); toast('OS criada a partir do pedido');
    } catch (e) { toast(e.message, 'error'); }
  }

  function serviceOrderPdfUrl(id) { return API + '/service-orders/' + encodeURIComponent(id) + '/pdf'; }
  function downloadServiceOrderPdf(id) { if (!id) return; const a = document.createElement('a'); a.href = serviceOrderPdfUrl(id); a.download = 'tech7-os-' + id + '.pdf'; a.click(); }
  function printServiceOrderPdf(id) { if (id) window.open(serviceOrderPdfUrl(id), '_blank', 'noopener'); }
  function whatsappServiceOrder(o) {
    const phone = String(o.customer_phone || '').replace(/\D/g, '');
    const msg = 'Ola ' + (o.customer_name || '') + ', sua ' + (o.code || 'OS') + ' da Tech 7 esta em status: ' + serviceStatusLabel(o.status) + '. Total: ' + money(o.total || 0) + '.';
    window.open('https://wa.me/' + (phone ? '55' + phone.replace(/^55/, '') : '') + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  function renderPricing() {
    setHead('Motor de preços', 'Simule custo, taxa, margem e aplique reajustes no catálogo.');
    const r = pricingResult();
    const controls = '<div class="bars">' +
      range('cost', 'Custo base médio', 0, 500, 1, money(state.pricing.cost)) +
      range('freight', 'Frete/embalagem estimado', 0, 100, 1, money(state.pricing.freight)) +
      range('tax', 'Taxas e impostos', 0, 40, 1, state.pricing.tax + '%') +
      range('margin', 'Margem alvo', 0, 90, 1, state.pricing.margin + '%') +
      range('adjustment', 'Reajuste em lote', -50, 100, 1, state.pricing.adjustment + '%') +
      '</div>';
    const output = '<div class="bars">' +
      result('Custo total estimado', money(r.totalCost)) +
      result('Preço sugerido', money(r.price), true) +
      result('Lucro bruto estimado', money(r.profit)) +
      result('Margem calculada', r.margin.toFixed(1) + '%') +
      '<button class="btn btn-primary" id="applyPricingVisible">Aplicar reajuste nos produtos carregados</button>' +
      '<button class="btn btn-outline" id="resetPricing">Resetar simulador</button>' +
      '</div>';
    document.getElementById('tab-pricing').innerHTML =
      '<div class="grid-2"><div>' + panel('Entradas de preço', 'Controles em tempo real', controls) + '</div><div>' + panel('Resultado', 'Cálculo imediato', output) + '</div></div>' +
      panel('Cenários', 'Comparação simples de margens', scenarioList(r.totalCost));
    bindPricingEvents();
  }

  function pricingResult() {
    const p = state.pricing;
    const totalCost = Number(p.cost) + Number(p.freight) + (Number(p.cost) * Number(p.tax) / 100);
    const price = totalCost * (1 + Number(p.margin) / 100);
    const profit = price - totalCost;
    return { totalCost, price, profit, margin: price ? (profit / price) * 100 : 0 };
  }

  function range(key, label, min, max, step, valueLabel) {
    return '<div><div class="bar-row" style="grid-template-columns:1fr auto"><label for="range-' + key + '">' + esc(label) + '</label><strong>' + esc(valueLabel) + '</strong></div><input type="range" id="range-' + key + '" data-price-control="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + state.pricing[key] + '"></div>';
  }

  function result(label, value, primary) {
    return '<div class="sub-card" style="' + (primary ? 'border-color:rgba(59,130,246,.35);background:rgba(37,99,235,.1)' : '') + '"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong></div>';
  }

  function scenarioList(totalCost) {
    return '<div class="sub-grid">' +
      scenario('Conservador', 20, totalCost * 1.2) +
      scenario('Atual', state.pricing.margin, totalCost * (1 + state.pricing.margin / 100)) +
      scenario('Premium', 50, totalCost * 1.5) +
      scenario('Agressivo', 65, totalCost * 1.65) +
      '</div>';
  }

  function scenario(name, margin, price) {
    return '<div class="sub-card"><small>' + esc(name) + '</small><strong>' + money(price) + '</strong><span style="color:var(--dim);font-size:12px">Margem alvo: ' + margin + '%</span></div>';
  }

  function bindPricingEvents() {
    document.querySelectorAll('[data-price-control]').forEach((input) => input.addEventListener('input', () => {
      state.pricing[input.dataset.priceControl] = Number(input.value);
      renderPricing();
    }));
    document.getElementById('resetPricing').addEventListener('click', () => {
      state.pricing = { cost: 45, freight: 12, tax: 8, margin: 35, adjustment: 10 };
      renderPricing();
    });
    document.getElementById('applyPricingVisible').addEventListener('click', async () => {
      if (!state.products.length) return toast('Abra a aba Produtos para carregar uma página antes de aplicar', 'error');
      const updates = state.products.map((p) => ({ id: p.id, price: Math.max(0, +(Number(p.price || 0) * (1 + state.pricing.adjustment / 100)).toFixed(2)) }));
      if (!confirm('Aplicar reajuste de ' + state.pricing.adjustment + '% nos ' + updates.length + ' produtos carregados?')) return;
      try {
        await api('/prices/bulk', { method: 'POST', body: JSON.stringify({ updates }) });
        state.metrics = null;
        toast('Reajuste aplicado');
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  function renderReports() {
    setHead('Relatórios', 'Gráficos compactos e distribuições calculadas pelo backend.');
    const el = document.getElementById('tab-reports');
    el.innerHTML = '<div class="loading">Carregando relatórios...</div>';
    loadMetrics().then((m) => {
      el.innerHTML = '<div class="grid-4">' +
        metric('Receita total', money(m.orders.revenue), 'Somente vendas concluídas', icon('money')) +
        metric('Receita 7 dias', money(m.orders.last_7_days_revenue), number(m.orders.last_7_days) + ' vendas concluídas', icon('trend')) +
        metric('Preço médio', money(m.products.avg_price), 'Catálogo', icon('box')) +
        metric('Maior preço', money(m.products.max_price), 'Produto mais caro', icon('alert')) +
        '</div>' +
        '<div class="grid-2"><div>' + panel('Pedidos por status', 'Quantidade e receita concluída', bars(m.orders.by_status, m.orders.total, true)) + '</div><div>' +
        panel('Pagamentos por provedor', 'Somente vendas concluídas', bars(m.orders.by_payment_provider, null, true)) + '</div></div>' +
        '<div class="grid-2"><div>' + panel('Marcas', 'Distribuição do catálogo', bars(m.products.by_brand, m.products.total)) + '</div><div>' +
        panel('Categorias', 'Distribuição do catálogo', bars(m.products.by_category, m.products.total)) + '</div></div>';
    }).catch((e) => {
      el.innerHTML = '<div class="error-state">Erro ao carregar relatórios: ' + esc(e.message) + '</div>';
    });
  }

  function pagination(kind, page, totalPages) {
    return '<div class="pagination"><button class="btn btn-outline btn-sm" data-page="' + kind + ':prev"' + (page <= 0 ? ' disabled' : '') + '>Anterior</button><span>Página ' + (page + 1) + ' de ' + totalPages + '</span><button class="btn btn-outline btn-sm" data-page="' + kind + ':next"' + (page >= totalPages - 1 ? ' disabled' : '') + '>Próxima</button></div>';
  }

  function renderSettings() {
    setHead('Configuracoes', 'Preferencias operacionais e leitura do ambiente do painel.');
    const el = document.getElementById('tab-settings');
    loadMetrics().then((m) => {
      el.innerHTML = '<div class="grid-2"><div>' +
        panel('Fonte de verdade', 'Dados usados pelo admin', '<div class="bars">' +
          '<div class="sub-card"><small>Banco</small><strong>Supabase via API do projeto</strong><span>ONE indisponivel nesta sessao; runtime do app foi usado como fallback.</span></div>' +
          '<div class="sub-card"><small>Admin principal</small><strong>admin.html</strong><span>CRUD atual preservado em assets/js/admin.js e /api/admin.</span></div>' +
          '<div class="sub-card"><small>OS</small><strong>' + number(m.service_orders?.total || 0) + '</strong><span>Ordens salvas em service_orders e service_order_items.</span></div>' +
        '</div>') + '</div><div>' +
        panel('Campos recomendados', 'Proximas melhorias de schema', '<div class="bars">' +
          '<div class="sub-card"><small>Estoque</small><strong>Minimo por produto</strong><span>Hoje o alerta usa estoque <= 2.</span></div>' +
          '<div class="sub-card"><small>Cliente</small><strong>Cadastro unificado</strong><span>Recorrencia hoje e calculada por telefone/email/nome do pedido.</span></div>' +
          '<div class="sub-card"><small>Servicos</small><strong>Tabela de servicos padrao</strong><span>Pode acelerar OS recorrentes no balcao.</span></div>' +
        '</div>') + '</div></div>';
    }).catch((e) => {
      el.innerHTML = '<div class="error-state">Erro ao carregar configuracoes: ' + esc(e.message) + '</div>';
    });
  }

  function bindPagination(kind) {
    document.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', () => {
      const [target, dir] = btn.dataset.page.split(':');
      if (target !== kind) return;
      if (kind === 'products') {
        state.productsPage = dir === 'prev' ? Math.max(0, state.productsPage - 1) : state.productsPage + 1;
        renderProducts();
      } else if (kind === 'serviceOrders') {
        state.serviceOrdersPage = dir === 'prev' ? Math.max(0, state.serviceOrdersPage - 1) : state.serviceOrdersPage + 1;
        renderServiceOrders();
      } else {
        state.ordersPage = dir === 'prev' ? Math.max(0, state.ordersPage - 1) : state.ordersPage + 1;
        renderOrders();
      }
    }));
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'dashboard') renderDashboardV2();
    if (tab === 'products') renderProducts();
    if (tab === 'orders') renderOrders();
    if (tab === 'service-orders') renderServiceOrders();
    if (tab === 'pricing') renderPricing();
    if (tab === 'reports') renderReports();
    if (tab === 'settings') renderSettings();
  }

  function exportCsv() {
    let rows;
    if (state.tab === 'orders') {
      rows = [['id', 'cliente', 'email', 'total', 'status', 'pagamento', 'data']].concat(state.orders.map((o) => [o.id, o.customer_name, o.customer_email, o.total, o.status, o.payment_provider, o.created_at]));
    } else if (state.tab === 'products') {
      rows = [['id', 'nome', 'marca', 'categoria', 'preco', 'ativo', 'url']].concat(state.products.map((p) => [p.id, p.name, p.brand, p.category, p.price, p.active, p.url]));
    } else if (state.tab === 'service-orders') {
      rows = [['id', 'codigo', 'cliente', 'telefone', 'aparelho', 'status', 'total', 'data']].concat(state.serviceOrders.map((o) => [o.id, o.code, o.customer_name, o.customer_phone, [o.device_brand, o.device_model].filter(Boolean).join(' '), o.status, o.total, o.created_at]));
    } else {
      rows = [['metrica', 'valor'], ['produtos_total', state.metrics?.products?.total || 0], ['pedidos_total', state.metrics?.orders?.total || 0], ['os_abertas', state.metrics?.service_orders?.open || 0], ['receita_total', state.metrics?.orders?.revenue || 0]];
    }
    const csv = rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tech7-admin-' + state.tab + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function checkLogin() {
    try {
      const res = await api('/session');
      if (!res.ok) return;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';
      switchTab(state.tab);
    } catch (_) {
      document.getElementById('loginScreen').style.display = 'grid';
      document.getElementById('appScreen').style.display = 'none';
    }
  }

  document.getElementById('loginBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('loginError');
    try {
      const res = await api('/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('usernameInput').value,
          password: document.getElementById('passwordInput').value
        })
      });
      if (res.ok) {
        errorEl.style.display = 'none';
        await checkLogin();
      }
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await api('/logout', { method: 'POST' });
    } catch (_) {
      // Local UI should still close even if session already expired server-side.
    }
    document.getElementById('loginScreen').style.display = 'grid';
    document.getElementById('appScreen').style.display = 'none';
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    state.metrics = null;
    await loadMetrics(true);
    switchTab(state.tab);
    toast('Dados atualizados');
  });
  document.getElementById('exportBtn').addEventListener('click', exportCsv);
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  applyTheme(state.theme);
  checkLogin();
})();
