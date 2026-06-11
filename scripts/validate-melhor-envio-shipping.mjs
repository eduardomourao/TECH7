import "dotenv/config";
import http from "node:http";

const PRODUCT_ID = process.env.MELHOR_ENVIO_TEST_PRODUCT_ID || "tampas-e-carcacas-apple-carcaca-transforma-iphone-xs-em-iphone-17-pro-max";
const DESTINATION = {
  cep: process.env.MELHOR_ENVIO_TEST_DESTINATION_ZIPCODE || "30111070",
  logradouro: process.env.MELHOR_ENVIO_TEST_DESTINATION_ADDRESS || "Avenida Oiapoque",
  numero: process.env.MELHOR_ENVIO_TEST_DESTINATION_NUMBER || "156",
  bairro: process.env.MELHOR_ENVIO_TEST_DESTINATION_NEIGHBORHOOD || "Centro",
  cidade: process.env.MELHOR_ENVIO_TEST_DESTINATION_CITY || "Belo Horizonte",
  estado: process.env.MELHOR_ENVIO_TEST_DESTINATION_STATE || "MG"
};

function arg(name) {
  return process.argv.includes(name);
}

function randomPort() {
  return 4700 + Math.floor(Math.random() * 1200);
}

async function listen(server, port) {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

async function close(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

async function requestJson(port, method, path, body) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (response.ok) return json;
    lastError = new Error(`${path} ${response.status} ${JSON.stringify(json)}`);
    if (json?.error !== "database_connection_error") break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw lastError;
}

async function requestText(port, method, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status} ${text}`);
  return text;
}

function createMockServer() {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/oauth/token") {
        const parsed = new URLSearchParams(body || "");
        if (!parsed.get("client_id") || !parsed.get("client_secret")) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "bad_oauth_payload" }));
          return;
        }
        res.end(JSON.stringify({
          token_type: "Bearer",
          access_token: "mock-oauth-access-token",
          refresh_token: "mock-oauth-refresh-token",
          expires_in: 2592000,
          scope: "shipping-calculate"
        }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/v2/me/shipment/calculate") {
        if (!String(req.headers.authorization || "").startsWith("Bearer ")) {
          res.statusCode = 401;
          res.end(JSON.stringify({ message: "Unauthenticated" }));
          return;
        }
        const parsed = JSON.parse(body || "{}");
        if (!parsed.from?.postal_code || !parsed.to?.postal_code || !Array.isArray(parsed.products)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: "bad_payload" }));
          return;
        }
        res.end(JSON.stringify([
          {
            id: 2,
            name: "SEDEX",
            price: "29.90",
            custom_price: "29.90",
            currency: "R$",
            delivery_time: 2,
            custom_delivery_time: 2,
            company: { id: 1, name: "Correios" }
          },
          {
            id: 3,
            name: ".Package",
            price: "37.31",
            custom_price: "37.31",
            currency: "R$",
            delivery_time: 5,
            custom_delivery_time: 5,
            company: { id: 2, name: "Jadlog" }
          },
          {
            id: 34,
            name: "Loggi Ponto",
            price: "21.21",
            custom_price: "21.21",
            currency: "R$",
            delivery_time: 4,
            custom_delivery_time: 4,
            company: { id: 3, name: "Loggi" }
          }
        ]));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not_found", url: req.url }));
    });
  });
}

function setMockEnv(port, { oauth = false } = {}) {
  process.env.MELHOR_ENVIO_API_URL = `http://127.0.0.1:${port}`;
  if (oauth) {
    delete process.env.MELHOR_ENVIO_TOKEN;
    process.env.MELHOR_ENVIO_CLIENT_ID = "mock-client-id";
    process.env.MELHOR_ENVIO_CLIENT_SECRET = "mock-client-secret";
    process.env.MELHOR_ENVIO_REDIRECT_URI = "http://127.0.0.1:3000/api/shipping/melhor-envio/oauth/callback";
  } else {
    process.env.MELHOR_ENVIO_TOKEN = "mock-token";
  }
  process.env.MELHOR_ENVIO_USER_AGENT = "TECH7 QA (qa@example.com)";
  process.env.MELHOR_ENVIO_ORIGIN_ZIPCODE = "30111070";
  process.env.MELHOR_ENVIO_SERVICE_IDS = "2,3,34";
}

async function run() {
  const mockMode = arg("--mock") || !arg("--live");
  const oauthMode = arg("--oauth");
  const mockPort = randomPort();
  const appPort = randomPort();
  let mockServer = null;
  if (mockMode) {
    mockServer = createMockServer();
    await listen(mockServer, mockPort);
    setMockEnv(mockPort, { oauth: oauthMode });
  }
  process.env.PORT = String(appPort);
  if (oauthMode) {
    process.env.MELHOR_ENVIO_REDIRECT_URI = `http://127.0.0.1:${appPort}/api/shipping/melhor-envio/oauth/callback`;
  }

  const { missingMelhorEnvioRuntimeEnv } = await import("../server/lib/melhor_envio.js");
  const missing = missingMelhorEnvioRuntimeEnv({ hasAccessToken: oauthMode });
  if (missing.length) {
    console.error(JSON.stringify({ ok: false, mode: mockMode ? "mock" : "live", missing }, null, 2));
    await close(mockServer);
    process.exit(1);
  }

  const { app } = await import("../server/app.js");
  const { pool } = await import("../server/lib/db.js");
  const appServer = app.listen(appPort, "127.0.0.1");
  await new Promise((resolve) => appServer.once("listening", resolve));
  let cartId = "";
  let quoteId = "";
  let orderId = "";
  try {
    if (oauthMode) {
      const auth = await requestJson(appPort, "GET", "/api/shipping/melhor-envio/oauth/authorize?redirect=0");
      const state = new URL(auth.authorizeUrl).searchParams.get("state");
      await requestText(appPort, "GET", `/api/shipping/melhor-envio/oauth/callback?code=mock-code&state=${encodeURIComponent(state)}`);
    }
    const readiness = await requestJson(appPort, "GET", "/api/shipping/melhor-envio/readiness");
    const cart = await requestJson(appPort, "POST", "/api/cart");
    cartId = cart.id;
    await requestJson(appPort, "POST", `/api/cart/${encodeURIComponent(cartId)}/items`, { productId: PRODUCT_ID, qty: 1 });
    const quote = await requestJson(appPort, "POST", "/api/shipping/melhor-envio/quote", {
      destination: DESTINATION,
      items: [{ id: PRODUCT_ID, qty: 1 }]
    });
    const quoteLabels = (quote.options || []).map((option) => option.label);
    const quoteServiceIds = (quote.options || []).map((option) => String(option.serviceId));
    quoteId = quote.quoteId;
    const order = await requestJson(appPort, "POST", "/api/orders", {
      cartId,
      customer: { name: "Cliente Melhor Envio QA", email: "melhor-envio-qa@example.com", phone: "31999990000", documento: "12345678909" },
      shipping: {
        deliveryMode: "shipping",
        quoteId,
        selectedServiceId: quote.selectedServiceId,
        cep: DESTINATION.cep,
        logradouro: DESTINATION.logradouro,
        numero: DESTINATION.numero,
        bairro: DESTINATION.bairro,
        cidade: DESTINATION.cidade,
        estado: DESTINATION.estado,
        carrier: "melhor_envio"
      }
    });
    orderId = order.id;
    const ok = readiness.ready === true &&
      order.shipping_provider === "melhor_envio" &&
      quoteServiceIds.join(",") === "2,3,34" &&
      quoteLabels.join("|") === "Correios - SEDEX|Jadlog|Loggi" &&
      Number(order.shipping_total_cents || 0) > 0 &&
      Number(order.total_cents || 0) === Number(order.subtotal_cents || 0) + Number(order.shipping_total_cents || 0);
    console.log(JSON.stringify({
      ok,
      mode: oauthMode ? "mock-oauth" : mockMode ? "mock" : "live",
      readiness,
      quoteId,
      orderId,
      selected: quote.options?.[0] || null,
      order: {
        subtotal_cents: order.subtotal_cents,
        shipping_total_cents: order.shipping_total_cents,
        total_cents: order.total_cents,
        shipping_provider: order.shipping_provider,
        shipping_service_id: order.shipping_service_id
      }
    }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    if (orderId) await pool.query("delete from orders where id = $1", [orderId]).catch(() => {});
    if (quoteId) await pool.query("delete from shipping_quotes where id = $1", [quoteId]).catch(() => {});
    if (cartId) await pool.query("delete from carts where id = $1", [cartId]).catch(() => {});
    if (oauthMode) await pool.query("delete from provider_oauth_tokens where provider = 'melhor_envio'").catch(() => {});
    await pool.end().catch(() => {});
    await close(appServer);
    await close(mockServer);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
