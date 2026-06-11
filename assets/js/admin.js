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
    products: [],
    orders: [],
    productFilters: { q: '', active: '', brand: '', category: '' },
    editingProduct: null,
    orderStatus: '',
    selectedOrderId: null,
    pricing: { cost: 45, freight: 12, tax: 8, margin: 35, adjustment: 10 },
  };

  const PRODUCTS_PER_PAGE = 20;
  const ORDERS_PER_PAGE = 20;

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
      alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>'
    };
    return icons[kind] || icons.trend;
  }

  async function loadMetrics(force) {
    if (state.metrics && !force) return state.metrics;
    state.metrics = await api('/metrics');
    document.getElementById('lastSync').textContent = 'Atualizado ' + new Date(state.metrics.generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return state.metrics;
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
      const [data, m] = await Promise.all([api('/products?' + params.toString()), loadMetrics()]);
      state.products = data.items || [];
      const totalPages = Math.max(1, Math.ceil((data.total || 0) / PRODUCTS_PER_PAGE));
      el.innerHTML = panel('Catálogo (' + number(data.total || 0) + ')', 'Tabela editável com filtros e ações rápidas',
        productToolbar(m) + productEditor() + productTable(state.products) + pagination('products', state.productsPage, totalPages)
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
      '<select id="productCategory"><option value="">Todas categorias</option>' + options(m.products.by_category, state.productFilters.category) + '</select>' +
      '<button class="btn btn-primary btn-sm" id="applyProductSearch">Buscar</button>' +
      '<button class="btn btn-outline btn-sm" id="clearProductFilters">Limpar</button>' +
      '</div><div class="toolbar-group">' +
      '<button class="btn btn-primary btn-sm" id="newProduct">Adicionar produto</button>' +
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

  function categoryOptions(current) {
    const rows = [
      ['display-e-lcd', 'Display e LCD'],
      ['baterias-celular', 'Baterias celular'],
      ['pecas-e-componentes', 'Pecas e componentes'],
      ['tampas-e-carcacas', 'Tampas e carcacas'],
      ['touchs-e-visores', 'Touchs e visores'],
      ['maquinas-e-ferramentas', 'Maquinas e ferramentas']
    ];
    return rows.map((row) => '<option value="' + esc(row[0]) + '"' + selected(current, row[0]) + '>' + esc(row[1]) + '</option>').join('');
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
      '<label>Categoria<select id="editCategory" required>' + categoryOptions(p.category || p.section) + '</select></label>' +
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
      (p.id ? '<button class="btn btn-outline" type="button" id="deactivateProduct">Desativar</button>' : '') +
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
        '<td><input class="cell-input" data-edit="category" value="' + esc(p.category || '') + '"></td>' +
        '<td><input class="cell-input price-input" type="number" step="0.01" min="0" data-edit="price" value="' + Number(p.price || 0).toFixed(2) + '"' + (p.price_status === 'consult' ? ' title="Preço sob consulta ou abaixo de R$ 2,00"' : '') + '></td>' +
        '<td><button class="btn btn-sm ' + (p.active ? 'btn-green' : 'btn-outline') + '" data-toggle-active="' + esc(p.id) + '" data-active="' + p.active + '">' + (p.active ? 'Ativo' : 'Inativo') + '</button></td>' +
        '<td><div class="toolbar-group"><button class="btn btn-primary btn-sm" data-save-product="' + esc(p.id) + '">Salvar</button><button class="btn btn-outline btn-sm" data-edit-product="' + esc(p.id) + '">Editar</button><button class="btn btn-outline btn-sm" data-view-product="' + esc(p.url || '') + '">Ver</button></div></td>' +
      '</tr>').join('') + '</tbody></table></div>';
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
    document.getElementById('newProduct')?.addEventListener('click', () => {
      state.editingProduct = emptyProduct();
      renderProducts();
    });
    bindProductEditor();
    document.getElementById('clearProductFilters')?.addEventListener('click', () => {
      state.productFilters = { q: '', active: '', brand: '', category: '' };
      state.productsPage = 0;
      renderProducts();
    });
    document.querySelectorAll('[data-save-product]').forEach((btn) => btn.addEventListener('click', () => saveProduct(btn.dataset.saveProduct)));
    document.querySelectorAll('[data-edit-product]').forEach((btn) => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
    document.querySelectorAll('[data-toggle-active]').forEach((btn) => btn.addEventListener('click', () => toggleProduct(btn.dataset.toggleActive, btn.dataset.active !== 'true')));
    document.querySelectorAll('[data-view-product]').forEach((btn) => btn.addEventListener('click', () => {
      const url = String(btn.dataset.viewProduct || '').trim();
      if (!url) return toast('Produto sem URL de vitrine', 'error');
      window.open(url.startsWith('/') ? url : '/' + url, '_blank');
    }));
    document.getElementById('bulkPercent')?.addEventListener('click', () => bulkPrice('percent'));
    document.getElementById('bulkFixed')?.addEventListener('click', () => bulkPrice('fixed'));
    bindPagination('products');
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
    if (!confirm('Desativar este produto? Ele saira da vitrine, busca e filtros.')) return;
    try {
      state.editingProduct = await api('/products/' + encodeURIComponent(id), { method: 'DELETE' });
      state.metrics = null;
      toast('Produto desativado');
      renderProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveProduct(id) {
    const row = document.querySelector('[data-product-row="' + CSS.escape(id) + '"]');
    if (!row) return;
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

  async function toggleProduct(id, active) {
    try {
      await api('/products/' + encodeURIComponent(id), active
        ? { method: 'PATCH', body: JSON.stringify({ active: true }) }
        : { method: 'DELETE' });
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
      items.map((o) => '<tr><td class="mono">' + esc((o.id || '').slice(0, 12)) + '</td><td>' + esc(o.customer_name || '-') + '</td><td>' + esc(o.customer_email || '-') + '</td><td><strong>' + money(o.total) + '</strong></td><td>' + badge(o.status) + '</td><td>' + esc(o.payment_provider || '-') + '</td><td>' + esc(o.shipping_status || o.shipping_service_label || o.shipping_provider || '-') + '</td><td class="mono">' + esc(o.tracking_code || '-') + '</td><td>' + dateStr(o.created_at) + '</td><td><button class="btn btn-primary btn-sm" data-view-order="' + esc(o.id) + '">Detalhes</button></td></tr>').join('') +
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
    bindPagination('orders');
  }

  async function renderOrderDetail(id) {
    const el = document.getElementById('tab-orders');
    el.innerHTML = '<div class="loading">Carregando pedido...</div>';
    try {
      const o = await api('/orders/' + encodeURIComponent(id));
      const detail = '<button class="btn btn-outline btn-sm" id="backOrders">Voltar</button>' +
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
      const detail = '<button class="btn btn-outline btn-sm" id="backOrders">Voltar</button>' +
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

  function bindPagination(kind) {
    document.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', () => {
      const [target, dir] = btn.dataset.page.split(':');
      if (target !== kind) return;
      if (kind === 'products') {
        state.productsPage = dir === 'prev' ? Math.max(0, state.productsPage - 1) : state.productsPage + 1;
        renderProducts();
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
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'products') renderProducts();
    if (tab === 'orders') renderOrders();
    if (tab === 'pricing') renderPricing();
    if (tab === 'reports') renderReports();
  }

  function exportCsv() {
    let rows;
    if (state.tab === 'orders') {
      rows = [['id', 'cliente', 'email', 'total', 'status', 'pagamento', 'data']].concat(state.orders.map((o) => [o.id, o.customer_name, o.customer_email, o.total, o.status, o.payment_provider, o.created_at]));
    } else if (state.tab === 'products') {
      rows = [['id', 'nome', 'marca', 'categoria', 'preco', 'ativo', 'url']].concat(state.products.map((p) => [p.id, p.name, p.brand, p.category, p.price, p.active, p.url]));
    } else {
      rows = [['metrica', 'valor'], ['produtos_total', state.metrics?.products?.total || 0], ['pedidos_total', state.metrics?.orders?.total || 0], ['receita_total', state.metrics?.orders?.revenue || 0]];
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

  checkLogin();
})();
