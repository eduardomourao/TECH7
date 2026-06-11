import "dotenv/config";
import http from "node:http";

const PRODUCT_ID = process.env.LOGGI_TEST_PRODUCT_ID || "tampas-e-carcacas-apple-carcaca-transforma-iphone-xs-em-iphone-17-pro-max";
const DESTINATION = {
  cep: process.env.LOGGI_TEST_DESTINATION_ZIPCODE || "30111070",
  logradouro: process.env.LOGGI_TEST_DESTINATION_ADDRESS || "Avenida Oiapoque",
  numero: process.env.LOGGI_TEST_DESTINATION_NUMBER || "156",
  bairro: process.env.LOGGI_TEST_DESTINATION_NEIGHBORHOOD || "Centro",
  cidade: process.env.LOGGI_TEST_DESTINATION_CITY || "Belo Horizonte",
  estado: process.env.LOGGI_TEST_DESTINATION_STATE || "MG"
};

function arg(name) {
  return process.argv.includes(name);
}

function randomPort() {
  return 4300 + Math.floor(Math.random() * 1200);
}

async function listen(server, port) {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

async function close(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

async function post(port, path, body, headers = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
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

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${path} ${response.status} ${JSON.stringify(json)}`);
  return json;
}

function createMockLoggiServer() {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/v2/oauth2/token") {
        res.end(JSON.stringify({ idToken: "mock-token", expiresIn: "3600s" }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/companies/mock-company/quotations") {
        const parsed = JSON.parse(body || "{}");
        if (!parsed.shipFrom || !parsed.shipTo || !Array.isArray(parsed.packages) || !parsed.externalServiceIds?.length) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "bad_payload" }));
          return;
        }
        res.end(JSON.stringify({
          packagesQuotations: [{
            quotations: [{
              externalServiceId: "EXPRESSO",
              freightType: "EXPRESS",
              freightTypeLabel: "Loggi Expressa",
              pickupType: "PICKUP_TYPE_DEDICATED",
              price: { totalAmount: { currencyCode: "BRL", units: "12", nanos: 340000000 } },
              sloInDays: 1
            }]
          }]
        }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/companies/mock-company/labels") {
        res.end(JSON.stringify({ content: [{ url: "https://example.test/loggi-label.pdf" }] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not_found", url: req.url }));
    });
  });
}

function setMockEnv(mockPort) {
  process.env.LOGGI_API_URL = `http://127.0.0.1:${mockPort}`;
  process.env.LOGGI_CLIENT_ID = "mock-client";
  process.env.LOGGI_CLIENT_SECRET = "mock-secret";
  process.env.LOGGI_COMPANY_ID = "mock-company";
  process.env.LOGGI_EXTERNAL_SERVICE_IDS = "EXPRESSO";
  process.env.LOGGI_ORIGIN_NAME = "TECH 7";
  process.env.LOGGI_ORIGIN_TAX_ID = "00000000000000";
  process.env.LOGGI_ORIGIN_ADDRESS = "Avenida Oiapoque";
  process.env.LOGGI_ORIGIN_NUMBER = "156";
  process.env.LOGGI_ORIGIN_NEIGHBORHOOD = "Centro";
  process.env.LOGGI_ORIGIN_ZIPCODE = "30111070";
  process.env.LOGGI_ORIGIN_CITY = "Belo Horizonte";
  process.env.LOGGI_ORIGIN_STATE = "MG";
  process.env.LOGGI_WEBHOOK_USERNAME = "loggi";
  process.env.LOGGI_WEBHOOK_PASSWORD = "secret";
}

async function createOrderWithQuote({ appPort, pool, serviceId = "EXPRESSO" }) {
  const cart = await post(appPort, "/api/cart");
  await post(appPort, `/api/cart/${encodeURIComponent(cart.id)}/items`, { productId: PRODUCT_ID, qty: 1 });
  const quote = await post(appPort, "/api/shipping/loggi/quote", {
    destination: DESTINATION,
    items: [{ id: PRODUCT_ID, qty: 1 }]
  });
  const selected = quote.options.find((option) => String(option.serviceId) === String(serviceId)) || quote.options[0];
  const order = await post(appPort, "/api/orders", {
    cartId: cart.id,
    customer: { name: "Cliente Loggi QA", email: "loggi-qa@example.com", phone: "31999990000", documento: "12345678909" },
    shipping: {
      deliveryMode: "shipping",
      quoteId: quote.quoteId,
      selectedServiceId: selected.serviceId,
      cep: DESTINATION.cep,
      logradouro: DESTINATION.logradouro,
      numero: DESTINATION.numero,
      bairro: DESTINATION.bairro,
      cidade: DESTINATION.cidade,
      estado: DESTINATION.estado
    }
  });
  return {
    cartId: cart.id,
    quoteId: quote.quoteId,
    orderId: order.id,
    selected,
    order,
    cleanup: async () => {
      await pool.query("delete from orders where id = $1", [order.id]).catch(() => {});
      await pool.query("delete from shipping_quotes where id = $1", [quote.quoteId]).catch(() => {});
      await pool.query("delete from carts where id = $1", [cart.id]).catch(() => {});
    }
  };
}

async function validateWebhook({ appPort, pool, orderId }) {
  const suffix = orderId.replace(/[^a-z0-9]/gi, "").slice(-12) || String(Date.now());
  const loggiKey = `LGKQA${suffix}`;
  const trackingCode = `TRKQA${suffix}`;
  await pool.query("delete from shipments where provider = 'loggi' and (loggi_key = $1 or tracking_code = $2)", [loggiKey, trackingCode]);
  await pool.query(
    "insert into shipments (order_id, provider, status, external_service_id, loggi_key, tracking_code) values ($1, 'loggi', 'created', 'EXPRESSO', $2, $3) on conflict (provider, order_id) do update set loggi_key = excluded.loggi_key, tracking_code = excluded.tracking_code",
    [orderId, loggiKey, trackingCode]
  );
  const auth = Buffer.from(`${process.env.LOGGI_WEBHOOK_USERNAME}:secret`).toString("base64");
  const payload = {
    id: `evt-loggi-qa-${Date.now()}`,
    packages: [{
      loggiKey,
      trackingCode,
      status: {
        code: 21,
        highLevelStatus: "delivered",
        description: "Entregue",
        updatedTime: new Date().toISOString(),
        actionRequired: { required: false }
      }
    }]
  };
  await post(appPort, "/api/webhooks/loggi", payload, { authorization: `Basic ${auth}` });
  const { rows } = await pool.query("select status from shipments where provider = 'loggi' and order_id = $1", [orderId]);
  return rows[0]?.status === "delivered";
}

async function run() {
  const mockMode = arg("--mock") || !arg("--live");
  const mockPort = randomPort();
  const appPort = randomPort();
  let mockServer = null;
  if (mockMode) {
    mockServer = createMockLoggiServer();
    await listen(mockServer, mockPort);
    setMockEnv(mockPort);
  }
  process.env.PORT = String(appPort);

  const { missingLoggiRuntimeEnv } = await import("../server/lib/loggi.js");
  const missing = missingLoggiRuntimeEnv();
  if (missing.length) {
    console.error(JSON.stringify({ ok: false, mode: mockMode ? "mock" : "live", missing }, null, 2));
    await close(mockServer);
    process.exit(1);
  }

  const { app } = await import("../server/app.js");
  const { pool } = await import("../server/lib/db.js");
  const appServer = app.listen(appPort, "127.0.0.1");
  await new Promise((resolve) => appServer.once("listening", resolve));

  let qa = null;
  try {
    const readiness = await getJson(appPort, "/api/shipping/loggi/readiness");
    qa = await createOrderWithQuote({ appPort, pool });
    const freightOk = Number(qa.order.shipping_total_cents || 0) > 0 &&
      Number(qa.order.total_cents || 0) === Number(qa.order.subtotal_cents || 0) + Number(qa.order.shipping_total_cents || 0) &&
      qa.order.shipping_provider === "loggi" &&
      qa.order.customer_document === "12345678909";
    const webhookOk = mockMode ? await validateWebhook({ appPort, pool, orderId: qa.orderId }) : true;
    const ok = freightOk && webhookOk;
    console.log(JSON.stringify({
      ok,
      mode: mockMode ? "mock" : "live",
      readiness: {
        ready: readiness.ready,
        externalServiceCount: readiness.externalServiceCount,
        webhookConfigured: readiness.webhookConfigured
      },
      quoteId: qa.quoteId,
      orderId: qa.orderId,
      selected: qa.selected,
      order: {
        subtotal_cents: qa.order.subtotal_cents,
        shipping_total_cents: qa.order.shipping_total_cents,
        total_cents: qa.order.total_cents,
        shipping_provider: qa.order.shipping_provider,
        shipping_service_id: qa.order.shipping_service_id
      },
      webhookOk
    }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    if (qa) await qa.cleanup();
    await pool.end().catch(() => {});
    await close(appServer);
    await close(mockServer);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
