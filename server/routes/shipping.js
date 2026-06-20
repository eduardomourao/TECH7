import express from "express";
import crypto from "node:crypto";
import { pool } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { applyCatalogPrices, isValidPriceCents } from "../lib/prices.js";
import {
  centsToLoggiMoney,
  loggiCompanyId,
  loggiExternalServiceIds,
  loggiFetch,
  loggiOriginAddress,
  moneyToCents,
  missingLoggiRuntimeEnv
} from "../lib/loggi.js";
import {
  centsToReais,
  decimalToCents,
  melhorEnvioAuthorizationUrl,
  melhorEnvioBaseUrl,
  melhorEnvioClientId,
  melhorEnvioClientSecret,
  melhorEnvioFetch,
  melhorEnvioOriginZipcode,
  melhorEnvioRedirectUri,
  melhorEnvioServiceIds,
  melhorEnvioScopes,
  missingMelhorEnvioOAuthEnv,
  missingMelhorEnvioRuntimeEnv
} from "../lib/melhor_envio.js";

export const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signOAuthState(payload) {
  const secret = melhorEnvioClientSecret() || process.env.SESSION_SECRET || "tech7-melhor-envio-dev";
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createOAuthState() {
  const payload = base64Url(JSON.stringify({
    nonce: crypto.randomBytes(16).toString("hex"),
    ts: Date.now()
  }));
  return `${payload}.${signOAuthState(payload)}`;
}

function verifyOAuthState(state) {
  const value = cleanText(state, 500);
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = signOAuthState(payload);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const ageMs = Date.now() - Number(decoded.ts || 0);
    return ageMs >= 0 && ageMs <= 15 * 60 * 1000;
  } catch {
    return false;
  }
}

async function ensureOAuthTokenTable() {
  await pool.query(`
    create table if not exists provider_oauth_tokens (
      provider text primary key,
      access_token text not null,
      refresh_token text,
      token_type text,
      scope text,
      expires_at timestamptz,
      refresh_expires_at timestamptz,
      raw_json jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

function tokenExpiryDate(expiresIn, fallbackSeconds = 30 * 24 * 60 * 60) {
  const seconds = Number(expiresIn || fallbackSeconds);
  return new Date(Date.now() + Math.max(60, seconds) * 1000);
}

async function saveMelhorEnvioOAuthToken(token, previous = {}) {
  const accessToken = cleanText(token.access_token, 5000);
  if (!accessToken) throw new Error("melhor_envio_missing_access_token");
  const refreshToken = cleanText(token.refresh_token || previous.refresh_token || "", 5000) || null;
  await ensureOAuthTokenTable();
  await pool.query(
    `
      insert into provider_oauth_tokens (
        provider, access_token, refresh_token, token_type, scope,
        expires_at, refresh_expires_at, raw_json, updated_at
      )
      values ('melhor_envio', $1, $2, $3, $4, $5, $6, $7, now())
      on conflict (provider) do update set
        access_token = excluded.access_token,
        refresh_token = coalesce(excluded.refresh_token, provider_oauth_tokens.refresh_token),
        token_type = excluded.token_type,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        refresh_expires_at = excluded.refresh_expires_at,
        raw_json = excluded.raw_json,
        updated_at = now()
    `,
    [
      accessToken,
      refreshToken,
      cleanText(token.token_type || "Bearer", 40),
      Array.isArray(token.scope) ? token.scope.join(" ") : cleanText(token.scope || melhorEnvioScopes().join(" "), 500),
      tokenExpiryDate(token.expires_in),
      token.refresh_expires_in
        ? tokenExpiryDate(token.refresh_expires_in)
        : new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      JSON.stringify({ ...token, access_token: "***", refresh_token: token.refresh_token ? "***" : undefined })
    ]
  );
}

async function readStoredMelhorEnvioToken() {
  await ensureOAuthTokenTable();
  const { rows } = await pool.query(
    `
      select access_token, refresh_token, token_type, scope, expires_at, refresh_expires_at, updated_at
      from provider_oauth_tokens
      where provider = 'melhor_envio'
      limit 1
    `
  );
  return rows[0] || null;
}

async function exchangeMelhorEnvioToken(params) {
  const response = await fetch(`${melhorEnvioBaseUrl()}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`melhor_envio_oauth_error:${response.status}`);
    error.status = response.status;
    error.details = json;
    throw error;
  }
  return json;
}

async function refreshStoredMelhorEnvioToken(current) {
  if (!current?.refresh_token) return null;
  const token = await exchangeMelhorEnvioToken({
    grant_type: "refresh_token",
    client_id: melhorEnvioClientId(),
    client_secret: melhorEnvioClientSecret(),
    refresh_token: current.refresh_token
  });
  await saveMelhorEnvioOAuthToken(token, current);
  return readStoredMelhorEnvioToken();
}

async function resolveMelhorEnvioAccessToken({ allowRefresh = true } = {}) {
  const envToken = String(process.env.MELHOR_ENVIO_TOKEN || "").trim();
  if (envToken) return { accessToken: envToken, source: "env" };
  const current = await readStoredMelhorEnvioToken().catch(() => null);
  if (!current?.access_token) return null;
  const expiresAt = current.expires_at ? new Date(current.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now() + 2 * 60 * 1000) {
    return { accessToken: current.access_token, source: "oauth", token: current };
  }
  if (!allowRefresh) return { accessToken: current.access_token, source: "oauth_expired", token: current };
  const refreshed = await refreshStoredMelhorEnvioToken(current).catch(() => null);
  if (refreshed?.access_token) return { accessToken: refreshed.access_token, source: "oauth_refreshed", token: refreshed };
  return { accessToken: current.access_token, source: "oauth_expired", token: current };
}

async function melhorEnvioApiFetch(path, opts = {}) {
  const resolved = await resolveMelhorEnvioAccessToken();
  if (!resolved?.accessToken) {
    const error = new Error("melhor_envio_missing_access_token");
    error.code = "missing_access_token";
    throw error;
  }
  try {
    return await melhorEnvioFetch(path, { ...opts, accessToken: resolved.accessToken });
  } catch (error) {
    if (![401, 403].includes(Number(error.status))) throw error;
    const refreshed = await resolveMelhorEnvioAccessToken({ allowRefresh: true });
    if (!refreshed?.accessToken || refreshed.accessToken === resolved.accessToken) throw error;
    return melhorEnvioFetch(path, { ...opts, accessToken: refreshed.accessToken });
  }
}

function normalizeDestination(input = {}) {
  const zipcode = String(input.cep || input.zipcode || "").replace(/\D/g, "");
  return {
    zipcode,
    address: cleanText(input.logradouro || input.address),
    number: cleanText(input.numero || input.number, 20),
    complement: cleanText(input.complemento || input.complement),
    neighborhood: cleanText(input.bairro || input.neighborhood, 80),
    city: cleanText(input.cidade || input.city, 80),
    state: cleanText(input.estado || input.state, 2).toUpperCase()
  };
}

function destinationToLoggi(destination) {
  return {
    correios: {
      logradouro: destination.address,
      numero: destination.number,
      complemento: destination.complement || "",
      bairro: destination.neighborhood,
      cep: destination.zipcode,
      cidade: destination.city,
      uf: destination.state
    }
  };
}

function buildPackage(subtotalCents) {
  return {
    weightG: Number(process.env.LOGGI_DEFAULT_WEIGHT_G || 500),
    lengthCm: Number(process.env.LOGGI_DEFAULT_LENGTH_CM || 20),
    widthCm: Number(process.env.LOGGI_DEFAULT_WIDTH_CM || 15),
    heightCm: Number(process.env.LOGGI_DEFAULT_HEIGHT_CM || 8),
    goodsValue: centsToLoggiMoney(subtotalCents)
  };
}

function loggiReadinessPayload() {
  const missingConfig = missingLoggiRuntimeEnv();
  const externalServiceIds = loggiExternalServiceIds();
  const webhookConfigured = Boolean(
    String(process.env.LOGGI_WEBHOOK_AUTHORIZATION || "").trim() ||
      (String(process.env.LOGGI_WEBHOOK_USERNAME || "").trim() && String(process.env.LOGGI_WEBHOOK_PASSWORD || "").trim())
  );
  return {
    provider: "loggi",
    ready: missingConfig.length === 0,
    missingConfig,
    externalServiceCount: externalServiceIds.length,
    autoCreateShipment: process.env.LOGGI_AUTO_CREATE_SHIPMENT !== "false",
    webhookConfigured,
    labelResponseType: process.env.LOGGI_LABEL_RESPONSE_TYPE || "LABEL_RESPONSE_TYPE_URL",
    apiHost: String(process.env.LOGGI_API_URL || "https://stg.api.loggi.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  };
}

function normalizeQuoteOptions(loggiResponse) {
  const packageQuote = Array.isArray(loggiResponse?.packagesQuotations)
    ? loggiResponse.packagesQuotations[0] || {}
    : {};
  const quotations = Array.isArray(packageQuote.quotations) ? packageQuote.quotations : [];
  return quotations
    .map((quote) => {
      const priceCents = moneyToCents(quote?.price?.totalAmount);
      const serviceId = String(quote.externalServiceId || quote.external_service_id || quote.freightType || "").trim();
      return {
        serviceId,
        label: quote.freightTypeLabel || quote.freightType || "Loggi",
        freightType: quote.freightType || "",
        pickupType: quote.pickupType || quote.pickup_type || "",
        priceCents,
        price: Number((priceCents / 100).toFixed(2)),
        sloInDays: Number.isFinite(Number(quote.sloInDays)) ? Number(quote.sloInDays) : null
      };
    })
    .filter((option) => option.serviceId && option.priceCents >= 0);
}

function buildMelhorEnvioProducts(items) {
  return items.map((item) => ({
    id: String(item.product_id),
    width: Number(process.env.MELHOR_ENVIO_DEFAULT_WIDTH_CM || 15),
    height: Number(process.env.MELHOR_ENVIO_DEFAULT_HEIGHT_CM || 8),
    length: Number(process.env.MELHOR_ENVIO_DEFAULT_LENGTH_CM || 20),
    weight: Number(process.env.MELHOR_ENVIO_DEFAULT_WEIGHT_KG || 0.5),
    insurance_value: centsToReais(item.price_cents),
    quantity: Number(item.qty)
  }));
}

function normalizeMelhorEnvioOptions(response) {
  const allowedServiceIds = new Set(melhorEnvioServiceIds());
  return (Array.isArray(response) ? response : [])
    .filter((quote) => {
      const rawPrice = quote.custom_price ?? quote.price;
      return !quote.error && rawPrice !== null && rawPrice !== undefined && String(rawPrice).trim() !== "";
    })
    .map((quote) => {
      const priceCents = decimalToCents(quote.custom_price ?? quote.price);
      const company = quote.company?.name || "Melhor Envio";
      const service = quote.name || quote.service || `Servico ${quote.id}`;
      const serviceId = String(quote.id || "");
      const publicLabel =
        serviceId === "3" ? "Jadlog" :
        serviceId === "34" ? "Loggi" :
        `${company} - ${service}`;
      return {
        serviceId,
        label: publicLabel,
        company,
        service,
        priceCents,
        price: Number((priceCents / 100).toFixed(2)),
        sloInDays: Number.isFinite(Number(quote.custom_delivery_time ?? quote.delivery_time))
          ? Number(quote.custom_delivery_time ?? quote.delivery_time)
          : null
      };
    })
    .filter((option) => option.serviceId && priceOptionAllowed(option, allowedServiceIds));
}

function priceOptionAllowed(option, allowedServiceIds) {
  return option.priceCents >= 0 && (!allowedServiceIds.size || allowedServiceIds.has(option.serviceId));
}

async function melhorEnvioReadinessPayload() {
  const resolved = await resolveMelhorEnvioAccessToken({ allowRefresh: false }).catch(() => null);
  const missingConfig = missingMelhorEnvioRuntimeEnv({ hasAccessToken: Boolean(resolved?.accessToken) });
  const serviceIds = melhorEnvioServiceIds();
  const missingOAuthConfig = missingMelhorEnvioOAuthEnv();
  return {
    provider: "melhor_envio",
    ready: missingConfig.length === 0,
    missingConfig,
    authSource: resolved?.source || "missing",
    oauthConfigured: missingOAuthConfig.length === 0,
    missingOAuthConfig,
    authorizeUrl: missingOAuthConfig.length === 0 ? "/api/shipping/melhor-envio/oauth/authorize" : null,
    serviceCount: serviceIds.length,
    quoteOnly: true,
    apiHost: melhorEnvioBaseUrl().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  };
}

async function loadPricedItems(items) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item.productId || item.id || "").trim(),
      qty: Math.max(1, Number.parseInt(item.qty || item.quantity || 1, 10) || 1)
    }))
    .filter((item) => item.product_id);
  if (!normalized.length) return [];

  const ids = [...new Set(normalized.map((item) => item.product_id))];
  const { rows } = await pool.query(
    `
      select id as product_id, slug, brand, section, price_cents, currency
      from products
      where id = any($1::text[]) and active = true
    `,
    [ids]
  );
  const priced = await applyCatalogPrices(rows);
  const byId = new Map(priced.map((row) => [row.product_id, row]));
  return normalized.map((item) => ({ ...byId.get(item.product_id), ...item })).filter((item) => item.product_id);
}

router.post("/loggi/quote", asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const missingConfig = missingLoggiRuntimeEnv();
  if (missingConfig.length) {
    return res.status(503).json({
      error: "shipping_provider_not_configured",
      provider: "loggi",
      missingConfig,
      message: "Frete Loggi nao configurado no servidor"
    });
  }

  const destination = normalizeDestination(req.body?.destination || req.body?.shipping || {});
  if (destination.zipcode.length !== 8 || !destination.address || !destination.number || !destination.city || destination.state.length !== 2) {
    return res.status(400).json({ error: "invalid_destination" });
  }

  const items = await loadPricedItems(req.body?.items || []);
  if (!items.length) return res.status(400).json({ error: "cart_empty" });
  if (items.some((item) => !isValidPriceCents(item.price_cents))) return res.status(400).json({ error: "invalid_product_price" });

  const currency = items[0].currency || "BRL";
  if (items.some((item) => (item.currency || "BRL") !== currency)) return res.status(400).json({ error: "mixed_currency" });

  const subtotalCents = items.reduce((sum, item) => sum + Number(item.price_cents) * Number(item.qty), 0);
  const externalServiceIds = loggiExternalServiceIds();

  const pack = buildPackage(subtotalCents);
  const payload = {
    shipFrom: loggiOriginAddress(),
    shipTo: destinationToLoggi(destination),
    packages: [pack],
    externalServiceIds
  };

  const loggiResponse = await loggiFetch(`/v1/companies/${encodeURIComponent(loggiCompanyId())}/quotations`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const options = normalizeQuoteOptions(loggiResponse);
  if (!options.length) return res.status(422).json({ error: "shipping_unavailable", provider: "loggi" });

  const quoteId = newId("shipq");
  const selected = options[0];
  await pool.query(
    `
      insert into shipping_quotes (
        id, provider, currency, subtotal_cents, destination_json, packages_json,
        options_json, selected_service_id, selected_price_cents, selected_label,
        raw_json, expires_at
      )
      values ($1, 'loggi', $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval '30 minutes')
    `,
    [
      quoteId,
      currency,
      subtotalCents,
      JSON.stringify(destination),
      JSON.stringify([pack]),
      JSON.stringify(options),
      selected.serviceId,
      selected.priceCents,
      selected.label,
      JSON.stringify(loggiResponse)
    ]
  );

  res.status(201).json({
    quoteId,
    provider: "loggi",
    expiresInSeconds: 1800,
    options,
    selectedServiceId: selected.serviceId
  });
}));

router.get("/loggi/readiness", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const payload = loggiReadinessPayload();
  res.status(payload.ready ? 200 : 503).json(payload);
});

router.get("/melhor-envio/readiness", asyncRoute(async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const payload = await melhorEnvioReadinessPayload();
  res.status(payload.ready ? 200 : 503).json(payload);
}));

router.get("/melhor-envio/oauth/authorize", asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const missing = missingMelhorEnvioOAuthEnv();
  if (missing.length) {
    return res.status(503).json({
      error: "melhor_envio_oauth_not_configured",
      missingConfig: missing
    });
  }
  const state = createOAuthState();
  const authorizeUrl = melhorEnvioAuthorizationUrl(state);
  if (String(req.query?.redirect || "1") === "0") {
    return res.json({
      provider: "melhor_envio",
      authorizeUrl,
      redirectUri: melhorEnvioRedirectUri(),
      scopes: melhorEnvioScopes()
    });
  }
  res.redirect(302, authorizeUrl);
}));

router.get("/melhor-envio/oauth/callback", asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const errorParam = cleanText(req.query?.error, 120);
  if (errorParam) {
    return res.status(400).send(`<!doctype html><html lang="pt-br"><meta charset="utf-8"><title>Melhor Envio</title><body><h1>Autorizacao recusada</h1><p>${escapeHtml(errorParam)}</p></body></html>`);
  }

  const code = cleanText(req.query?.code, 1000);
  const state = cleanText(req.query?.state, 500);
  if (!code) return res.status(400).json({ error: "missing_code" });
  if (process.env.MELHOR_ENVIO_OAUTH_STATE_DISABLED !== "true" && !verifyOAuthState(state)) {
    return res.status(400).json({ error: "invalid_state" });
  }

  const missing = missingMelhorEnvioOAuthEnv();
  if (missing.length) return res.status(503).json({ error: "melhor_envio_oauth_not_configured", missingConfig: missing });

  const token = await exchangeMelhorEnvioToken({
    grant_type: "authorization_code",
    client_id: melhorEnvioClientId(),
    client_secret: melhorEnvioClientSecret(),
    redirect_uri: melhorEnvioRedirectUri(),
    code
  });
  await saveMelhorEnvioOAuthToken(token);

  res.send(`<!doctype html>
<html lang="pt-br">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Melhor Envio autorizado</title>
  <body style="font-family:Arial,sans-serif;margin:40px;line-height:1.5;color:#17212b">
    <h1>Melhor Envio autorizado</h1>
    <p>Token salvo com seguranca no servidor. Checkout ja pode calcular frete usando Melhor Envio.</p>
    <p><a href="/api/shipping/melhor-envio/readiness">Ver status</a> &middot; <a href="/checkout">Abrir checkout</a></p>
  </body>
</html>`);
}));

router.post("/melhor-envio/quote", asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const resolvedToken = await resolveMelhorEnvioAccessToken({ allowRefresh: true }).catch(() => null);
  const missingConfig = missingMelhorEnvioRuntimeEnv({ hasAccessToken: Boolean(resolvedToken?.accessToken) });
  if (missingConfig.length) {
    return res.status(503).json({
      error: "shipping_provider_not_configured",
      provider: "melhor_envio",
      missingConfig,
      message: "Melhor Envio nao configurado no servidor"
    });
  }

  const destination = normalizeDestination(req.body?.destination || req.body?.shipping || {});
  if (destination.zipcode.length !== 8) return res.status(400).json({ error: "invalid_destination" });

  const items = await loadPricedItems(req.body?.items || []);
  if (!items.length) return res.status(400).json({ error: "cart_empty" });
  if (items.some((item) => !isValidPriceCents(item.price_cents))) return res.status(400).json({ error: "invalid_product_price" });

  const currency = items[0].currency || "BRL";
  if (items.some((item) => (item.currency || "BRL") !== currency)) return res.status(400).json({ error: "mixed_currency" });

  const subtotalCents = items.reduce((sum, item) => sum + Number(item.price_cents) * Number(item.qty), 0);
  const products = buildMelhorEnvioProducts(items);
  const serviceIds = melhorEnvioServiceIds();
  const payload = {
    from: { postal_code: melhorEnvioOriginZipcode() },
    to: { postal_code: destination.zipcode },
    products,
    options: {
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: true
    }
  };
  if (serviceIds.length) payload.services = serviceIds.join(",");

  const providerResponse = await melhorEnvioApiFetch("/api/v2/me/shipment/calculate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const options = normalizeMelhorEnvioOptions(providerResponse);
  if (!options.length) return res.status(422).json({ error: "shipping_unavailable", provider: "melhor_envio" });

  const quoteId = newId("shipq");
  const selected = options[0];
  await pool.query(
    `
      insert into shipping_quotes (
        id, provider, currency, subtotal_cents, destination_json, packages_json,
        options_json, selected_service_id, selected_price_cents, selected_label,
        raw_json, expires_at
      )
      values ($1, 'melhor_envio', $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval '30 minutes')
    `,
    [
      quoteId,
      currency,
      subtotalCents,
      JSON.stringify(destination),
      JSON.stringify(products),
      JSON.stringify(options),
      selected.serviceId,
      selected.priceCents,
      selected.label,
      JSON.stringify(providerResponse)
    ]
  );

  res.status(201).json({
    quoteId,
    provider: "melhor_envio",
    expiresInSeconds: 1800,
    options,
    selectedServiceId: selected.serviceId
  });
}));
