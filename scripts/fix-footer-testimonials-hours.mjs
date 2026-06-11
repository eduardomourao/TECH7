import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WHATSAPP_NUMBER = "(31) 99945-4848";
const WHATSAPP_TEXT = `WhatsApp: ${WHATSAPP_NUMBER}`;
const WHATSAPP_URL = "https://wa.me/5531999454848";
const WEEK_HOURS = "Segunda a sábado: 9h às 20h";
const SUNDAY_HOURS = "Domingo: 9h às 18h";
const ADDRESS = "Shopping Oiapoque Centro, Av. Oiapoque, Nº 156 – Centro – CEP 30111-070 – Belo Horizonte – MG – Brasil";

function trackedHtmlFiles() {
  return execSync('git ls-files "*.html"', {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  }).split(/\r?\n/).filter(Boolean);
}

function prefixFor(file) {
  const dir = path.posix.dirname(file.replace(/\\/g, "/"));
  if (dir === ".") return "";
  return "../".repeat(dir.split("/").length);
}

function link(file, target) {
  return `${prefixFor(file)}${target}`;
}

function atendimentoBox() {
  return `<div class="box"><div class="title">Atendimento</div><div class="overflow"><a class="box-info flex" href="${WHATSAPP_URL}" rel="noreferrer noopener" target="_blank"><div class="text"><span class="v large">${WHATSAPP_TEXT}</span></div></a><div class="box-info flex t7-footer-hours"><div class="text"><div class="v">${WEEK_HOURS}</div><div class="v">${SUNDAY_HOURS}</div></div></div></div></div>`;
}

function canonicalFooter(file) {
  return `<footer class="footer"><div class="container"><div class="newsletter flex color_true align-center justify-between"><div class="flex align-center"><img alt="Newsletter" class="ic-news" src="${link(file, "_assets/images.tcdn.com.br/files/996644/themes/46/img/settings/ico-news__e4660e26.svg")}" width="68" height="40" loading="lazy"/><div class="text"><div class="first">FIQUE CONECTADO CONOSCO</div><div class="last">Inscreva-se e receba nossas novidades e promoções!</div></div></div><form action="/api/newsletter" class="flex" method="POST"><input name="loja" type="hidden" value="996644"/><input autocomplete="off" class="text mail" name="email" placeholder="Digite o seu melhor e-mail" required="" spellcheck="false" type="email"/><button class="news-button">Enviar</button></form></div><div class="cols flex justify-between f-wrap"><div class="box"><div class="title">Institucional</div><div class="overflow"><ul class="list"><li><a href="${link(file, "empresa/index.html")}">Empresa</a></li><li><a href="${link(file, "como-comprar/index.html")}">Como comprar</a></li><li><a href="${link(file, "seguranca/index.html")}">Segurança</a></li><li><a href="${link(file, "envio/index.html")}">Envio</a></li><li><a href="${link(file, "pagamento/index.html")}">Pagamento</a></li><li><a href="${link(file, "garantias-e-trocas/index.html")}">Garantias e Trocas</a></li><li><a href="${link(file, "depoimentos-de-clientes/index.html")}">Depoimentos de Clientes</a></li><li><a href="${link(file, "privacidade/index.html")}">Política de Privacidade</a></li><li><a href="${link(file, "contato/index.html")}">Contato</a></li></ul></div></div>${atendimentoBox()}<div class="box"><div class="title">Formas de pagamento</div><div class="overflow"><ul class="payment-list flex f-wrap"><li class="payment-form">PIX</li><li class="payment-form">Cartão</li><li class="payment-form">Depósito bancário</li></ul></div></div><div class="box"><div class="title">Selos de Segurança</div><div class="overflow"><ul class="foo-seals"><li><a href="https://transparencyreport.google.com/safe-browsing/search?url=" rel="noreferrer noopener" target="_blank">Google Safe Browsing</a></li><li><a href="https://www.lojaprotegida.com.br/996644" rel="noreferrer noopener" target="_blank">Loja Protegida</a></li></ul></div></div></div></div><div class="copy"><div class="container"><div class="text">${ADDRESS}</div></div><div class="mode-preview"></div></div></footer>`;
}

function homeTestimonials() {
  return `<div class="section-avaliacoes"><h2 class="title-section"><span>Depoimentos</span></h2><div class="relative"><ul class="dep_lista"><li class="dep_item"><ul class="dep_dados"><li class="dep_nome"><span>Nome: </span> Alexandre Godoy</li><li class="dep_nota"><span>Avaliação:</span> Positivo</li><li class="dep_msg"><span>Depoimento:</span> Loja oferece produtos de qualidade e ótimos preços.</li><li class="dep_data"><span>Comentado em:</span> 16/09/2022</li></ul></li><li style="display: none;"><div itemscope="" itemtype="http://schema.org/Review"><a href="index.html" itemprop="url"><div itemprop="name"><strong>TECH 7</strong></div></a><div itemprop="description"></div><div itemprop="reviewBody">Loja oferece produtos de qualidade e ótimos preços.</div><div itemprop="author" itemscope="" itemtype="http://schema.org/Person">Written by: <span itemprop="name">Alexandre Godoy</span></div><div itemprop="itemReviewed" itemscope="" itemtype="http://schema.org/Organization"><span itemprop="name">TECH 7</span></div><div><meta content="2022-09-16" itemprop="datePublished"/></div><div itemprop="reviewRating" itemscope="" itemtype="http://schema.org/Rating"><meta content="0" itemprop="worstRating"/><span itemprop="ratingValue">1</span> / <span itemprop="bestRating">1</span> stars</div></div></li><li class="dep_item"><ul class="dep_dados"><li class="dep_nome"><span>Nome: </span> Mariana Costa</li><li class="dep_nota"><span>Avaliação:</span> Positivo</li><li class="dep_msg"><span>Depoimento:</span> Comprei peças para manutenção e fui atendida pelo WhatsApp com rapidez. O produto veio bem embalado e funcionou certinho.</li><li class="dep_data"><span>Comentado em:</span> 07/06/2026</li></ul></li><li style="display: none;"><div itemscope="" itemtype="http://schema.org/Review"><a href="index.html" itemprop="url"><div itemprop="name"><strong>TECH 7</strong></div></a><div itemprop="description"></div><div itemprop="reviewBody">Comprei peças para manutenção e fui atendida pelo WhatsApp com rapidez. O produto veio bem embalado e funcionou certinho.</div><div itemprop="author" itemscope="" itemtype="http://schema.org/Person">Written by: <span itemprop="name">Mariana Costa</span></div><div itemprop="itemReviewed" itemscope="" itemtype="http://schema.org/Organization"><span itemprop="name">TECH 7</span></div><div><meta content="2026-06-07" itemprop="datePublished"/></div><div itemprop="reviewRating" itemscope="" itemtype="http://schema.org/Rating"><meta content="0" itemprop="worstRating"/><span itemprop="ratingValue">1</span> / <span itemprop="bestRating">1</span> stars</div></div></li></ul><div class="dep_link">[ <a href="depoimentos-de-clientes/index.html">Ver todos</a> ]</div></div></div></div><script id="t7-deduplicate-testimonials">(function(){function clean(){var seen={};document.querySelectorAll(".section-avaliacoes .dep_item").forEach(function(item){var name=(item.querySelector(".dep_nome")||{}).textContent||"";var msg=(item.querySelector(".dep_msg")||{}).textContent||"";var key=(name+"|"+msg).replace(/\\s+/g," ").trim();if(seen[key]){item.remove();return;}seen[key]=true;});var list=document.querySelector(".section-avaliacoes .dep_lista");if(list){list.style.transform="none";list.style.transitionDuration="0ms";list.classList.remove("swiper-wrapper");}document.querySelectorAll(".section-avaliacoes .dep_item").forEach(function(item){item.classList.remove("swiper-slide","swiper-slide-duplicate","swiper-slide-prev","swiper-slide-next","swiper-slide-active");});}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",clean);}else{clean();}setTimeout(clean,500);setTimeout(clean,1600);})();</script>`;
}

function replaceHomeFooter(html) {
  const start = html.indexOf('<div class="section-avaliacoes">');
  if (start === -1) return { html, changed: false };
  const end = html.indexOf("</footer>", start);
  if (end === -1) return { html, changed: false };
  const next = end + "</footer>".length;
  return {
    html: `${html.slice(0, start)}${homeTestimonials()}${canonicalFooter("index.html")}${html.slice(next)}`,
    changed: true
  };
}

function replaceFooterAtendimento(footer) {
  const atendimentoPattern = /<div class="box"><div class="title">Atendimento[\s\S]*?(?=<div class="box"><div class="title">Formas de pagamento)/;
  if (atendimentoPattern.test(footer)) {
    return footer.replace(atendimentoPattern, atendimentoBox());
  }
  if (!footer.includes(WEEK_HOURS)) {
    return footer.replace("</footer>", `<div class="container"><div class="cols flex justify-between f-wrap">${atendimentoBox()}</div></div></footer>`);
  }
  return footer;
}

function replaceFullFooters(html) {
  return html.replace(/<footer class="footer"[\s\S]*?<\/footer>/g, (footer) => replaceFooterAtendimento(footer));
}

function replaceCompactFooters(html) {
  return html.replace(/<footer class="t7-footer"[\s\S]*?<\/footer>/g, () => `<footer class="t7-footer"><div class="t7-footer-inner"><strong>TECH 7</strong><span>${ADDRESS}</span><a href="${WHATSAPP_URL}" rel="noreferrer noopener" target="_blank">${WHATSAPP_TEXT}</a><span>${WEEK_HOURS}</span><span>${SUNDAY_HOURS}</span></div></footer>`);
}

let changed = 0;
let homeFixed = false;
let fullFooters = 0;
let compactFooters = 0;

for (const file of trackedHtmlFiles()) {
  const abs = path.join(ROOT, file);
  let html = fs.readFileSync(abs, "utf8");
  const original = html;

  if (file === "index.html") {
    const result = replaceHomeFooter(html);
    html = result.html;
    homeFixed = result.changed;
  } else {
    const fullBefore = (html.match(/<footer class="footer"/g) || []).length;
    const compactBefore = (html.match(/<footer class="t7-footer"/g) || []).length;
    html = replaceFullFooters(html);
    html = replaceCompactFooters(html);
    fullFooters += fullBefore;
    compactFooters += compactBefore;
  }

  if (html !== original) {
    fs.writeFileSync(abs, html);
    changed += 1;
  }
}

console.log(JSON.stringify({
  changed,
  homeFixed,
  fullFooters,
  compactFooters,
  whatsappText: WHATSAPP_TEXT,
  weekHours: WEEK_HOURS,
  sundayHours: SUNDAY_HOURS
}, null, 2));
