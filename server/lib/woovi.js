import { requireEnv } from "./env.js";

const DEFAULT_TIMEOUT_MS = 15_000;

function wooviBaseUrl() {
  const configured = String(process.env.WOOVI_API_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "production"
    ? "https://api.woovi.com"
    : "https://api.woovi-sandbox.com";
}

function authHeader() {
  const appId = requireEnv("WOOVI_APP_ID");
  return appId.toLowerCase().startsWith("bearer ") ? appId : appId;
}

export async function wooviFetch(path, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(opts.timeoutMs || DEFAULT_TIMEOUT_MS));

  try {
    const res = await fetch(`${wooviBaseUrl()}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        Authorization: authHeader(),
        "content-type": "application/json",
        ...(opts.headers || {})
      }
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const error = new Error(`woovi_error:${res.status}`);
      error.status = res.status;
      error.details = json;
      throw error;
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeWooviPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
