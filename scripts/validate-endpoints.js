import { failOrPass, readJson } from "./lib/site-audit.js";

const errors = [];
const config = readJson("_custom/endpoints.json", {});
const required = [["POST", "/api/cart/add"], ["POST", "/api/newsletter"], ["POST", "/api/comments"], ["POST", "/api/contact"], ["POST", "/api/testimonials"], ["GET", "/api/search"]];
const legacy = ["/loja/cartService.php", "/loja/login_layout.php", "/loja/catalogo.php", "/loja/busca.php", "/loja/logout.php", "/loja/redirect_cart_service.php", "/mvc/store/newsletter/", "/contato/contato.php", "/depoimentos-de-clientes/funcoes/envia_depoimento.php"];
const endpoints = Array.isArray(config.endpoints) ? config.endpoints : [];
const legacyRules = Array.isArray(config.legacy) ? config.legacy : [];

for (const [method, source] of required) if (!endpoints.some((item) => item.method === method && item.source === source)) errors.push({ type: "missing-endpoint", method, source });
for (const source of legacy) if (!legacyRules.some((item) => item.source === source)) errors.push({ type: "missing-legacy-endpoint", source });
for (const rule of legacyRules) if (rule.method === "POST" && rule.strategy !== "vercel-rewrite") errors.push({ type: "post-legacy-must-rewrite", rule });

failOrPass("validate-endpoints", errors, { endpoints: endpoints.length, legacy: legacyRules.length });
