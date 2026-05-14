(function () {
  'use strict';

  if (document.getElementById('t7-category-filter')) return;
  var container = document.querySelector('.showcase-catalog .list.flex');
  var form = document.querySelector('form.smart-filter');
  if (!container || !form) return;

  var itemSelector = 'li.item.flex, li.item';
  var allItems = [].slice.call(container.querySelectorAll(itemSelector));
  if (!allItems.length) return;

  var activeFilters = { brands: [], prices: [], variants: [] };

  function getBrand(item) {
    var el = item.querySelector('.product-name, .info-product .product-name');
    return el ? el.textContent.trim() : '';
  }

  function getPrice(item) {
    var el = item.querySelector('.price-off');
    if (!el) return 0;
    var txt = el.textContent.trim().replace(/[^\d,.-]/g, '').replace(',', '.');
    return parseFloat(txt) || 0;
  }

  function getColors(item) {
    var variantForm = item.querySelector('form.list-variants');
    if (!variantForm) return [];
    try {
      var data = JSON.parse(variantForm.getAttribute('data-variants') || '[]');
      return data.map(function (v) { return String(v.option || '').toLowerCase(); });
    } catch (e) { return []; }
  }

  function matchBrand(item, brands) {
    if (!brands.length) return true;
    var name = getBrand(item).toLowerCase();
    return brands.some(function (b) { return name.indexOf(b.toLowerCase()) !== -1; });
  }

  function matchPrice(item, ranges) {
    if (!ranges.length) return true;
    var price = getPrice(item);
    return ranges.some(function (r) {
      var min = r[0], max = r[1];
      return price >= min && price <= max;
    });
  }

  function matchColor(item, colors) {
    if (!colors.length) return true;
    var itemColors = getColors(item);
    if (!itemColors.length) return true;
    return itemColors.some(function (c) { return colors.indexOf(c) !== -1; });
  }

  function applyFilters() {
    allItems.forEach(function (item) {
      var show = matchBrand(item, activeFilters.brands) &&
                 matchPrice(item, activeFilters.prices) &&
                 matchColor(item, activeFilters.variants);
      item.style.display = show ? '' : 'none';
    });
  }

  function parsePriceRange(val) {
    var parts = val.split(',');
    return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 999999];
  }

  function updateFromForm() {
    activeFilters.brands = [];
    activeFilters.prices = [];
    activeFilters.variants = [];

    form.querySelectorAll('input[name="brands[]"]:checked').forEach(function (cb) {
      activeFilters.brands.push(cb.value.toLowerCase());
    });

    form.querySelectorAll('input[name="prices[]"]:checked').forEach(function (cb) {
      activeFilters.prices.push(parsePriceRange(cb.value));
    });

    form.querySelectorAll('input[name="variants[]"]:checked').forEach(function (cb) {
      var val = cb.value.replace(/^Cor\|\|/i, '').toLowerCase().trim();
      if (val) activeFilters.variants.push(val);
    });

    applyFilters();
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'brands[]' || e.target.name === 'prices[]' || e.target.name === 'variants[]') {
      updateFromForm();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    updateFromForm();
  });

  var params = new URLSearchParams(window.location.search);
  var brandsParam = params.get('brands[]');
  var pricesParam = params.get('prices[]');
  if (brandsParam || pricesParam) {
    if (brandsParam) {
      form.querySelectorAll('input[name="brands[]"]').forEach(function (cb) {
        if (cb.value === brandsParam) cb.checked = true;
      });
    }
    if (pricesParam) {
      form.querySelectorAll('input[name="prices[]"]').forEach(function (cb) {
        if (cb.value === pricesParam) cb.checked = true;
      });
    }
    updateFromForm();
  }

  var style = document.createElement('style');
  style.textContent = '.catalog-content .list.flex li.item.flex[style*="display: none"] { display: none !important; }';
  document.head.appendChild(style);
})();
