import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

process.env.DATABASE_URL = "";
process.env.POSTGRES_URL = "";
process.env.SUPABASE_DB_URL = "";
delete process.env.ADMIN_USERNAME;
delete process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_PASSWORD_HASH;
delete process.env.MP_WEBHOOK_SECRET;
delete process.env.WHATSAPP_APP_SECRET;
delete process.env.WOOVI_WEBHOOK_AUTHORIZATION;

const { createApp } = await import("../server/app.js");
const { pool } = await import("../server/lib/db.js");

delete process.env.ADMIN_USERNAME;
delete process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_PASSWORD_HASH;
delete process.env.MP_WEBHOOK_SECRET;
delete process.env.WHATSAPP_APP_SECRET;
delete process.env.WOOVI_WEBHOOK_AUTHORIZATION;

const report = {
  generated_at: new Date().toISOString(),
  checks: []
};

function record(name, ok, detail = "") {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? "[OK]" : "[FAIL]"} ${name}${detail ? ` - ${detail}` : ""}`);
}

async function withCheck(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (error) {
    record(name, false, String(error?.message || error));
  }
}

const originalQuery = pool.query.bind(pool);
let catalogMutationAttempted = false;

pool.query = async (sql, params = []) => {
  const text = String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (text.includes("update products") || text.includes("insert into products")) {
    catalogMutationAttempted = true;
    throw new Error("catalog_mutation_attempted");
  }
  if (text.startsWith("select id, status from carts")) {
    return { rowCount: 1, rows: [{ id: params[0], status: "open" }] };
  }
  if (text.includes("from products") && text.includes("where id = $1")) {
    if (params[0] === "known-product") {
      return {
        rowCount: 1,
        rows: [{
          id: "known-product",
          slug: "known-product",
          brand: "apple",
          section: "display-e-lcd",
          price_cents: 99900
        }]
      };
    }
    return { rowCount: 0, rows: [] };
  }
  if (text.includes("from products") && text.includes("slug = $1")) {
    return { rowCount: 0, rows: [] };
  }
  if (text.startsWith("begin") || text.startsWith("commit") || text.startsWith("rollback")) {
    return { rowCount: 0, rows: [] };
  }
  if (text.includes("insert into cart_items") || text.includes("delete from cart_items") || text.includes("update carts")) {
    return { rowCount: 1, rows: [] };
  }
  if (text.includes("from carts where id = $1")) {
    return { rowCount: 1, rows: [{ id: params[0], status: "open", created_at: new Date(), updated_at: new Date() }] };
  }
  if (text.includes("from cart_items")) {
    return { rowCount: 0, rows: [] };
  }
  return { rowCount: 0, rows: [] };
};

const server = http.createServer(createApp({ serveStatic: false }));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function request(pathname, options = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, options);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { res, body };
}

try {
  await withCheck("admin protected route rejects missing session", async () => {
    const { res } = await request("/api/admin/products");
    assert.equal(res.status, 401);
  });

  await withCheck("admin login without configured hash fails closed", async () => {
    const { res, body } = await request("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "eduardomourao", password: "32361417" })
    });
    assert.equal(res.status, 503);
    assert.equal(body.error, "admin_not_configured");
  });

  await withCheck("cart snapshot cannot mutate catalog", async () => {
    catalogMutationAttempted = false;
    const { res } = await request("/api/cart/test-cart/items", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "known-product",
        qty: 1,
        product: {
          name: "Produto falso",
          price: 1,
          image_url: "https://evil.example/fake.jpg"
        }
      })
    });
    assert.equal(res.status, 200);
    assert.equal(catalogMutationAttempted, false);
  });

  await withCheck("unknown product snapshot returns 404 without catalog insert", async () => {
    catalogMutationAttempted = false;
    const { res, body } = await request("/api/cart/test-cart/items", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "unknown-product",
        qty: 1,
        product: {
          name: "Produto falso",
          slug: "unknown-product",
          price: 1
        }
      })
    });
    assert.equal(res.status, 404);
    assert.equal(body.error, "product_not_found");
    assert.equal(catalogMutationAttempted, false);
  });

  await withCheck("Mercado Pago webhook missing secret fails closed", async () => {
    const { res, body } = await request("/api/webhooks/mercadopago", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { id: "123" } })
    });
    assert.equal(res.status, 503);
    assert.equal(body.error, "webhook_secret_not_configured");
  });

  await withCheck("WhatsApp webhook missing secret fails closed", async () => {
    const { res, body } = await request("/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entry: [] })
    });
    assert.equal(res.status, 503);
    assert.equal(body.error, "webhook_secret_not_configured");
  });

  await withCheck("Woovi webhook missing authorization fails closed", async () => {
    const { res, body } = await request("/api/webhooks/woovi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "CHARGE_COMPLETED" })
    });
    assert.equal(res.status, 503);
    assert.equal(body.error, "webhook_secret_not_configured");
  });
} finally {
  pool.query = originalQuery;
  await new Promise((resolve) => server.close(resolve));
}

const outDir = path.resolve("_validation");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "validate-api-security.json"), JSON.stringify(report, null, 2));

const failed = report.checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`[validate-api-security] FAIL ${failed.length}/${report.checks.length}`);
  process.exit(1);
}

console.log(`[validate-api-security] OK ${report.checks.length}/${report.checks.length}`);
