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
    if (!value) return "../_assets/tech7/product-placeholder.svg";
    if (/^https?:\/\//i.test(value)) return value;
    return "../" + value.replace(/^\/+/, "");
  }

  function productUrl(value) {
    var clean = String(value || "index.html").trim().replace(/\\/g, "/");
    if (/^https?:\/\//i.test(clean)) {
      try {
        var parsed = new URL(clean, window.location.origin);
        clean = parsed.pathname;
      } catch (e) {
        clean = "index.html";
      }
    }
    clean = clean.split("#")[0].split("?")[0].replace(/^\/+|\/+$/g, "");
    if (!clean || /['"<>\s]|(?:\+)|(?:productUrl\()/i.test(clean) || !/^[a-z0-9._~/%-]+$/i.test(clean)) {
      clean = "index.html";
    }
    if (!/\.html$/i.test(clean)) clean += "/index.html";
    return "../" + clean;
  }

  function formatPriceFromCents(cents) {
    var n = Number(cents || 0);
    if (!Number.isFinite(n) || n < 200) return "";
    return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function isPlaceholder(value) {
    return /^\[[^\]]+\]$/.test(String(value || "").trim());
  }

  function displayName(item) {
    var candidates = [item.title, item.name, item.description, item.slug];
    for (var i = 0; i < candidates.length; i += 1) {
      var value = String(candidates[i] || "").trim();
      if (value && !isPlaceholder(value)) return value.replace(/-/g, " ");
    }
    return "";
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
    results.innerHTML = "";
    filtered.forEach(function (item) {
      var name = displayName(item);
      if (!name) return;
      var tag = item.brand || item.category || item.section || "TECH 7";
      var price = formatPriceFromCents(item.price_cents);
      var description = item.description || "Produto TECH 7 para reposicao de aparelho celular.";

      var card = document.createElement("a");
      card.className = "result-card";
      card.href = productUrl(item.url);

      var pic = document.createElement("div");
      pic.className = "pic";
      var img = document.createElement("img");
      img.src = assetUrl(item.image || item.image_url);
      img.alt = name;
      img.loading = "lazy";
      img.width = 180;
      img.height = 180;
      img.onerror = function () {
        if (img.getAttribute("src") !== "../_assets/tech7/product-placeholder.svg") {
          img.src = "../_assets/tech7/product-placeholder.svg";
        }
      };
      pic.appendChild(img);

      var info = document.createElement("div");
      info.className = "info";
      var tagEl = document.createElement("div");
      tagEl.className = "tag";
      tagEl.textContent = tag;
      var nameEl = document.createElement("h2");
      nameEl.className = "name";
      nameEl.textContent = name;
      var desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = description;
      info.appendChild(tagEl);
      info.appendChild(nameEl);
      info.appendChild(desc);

      if (price) {
        var priceEl = document.createElement("p");
        priceEl.className = "desc";
        priceEl.style.color = "#ffcf8a";
        priceEl.style.fontWeight = "800";
        priceEl.textContent = price;
        info.appendChild(priceEl);
      }

      var cta = document.createElement("div");
      cta.className = "cta";
      cta.textContent = "Ver produto";

      card.appendChild(pic);
      card.appendChild(info);
      card.appendChild(cta);
      results.appendChild(card);
    });
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
