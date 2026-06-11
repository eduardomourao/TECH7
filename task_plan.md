# Plano de execucao - Produtos visitados imagens TECH7 (2026-06-11)

## Objetivo
Corrigir a secao `Produtos visitados` para exibir imagens reais dos produtos, preservando cards de categoria, busca, home, produto individual e carrosseis.

## Guardrails
- CWD confirmado: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Investigar antes de editar.
- Corrigir causa compartilhada no runtime; nao editar produto por produto.
- ONE/Supabase: nao alterar dados de produto/imagem/API/banco nesta tarefa sem tentar ONE primeiro.
- Browser: validar com `@chrome` primeiro; Chrome DevTools MCP depois; Playwright somente fallback final.
- Preservar stage/worktree existente; `assets/js/tech7-local-runtime.js` ja esta `MM`, entao staging deve ser seletivo.

## Subagentes
- [ ] Recently Viewed Investigator: localizar render/storage/campos salvos.
- [ ] Image Path Analyst: comparar card normal vs visitado e testar URLs.
- [ ] Shared Runtime Fixer: patch minimo no helper compartilhado.
- [ ] Storage Migration/Recovery: reidratar itens antigos sem imagem quando houver slug/id.
- [ ] QA Validator: desktop/mobile, reload, categoria/busca, console e validadores.

## Fases
- [x] Confirmar cwd, ler memoria e print.
- [ ] Localizar `Produtos visitados`, `recently`, `visited`, placeholder, imagem e storage.
- [ ] Reproduzir problema no Chrome real e inspecionar DOM/storage.
- [ ] Identificar causa raiz.
- [ ] Implementar correcao compartilhada minima.
- [ ] Validar visualmente com Chrome real desktop/mobile.
- [ ] Rodar validadores aplicaveis.

---

# Plano de execucao - performance de preco TECH7 (2026-06-11)

## Objetivo
Investigar e corrigir demora na exibicao de precos em cards, produto, busca, carrinho e checkout, preservando dados reais do Supabase e evitando loading visual como mascara.

## Guardrails
- CWD confirmado: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- ONE/Supabase: ONE foi buscado via `tool_search`, mas nao ficou callable nesta sessao; fallback permitido sera env/local/CLI somente apos registrar indisponibilidade.
- Browser: tentar `@chrome`/Browser MCP primeiro; se indisponivel, Chrome DevTools MCP; Playwright apenas como fallback final com registro explicito.
- Usar `npm`.
- Nao alterar preco, produto, rota, banco ou checkout sem necessidade clara.

## Subagentes
- [x] Performance Investigator: medicao local feita por script Playwright Chrome fallback.
- [x] Data Path Analyst: fluxo mapeado em `preco-loader.js`, `assets/js/tech7-local-runtime.js`, `server/routes/products.js`, `server/routes/search.js` e `cart-manager.js`.
- [x] Frontend Render Analyst: causa encontrada no apagamento preventivo dos precos em `preco-loader.js`.
- [x] Backend/Supabase Analyst: endpoints confirmados; `/api/products` e `/api/search` ja carregam `price_cents`, `/resolve-prices` e usado como reconciliacao.
- [x] Fix Implementer: correcao minima aplicada em `preco-loader.js`.
- [x] QA Validator: validacoes npm e browser fallback executados.

## Fases
- [x] Confirmar cwd, skills e arquivos de acompanhamento.
- [x] Tentar ONE e registrar indisponibilidade.
- [x] Mapear arquivos com `rg`/`rg --files`.
- [x] Rodar servidor local e medir baseline.
- [x] Confirmar caminho de dados por fallback local seguro sem alterar banco.
- [x] Identificar causa raiz.
- [x] Corrigir fluxo de preco.
- [x] Validar comandos e browser.
- [x] Registrar antes/depois e decisao final.

## Resultado
- Causa raiz: `preco-loader.js` sobrescrevia precos ja existentes no HTML com `Preco sob consulta` antes do retorno de `/api/products/resolve-prices`, criando uma janela visual sem preco real e novas chamadas assicronas de reconciliacao.
- Correcao: preservar preco estatico ate a confirmacao do backend, cachear resultados por chave e slug, compartilhar requests em voo e nao apagar preco em falha de rede.
- Evidencias: `_validation/price-performance/baseline-summary.json`, `_validation/price-performance/after-slug-cache-final-summary.json` e screenshots `after-slug-cache-final-*.png`.
- Decisao: atraso visual corrigido para categorias, home, produto, busca e carrinho vazio; risco de dados remanescente registrado para o produto Realme C55, cujo backend retorna preco indisponivel enquanto o HTML estatico mostra `R$ 138,00`.

---

# Plano de execucao - mobile release gate TECH7 (2026-06-10)

## Objetivo
Validar o site TECH 7 em mobile antes de producao, com inspeção real em navegador, screenshots, DOM, console, network, navegação e correções pontuais de CSS/JS.

## Ferramentas e fallback
- `npm run dev` executado em `http://127.0.0.1:3000`.
- Browser MCP / `@chrome` e Chrome DevTools MCP foram tentados via descoberta, mas nao ficaram callable nesta sessao.
- Fallback final usado: Playwright com `channel: "chrome"` e evidencias em `_validation/mobile-release-gate/`.

## Rotas e viewports
- Rotas: `/`, `/Apple/index.html`, `/tampas-e-carcacas/index.html`, `/display/tela-display-lcd-realme-c55-rmx3710-com-aro`, `/tampas-e-carcacas/tampa-traseira-iph-12-pro-max`, busca com resultado, busca sem resultado, `/carrinho/`, `/checkout/`.
- Viewports: `320x568`, `360x640`, `375x667`, `390x844`, `414x896`, `430x932`, `768x1024`.

## Fases
- [x] Ler skills obrigatorias e contexto TECH7.
- [x] Criar/atualizar plano, progresso, findings e pasta `_validation/mobile-release-gate/`.
- [x] Rodar servidor local com `npm run dev`.
- [x] Executar auditor mobile com screenshots e checks DOM/network/console.
- [x] Corrigir bugs visuais/navegacao encontrados.
- [x] Rodar `node --check`, `validate:assets`, `validate:routes`, `validate:product-cards`.
- [x] Rodar gate completo final.

## Resultado
- Status final do gate: `APROVADO PARA PRODUCAO`.
- Evidencia principal: `_validation/mobile-release-gate/mobile-release-gate-summary.json`.
- Resultado final: 63 combinacoes rota/viewport, 0 blockers.

---

# Plano de execucao - hardening seguranca TECH7

## Fases
- [x] Auditoria base e plano aprovado.
- [x] Auth/admin: remover credenciais padrao, cookie HttpOnly, logout servidor.
- [x] Carrinho/catalogo: impedir escrita publica em `products`.
- [x] Webhooks/CORS/headers: fail-closed e headers de seguranca.
- [x] Repo hygiene/dependencias/testes.
- [x] Validacao local e Chrome.

## Regras
- Sem git, commit, push ou deploy.
- Sem alterar layout, produtos, textos comerciais ou navegacao publica.
- Preservar compatibilidade do frontend onde possivel.

---

# Plano de execucao - reajuste de produtos restantes

## Objetivo
Atualizar precos de venda apenas de produtos que nao sejam Display/LCD/tela ou equivalentes, usando preco atual como base e adicional por faixa. Backup e preview obrigatorios antes de qualquer update.

## Guardrails
- Fonte de verdade: Supabase; tentar ONE primeiro, fallback Supabase MCP se ONE indisponivel.
- Nunca alterar Display/LCD/tela, frontal, touch, vidro, incel, OLED, Vivid, JK, com/sem aro ou suspeitos.
- Planilha `artifacts/tabela_precos_venda_telas.xlsx` reforca exclusao; nao e unico criterio.
- Atualizar somente campo de preco detectado no banco; preservar todo resto.

## Subagentes
- [x] Catalog Auditor: fonte real, schema, export bruto, campos alteraveis. Agent `019ea06f-28a4-7ab3-8d0b-f9705e7cbef4`.
- [x] Display/LCD Blocklist Matcher: planilha + heuristicas + suspeitos. Agent `019ea06f-4345-71f3-b31c-ed4dcf396be6`.
- [x] Backup Builder: backup completo antes de update. Agent `019ea06f-5889-7600-b37a-1353e38e7a98`.
- [x] Pricing Calculator: preview e faixas. Agent `019ea06f-6ee9-77f0-b2af-8ac939332eee`.
- [x] Update Executor: aplicar somente status Atualizar. Agent `019ea06f-8960-7311-9d6e-e79cdfdec6d8`.
- [x] QA Validator: validar DB, arquivos, scripts e Chrome. Agent `019ea06f-a0a7-7a41-96e4-12608f1c0596`.

## Fases
- [x] Confirmar ferramentas, projeto Supabase e schema.
- [x] Exportar lista completa de produtos atuais.
- [x] Gerar backup XLSX.
- [x] Ler planilha de telas e montar blocklist.
- [x] Gerar preview XLSX com status por produto.
- [x] Validar preview e contagens antes do update.
- [x] Aplicar update somente nos elegiveis.
- [x] Validar que bloqueados nao mudaram e que faixas batem.
- [x] Rodar scripts aplicaveis e validar site/produto/carrinho no Chrome.
- [x] Gerar relatorio JSON final.

## Erros Encontrados
| Erro | Tentativa | Resolucao |
|------|-----------|-----------|
| ONE nao apareceu em tool_search | Descoberta de ferramentas | Registrar indisponibilidade e usar Supabase MCP direto como fallback autorizado |
| `npm run validate:build` timeout 120s | Validacao pos-update | Scripts internos executados isoladamente; todos OK |
| `npm run validate:build` timeout 10min | Validacao agregada | Agregador registrado como timeout; validacoes internas aplicaveis registradas OK |
| `@chrome`/DevTools nao ficou callable | Validacao visual | Fallback final Playwright com screenshots e JSON OK |

### Subagente Display/LCD Blocklist Matcher - 2026-06-07
- [x] Ler skills `caveman` e `planning-with-files`.
- [x] Ler `artifacts/tabela_precos_venda_telas.xlsx` sem alterar banco.
- [x] Ler contexto de catalogo local (`search-index.json`, rotas e artefatos de match).
- [x] Definir heuristicas conservadoras, estrategia de match e riscos.
- [x] Entregar `artifacts/subagent_display_blocklist.md`.

### Subagente Match Report Reader - telas
- [x] Ler regras e skills obrigatorias sem alterar banco/codigo.
- [x] Mapear schema de `artifacts/price-match-report.json`.
- [x] Mapear schema de `artifacts/price-update-preview.csv`.
- [x] Conferir `artifacts/tabela_precos_venda_telas.xlsx` aba `Tabela Completa` quando necessario.
- [x] Identificar matches confiaveis e relacao produto site -> linha/preco da tabela.
- [x] Entregar `artifacts/subagent_match_report_reader_telas.md`.

---

# Plano de execucao - reajuste de telas/display

## Objetivo
Atualizar somente produtos de tela/display no Supabase:
- match confiavel: `price_cents` recebe exatamente `Preco de venda` da planilha.
- sem match confiavel: `price_cents` recebe preco atual + adicional por faixa.
- produtos fora de tela/display nao mudam.

## Guardrails
- ONE deve ser tentado primeiro; se indisponivel, registrar e usar Supabase MCP/DATABASE_URL validado.
- Fonte real: `public.products`.
- Campo alteravel: somente `products.price_cents`.
- Nao alterar `precos.json`.
- Preview antes de update; update com guarda por `id` + preco antigo.

## Subagentes
- [x] Catalog Source Auditor: Agent `019eaa42-2c95-70a1-bc9f-803f00b99fa3`.
- [x] Match Report Reader: Agent `019eaa42-7fd5-78a1-b183-34be1e746e59`.
- [x] Price Rule Calculator: Agent `019eaa42-d245-79e0-bc21-6e72892d70fa`.
- [x] Price Update Executor: Agent `019eaa43-19df-7671-8c7f-937a4ed32739`.
- [x] QA Validator: Agent `019eaa43-77c1-7501-b96d-2204bf3710f0`.

## Fases
- [x] Ler skills e memoria aplicavel.
- [x] Confirmar projeto Supabase ativo.
- [x] Exportar snapshot atual de `products`.
- [x] Ler relatorios de match e planilha.
- [x] Gerar preview geral.
- [x] Validar preview antes de update.
- [x] Aplicar update somente em `price_cents`.
- [x] Validar DB, calculos, scripts e navegador.
- [x] Gerar relatorio final.

## Erros Encontrados
| Erro | Tentativa | Resolucao |
|------|-----------|-----------|
| ONE nao apareceu como ferramenta callable | tool_search por ONE/Supabase | Registrar indisponibilidade e usar Supabase MCP direto + fallback DATABASE_URL validado |
| `npm run validate:build` falhou em `.od-skills` | Primeira rodada pos-update | `scripts/lib/site-audit.js` passou a ignorar `.od-skills`, diretorio oculto nao publicado |

### Subagente Price Rule Calculator - telas
- [x] Ler artefatos locais de match, preview, sem-match e snapshots exportados.
- [x] Validar regra de faixas em centavos para telas/display sem match confiavel.
- [x] Definir tratamento de preco invalido/0/Consultar antes de qualquer calculo.
- [x] Entregar `artifacts/subagent_price_rule_calculator_telas.md`.

---

# Plano de leitura - API Loggi

## Objetivo
Ler a documentacao oficial da Loggi e transformar em plano de integracao para o site TECH 7, separando frete/logistica de pagamento Mercado Pago/Woovi ja existente.

## Fases
- [x] Ler skills obrigatorias: `api-documenter`, `caveman`, `planning-with-files`.
- [x] Consultar memoria aplicavel do checkout TECH7-main.
- [x] Ler indice oficial `llms.txt` e pagina inicial da API.
- [x] Extrair endpoints OpenAPI principais: auth, cotacao, shipment, etiqueta, tracking, webhook, update, cancelamento, dropoff e integrador.
- [x] Conferir superficie local de checkout/pedidos/pagamentos.
- [x] Entregar resumo tecnico e plano de implementacao.

## Decisoes
- A documentacao lida nao expõe API de pagamento Loggi separada; o escopo oficial e frete/logistica.
- No TECH7-main, Loggi deve ser modulo de frete/envio associado a pedidos pagos, mantendo Mercado Pago/Woovi como provedores de pagamento.
- Como shipment e assincrono, criar etiqueta depende de `loggiKey` persistido apos confirmacao via webhook ou consulta.
---

# Plano de execucao - mobile release gate TECH7

## Objetivo
Validar visual mobile final do e-commerce TECH 7 antes de producao, com navegador real/fallback documentado, screenshots, DOM, console, network, navegacao e comandos de regressao.

## Skills usadas
- [x] caveman
- [x] planning-with-files
- [x] webapp-testing
- [x] ui-ux-pro-max
- [x] frontend-developer
- [x] verification-quality

## Ferramentas
- [ ] `npm run dev`
- [x] Tentativa de descoberta Browser MCP / @chrome
- [x] Tentativa de descoberta Chrome DevTools MCP
- [ ] Fallback final Playwright se Browser/DevTools nao estiverem callable
- [ ] Screenshots em `_validation/mobile-release-gate/`

## Subagentes
- [x] `mobile-visual-auditor`: mapear rotas e seletores.
- [x] `layout-bug-hunter`: mapear riscos CSS/JS.
- [ ] `css-fix-agent`: aplicar somente fix CSS/JS se bug visual reproduzido.
- [ ] `chrome-qa-agent`: executar navegacao e cliques reais no navegador disponivel.
- [x] `regression-agent`: mapear validacoes tecnicas.
- [ ] `release-gatekeeper`: emitir decisao final.

## Rotas minimas
- [ ] `/`
- [ ] `/Apple/index.html`
- [ ] `/tampas-e-carcacas/index.html`
- [ ] `/display/tela-display-lcd-realme-c55-rmx3710-com-aro`
- [ ] `/tampas-e-carcacas/tampa-traseira-iph-12-pro-max`
- [ ] busca com resultado
- [ ] busca sem resultado
- [ ] `/carrinho/`
- [ ] `/checkout/` ou primeira tela acessivel do fluxo

## Viewports
- [ ] 320x568
- [ ] 360x640
- [ ] 375x667
- [ ] 390x844
- [ ] 414x896
- [ ] 430x932
- [ ] 768x1024

## Validacoes obrigatorias
- [ ] Sem overflow horizontal: `document.documentElement.scrollWidth <= window.innerWidth`.
- [ ] Header/logo/menu/busca mobile funcionais.
- [ ] Cards, veja tambem, produtos visitados e footer sem quebra.
- [ ] Instagram/WhatsApp/carrinho/checkout/cards clicaveis.
- [ ] Console/network sem erro critico e sem 404 critico.
- [ ] `node --check assets/js/tech7-local-runtime.js` se JS alterado.
- [ ] `npm run validate:assets`
- [ ] `npm run validate:routes`
- [ ] `npm run validate:product-cards`

## Erros encontrados
| Erro | Tentativa | Resolucao |
|------|-----------|-----------|
| Browser MCP / @chrome nao apareceu como ferramenta callable | `tool_search` por Browser MCP/browser-use | Registrar fallback |
| Chrome DevTools MCP nao apareceu como ferramenta callable | `tool_search` por Chrome DevTools MCP | Usar Playwright como fallback final se necessario |

---

# Plano de execucao - remover catalogo Apple errado

## Objetivo
Remover do site TECH7 produtos completos de `Iphones`, `Macs` e `Ipads`, incluindo rota exemplo `/macs/macbook-air-m4-hgwf3/index.html`, sem remover pecas Apple/iPhone em categorias corretas.

## Guardrails
- Fonte real: Supabase `public.products`.
- ONE primeiro; se nao houver acao Supabase callable, usar fallback `DATABASE_URL` validado.
- Backup antes de delete.
- Escopo alvo: `section` normalizada em `iphones`, `macs`, `ipads` e diretorios estaticos correspondentes.
- Nao tocar em `display-e-lcd`, `baterias-celular`, `tampas-e-carcacas`, `pecas-e-componentes`.

## Fases
- [x] Ler skills/memoria e estado local.
- [x] Mapear produtos/rotas alvo.
- [x] Gerar backup.
- [x] Remover do DB e arquivos/indice estatico relacionados.
- [x] Validar API, busca, rotas e navegador local.

---

# Plano de execucao - autoplay carrossel home

## Objetivo
Corrigir o carrossel da tela inicial para trocar automaticamente para o produto da direita a cada 3 segundos.

## Guardrails
- Preservar visual ja ajustado do carrossel.
- Usar `index.html` como superficie principal, onde o Swiper da home e inicializado.
- Validar no servidor local `http://127.0.0.1:3000`.
- Tentar validacao Chrome/DevTools quando ferramenta callable existir; se nao, usar Playwright como fallback registrado.

## Fases
- [x] Ler skills obrigatorias e contexto local.
- [x] Localizar inicializacao do Swiper do carrossel.
- [x] Reproduzir/identificar por que autoplay nao avanca sozinho.
- [x] Corrigir delay para 3000ms e garantir start/restart do autoplay.
- [x] Testar avancos automaticos no navegador.

---

# Plano de execucao - foco central carrossel home

## Objetivo
Fazer o produto principal do carrossel ficar no centro visual da faixa, mantendo autoplay a cada 3 segundos para a direita.

## Guardrails
- Preservar visual escuro/premium ja aplicado.
- Nao quebrar mobile: card ativo deve ficar centralizado dentro do viewport.
- Validar por metrica de centro: centro do slide ativo proximo ao centro do carrossel.
- Validar autoplay apos ajuste.

## Fases
- [x] Ler Product Design index e descartar `design-qa` por falta de mock/source separado.
- [x] Medir desalinhamento atual do slide ativo.
- [x] Ajustar Swiper/CSS para centralizar o slide principal.
- [x] Testar desktop/mobile, autoplay e overflow.

---

# Plano de execucao - marquee beneficios mobile

## Objetivo
Transformar somente a faixa de beneficios da home mobile em marquee/carrossel horizontal continuo, automatico, infinito e sem controles.

## Guardrails
- Aplicar movimento somente em mobile (`max-width: 767px`).
- Preservar desktop/tablet.
- Manter todos os 4 beneficios existentes: Tecnologia, Entrega Rapida, Site Seguro e Atendimento.
- Animar com CSS transform, sem layout shift e sem overflow horizontal.
- Respeitar `prefers-reduced-motion`.

## Fases
- [x] Ler print de referencia, memoria e skills obrigatorias.
- [x] Localizar markup/CSS da faixa.
- [x] Implementar duplicacao interna e CSS marquee mobile.
- [x] Validar em 320px, 375px, 390px e 430px.
- [x] Confirmar desktop preservado.

## Ajuste loop sem salto
- [x] Reproduzir/confirmar fragilidade do loop baseado em `translate(-50%)`.
- [x] Trocar para deslocamento em px medido da sequencia original.
- [x] Validar continuidade do reset no Chrome.

## Ajuste autoplay continuo
- [x] Reduzir ciclo para deixar o movimento automatico perceptivel.
- [x] Forcar `animation-play-state: running` no trilho mobile.
- [x] Adicionar watchdog leve para reiniciar a animacao se CSS/script externo pausar o trilho.
- [x] Validar no Chrome que o trilho anda sozinho e completa loop.
- [x] Trocar para ticker JS por `requestAnimationFrame` quando o ambiente ainda nao refletir giro automatico.
- [x] Versionar chamada do runtime no HTML para evitar JS antigo no cache do Chrome.

---

# Plano de execucao - Produtos visitados imagens TECH7

## Objetivo
Corrigir `Produtos visitados` para exibir imagens reais dos produtos, preservando cards de categoria, busca, home, produto individual e carrosseis.

## Guardrails
- Investigar antes de editar.
- Nao corrigir produto por produto.
- Corrigir causa compartilhada no runtime.
- Nao alterar Supabase/API/dados de produto sem ONE; nesta tarefa nao houve alteracao de dados externos.
- Validar primeiro com `@chrome`; Playwright somente como fallback para mobile.

## Fases
- [x] Confirmar `cwd` e regras do projeto.
- [x] Atualizar `task_plan.md`, `findings.md` e `progress.md`.
- [x] Localizar runtime de `Produtos visitados`, storage e resolvedores de imagem.
- [x] Reproduzir problema no Chrome real.
- [x] Comparar URL quebrada com imagem canonica/indice local.
- [x] Corrigir resolvedor compartilhado por `og:image`, slug, rota e titulo.
- [x] Reidratar itens antigos de `visitedProducts` quando houver slug/rota suficiente.
- [x] Validar desktop no Chrome real.
- [x] Validar categoria/cards normais no Chrome real.
- [x] Validar mobile via fallback Playwright e registrar limitacao do breakpoint.
- [x] Rodar validacoes aplicaveis e registrar timeouts dos gates globais pesados.

## Evidencias
- Antes: `_validation/visited-products/before-runtime-fix-desktop.png`
- Depois desktop: `_validation/visited-products/after-runtime-fix-desktop.png`
- Mobile fallback: `_validation/visited-products/after-runtime-fix-mobile-playwright.png`
- Mobile JSON: `_validation/visited-products/mobile-fallback-validation.json`

---

# Plano de execucao - preco inicial errado TECH7

## Objetivo
Impedir que qualquer pagina mostre preco antigo/estatico/cacheado antes do preco real do banco/API carregar.

## Guardrails
- ONE primeiro antes de alterar preco, produto, banco, Supabase, API, carrinho ou checkout.
- Supabase/banco e fonte de verdade do preco.
- Nao usar HTML estatico, `precos.json`, `dataLayer`, cache/localStorage ou hardcoded como fonte final.
- Se preco do banco nao carregou, mostrar estado neutro/carregando, nunca preco incorreto.
- Validar com `@chrome` primeiro; DevTools depois; Playwright so fallback.
- Preservar home, categorias, busca, produto individual, produtos visitados, carrinho e checkout.

## Workstreams
- Price Source Investigator: mapear fontes e identificar preco inicial vs final.
- Database Price Validator: confirmar projeto/preco real via ONE ou fallback documentado.
- Runtime/API Analyst: revisar `/api/products/resolve-prices`, `server/routes/products.js`, `preco-loader.js`, `assets/js/tech7-local-runtime.js`.
- Fix Implementer: neutralizar preco estatico e padronizar exibicao pelo resolvedor confiavel.
- QA Validator: validar visual, console, network e consistencia com banco.

## Fases
- [x] Confirmar `cwd` e carregar regras/skills.
- [x] Atualizar arquivos de planejamento.
- [x] Tentar conectar via ONE e registrar indisponibilidade.
- [x] Se ONE indisponivel, registrar e usar fallback DB local/env.
- [x] Mapear fontes de preco com `rg`.
- [x] Reproduzir bug no Chrome real com tempo/preco inicial/final/network.
- [x] Confirmar preco real no banco.
- [x] Identificar causa raiz.
- [x] Implementar fix minimo.
- [x] Validar home/categoria/busca/produto/visitados/carrinho/checkout.
- [x] Rodar validacoes aplicaveis e registrar limites/timeouts.

## Evidencias
- Chrome real home: `_validation/price-source/home-price-after-fix-chrome.png`
- Home com API atrasada: `_validation/price-source/home-price-delayed-api-validation.json`
- Produto com API atrasada: `_validation/price-source/product-price-delayed-api-validation.json`
- Carrinho com localStorage antigo: `_validation/price-source/cart-price-delayed-api-validation.json`
- Checkout com localStorage antigo: `_validation/price-source/checkout-price-delayed-api-validation.json`
- Busca: `_validation/price-source/search-price-validation.json`
- Superficies categoria/mobile: `_validation/price-source/surface-price-validation.json`

## Deploy Vercel
- [x] Confirmar projeto Vercel linkado localmente.
- [x] Tentar deploy padrao.
- [x] Registrar falha por limite de arquivos.
- [x] Tentar deploy com `--archive=tgz`.
- [ ] Resolver pacote grande sem alterar funcionamento do site.
- [ ] Publicar em producao.
- [ ] Validar smoke de producao.

## Erros de deploy
| Erro | Tentativa | Proximo passo |
|------|-----------|---------------|
| `files` maior que 15000 itens | `npx vercel deploy --prod --yes` | Usar archive ou reduzir pacote |
| API Vercel `Internal Server` / worker timeout com pacote ~1.1GB | `npx vercel deploy --prod --yes --archive=tgz` | Investigar conteudo pesado e escolher deploy alternativo seguro |
