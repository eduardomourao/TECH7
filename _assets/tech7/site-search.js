(function () {
  var params = new URLSearchParams(window.location.search);
  var term = (params.get("q") || params.get("palavra_busca") || params.get("t") || "").trim();
  var brand = (params.get("brand") || params.get("marca") || params.get("filtrar_marca") || "").trim();
  var category = (params.get("category") || params.get("categoria") || params.get("filtrar_departamento") || params.get("departamento") || "").trim();
  var title = document.getElementById("searchTitle");
  var count = document.getElementById("searchCount");
  var input = document.getElementById("searchInput");
  var results = document.getElementById("searchResults");

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function assetUrl(value) {
    if (!value) return "../logo.png";
    if (/^https?:\/\//i.test(value)) return value;
    return "../" + value.replace(/^\/+/, "");
  }

  function productUrl(value) {
    return "../" + String(value || "index.html").replace(/^\/+/, "");
  }

  function formatPriceFromCents(cents) {
    var n = Number(cents || 0);
    if (!Number.isFinite(n) || n <= 0) return "";
    return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function render(items, totalCount) {
    var filtered = Array.isArray(items) ? items : [];
    if (input) input.value = term;
    if (title) title.textContent = term ? 'Resultado para "' + term + '"' : "Produtos em destaque";
    if (count) count.textContent = Number(totalCount || filtered.length) + " produto(s) encontrado(s)";

    if (!filtered.length) {
      results.className = "empty";
      results.innerHTML = "Nenhum produto encontrado. Tente buscar por marca, modelo ou tipo de peca.";
      return;
    }

    results.className = "results-grid";
    results.innerHTML = filtered.map(function (item) {
      var name = item.title || item.name || "";
      var tag = item.brand || item.category || item.section || "TECH 7";
      var price = formatPriceFromCents(item.price_cents);
      var description = item.description || "Produto TECH 7 para reposicao de aparelho celular.";

      return '<a class="result-card" href="' + productUrl(item.url) + '">' +
        '<div class="pic"><img src="' + assetUrl(item.image || item.image_url) + '" alt="' + escapeHtml(name) + '" loading="lazy"></div>' +
        '<div class="info">' +
        '<div class="tag">' + escapeHtml(tag) + "</div>" +
        '<h2 class="name">' + escapeHtml(name) + "</h2>" +
        '<p class="desc">' + escapeHtml(description) + "</p>" +
        (price ? '<p class="desc" style="color:#ffcf8a;font-weight:800;">' + escapeHtml(price) + "</p>" : "") +
        "</div>" +
        '<div class="cta">Ver produto</div>' +
        "</a>";
    }).join("");
  }

  function renderEmptySearch() {
    if (input) input.value = "";
    if (title) title.textContent = "Produtos em destaque";
    if (count) count.textContent = "";
    results.className = "empty";
    results.innerHTML = "Digite um termo para buscar produtos TECH 7.";
  }

  if (!term && !brand && !category) {
    renderEmptySearch();
    return;
  }

  var query = new URLSearchParams();
  if (term) query.set("q", term);
  if (brand) query.set("brand", brand);
  if (category) query.set("category", category);
  query.set("limit", "120");

  fetch("/api/search?" + query.toString(), { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Busca indisponivel");
      return response.json();
    })
    .then(function (data) {
      if (term && Number(data.count || 0) === 0) {
        window.location.replace("/sem-resultados-na-busca/");
        return;
      }
      render(data.items || [], data.count || 0);
    })
    .catch(function () {
      if (title) title.textContent = "Busca indisponivel";
      if (count) count.textContent = "";
      results.className = "empty";
      results.innerHTML = "Nao foi possivel carregar os resultados da busca.";
    });
})();
