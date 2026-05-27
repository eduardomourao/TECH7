export const MIN_VALID_PRICE_CENTS = 200;

export function priceToCents(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
  }

  const str = String(value || "").trim().replace(/[^\d,.-]/g, "");
  const normalized = str.includes(",") ? str.replace(/\./g, "").replace(",", ".") : str;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

export function isValidPriceCents(value) {
  return Number(value || 0) >= MIN_VALID_PRICE_CENTS;
}

export async function resolveCatalogPrice(input = {}) {
  const priceCents = Number(input.price_cents || 0);
  const valid = isValidPriceCents(priceCents);
  return {
    found: !!input.id || !!input.slug,
    price_cents: Number.isFinite(priceCents) ? Math.max(0, Math.round(priceCents)) : 0,
    section: input.section || input.secao || "",
    brand: input.brand || input.marca || "",
    slug: input.slug || "",
    price_available: valid,
    price_status: valid ? "available" : "consult"
  };
}

export async function applyCatalogPrice(row) {
  const price = await resolveCatalogPrice(row || {});
  return {
    ...row,
    price_cents: price.price_cents,
    price_available: price.price_available,
    price_status: price.price_status
  };
}

export async function applyCatalogPrices(rows) {
  return Promise.all((rows || []).map((row) => applyCatalogPrice(row)));
}
