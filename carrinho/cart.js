const API = "/api";
const LS_KEY = "t7_cart_id";

function moneyBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts?.headers || {}) }
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(json?.error || `http_${res.status}`);
    err.details = json;
    throw err;
  }
  return json;
}

async function ensureCart() {
  const existing = localStorage.getItem(LS_KEY);
  if (existing) return existing;
  const cart = await api("/cart", { method: "POST", body: "{}" });
  localStorage.setItem(LS_KEY, cart.id);
  return cart.id;
}

function render(cart) {
  const itemsEl = document.getElementById("items");
  const emptyEl = document.getElementById("empty");
  const cartIdLabel = document.getElementById("cartIdLabel");
  const checkoutBtn = document.getElementById("checkoutBtn");

  cartIdLabel.textContent = cart?.id ? `ID: ${cart.id}` : "";

  itemsEl.innerHTML = "";
  const items = cart?.items || [];
  emptyEl.style.display = items.length ? "none" : "block";
  checkoutBtn.disabled = items.length === 0;

  let subtotal = 0;
  for (const it of items) {
    const line = Number(it.price_cents || 0) * Number(it.qty || 0);
    subtotal += line;

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="thumb">${it.image_url ? `<img alt="" src="${it.image_url}">` : ""}</div>
      <div>
        <div class="name">${it.name || "Produto"}</div>
        <div class="meta">${it.slug || ""}</div>
      </div>
      <div class="right">
        <div class="price">${moneyBRL(line / 100)}</div>
        <div class="qty">
          <button type="button" data-dec>-</button>
          <input inputmode="numeric" value="${it.qty}" data-qty />
          <button type="button" data-inc>+</button>
        </div>
      </div>
    `;

    const qtyInput = row.querySelector("[data-qty]");
    row.querySelector("[data-dec]").addEventListener("click", () => setQty(cart.id, it.product_id, Number(qtyInput.value) - 1));
    row.querySelector("[data-inc]").addEventListener("click", () => setQty(cart.id, it.product_id, Number(qtyInput.value) + 1));
    qtyInput.addEventListener("change", () => setQty(cart.id, it.product_id, Number(qtyInput.value)));

    itemsEl.appendChild(row);
  }

  document.getElementById("subtotal").textContent = moneyBRL(subtotal / 100);
  document.getElementById("total").textContent = moneyBRL(subtotal / 100);
}

let inflight = null;

async function refresh() {
  const cartId = await ensureCart();
  const cart = await api(`/cart/${encodeURIComponent(cartId)}`);
  render(cart);
  return cart;
}

async function setQty(cartId, productId, qty) {
  const q = Math.max(0, Math.min(99, Number(qty || 0)));
  inflight = api(`/cart/${encodeURIComponent(cartId)}/items`, {
    method: "PUT",
    body: JSON.stringify({ productId, qty: q })
  })
    .then((cart) => {
      render(cart);
      inflight = null;
    })
    .catch((e) => {
      inflight = null;
      alert(`Erro: ${e.message}`);
    });
}

async function checkout() {
  const cartId = await ensureCart();
  const order = await api("/orders", { method: "POST", body: JSON.stringify({ cartId }) });
  const pay = await api("/payments/mercadopago", { method: "POST", body: JSON.stringify({ orderId: order.id }) });
  const url = pay.initPoint || pay.sandboxInitPoint;
  if (!url) throw new Error("missing_checkout_url");
  window.location.href = url;
}

async function addDemo() {
  // Adds the newest product from the catalog (seed inserts demo products).
  const prod = await api("/products?limit=1&offset=0");
  const p = prod.items?.[0];
  if (!p) return alert("Nenhum produto disponivel no catalogo.");
  const cartId = await ensureCart();
  await api(`/cart/${encodeURIComponent(cartId)}/items`, {
    method: "PUT",
    body: JSON.stringify({ productId: p.id, qty: 1 })
  });
  await refresh();
}

document.getElementById("checkoutBtn").addEventListener("click", async () => {
  try {
    if (inflight) await inflight;
    await checkout();
  } catch (e) {
    alert(`Erro no checkout: ${e.message}`);
  }
});

document.getElementById("addDemoBtn").addEventListener("click", async () => {
  try {
    await addDemo();
  } catch (e) {
    alert(`Erro: ${e.message}`);
  }
});

refresh().catch((e) => alert(`Erro: ${e.message}`));

