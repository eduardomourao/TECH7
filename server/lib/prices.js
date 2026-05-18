import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRICE_PATH = path.resolve(__dirname, "../../precos.json");

export const MIN_VALID_PRICE_CENTS = 200;

let priceDataPromise = null;

export function normalizePriceSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

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

async function loadPriceData() {
  if (!priceDataPromise) {
    priceDataPromise = fs.readFile(PRICE_PATH, "utf8")
      .then((raw) => JSON.parse(raw))
      .catch((error) => {
        priceDataPromise = null;
        throw error;
      });
  }
  return priceDataPromise;
}

export async function resolveCatalogPrice(input = {}) {
  const data = await loadPriceData();
  const section = normalizePriceSegment(input.section || input.secao);
  const brand = normalizePriceSegment(input.brand || input.marca);
  const slug = normalizePriceSegment(input.slug);

  if (!data || !slug) {
    return { found: false, price_cents: 0, section, brand, slug, price_available: false, price_status: "consult" };
  }

  let rawPrice;
  let foundSection = section;
  let foundBrand = brand;

  if (section && brand && data[section]?.[brand] && typeof data[section][brand][slug] !== "undefined") {
    rawPrice = data[section][brand][slug];
  }

  if (typeof rawPrice === "undefined" && section && data[section]) {
    for (const candidateBrand of Object.keys(data[section])) {
      if (typeof data[section]?.[candidateBrand]?.[slug] !== "undefined") {
        rawPrice = data[section][candidateBrand][slug];
        foundBrand = candidateBrand;
        break;
      }
    }
  }

  if (typeof rawPrice === "undefined") {
    for (const candidateSection of Object.keys(data)) {
      const brands = data[candidateSection] || {};
      for (const candidateBrand of Object.keys(brands)) {
        if (typeof brands[candidateBrand]?.[slug] !== "undefined") {
          rawPrice = brands[candidateBrand][slug];
          foundSection = candidateSection;
          foundBrand = candidateBrand;
          break;
        }
      }
      if (typeof rawPrice !== "undefined") break;
    }
  }

  const priceCents = priceToCents(rawPrice);
  const valid = typeof rawPrice !== "undefined" && isValidPriceCents(priceCents);

  return {
    found: valid,
    price_cents: valid ? priceCents : 0,
    section: foundSection,
    brand: foundBrand,
    slug,
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
