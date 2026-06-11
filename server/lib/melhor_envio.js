import { requireEnv } from "./env.js";

export function melhorEnvioBaseUrl() {
  return String(process.env.MELHOR_ENVIO_API_URL || "https://sandbox.melhorenvio.com.br")
    .trim()
    .replace(/\/+$/, "");
}

export function missingMelhorEnvioRuntimeEnv({ hasAccessToken = false } = {}) {
  return [
    "MELHOR_ENVIO_ORIGIN_ZIPCODE"
  ]
    .filter((name) => !String(process.env[name] || "").trim())
    .concat(String(process.env.MELHOR_ENVIO_TOKEN || "").trim() || hasAccessToken ? [] : ["MELHOR_ENVIO_TOKEN_OR_OAUTH"]);
}

export function melhorEnvioOriginZipcode() {
  return requireEnv("MELHOR_ENVIO_ORIGIN_ZIPCODE").replace(/\D/g, "");
}

export function melhorEnvioServiceIds() {
  return String(process.env.MELHOR_ENVIO_SERVICE_IDS || "2,3,34")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function melhorEnvioUserAgent() {
  return String(process.env.MELHOR_ENVIO_USER_AGENT || "TECH7 (contato@tech7importados.com.br)").trim();
}

export function melhorEnvioClientId() {
  return String(process.env.MELHOR_ENVIO_CLIENT_ID || "").trim();
}

export function melhorEnvioClientSecret() {
  return String(process.env.MELHOR_ENVIO_CLIENT_SECRET || "").trim();
}

export function melhorEnvioRedirectUri() {
  return String(
    process.env.MELHOR_ENVIO_REDIRECT_URI ||
      "https://tech-7.vercel.app/api/shipping/melhor-envio/oauth/callback"
  ).trim();
}

export function melhorEnvioScopes() {
  const configured = String(process.env.MELHOR_ENVIO_SCOPES || "shipping-calculate").trim();
  return configured
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function missingMelhorEnvioOAuthEnv() {
  return [
    "MELHOR_ENVIO_CLIENT_ID",
    "MELHOR_ENVIO_CLIENT_SECRET",
    "MELHOR_ENVIO_REDIRECT_URI"
  ].filter((name) => !String(process.env[name] || "").trim());
}

export function melhorEnvioAuthorizationUrl(state) {
  const url = new URL("/oauth/authorize", melhorEnvioBaseUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requireEnv("MELHOR_ENVIO_CLIENT_ID"));
  url.searchParams.set("redirect_uri", melhorEnvioRedirectUri());
  const scopes = melhorEnvioScopes();
  scopes.forEach((scope, index) => {
    url.searchParams.set(`scope[${index}]`, scope);
  });
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function centsToReais(cents) {
  return Number((Math.max(0, Number(cents || 0)) / 100).toFixed(2));
}

export function decimalToCents(value) {
  const normalized = String(value ?? "0").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export async function melhorEnvioFetch(path, opts = {}) {
  const { accessToken, ...fetchOpts } = opts;
  const response = await fetch(`${melhorEnvioBaseUrl()}${path}`, {
    ...fetchOpts,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${String(accessToken || process.env.MELHOR_ENVIO_TOKEN || "").trim() || requireEnv("MELHOR_ENVIO_TOKEN")}`,
      "user-agent": melhorEnvioUserAgent(),
      ...(fetchOpts.headers || {})
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
    const error = new Error(`melhor_envio_error:${response.status}`);
    error.status = response.status;
    error.details = json;
    throw error;
  }
  return json;
}
