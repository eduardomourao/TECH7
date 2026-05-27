import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "_validation");
const reportPath = path.join(outputDir, "store-visible-data-update.json");
const extensions = new Set([".html", ".js", ".css", ".json", ".xml", ".md"]);
const ignoredDirs = new Set([
  ".git",
  ".vercel",
  "node_modules",
  "_validation",
  "backup",
  "artifacts",
  "test-results",
  "validation-screenshots"
]);

const current = {
  phoneText: "(31) 99945-4848 WhatsApp",
  phoneRaw: "31999454848",
  whatsapp: "https://wa.me/5531999454848",
  instagram: "https://www.instagram.com/tech7i/",
  email: "suportehubtech7@gmail.com",
  address: "Shopping Oiapoque Centro, Av. Oiapoque, Nº 156 – Centro – CEP 30111-070 – Belo Horizonte – MG – Brasil",
  author: "TECH 7"
};

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function replaceAllCount(text, search, replacement) {
  const before = text;
  const next = text.replace(search, replacement);
  if (next === before) return { text, count: 0 };
  const matches = before.match(search);
  return { text: next, count: matches ? matches.length : 1 };
}

function applyRule(state, key, search, replacement) {
  const result = replaceAllCount(state.text, search, replacement);
  if (result.count > 0) {
    state.text = result.text;
    state.counts[key] = (state.counts[key] || 0) + result.count;
  }
}

function updateText(input) {
  const state = { text: input, counts: {} };

  applyRule(state, "email", /comercial@centralselling\.com\.br/gi, current.email);
  applyRule(state, "email_pontoxnet", /comercial01@pontoxnet\.com\.br/gi, current.email);
  applyRule(state, "email_x3", /x3distribuidoraloja@gmail\.com/gi, current.email);
  applyRule(state, "email_centroselling_typo", /comercial@centroselling\.com\.br/gi, current.email);
  applyRule(state, "email_contato_tech7", /contato@tech7\.com\.br/gi, current.email);
  applyRule(state, "email_privacidade_locaweb", /privacidade@locaweb\.com\.br/gi, current.email);
  applyRule(state, "instagram_dup_suffix", /https?:\/\/(?:www\.)?instagram\.com\/tech7i\/(?:i\/)+/gi, current.instagram);
  applyRule(state, "instagram", /https?:\/\/(?:www\.)?instagram\.com\/tech7(?!i)\/?/gi, current.instagram);
  applyRule(state, "meta_author", /Tray Tecnologia/g, current.author);
  applyRule(state, "central_selling_text", /Central Selling/gi, current.author);
  applyRule(state, "central_selling_domain", /centralselling/gi, "tech7");

  applyRule(
    state,
    "whatsapp_href",
    /href=(["'])https?:\/\/(?:wa\.me\/5531973548107|api\.whatsapp\.com\/send\?[^"']*5531973548107)[^"']*\1/gi,
    `href="${current.whatsapp}"`
  );
  applyRule(
    state,
    "whatsapp_url_raw",
    /https?:\/\/(?:wa\.me\/5531973548107|api\.whatsapp\.com\/send\?[^"'\s<>]*5531973548107)[^"'\s<>]*/gi,
    current.whatsapp
  );
  applyRule(state, "whatsapp_href_44", /https?:\/\/wa\.me\/5544998286252[^"'\s<>]*/gi, current.whatsapp);
  applyRule(state, "old_whatsapp_with_country_44", /\b5544998286252\b/g, "5531999454848");
  applyRule(state, "x3_course_link", /https?:\/\/www\.x3distribuidoraloja\.com\.br\/[^"'\s<>]*/gi, current.whatsapp);
  applyRule(state, "tel_href_old_whatsapp", /href=(["'])tel:31973548107Whatsapp\1/gi, `href="tel:${current.phoneRaw}"`);
  applyRule(state, "tel_href_old_whatsapp_plain", /href=(["'])tel:31973548107\1/gi, `href="tel:${current.phoneRaw}"`);
  applyRule(state, "tel_href_old_landline", /href=(["'])tel:3132136621\1/gi, `href="tel:${current.phoneRaw}"`);
  applyRule(state, "tel_href_empty", /href=(["'])tel:\1/gi, `href="tel:${current.phoneRaw}"`);
  applyRule(state, "old_whatsapp_display", /\(31\)\s*97354[-\s]?8107\s*Whatsapp/gi, current.phoneText);
  applyRule(state, "old_whatsapp_display_no_label", /\(31\)\s*97354[-\s]?8107/gi, current.phoneText);
  applyRule(state, "old_whatsapp_display_plain", /\b31\s*97354[-\s]?8107\b/gi, current.phoneRaw);
  applyRule(state, "old_whatsapp_display_44", /\b44\s*9\s*9828[-\s]?6252\b/gi, current.phoneText);
  applyRule(state, "old_whatsapp_digits", /\b31973548107\b/g, current.phoneRaw);
  applyRule(state, "old_whatsapp_with_country", /\b5531973548107\b/g, "5531999454848");
  applyRule(state, "old_landline_display", /\(31\)\s*3213[-\s]?6621/gi, current.phoneText);
  applyRule(state, "old_landline_digits", /\b3132136621\b/g, current.phoneRaw);
  applyRule(state, "old_landline_with_country", /\b553132136621\b/g, "5531999454848");

  applyRule(
    state,
    "old_address_line",
    /Rua dos Caet(?:é|Ã©|&eacute;)s[^<"\n\r]*/gi,
    current.address
  );
  applyRule(state, "old_address_cep", /30120[-\s]?082/g, "30111-070");
  applyRule(state, "old_address_ascii_caetes_line", /Rua dos Caetes[^<"\n\r]*/gi, current.address);
  applyRule(state, "old_address_baalbeck", /Ed\.?\s*Baalbeck|Baalbeck/gi, "Shopping Oiapoque Centro");

  applyRule(
    state,
    "facebook_removed",
    /<a\s+href=(["'])https?:\/\/(?:www\.)?facebook\.com\/tech7\/?\1[\s\S]*?<\/a>/gi,
    ""
  );
  applyRule(
    state,
    "tray_footer_removed",
    /<div\s+data-tray-tst=(["'])logo_tray\1\s+id=(["'])NavLogoTray\2>[\s\S]*?<\/div>(?=<div class=(["'])mode-preview\3>)/gi,
    ""
  );
  applyRule(state, "traycommerce_text", /TrayCommerce|Powered by Tray/gi, "");

  return state;
}

const files = walk(root);
const changed = [];
const totals = {};

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const before = fs.readFileSync(file, "utf8");
  const result = updateText(before);
  if (result.text === before) continue;
  fs.writeFileSync(file, result.text, "utf8");
  for (const [key, count] of Object.entries(result.counts)) {
    totals[key] = (totals[key] || 0) + count;
  }
  changed.push({ file: rel, counts: result.counts });
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  filesChanged: changed.length,
  totals,
  changed
}, null, 2));

console.log(JSON.stringify({
  report: path.relative(root, reportPath).replace(/\\/g, "/"),
  filesScanned: files.length,
  filesChanged: changed.length,
  totals
}, null, 2));
