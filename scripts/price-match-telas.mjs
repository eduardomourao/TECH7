import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pool } from "../server/lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const artifactsDir = path.join(root, "artifacts");
const sheetPath = path.join(artifactsDir, "tabela_precos_venda_telas.xlsx");
const parsedSheetPath = path.join(artifactsDir, ".price-table-parsed.json");
const prefixArg = process.argv.find((arg) => arg.startsWith("--prefix="));
const outputPrefix = prefixArg ? prefixArg.slice("--prefix=".length).replace(/[^a-z0-9_-]/gi, "-") : "";
const previewPath = outputPrefix
  ? path.join(artifactsDir, `${outputPrefix}-update-preview.csv`)
  : path.join(artifactsDir, "price-update-preview.csv");
const siteNoMatchPath = outputPrefix
  ? path.join(artifactsDir, `${outputPrefix}-produtos-site-sem-match.csv`)
  : path.join(artifactsDir, "produtos-site-sem-match.csv");
const tableUnusedPath = outputPrefix
  ? path.join(artifactsDir, `${outputPrefix}-produtos-tabela-sem-match.csv`)
  : path.join(artifactsDir, "produtos-tabela-sem-match.csv");
const reportPath = outputPrefix
  ? path.join(artifactsDir, `${outputPrefix}-report.json`)
  : path.join(artifactsDir, "price-match-report.json");
const snapshotPath = path.join(artifactsDir, ".price-match-before-snapshot.json");
const applyMode = process.argv.includes("--apply");

const PYTHON = process.env.CODEX_BUNDLED_PYTHON
  || path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");

const GENERIC_TOKENS = new Set([
  "tela", "display", "lcd", "original", "tech", "peca", "pecas", "celular", "para",
  "modelo", "modulo", "frontal", "touch", "screen", "tablet", "completo", "completa",
  "troca", "ci", "nao", "sem", "com", "aro", "preta", "borda", "retirada", "qualidade",
  "alta", "reposicao", "lente", "main", "flex", "wf", "tft", "hd", "dd", "gx", "sl",
  "amoled", "polegadas", "pol", "pecas", "aparelho", "aparelhos", "troca_ci",
  "em", "juros", "oferta", "estoque", "preco", "melhor"
]);

const BRAND_ALIASES = new Map([
  ["apple", "apple"], ["iphone", "apple"], ["ipad", "apple"], ["iph", "apple"],
  ["samsung", "samsung"], ["sam", "samsung"], ["galaxy", "samsung"],
  ["motorola", "motorola"], ["moto", "motorola"],
  ["xiaomi", "xiaomi"], ["redmi", "xiaomi"], ["poco", "xiaomi"], ["mi", "xiaomi"],
  ["realme", "realme"],
  ["lg", "lg"],
  ["nokia", "nokia"],
  ["asus", "asus"],
  ["infinix", "infinix"]
]);

const CRITICAL_GROUPS = {
  aro: ["com_aro", "sem_aro"],
  network: ["4g", "5g"],
  tech: ["oled", "vivid", "incel", "nacional", "jk", "premium", "amoled"],
  retirada: ["retirada", "troca_ci"],
  borda: ["borda_preta"]
};

const MOTOROLA_5G_MODELS_WITH_OPTIONAL_TABLE_NETWORK = new Set([
  "g34", "g35", "g54", "g56", "g62", "g64", "g73", "g75", "g85", "g200"
]);
const WEAK_SINGLE_MODEL_TOKENS = new Set(["one", "redmi", "note", "edge", "poco", "mi", "galaxy", "plus", "pro", "max", "lite", "ultra", "power"]);
const BLOCKING_EXTRA_MODEL_TOKENS = new Set([
  "se", "prime", "plus", "pro", "pro_max", "max", "lite", "ultra", "core", "power",
  "note", "neo", "fusion", "action", "vision", "hyper"
]);

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&acirc;/gi, "a")
    .replace(/&ecirc;/gi, "e")
    .replace(/&ocirc;/gi, "o")
    .replace(/&ccedil;/gi, "c")
    .replace(/&atilde;/gi, "a")
    .replace(/&otilde;/gi, "o")
    .replace(/&aacute;/gi, "a")
    .replace(/&eacute;/gi, "e")
    .replace(/&iacute;/gi, "i")
    .replace(/&oacute;/gi, "o")
    .replace(/&uacute;/gi, "u")
    .replace(/&amp;/gi, " e ")
    .replace(/&#\d+;/g, " ");
}

function stripAccents(value) {
  return decodeHtml(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeBase(value) {
  let text = stripAccents(value).toLowerCase();
  text = text
    .replace(/\btech\s*7\b/g, " tech ")
    .replace(/\b\d+[,.]\d+\b/g, " ")
    .replace(/\bc\s*\/\s*a\b|\bc\s*-\s*aro\b|\bc\s+aro\b|\bca\b|\bcaro\b/g, " com_aro ")
    .replace(/\bs\s*\/\s*a\b|\bs\s*-\s*aro\b|\bs\s+aro\b|\bsa\b|\bsaro\b/g, " sem_aro ")
    .replace(/\bcom\s+aro\b/g, " com_aro ")
    .replace(/\bsem\s+aro\b/g, " sem_aro ")
    .replace(/\bborda\s+preta\b/g, " borda_preta ")
    .replace(/\bpro\s+max\b/g, " pro_max ")
    .replace(/\btroca\s+ci\b/g, " troca_ci ")
    .replace(/\bincell\b|\bincel\b|\binc\b/g, " incel ")
    .replace(/\bnac\b|\bncn\b|\bnsn\b|\bnacional\b/g, " nacional ")
    .replace(/\bvivid\b|\bvmd\b|\bvivio\b/g, " vivid ")
    .replace(/\boled\b|\boleo\b|\bold\b/g, " oled ")
    .replace(/\bamoled\b/g, " amoled ");
  text = text.replace(/[^a-z0-9_+\/]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function tokenize(value) {
  const base = normalizeBase(value);
  return base ? base.split(" ").filter(Boolean) : [];
}

function detectBrand(tokens, fallback = "") {
  const normalizedFallback = normalizeBase(fallback);
  if (BRAND_ALIASES.has(normalizedFallback)) return BRAND_ALIASES.get(normalizedFallback);
  for (const token of tokens) {
    if (BRAND_ALIASES.has(token)) return BRAND_ALIASES.get(token);
  }
  return "";
}

function expandSlashTokens(tokens) {
  const expanded = [];
  for (const token of tokens) {
    const slashNormalized = token.replace(/\/+/g, "/");
    if (/^[a-z0-9]+(\/[a-z0-9]+)+$/i.test(slashNormalized)) {
      expanded.push(...slashNormalized.split("/").filter(Boolean));
    } else if (/^(?:[a-z]+\d+[a-z]*){2,}$/i.test(token)) {
      expanded.push(...(token.match(/[a-z]+\d+[a-z]*/gi) || [token]));
    } else {
      expanded.push(token);
    }
  }
  return expanded;
}

function canonicalToken(token, contextTokens) {
  let t = token.toLowerCase();
  if (contextTokens.includes("iphone") && /^(\d+)g$/.test(t)) t = t.replace(/g$/, "");
  if (/^sm_?/.test(t)) t = t.replace(/^sm_?/, "");
  return t;
}

function isAuxiliaryModelCode(token, brand) {
  if (/^xt\d/.test(token) || /^rmx\d/.test(token) || /^x\d{3}/.test(token) || /^lm/.test(token)) return true;
  if (brand === "samsung") {
    if (/^[afgmnst]\d{3,4}[a-z]*$/.test(token)) return true;
    if (/^sm_?[afgmnst]?\d{3,4}[a-z]*$/.test(token)) return true;
  }
  if (brand === "apple" && /^a\d{4}$/i.test(token)) return true;
  if (brand === "lg" && (/^[kx]\d{3,4}[a-z]*$/.test(token) || /^lm/.test(token))) return true;
  if (brand === "xiaomi" && /^\d{4,}[a-z0-9]*$/.test(token)) return true;
  return false;
}

function modelTokens(tokens, brand = "") {
  const expanded = expandSlashTokens(tokens);
  const out = [];
  for (let i = 0; i < expanded.length; i += 1) {
    let token = canonicalToken(expanded[i], expanded);
    if (!token || GENERIC_TOKENS.has(token)) continue;
    if (brand === "motorola") {
      if (token === "pow") token = "power";
      if (token === "lit") token = "lite";
      if (token === "fus") token = "fusion";
      if (token === "o") token = "one";
    }
    const previousToken = i > 0 ? canonicalToken(expanded[i - 1], expanded) : "";
    if (/^\d+$/.test(token) && previousToken && isAuxiliaryModelCode(previousToken, brand)) continue;
    if (/^\d+x$/.test(token)) continue;
    if (brand === "apple" && (token === "se" || /^20(20|22)$/.test(token))) continue;
    if (BRAND_ALIASES.has(token) && token !== "redmi" && token !== "poco" && token !== "iphone") continue;
    if (Object.values(CRITICAL_GROUPS).flat().includes(token)) continue;
    if (isAuxiliaryModelCode(token, brand)) continue;
    out.push(token);
  }
  return Array.from(new Set(out));
}

function detectCritical(tokens) {
  const set = new Set(tokens);
  const detected = {};
  for (const [group, values] of Object.entries(CRITICAL_GROUPS)) {
    detected[group] = values.filter((value) => set.has(value));
  }
  return detected;
}

function hasAnyCritical(tokens) {
  const detected = detectCritical(tokens);
  return Object.values(detected).some((values) => values.length > 0);
}

function orderedTokenKey(tokens) {
  return Array.from(new Set(tokens)).sort().join(" ");
}

function hasKnownMotorola5GModel(analysis) {
  if (analysis.brand !== "motorola") return false;
  return analysis.important.some((token) => MOTOROLA_5G_MODELS_WITH_OPTIONAL_TABLE_NETWORK.has(token));
}

function analyze(value, fallbackBrand = "", slug = "") {
  const combined = [value, slug].filter(Boolean).join(" ");
  const tokens = tokenize(combined);
  const nameTokens = tokenize(value);
  const criticalTokens = hasAnyCritical(nameTokens) ? nameTokens : tokens;
  const brand = detectBrand(tokens, fallbackBrand);
  const models = modelTokens(nameTokens.length ? nameTokens : tokens, brand);
  const critical = detectCritical(criticalTokens);
  const normalized = normalizeBase(value);
  const slugNormalized = normalizeBase(slug);
  return {
    original: String(value ?? ""),
    normalized,
    slugNormalized,
    tokens,
    tokenSet: new Set(tokens),
    important: models,
    importantKey: orderedTokenKey(models),
    brand,
    critical,
    sortedTokenKey: orderedTokenKey(tokens)
  };
}

function parseSalePrice(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { status: "empty", cents: null, value: null, text };
  if (/consultar/i.test(stripAccents(text))) return { status: "consultar", cents: null, value: null, text };
  const cleaned = text.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return { status: "invalid", cents: null, value: null, text };
  return { status: "numeric", cents: Math.round(value * 100), value, text };
}

function hasConflict(a, b) {
  const conflicts = [];
  for (const group of Object.keys(CRITICAL_GROUPS)) {
    const av = a.critical[group] || [];
    const bv = b.critical[group] || [];
    const missingFromTable = av.filter((value) => !bv.includes(value));
    const missingFromProduct = bv.filter((value) => !av.includes(value));
    const acceptableTechSuperset = group === "tech"
      && av.includes("jk")
      && missingFromProduct.length
      && missingFromProduct.every((value) => value === "vivid")
      && !missingFromTable.length;
    const acceptableAppleTech = group === "tech"
      && a.brand === "apple"
      && b.brand === "apple"
      && (
        (av.includes("jk") && bv.includes("jk") && bv.every((value) => value === "vivid" || value === "jk"))
        || (av.includes("vivid") && bv.every((value) => value === "vivid" || value === "jk"))
        || (av.includes("oled") && bv.includes("oled") && missingFromProduct.every((value) => value === "vivid"))
      );
    const acceptableAppleTrocaCi = group === "retirada"
      && a.brand === "apple"
      && b.brand === "apple"
      && av.includes("troca_ci")
      && !bv.includes("retirada")
      && missingFromTable.every((value) => value === "troca_ci")
      && !missingFromProduct.length;
    if (av.length && bv.length && !acceptableTechSuperset && !acceptableAppleTech && (missingFromTable.length || missingFromProduct.length)) {
      if (!acceptableAppleTrocaCi) conflicts.push(`${group}: ${av.join("+")} vs ${bv.join("+")}`);
    }
  }
  return conflicts;
}

function isAppleTrocaCiCompatible(product, tableRow) {
  const productValues = product.analysis.critical.retirada || [];
  const tableValues = tableRow.analysis.critical.retirada || [];
  return product.analysis.brand === "apple"
    && tableRow.analysis.brand === "apple"
    && productValues.includes("troca_ci")
    && !tableValues.includes("retirada");
}

function missingCriticalAmbiguity(product, tableRow, tableRowsSameModel) {
  const reasons = [];
  for (const group of Object.keys(CRITICAL_GROUPS)) {
    const productValues = product.analysis.critical[group] || [];
    const tableValues = tableRow.analysis.critical[group] || [];
    const variants = new Set(tableRowsSameModel.flatMap((row) => row.analysis.critical[group] || []));
    if (group === "aro" && product.analysis.inferredSemAro && tableValues.includes("sem_aro")) {
      continue;
    }
    if (group === "retirada" && isAppleTrocaCiCompatible(product, tableRow)) {
      continue;
    }
    if (
      group === "network"
      && product.analysis.critical.network.includes("5g")
      && !tableValues.length
      && hasKnownMotorola5GModel(product.analysis)
    ) {
      continue;
    }
    if (group === "tech" && !productValues.length && !tableValues.length) {
      continue;
    }
    if (!productValues.length && variants.size > 0) {
      reasons.push(`produto sem ${group}; tabela tem variantes ${Array.from(variants).join("/")}`);
    } else if (productValues.length && !tableValues.length) {
      reasons.push(`tabela sem ${group}; produto tem ${productValues.join("/")}`);
    } else if (tableValues.length && !productValues.length) {
      if (variants.size > 1) reasons.push(`produto sem ${group}; tabela tem variantes ${Array.from(variants).join("/")}`);
    }
  }
  return reasons;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

function modelCompatible(product, tableRow) {
  const p = product.analysis.important;
  const t = tableRow.analysis.important;
  if (!p.length || !t.length) return { ok: false, reason: "modelo incompleto" };

  const pSet = new Set(p);
  const tSet = new Set(t);
  const tableInProduct = t.every((token) => pSet.has(token));
  const productInTable = p.every((token) => tSet.has(token));
  const exact = product.analysis.importantKey === tableRow.analysis.importantKey;

  if (exact) return { ok: true, quality: "exact" };
  if (tableInProduct && p.length <= t.length + 1) {
    const extraProductTokens = p.filter((token) => !t.includes(token));
    const blockingExtras = extraProductTokens.filter((token) => BLOCKING_EXTRA_MODEL_TOKENS.has(token));
    if (blockingExtras.length) {
      return { ok: false, reason: `produto tem variante comercial ausente na tabela (${blockingExtras.join(" ")})` };
    }
    if (hasXiaomiLineConflict(product, tableRow)) {
      return { ok: false, reason: "linha Xiaomi Mi/Redmi conflitante" };
    }
    return { ok: true, quality: "table_subset" };
  }
  if (productInTable && t.length <= p.length + 1) return { ok: false, reason: `produto incompleto frente a variante (${p.join(" ")} vs ${t.join(" ")})` };
  return { ok: false, reason: `modelo diferente (${p.join(" ")} vs ${t.join(" ")})` };
}

function scoreCandidate(product, tableRow, sameModelRows) {
  const reasons = [];
  const penalties = [];
  let score = 0;

  if (product.analysis.brand && tableRow.analysis.brand && product.analysis.brand !== tableRow.analysis.brand) {
    return { score: -100, reasons: ["marca diferente"], penalties: ["marca diferente"], conflicts: ["marca diferente"], modelOk: false };
  }
  if (product.analysis.brand && tableRow.analysis.brand) {
    score += 25;
    reasons.push("marca compativel");
  }

  const conflicts = hasConflict(product.analysis, tableRow.analysis);
  if (conflicts.length) {
    return { score: -100, reasons, penalties, conflicts, modelOk: false };
  }

  if (product.analysis.normalized === tableRow.analysis.normalized) {
    score += 45;
    reasons.push("nome normalizado exato");
  }
  if (product.analysis.slugNormalized && product.analysis.slugNormalized === tableRow.analysis.normalized) {
    score += 35;
    reasons.push("slug normalizado exato");
  }

  const model = modelCompatible(product, tableRow);
  if (!model.ok) {
    return { score: -40, reasons: [...reasons, model.reason], penalties, conflicts, modelOk: false };
  }
  score += model.quality === "exact" ? 60 : 35;
  reasons.push(`modelo ${model.quality}`);

  for (const group of Object.keys(CRITICAL_GROUPS)) {
    const pv = product.analysis.critical[group] || [];
    const tv = tableRow.analysis.critical[group] || [];
    if (pv.length && tv.length && pv.every((value) => tv.includes(value))) {
      score += 15;
      reasons.push(`${group} compativel`);
    } else if (group === "aro" && !pv.length && tv.includes("sem_aro") && product.analysis.inferredSemAro) {
      score += 12;
      reasons.push("aro inferido sem_aro");
    } else if (
      group === "network"
      && pv.includes("5g")
      && !tv.length
      && hasKnownMotorola5GModel(product.analysis)
    ) {
      score += 10;
      reasons.push("network 5g inferido pelo modelo comercial");
    } else if (group === "retirada" && isAppleTrocaCiCompatible(product, tableRow)) {
      score += 10;
      reasons.push("troca_ci compativel com linha iPhone nao retirada");
    }
  }

  const missing = missingCriticalAmbiguity(product, tableRow, sameModelRows);
  if (missing.length) {
    penalties.push(...missing);
    score -= 25 * missing.length;
  }

  const sim = similarity(product.analysis.sortedTokenKey, tableRow.analysis.sortedTokenKey);
  if (sim >= 0.72) {
    score += Math.round(sim * 10);
    reasons.push(`fuzzy apoio ${sim.toFixed(2)}`);
  }

  return { score, reasons, penalties, conflicts, modelOk: true };
}

function weakSingleModelToken(token) {
  return WEAK_SINGLE_MODEL_TOKENS.has(token);
}

function hasXiaomiLineConflict(product, tableRow) {
  if (product.analysis.brand !== "xiaomi" || tableRow.analysis.brand !== "xiaomi") return false;
  const productTokens = new Set(product.analysis.tokens);
  const tableTokens = new Set(tableRow.analysis.tokens);
  return tableTokens.has("mi") && !tableTokens.has("redmi") && productTokens.has("redmi");
}

function tableModelContainedInProduct(product, tableRow) {
  const p = product.analysis.important;
  const t = tableRow.analysis.important;
  if (!p.length || !t.length) return { ok: false, reason: "modelo incompleto" };
  if (p.join(" ") === t.join(" ")) return { ok: true, quality: "exact" };
  if (t.length === 1 && weakSingleModelToken(t[0])) return { ok: false, reason: `modelo da tabela muito generico (${t.join(" ")})` };
  const pSet = new Set(p);
  if (!t.every((token) => pSet.has(token))) {
    return { ok: false, reason: `modelo da tabela nao esta contido no produto (${t.join(" ")} vs ${p.join(" ")})` };
  }
  const extraProductTokens = p.filter((token) => !t.includes(token));
  if (extraProductTokens.length > 4) {
    return { ok: false, reason: `produto contem muitos modelos extras (${extraProductTokens.join(" ")})` };
  }
  const blockingExtras = extraProductTokens.filter((token) => BLOCKING_EXTRA_MODEL_TOKENS.has(token));
  if (blockingExtras.length) {
    return { ok: false, reason: `produto tem variante comercial ausente na tabela (${blockingExtras.join(" ")})` };
  }
  if (hasXiaomiLineConflict(product, tableRow)) {
    return { ok: false, reason: "linha Xiaomi Mi/Redmi conflitante" };
  }
  return { ok: true, quality: "table_model_contained" };
}

function scoreInvertedCandidate(tableRow, product) {
  const reasons = [];
  const penalties = [];
  let score = 0;

  if (product.analysis.brand && tableRow.analysis.brand && product.analysis.brand !== tableRow.analysis.brand) {
    return { score: -100, reasons: ["marca diferente"], penalties: ["marca diferente"], conflicts: ["marca diferente"], modelOk: false };
  }
  if (product.analysis.brand && tableRow.analysis.brand) {
    score += 25;
    reasons.push("marca compativel");
  }

  const conflicts = hasConflict(product.analysis, tableRow.analysis);
  if (conflicts.length) {
    return { score: -100, reasons, penalties, conflicts, modelOk: false };
  }

  const model = tableModelContainedInProduct(product, tableRow);
  if (!model.ok) {
    return { score: -40, reasons: [...reasons, model.reason], penalties, conflicts, modelOk: false };
  }
  score += model.quality === "exact" ? 60 : 50;
  reasons.push(`modelo ${model.quality}`);

  for (const group of Object.keys(CRITICAL_GROUPS)) {
    const pv = product.analysis.critical[group] || [];
    const tv = tableRow.analysis.critical[group] || [];
    if (pv.length && tv.length && tv.every((value) => pv.includes(value))) {
      score += 15;
      reasons.push(`${group} compativel`);
    } else if (group === "aro" && !pv.length && tv.includes("sem_aro") && product.analysis.inferredSemAro) {
      score += 12;
      reasons.push("aro inferido sem_aro");
    } else if (
      group === "network"
      && pv.includes("5g")
      && !tv.length
      && hasKnownMotorola5GModel(product.analysis)
    ) {
      score += 10;
      reasons.push("network 5g inferido pelo modelo comercial");
    } else if (group === "retirada" && isAppleTrocaCiCompatible(product, tableRow)) {
      score += 10;
      reasons.push("troca_ci compativel com linha iPhone nao retirada");
    } else if (tv.length && !pv.length && !(group === "aro" && tv.includes("sem_aro") && product.analysis.inferredSemAro)) {
      penalties.push(`produto sem ${group}; tabela tem ${tv.join("/")}`);
    } else if (pv.length && !tv.length) {
      penalties.push(`tabela sem ${group}; produto tem ${pv.join("/")}`);
    }
  }

  if (product.analysis.sortedTokenKey.includes(tableRow.analysis.important.join(" "))) {
    score += 5;
    reasons.push("tokens do modelo encontrados no produto");
  }

  return { score, reasons, penalties, conflicts, modelOk: true };
}

function isDisplayScope(row) {
  const section = normalizeBase(row.section || "");
  const idSlug = normalizeBase(`${row.id || ""} ${row.slug || ""}`);
  const text = normalizeBase(`${row.name || ""} ${row.title || ""} ${row.description_text || ""}`);
  if (section.includes("display") || section.includes("tela")) return true;
  if (idSlug.startsWith("display ") || idSlug.includes(" display ") || idSlug.includes("display-e-lcd")) return true;
  if ((text.includes("tela") || text.includes("display")) && text.includes("lcd")) return true;
  return false;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(";"));
  }
  fs.writeFileSync(file, `${lines.join("\r\n")}\r\n`, "utf8");
}

function extractSpreadsheet() {
  if (!fs.existsSync(sheetPath)) throw new Error(`Planilha ausente: ${sheetPath}`);
  const code = String.raw`
import json
import sys
import unicodedata
from pathlib import Path
import pandas as pd

xlsx = Path(sys.argv[1])
out = Path(sys.argv[2])
df = pd.read_excel(xlsx, sheet_name="Tabela Completa", dtype=object).fillna("")

def norm_col(value):
    s = unicodedata.normalize("NFD", str(value)).encode("ascii", "ignore").decode("ascii")
    return "_".join(s.lower().strip().split())

cols = {norm_col(c): c for c in df.columns}
required = ["produto", "custo", "adicional", "preco_de_venda"]
missing = [c for c in required if c not in cols]
if missing:
    raise SystemExit(f"Missing columns: {missing}; got {list(df.columns)}")

records = []
seen = set()
duplicates = 0
for idx, row in df.iterrows():
    raw = {
        "produto": str(row[cols["produto"]]).strip(),
        "custo": str(row[cols["custo"]]).strip(),
        "adicional": str(row[cols["adicional"]]).strip(),
        "preco_de_venda": str(row[cols["preco_de_venda"]]).strip(),
    }
    key = json.dumps(raw, ensure_ascii=False, sort_keys=True)
    if key in seen:
        duplicates += 1
        continue
    seen.add(key)
    raw["row_number"] = int(idx) + 2
    records.append(raw)

out.write_text(json.dumps({
    "sheet": "Tabela Completa",
    "rows_total": int(len(df)),
    "rows_deduped": int(len(records)),
    "exact_duplicates_removed": int(duplicates),
    "records": records,
}, ensure_ascii=False, indent=2), encoding="utf-8")
`;
  const result = spawnSync(PYTHON, ["-c", code, sheetPath, parsedSheetPath], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Falha lendo planilha: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(fs.readFileSync(parsedSheetPath, "utf8"));
}

async function fetchProducts() {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { rows } = await pool.query(`
        select id, slug, name, brand, section, price_cents, currency, image_url, primary_image_url,
               active, is_active, description_text, description_html, title, stock, availability,
               specifications, metadata, price, price_text, created_at, updated_at
        from products
        where active = true and coalesce(is_active, true) = true
        order by section asc nulls last, brand asc nulls last, name asc
      `);
      return rows;
    } catch (error) {
      lastError = error;
      if (!/ECONNRESET|ETIMEDOUT|terminating connection/i.test(String(error?.message || "")) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw lastError;
}

function prepareTableRows(sheet) {
  return sheet.records.map((record, index) => {
    const price = parseSalePrice(record.preco_de_venda);
    const analysis = analyze(record.produto);
    return {
      table_index: index,
      row_number: record.row_number,
      produto: record.produto,
      custo: record.custo,
      adicional: record.adicional,
      preco_de_venda: record.preco_de_venda,
      sale_price_status: price.status,
      sale_price_cents: price.cents,
      sale_price_value: price.value,
      analysis,
      used_by: []
    };
  });
}

function prepareProduct(row) {
  const prepared = {
    ...row,
    price_cents: Number(row.price_cents || 0),
    analysis: analyze(row.name || row.title || "", row.brand || "", row.slug || ""),
    display_scope: isDisplayScope(row)
  };
  const productText = normalizeBase(`${row.name || ""} ${row.title || ""} ${row.slug || ""}`);
  const hasExplicitAro = prepared.analysis.critical.aro.length > 0;
  const isRetirada = prepared.analysis.critical.retirada.length > 0;
  prepared.analysis.inferredSemAro = prepared.display_scope && !hasExplicitAro && !isRetirada && !productText.includes("com_aro");
  return prepared;
}

function buildMatches(products, tableRows) {
  const numericTableRows = tableRows.filter((row) => row.sale_price_status === "numeric");
  const consultarTableRows = tableRows.filter((row) => row.sale_price_status === "consultar");
  const tableRowsByBrandModel = new Map();
  for (const row of numericTableRows) {
    const key = `${row.analysis.brand}|${row.analysis.importantKey}`;
    const bucket = tableRowsByBrandModel.get(key) || [];
    bucket.push(row);
    tableRowsByBrandModel.set(key, bucket);
  }

  const preview = [];
  const siteNoMatch = [];
  const review = [];
  const tableReview = [];
  const approved = [];
  const scopedProducts = products.filter((row) => row.display_scope);

  for (const product of scopedProducts) {
    const candidates = [];
    for (const tableRow of numericTableRows) {
      const key = `${tableRow.analysis.brand}|${tableRow.analysis.importantKey}`;
      const sameModelRows = tableRowsByBrandModel.get(key) || [tableRow];
      const scored = scoreCandidate(product, tableRow, sameModelRows);
      if (scored.score >= 55 || (scored.modelOk && scored.score >= 45)) {
        candidates.push({ tableRow, ...scored });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.tableRow.row_number - b.tableRow.row_number);

    const best = candidates[0];
    const second = candidates[1];
    const base = {
      "Produto do site": product.name,
      "ID do site": product.id,
      "Marca": product.brand || "",
      "Slug": product.slug,
      "Categoria/secao": product.section || "",
      "Preco atual": (product.price_cents / 100).toFixed(2).replace(".", ",")
    };

    if (!best) {
      siteNoMatch.push({
        Produto: product.name,
        "ID do site": product.id,
        Marca: product.brand || "",
        Slug: product.slug,
        "Categoria/secao": product.section || "",
        Motivo: "nenhum candidato com marca/modelo/variacao confiavel"
      });
      continue;
    }

    const doubtful = [];
    if (best.penalties.length) doubtful.push(...best.penalties);
    if (second && second.score >= best.score - 6 && second.tableRow.sale_price_cents !== best.tableRow.sale_price_cents) {
      doubtful.push(`empate relevante com linha ${second.tableRow.row_number} (${second.score})`);
    }
    const consultarConflicts = consultarTableRows.filter((row) => {
      if (product.analysis.brand && row.analysis.brand && product.analysis.brand !== row.analysis.brand) return false;
      const model = modelCompatible(product, row);
      return model.ok && row.analysis.importantKey !== best.tableRow.analysis.importantKey;
    });
    if (consultarConflicts.length) {
      doubtful.push(`produto tambem casa com linha Consultar: ${consultarConflicts.map((row) => `${row.row_number} ${row.produto}`).join(" | ")}`);
    }
    if (best.score < 85) doubtful.push(`score abaixo do corte automatico (${best.score})`);

    if (doubtful.length) {
      review.push({
        product,
        candidates: candidates.slice(0, 5).map((candidate) => ({
          produto_tabela: candidate.tableRow.produto,
          row_number: candidate.tableRow.row_number,
          preco_de_venda: candidate.tableRow.preco_de_venda,
          score: candidate.score,
          motivo: [...candidate.reasons, ...candidate.penalties].join("; ")
        })),
        reason: doubtful.join("; ")
      });
      preview.push({
        ...base,
        "Produto da tabela": best.tableRow.produto,
        "Linha tabela": best.tableRow.row_number,
        "Novo preco": (best.tableRow.sale_price_cents / 100).toFixed(2).replace(".", ","),
        "Confianca": best.score,
        "Motivo do match": [...best.reasons, ...best.penalties].join("; "),
        "Status": "revisao"
      });
      continue;
    }

    best.tableRow.used_by.push(product.id);
    const item = {
      product,
      tableRow: best.tableRow,
      score: best.score,
      reason: best.reasons.join("; ")
    };
    approved.push(item);
    preview.push({
      ...base,
      "Produto da tabela": best.tableRow.produto,
      "Linha tabela": best.tableRow.row_number,
      "Novo preco": (best.tableRow.sale_price_cents / 100).toFixed(2).replace(".", ","),
      "Confianca": best.score,
      "Motivo do match": best.reasons.join("; "),
      "Status": product.price_cents === best.tableRow.sale_price_cents ? "aprovado_sem_mudanca" : "aprovado"
    });
  }

  const approvedProductIds = new Set(approved.map((item) => item.product.id));
  for (const tableRow of numericTableRows.filter((row) => !row.used_by.length)) {
    const candidates = [];
    for (const product of scopedProducts) {
      const scored = scoreInvertedCandidate(tableRow, product);
      if (scored.score >= 60 || (scored.modelOk && scored.score >= 55)) {
        candidates.push({ product, tableRow, ...scored });
      }
    }
    candidates.sort((a, b) => b.score - a.score || String(a.product.id).localeCompare(String(b.product.id)));

    const best = candidates[0];
    const second = candidates[1];
    if (!best) {
      tableRow.unused_reason = "sem_produto: nenhum produto do catalogo contem modelo comercial + qualidade compativel";
      tableRow.unused_status = "sem_produto";
      continue;
    }

    const doubtful = [];
    if (best.penalties.length) doubtful.push(...best.penalties);
    if (second && second.score >= best.score - 6 && second.product.id !== best.product.id) {
      doubtful.push(`mais de um produto candidato: ${second.product.id} (${second.score})`);
    }
    const consultarConflicts = consultarTableRows.filter((row) => {
      if (best.product.analysis.brand && row.analysis.brand && best.product.analysis.brand !== row.analysis.brand) return false;
      const model = tableModelContainedInProduct(best.product, row);
      return model.ok && row.analysis.importantKey !== tableRow.analysis.importantKey;
    });
    if (consultarConflicts.length) {
      doubtful.push(`produto tambem casa com linha Consultar: ${consultarConflicts.map((row) => `${row.row_number} ${row.produto}`).join(" | ")}`);
    }
    const tablePriceConflicts = numericTableRows
      .filter((row) => row.row_number !== tableRow.row_number && row.sale_price_cents !== tableRow.sale_price_cents)
      .map((row) => ({ row, scored: scoreInvertedCandidate(row, best.product) }))
      .filter((item) => item.scored.modelOk && item.scored.score >= best.score - 6);
    if (tablePriceConflicts.length) {
      doubtful.push(`outra linha da tabela tambem casa com preco diferente: ${tablePriceConflicts.map((item) => `${item.row.row_number} ${item.row.produto} (${item.row.preco_de_venda})`).join(" | ")}`);
    }
    if (best.score < 85) doubtful.push(`score abaixo do corte automatico (${best.score})`);

    const base = {
      "Produto do site": best.product.name,
      "ID do site": best.product.id,
      "Marca": best.product.brand || "",
      "Slug": best.product.slug,
      "Categoria/secao": best.product.section || "",
      "Preco atual": (best.product.price_cents / 100).toFixed(2).replace(".", ","),
      "Produto da tabela": tableRow.produto,
      "Linha tabela": tableRow.row_number,
      "Novo preco": (tableRow.sale_price_cents / 100).toFixed(2).replace(".", ","),
      "Confianca": best.score,
      "Motivo do match": [...best.reasons, ...best.penalties].join("; ")
    };

    if (approvedProductIds.has(best.product.id)) {
      const existing = approved.find((item) => item.product.id === best.product.id);
      if (existing?.tableRow.sale_price_cents === tableRow.sale_price_cents) {
        tableRow.used_by.push(best.product.id);
        tableRow.unused_reason = `resolvido_por_produto_ja_aprovado: ${best.product.id}`;
        tableRow.unused_status = "resolvido_por_match_existente";
        tableRow.unused_candidate = best.product.name;
        continue;
      }
      doubtful.push(`produto ja aprovado por outra linha com preco diferente: ${existing?.tableRow.row_number ?? "desconhecida"}`);
    }

    if (doubtful.length) {
      tableRow.unused_reason = doubtful.join("; ");
      tableRow.unused_status = "revisao";
      tableRow.unused_candidate = best.product.name;
      tableReview.push({
        tableRow,
        candidates: candidates.slice(0, 5).map((candidate) => ({
          produto_site: candidate.product.name,
          id_site: candidate.product.id,
          slug: candidate.product.slug,
          preco_atual: Number(candidate.product.price_cents / 100),
          score: candidate.score,
          motivo: [...candidate.reasons, ...candidate.penalties].join("; ")
        })),
        reason: doubtful.join("; ")
      });
      preview.push({
        ...base,
        "Status": "revisao_tabela"
      });
      continue;
    }

    tableRow.used_by.push(best.product.id);
    approvedProductIds.add(best.product.id);
    const item = {
      product: best.product,
      tableRow,
      score: best.score,
      reason: `busca invertida tabela->site; ${best.reasons.join("; ")}`
    };
    approved.push(item);
    preview.push({
      ...base,
      "Motivo do match": item.reason,
      "Status": best.product.price_cents === tableRow.sale_price_cents ? "aprovado_sem_mudanca" : "aprovado"
    });
  }

  const finalApprovedProductIds = new Set(approved.map((item) => item.product.id));
  const finalSiteNoMatch = siteNoMatch.filter((item) => !finalApprovedProductIds.has(item["ID do site"]));
  const finalReview = review.filter((item) => !finalApprovedProductIds.has(item.product.id));

  return { preview, siteNoMatch: finalSiteNoMatch, review: finalReview, tableReview, approved };
}

async function applyUpdates(approved, beforeProducts) {
  const updated = [];
  const noChange = [];
  const updatedAtRestored = [];
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const item of approved) {
      const current = item.product.price_cents;
      const next = item.tableRow.sale_price_cents;
      if (current === next) {
        noChange.push(item);
        continue;
      }
      const result = await client.query(
        "update products set price_cents = $1 where id = $2 and price_cents = $3 returning id, price_cents",
        [next, item.product.id, current]
      );
      if (result.rowCount !== 1) {
        throw new Error(`Update guard failed for ${item.product.id}`);
      }
      updated.push({ ...item, old_price_cents: current, new_price_cents: next });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (updated.length) {
    const beforeByIdForRestore = new Map(beforeProducts.map((row) => [row.id, row]));
    const restoreClient = await pool.connect();
    try {
      await restoreClient.query("begin");
      await restoreClient.query("alter table products disable trigger set_products_updated_at");
      for (const item of updated) {
        const before = beforeByIdForRestore.get(item.product.id);
        if (!before?.updated_at) continue;
        const result = await restoreClient.query(
          "update products set updated_at = $1 where id = $2 and price_cents = $3",
          [before.updated_at, item.product.id, item.new_price_cents]
        );
        if (result.rowCount !== 1) {
          throw new Error(`updated_at restore guard failed for ${item.product.id}`);
        }
        updatedAtRestored.push({ id: item.product.id, restored_to: before.updated_at });
      }
      await restoreClient.query("alter table products enable trigger set_products_updated_at");
      await restoreClient.query("commit");
    } catch (error) {
      await restoreClient.query("rollback").catch(() => {});
      throw error;
    } finally {
      restoreClient.release();
    }
  }

  const after = await fetchProducts();
  const afterById = new Map(after.map((row) => [row.id, row]));
  const beforeById = new Map(beforeProducts.map((row) => [row.id, row]));
  const updatedIds = new Set(updated.map((item) => item.product.id));
  const approvedIds = new Set(approved.map((item) => item.product.id));

  const unexpectedPriceChanges = [];
  const fieldChanges = [];
  const updatedAtRestoreMismatches = [];
  const fieldsToCheck = ["name", "slug", "brand", "section", "image_url", "primary_image_url", "description_text", "description_html", "stock", "active", "is_active"];
  for (const [id, before] of beforeById.entries()) {
    const row = afterById.get(id);
    if (!row) {
      unexpectedPriceChanges.push({ id, reason: "produto sumiu apos update" });
      continue;
    }
    if (!updatedIds.has(id) && Number(before.price_cents || 0) !== Number(row.price_cents || 0)) {
      unexpectedPriceChanges.push({ id, before: before.price_cents, after: row.price_cents });
    }
    if (approvedIds.has(id)) {
      for (const field of fieldsToCheck) {
        if (JSON.stringify(before[field] ?? null) !== JSON.stringify(row[field] ?? null)) {
          fieldChanges.push({ id, field, before: before[field] ?? null, after: row[field] ?? null });
        }
      }
      if (updatedIds.has(id)) {
        const actualUpdatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || "");
        const expectedUpdatedAt = before.updated_at instanceof Date ? before.updated_at.toISOString() : String(before.updated_at || "");
        if (actualUpdatedAt !== expectedUpdatedAt) {
          updatedAtRestoreMismatches.push({ id, before: expectedUpdatedAt, after: actualUpdatedAt });
        }
      }
    }
  }

  return { updated, noChange, validation: { unexpectedPriceChanges, fieldChanges, updatedAtRestored, updatedAtRestoreMismatches } };
}

function reportRowsUpdated(items) {
  return items.map((item) => ({
    produto_site: item.product.name,
    id_site: item.product.id,
    slug: item.product.slug,
    marca: item.product.brand || "",
    secao: item.product.section || "",
    produto_tabela: item.tableRow.produto,
    linha_tabela: item.tableRow.row_number,
    preco_antigo: Number((item.old_price_cents ?? item.product.price_cents) / 100),
    preco_novo: Number(item.tableRow.sale_price_cents / 100),
    score: item.score,
    motivo: item.reason
  }));
}

function reviewRows(review) {
  return review.map((item) => ({
    produto_site: item.product.name,
    id_site: item.product.id,
    slug: item.product.slug,
    candidatos_tabela: item.candidates,
    motivo_duvida: item.reason
  }));
}

function tableUnusedRows(tableRows) {
  return tableRows
    .filter((row) => !row.used_by.length)
    .map((row) => ({
      Produto: row.produto,
      "Linha tabela": row.row_number,
      "Preco de venda": row.preco_de_venda,
      Motivo: row.sale_price_status === "consultar"
        ? "ignorado por Consultar"
        : row.sale_price_status !== "numeric"
          ? `preco nao numerico: ${row.sale_price_status}`
          : row.unused_reason || "sem produto do site aprovado automaticamente",
      "Status tabela": row.unused_status || "sem_match",
      "Candidato site": row.unused_candidate || ""
    }));
}

function tableReviewRows(tableReview) {
  return tableReview.map((item) => ({
    produto_tabela: item.tableRow.produto,
    linha_tabela: item.tableRow.row_number,
    preco_de_venda: item.tableRow.preco_de_venda,
    candidatos_site: item.candidates,
    motivo_duvida: item.reason
  }));
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const sheet = extractSpreadsheet();
  const productsRaw = await fetchProducts();
  const products = productsRaw.map(prepareProduct);
  const tableRows = prepareTableRows(sheet);
  const scopedProducts = products.filter((row) => row.display_scope);
  const { preview, siteNoMatch, review, tableReview, approved } = buildMatches(products, tableRows);

  writeCsv(previewPath, preview, [
    "Produto do site", "ID do site", "Produto da tabela", "Linha tabela", "Preco atual",
    "Novo preco", "Confianca", "Motivo do match", "Status", "Marca", "Slug", "Categoria/secao"
  ]);
  writeCsv(siteNoMatchPath, siteNoMatch, ["Produto", "ID do site", "Marca", "Slug", "Categoria/secao", "Motivo"]);
  const unused = tableUnusedRows(tableRows);
  writeCsv(tableUnusedPath, unused, ["Produto", "Linha tabela", "Preco de venda", "Motivo", "Status tabela", "Candidato site"]);
  fs.writeFileSync(snapshotPath, JSON.stringify(productsRaw, null, 2), "utf8");

  let applyResult = { updated: [], noChange: [], validation: { unexpectedPriceChanges: [], fieldChanges: [] } };
  if (applyMode) {
    applyResult = await applyUpdates(approved, productsRaw);
  }

  const ignoredConsultar = tableRows.filter((row) => row.sale_price_status === "consultar");
  const report = {
    generated_at: new Date().toISOString(),
    source: {
      spreadsheet: sheetPath,
      sheet: sheet.sheet,
      rows_total: sheet.rows_total,
      rows_deduped: sheet.rows_deduped,
      exact_duplicates_removed: sheet.exact_duplicates_removed,
      catalog_source: "Supabase Postgres via project .env DATABASE_URL fallback; ONE unavailable; Supabase connector SQL required reauth",
      update_field: "products.price_cents"
    },
    mode: applyMode ? "apply" : "preview",
    summary: {
      total_produtos_site_analisados: products.length,
      total_telas_display_detectadas: scopedProducts.length,
      total_matches_confiaveis: approved.length,
      total_atualizado: applyResult.updated.length,
      total_aprovado_sem_mudanca: applyResult.noChange.length,
      total_sem_match: siteNoMatch.length,
      total_em_revisao: review.length,
      total_linhas_tabela_em_revisao: tableReview.length,
      total_ignorado_por_consultar: ignoredConsultar.length,
      total_tabela_sem_uso: unused.length
    },
    produtos_atualizados: reportRowsUpdated(applyResult.updated),
    produtos_aprovados_sem_mudanca: reportRowsUpdated(applyResult.noChange),
    produtos_site_sem_match: siteNoMatch,
    produtos_tabela_sem_uso: unused,
    produtos_revisao: reviewRows(review),
    linhas_tabela_revisao: tableReviewRows(tableReview),
    ignorados_por_consultar: ignoredConsultar.map((row) => ({
      produto: row.produto,
      linha_tabela: row.row_number,
      preco_de_venda: row.preco_de_venda
    })),
    validation: applyResult.validation,
    files: {
      preview: previewPath,
      produtos_site_sem_match: siteNoMatchPath,
      produtos_tabela_sem_match: tableUnusedPath,
      report: reportPath,
      before_snapshot: snapshotPath
    }
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    mode: report.mode,
    summary: report.summary,
    validation: report.validation,
    files: report.files
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
