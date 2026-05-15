(function () {
  var params = new URLSearchParams(window.location.search);
  var term = (params.get("q") || params.get("palavra_busca") || "").trim();
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

  function render(filtered, totalCount) {
    if (input) input.value = term;
    if (title) title.textContent = term ? 'Resultado para "' + term + '"' : "Produtos em destaque";
    if (count) count.textContent = Number(totalCount || filtered.length) + " produto(s) encontrado(s)";

    if (!filtered.length) {
      results.className = "empty";
      results.innerHTML = "Nenhum produto encontrado. Tente buscar por marca, modelo ou tipo de peça.";
      return;
    }

    results.className = "results-grid";
    results.innerHTML = filtered.map(function (item) {
      return '<a class="result-card" href="' + productUrl(item.url) + '">' +
        '<div class="pic"><img src="' + assetUrl(item.image) + '" alt="' + escapeHtml(item.title) + '" loading="lazy"></div>' +
        '<div class="info">' +
        '<div class="tag">' + escapeHtml(item.brand || item.category || "TECH 7") + '</div>' +
        '<h2 class="name">' + escapeHtml(item.title) + '</h2>' +
        '<p class="desc">' + escapeHtml(item.description || "Produto TECH 7 para reposicao de aparelho celular.") + '</p>' +
        '</div>' +
        '<div class="cta">Ver produto</div>' +
        '</a>';
    }).join("");
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
    .then(function (data) { render(data.items || [], data.count || 0); })
    .catch(function () {
      if (title) title.textContent = "Busca indisponivel";
      if (count) count.textContent = "";
      results.className = "empty";
      results.innerHTML = "Nao foi possivel carregar os resultados de busca.";
    });
})();
