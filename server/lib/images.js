export function normalizePublicImageUrl(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw || raw === "undefined" || raw === "null") return "";

  const assetIndex = raw.indexOf("_assets/");
  if (assetIndex >= 0) return `/${raw.slice(assetIndex).replace(/^\/+/, "")}`;

  if (/^\/_assets\//i.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (/images\.tcdn\.com\.br$/i.test(url.hostname)) {
      return `/_assets/images.tcdn.com.br${url.pathname}`;
    }
    return raw;
  } catch (_err) {
    return raw;
  }
}
