import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

export const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEARCH_INDEX_PATH = path.resolve(__dirname, "../../_assets/tech7/search-index.json");

let indexPromise = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function loadIndex() {
  if (!indexPromise) {
    indexPromise = fs
      .readFile(SEARCH_INDEX_PATH, "utf8")
      .then((raw) => JSON.parse(raw))
      .then((json) => (Array.isArray(json?.items) ? json.items : []))
      .catch(() => []);
  }
  return indexPromise;
}

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const brand = String(req.query.brand || req.query.marca || "").trim();
  const category = String(req.query.category || req.query.categoria || "").trim();
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 48)));
  const words = normalize(q).split(/\s+/).filter(Boolean);

  const items = await loadIndex();
  const brandNorm = normalize(brand);
  const categoryNorm = normalize(category);

  const filtered = items
    .filter((item) => {
      if (brandNorm && normalize(item.brand) !== brandNorm) return false;
      if (categoryNorm && normalize(item.category) !== categoryNorm) return false;
      return true;
    })
    .filter((item) => {
      if (!words.length) return true;
      const haystack = normalize(
        item.keywords ||
          [item.title, item.description, item.brand, item.category, item.slug].join(" ")
      );
      return words.every((word) => haystack.includes(word));
    });

  res.json({
    q,
    brand: brand || null,
    category: category || null,
    count: filtered.length,
    items: filtered.slice(0, limit)
  });
});
