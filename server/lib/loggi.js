import { requireEnv } from "./env.js";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function loggiBaseUrl() {
  return String(process.env.LOGGI_API_URL || "https://stg.api.loggi.com").trim().replace(/\/+$/, "");
}

function parseExpiresInSeconds(value) {
  const raw = String(value || "").trim();
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : 3300;
}

export function moneyToCents(value = {}) {
  const units = Number(value.units || 0);
  const nanos = Number(value.nanos || 0);
  return Math.round(units * 100 + nanos / 10_000_000);
}

export function centsToLoggiMoney(cents) {
  const safe = Math.max(0, Math.round(Number(cents || 0)));
  return {
    currencyCode: "BRL",
    units: String(Math.floor(safe / 100)),
    nanos: (safe % 100) * 10_000_000
  };
}

export function loggiConfigured() {
  return missingLoggiRuntimeEnv({ includeServices: false, includeOrigin: false }).length === 0;
}

export function missingLoggiRuntimeEnv({ includeServices = true, includeOrigin = true } = {}) {
  const required = [
    "LOGGI_CLIENT_ID",
    "LOGGI_CLIENT_SECRET",
    "LOGGI_COMPANY_ID"
  ];
  if (includeServices) required.push("LOGGI_EXTERNAL_SERVICE_IDS");
  if (includeOrigin) {
    required.push(
      "LOGGI_ORIGIN_ADDRESS",
      "LOGGI_ORIGIN_NUMBER",
      "LOGGI_ORIGIN_NEIGHBORHOOD",
      "LOGGI_ORIGIN_ZIPCODE",
      "LOGGI_ORIGIN_CITY",
      "LOGGI_ORIGIN_STATE"
    );
  }
  return required.filter((name) => !String(process.env[name] || "").trim());
}

export function loggiQuoteConfigured() {
  return missingLoggiRuntimeEnv().length === 0;
}

export function loggiAuthConfigured() {
  return Boolean(
    String(process.env.LOGGI_CLIENT_ID || "").trim() &&
      String(process.env.LOGGI_CLIENT_SECRET || "").trim() &&
      String(process.env.LOGGI_COMPANY_ID || "").trim()
  );
}

export function loggiCompanyId() {
  return requireEnv("LOGGI_COMPANY_ID");
}

export function loggiExternalServiceIds() {
  return String(process.env.LOGGI_EXTERNAL_SERVICE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loggiOriginAddress() {
  return {
    correios: {
      logradouro: requireEnv("LOGGI_ORIGIN_ADDRESS"),
      numero: requireEnv("LOGGI_ORIGIN_NUMBER"),
      complemento: process.env.LOGGI_ORIGIN_COMPLEMENT || "",
      bairro: requireEnv("LOGGI_ORIGIN_NEIGHBORHOOD"),
      cep: requireEnv("LOGGI_ORIGIN_ZIPCODE").replace(/\D/g, ""),
      cidade: requireEnv("LOGGI_ORIGIN_CITY"),
      uf: requireEnv("LOGGI_ORIGIN_STATE").toUpperCase()
    }
  };
}

async function authenticateLoggi() {
  const response = await fetch(`${loggiBaseUrl()}/v2/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("LOGGI_CLIENT_ID"),
      client_secret: requireEnv("LOGGI_CLIENT_SECRET")
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`loggi_auth_error:${response.status}`);
    error.status = response.status;
    error.details = json;
    throw error;
  }
  const token = json.idToken;
  if (!token) throw new Error("loggi_auth_missing_token");
  const ttl = parseExpiresInSeconds(json.expiresIn);
  cachedToken = token;
  cachedTokenExpiresAt = Date.now() + Math.max(60, ttl - 60) * 1000;
  return token;
}

export async function getLoggiToken() {
  if (cachedToken && cachedTokenExpiresAt > Date.now()) return cachedToken;
  return authenticateLoggi();
}

export async function loggiFetch(path, opts = {}) {
  const token = await getLoggiToken();
  const response = await fetch(`${loggiBaseUrl()}${path}`, {
    ...opts,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`loggi_error:${response.status}`);
    error.status = response.status;
    error.details = json;
    throw error;
  }
  return json;
}
