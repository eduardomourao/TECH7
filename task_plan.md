# Plano de execucao - performance producao TECH7 (2026-06-13)

## Admin `/Admin` - filtros, massa, exclusoes e tema - 2026-06-15
- [x] Confirmar cwd e escopo restrito ao painel admin.
- [x] Usar Supabase plugin e confirmar projeto ativo antes de tocar produtos/pedidos/OS/categorias.
- [x] Mapear tabelas reais: `products`, `categories`, `orders`, `service_orders`.
- [x] Implementar endpoints/admin helpers sem mexer storefront publico.
- [x] Implementar UI admin: filtros, ordenacao, salvar tudo, exclusoes, tema e categorias por select.
- [x] Rodar validacoes npm e sintaxe JS.
- [x] Validar navegador com Chrome; se ferramenta nao expor comandos, registrar fallback.
- [x] Commit e push para GitHub apos validacao.

### Guardrails Admin
- Alterar somente `admin.html`, `assets/js/admin.js`, `server/routes/admin.js` e arquivos de acompanhamento.
- Produtos usam soft delete/inativacao quando possivel.
- Pedidos e OS sem coluna `deleted_at`: exclusao no admin deve cancelar status, preservando historico e FKs.
- Categoria no admin deve vir de `categories` do banco, nao campo livre.

### Ajuste solicitado - produto delete real - 2026-06-15
- [x] Confirmar FKs no Supabase antes de alterar exclusao de produto.
- [x] Alterar DELETE admin de produto para remover linha de `products` do banco.
- [x] Atualizar textos da UI para exclusao definitiva.
- [x] Validar sintaxe/endpoints e push GitHub.

### Ajuste solicitado - cards operacionais clicaveis - 2026-06-15
- [x] Transformar cards da visao operacional em botoes clicaveis.
- [x] Mapear cada card para filtro/aba correta.
- [x] Adicionar filtros backend faltantes para duplicados e OS agregadas.
- [x] Validar JS/API e navegador.

### Ajuste solicitado - dashboard admin visual e graficos - 2026-06-15
- [x] Melhorar layout da pagina Dashboard no `/Admin`.
- [x] Preservar cards clicaveis e funcoes atuais.
- [x] Adicionar graficos/resumos visuais usando metricas existentes.
- [x] Validar sintaxe e navegador.

## Remover logo errada do site/admin - 2026-06-15
- [x] Localizar origem da logo errada mostrada na aba/Admin.
- [x] Identificar logo correta TECH 7 no projeto.
- [x] Substituir favicon/icone incorreto sem alterar rotas ou negocio.
- [x] Validar localmente e registrar evidencias.
- [ ] Fazer deploy e validar producao.

## Deploy alteracoes paginas de duvidas - 2026-06-14
- [x] Confirmar estado local e projeto Vercel vinculado.
- [x] Rodar validacoes rapidas antes do deploy.
- [x] Fazer deploy de producao com Vercel.
- [x] Validar URL publicada com smoke tests.

## Ajuste pagina Tipos de Telas - video OLED vs Original - 2026-06-14
- [x] Localizar pagina `duvidas-tipos-de-telas/index.html`.
- [x] Inserir player responsivo do Google Drive.
- [x] Adicionar aviso explicito sobre comparativo OLED vs ORIGINAL linha S Ultra S20-S25 Ultra.
- [x] Validar rotas/assets e conferir render mobile local.

## Ajuste textual - Servico de Instalacao - 2026-06-14
- [x] Localizar pagina `duvidas-servico-de-instalacao/index.html`.
- [x] Mapear ocorrencias reais de `X3 Distribuidora` sem confundir com produtos `Poco X3`.
- [x] Reescrever condicoes de instalacao conforme pedido.
- [x] Corrigir nome/endereco da loja e remover citacoes antigas de `X3` que nao sejam produtos.
- [x] Validar assets/rotas e conferir pagina local.

## Deploy solicitado - 2026-06-14
- [x] Confirmar projeto Vercel vinculado.
- [x] Rodar validacoes rapidas antes do deploy.
- [x] Fazer deploy do workspace atual na Vercel.
- [x] Validar URL publicada com smoke tests.

## Ajuste pontual - carrossel home
- [x] Restringir escopo ao carrossel da home.
- [x] Gerar assets otimizados derivados somente das imagens do carrossel.
- [x] Atualizar markup do carrossel para `srcset`/`sizes` e prioridade correta.
- [x] Validar sintaxe, assets e rotas.
- [x] Validar no navegador mobile com fallback documentado se Browser/Chrome MCP nao estiver callable.

## Objetivo
Identificar por que `https://tech-7.vercel.app/` demora para carregar em producao, separando DNS/TLS, TTFB, HTML, assets, APIs, banco/Supabase, renderizacao, cold start e warm start.

## Guardrails
- Comecar medindo. Nao alterar codigo antes de evidenciar gargalo.
- Dominio real do cliente: `https://tech-7.vercel.app/`.
- Runtime real de producao: `server/app.js` via `api/[...path].js`; nao confundir com `admin/`.
- ONE/Supabase: antes de mexer em banco/produtos/precos/carrinho/pedidos/auth/Supabase, tentar ONE e confirmar projeto ativo. Se indisponivel, registrar e usar fallback apenas depois.
- Browser: tentar Browser MCP / `@chrome`; depois Chrome DevTools MCP; Playwright Chrome apenas fallback final registrado.
- Se houver correcao, deve reduzir metrica medida e passar validacoes.

## Rotas e endpoints alvo
- `/`
- `/Apple/index.html`
- `/display/tela-display-lcd-realme-c55-rmx3710-com-aro`
- `/carrinho/`
- `/api/health`
- `/api/products`
- `/api/search?q=iphone&limit=24`
- `/api/products/resolve-prices`

## Subagentes
- production-performance-auditor: medir cold/warm, TTFB, payload, waterfall e local vs producao.
- server-startup-investigator: revisar startup/imports/envs/integracoes opcionais em `server/app.js`.
- database-latency-investigator: medir conexao/query Supabase e latencia API.
- frontend-waterfall-auditor: auditar JS/CSS/imagens/APIs de primeiro load.
- fix-planner: priorizar correcoes por impacto/risco.
- qa-validator: repetir medicoes e validar producao.

## Fases
- [x] Confirmar cwd, dominio e skills obrigatorias.
- [ ] Tentar ONE, Browser MCP, Chrome DevTools MCP e Vercel/logs.
- [ ] Medir producao sem alterar: cold/warm, APIs, navegador e waterfall.
- [ ] Medir local para comparar.
- [ ] Inspecionar `server/app.js`, `api/[...path].js`, `server/lib/db.js`, `vercel.json`, assets e chamadas iniciais.
- [ ] Identificar causa raiz com evidencia.
- [ ] Implementar somente correcao segura, se comprovada.
- [ ] Rodar validacoes e repetir medicoes.
- [ ] Relatorio final.

---

# Plano de execucao - mobile production gate TECH7 (2026-06-12)

## Objetivo
Testar o site TECH7 rodando localmente em versao mobile antes de producao, usando navegador real, screenshots, DOM, console, network, navegacao e performance basica.

## Guardrails
- CWD: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Skills usadas nesta rodada: `caveman`, `planning-with-files`, `cloudflare:web-perf`, `website-building`.
- Ferramenta solicitada: Browser MCP. Descoberta feita via `tool_search`; Browser MCP e Chrome DevTools MCP nao expuseram comandos chamaveis de navegacao/screenshot/trace nesta sessao.
- Fallback final permitido e registrado: Playwright com Google Chrome.
- Corrigir somente CSS/JS necessario para bugs visuais ou navegacao mobile; nao alterar produto, preco, checkout, banco ou rotas sem necessidade clara.

## Rotas alvo
- `/`
- `/Apple/index.html`
- `/tela-display-lcd/index.html`
- `/tela-display-lcd/samsung/index.html`
- `/tampas-e-carcacas/index.html`
- `/display/tela-display-lcd-realme-c55-rmx3710-com-aro`
- `/display/samsung/tela-display-lcd-samsung-s20-ultra-g988-oled-com-aro`
- `/tampas-e-carcacas/tampa-traseira-iph-12-pro-max`
- `/busca/?palavra_busca=iphone`
- `/busca/?palavra_busca=zzzznaoexiste`
- `/carrinho/`
- `/checkout/`

## Viewports alvo
- `320x568`
- `360x640`
- `375x667`
- `390x844`
- `414x896`
- `430x932`
- `768x1024`

## Fases
- [x] Confirmar cwd e regras do projeto.
- [x] Tentar Browser MCP e Chrome DevTools MCP.
- [x] Rodar auditoria mobile com screenshots, console, network, DOM, cliques e overflow.
- [x] Corrigir bugs encontrados.
- [x] Revalidar rotas/viewports afetadas.
- [x] Rodar validadores npm relevantes.
- [x] Decisao release gate: `APROVADO PARA PRODUCAO`.

---

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

# Plano de execucao - filtros mobile TECH7 (2026-06-12)

## Objetivo
Corrigir a tela de filtros no mobile para ficar adaptada, legivel e clicavel, preservando produtos, rotas, preco e logica de negocio.

## Guardrails
- CWD: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Corrigir no runtime/CSS compartilhado; evitar editar milhares de HTMLs estaticos.
- Browser-first: tentar `@chrome`/Browser e Chrome DevTools; se nao ficarem callable, usar Playwright Chrome fallback e registrar.
- Sem alterar banco, produto, preco, categoria ou rota.

## Fases
- [x] Ler skills `senior-fullstack`, `caveman`, `planning-with-files`.
- [x] Localizar markup/runtime de filtros.
- [x] Reproduzir problema em mobile e salvar evidencia antes.
- [x] Implementar ajuste minimo CSS/JS.
- [x] Validar abertura/fechamento, clique em filtro, URL/lista, overflow e console.
- [x] Rodar validadores relevantes.

## Resultado
- Causa: painel legado `.box-fixed .box-white` mantinha formato estreito/alto demais no mobile e alguns labels apontavam para ids inexistentes, reduzindo a area clicavel.
- Correcao: `assets/js/tech7-local-runtime.js` injeta CSS mobile para drawer lateral responsivo, bloqueia scroll do body enquanto aberto, normaliza labels/inputs e preenche labels de faixas de preco vazias.
- Evidencias: `_validation/mobile-filters/before-filters-390.json`, `before-filters-open-390.png`, `after-mobile-filters-validation.json`, `after-filters-open-final-390.png`, `after-filters-samsung-final-390.png`.
- Validacoes: `node --check assets/js/tech7-local-runtime.js`, `npm run validate:routes`, `npm run validate:assets` OK.

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

## Reajuste Galaxy Ultra OLED - 2026-06-12
- Escopo confirmado pelo usuario: somente telas dos modelos Galaxy S20 Ultra, Note 20 Ultra, S21 Ultra, S22 Ultra e S23 Ultra; OLED para `R$ 950,00`; Incell/Vivid para `R$ 450,00`.
- ONE, Supabase plugin e Composio nao ficaram callable nesta sessao; fallback usado: `DATABASE_URL` do runtime local apontando para Supabase pooler `aws-1-sa-east-1.pooler.supabase.com`.
- Produtos ativos encontrados e atualizados no banco para `price_cents=95000`: Note 20 Ultra OLED, S20 Ultra OLED com aro, S21 Ultra OLED com aro e S23 Ultra OLED com aro.
- Nenhum produto ativo S22 Ultra OLED, Incell ou Vivid foi encontrado dentro do escopo confirmado; nada foi alterado para `R$ 450,00`.
- HTML estatico principal alinhado nas quatro paginas `display/samsung/...`.
- Correção adicional em `produto-comprar.js`: permitir recriar a UI de compra em pagina de produto mesmo quando o form Tray legado ja tiver sido removido antes do script local rodar.
- Validacao final: API `/api/products/resolve-prices`, Playwright Chrome fallback em 390x844, `node --check`, `npm run validate:backend-prices`, `npm run validate:routes`, `npm run validate:assets` e `npm run validate:product-cards` OK.
- Evidencia: `_validation/price-performance/galaxy-ultra-oled-950-validation.json` e screenshots `galaxy-ultra-oled-950-*.png`.

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

---

# Plano de execucao - busca inteligente no header TECH7

## Objetivo
Adicionar autocomplete em tempo real no campo de busca do header, com imagem, nome, preco real e categoria, preservando Enter para busca tradicional.

## Guardrails
- ONE primeiro antes de mexer em produto, preco, API, busca ou Supabase.
- Se ONE indisponivel, registrar e usar fallback local/API/env.
- Supabase/API deve ser fonte confiavel para produtos/precos.
- `_assets/tech7/search-index.json` apenas auxiliar, nao fonte final de preco.
- Debounce 200-300ms, limite 6-8 sugestoes, ignorar resposta antiga.
- Nao quebrar busca existente, menu, carrinho, mobile ou desktop.

## Subagentes
- Search Flow Analyst: mapear header e fluxo atual.
- Data Accuracy Validator: mapear API confiavel e campos.
- Responsive QA: mapear constraints do header/dropdown.
- Autocomplete Implementer: execucao local no runtime apos investigacao.

## Fases
- [x] Confirmar cwd, skills e estado Git.
- [x] Tentar ONE e registrar indisponibilidade.
- [x] Mapear busca/header/API existente.
- [x] Implementar endpoint/API ou reaproveitar endpoint confiavel.
- [x] Implementar UI autocomplete desktop/mobile.
- [x] Validar dados reais de preco/imagem/categoria.
- [x] Rodar validacoes `node --check`, `npm run validate:product-cards`, `npm run validate:build`.
- [x] Validar visualmente com `@chrome` ou fallback reportado.

## Resultado
- Endpoint reaproveitado: `/api/search?q=<termo>&limit=24`, com sugestoes finais limitadas a 8.
- UI implementada no runtime compartilhado `assets/js/tech7-local-runtime.js`, com debounce de 250ms, `AbortController`, descarte por sequencia, Escape, clique fora, Enter nativo e clique na sugestao.
- Home deixou de usar o autocomplete inline antigo quando o runtime compartilhado esta ativo.
- Validacao visual via Playwright Chrome fallback porque `@chrome` nao ficou callable nesta sessao: `_validation/search-autocomplete/search-autocomplete-validation.json` e screenshots desktop/mobile.
- Validacoes finais OK: `node --check assets/js/tech7-local-runtime.js`, `npm run validate:product-cards`, `npm run validate:build`.

---

# Plano de execucao - galeria produto mobile

## Objetivo
Corrigir a galeria de imagens em paginas de produto somente no mobile, garantindo proxima/anterior, thumbnails e swipe sem overflow horizontal e sem regressao desktop.

## Guardrails
- Corrigir runtime/CSS compartilhado, nao produto individual.
- Inspecionar primeiro `assets/js/tech7-local-runtime.js` e `_custom/tech7-theme.css`.
- Preservar desktop.
- Validar Chrome mobile em 320, 375, 390 e 430px e desktop.
- Rodar `npm run validate:build` e validacoes de galeria disponiveis.

## Fases
- [x] Ler memoria e skills obrigatorias.
- [x] Analisar print e mapear seletores compartilhados.
- [x] Reproduzir comportamento no Chrome mobile.
- [x] Corrigir runtime/CSS compartilhado.
- [x] Validar proximo/anterior, thumb e swipe em mobile.
- [x] Validar desktop.
- [x] Rodar validacoes npm obrigatorias.

## Evidencias
- `artifacts/product-gallery-final4-validation.json`: mobile 320/375/390/430 OK para proximo, anterior, swipe, thumbnail, uma imagem principal visivel, sem overflow e sem salto de scroll.
- `artifacts/product-gallery-desktop-final4.png`: desktop preservado; thumbnails continuam acionando a galeria e setas mobile nao aparecem.
- `npm run validate:product-gallery`: 25/25 galerias OK.
- `npm run validate:gallery-selected-sync -- 40`: 40/40 OK; execucao completa sem limite excedeu 300s.
- `npm run validate:build`: OK.
- `npm run validate:product-images`: 26/26 imagens visiveis.
- `npm run validate:gallery-position`: 24/24 OK.
- `npm run validate:product-gallery-static-dedupe`: OK; simulacao sem falhas.
- `npm run validate:product-gallery-dedupe`: excedeu 180s sem resultado.
- 2026-06-12: `artifacts/realme-gallery-final-overlap-validation.json`: produto Realme C55 mobile em 320/375/400/430 OK; sem corte/sobreposicao, thumbs abaixo, titulo abaixo da galeria, next/prev OK e sem overflow horizontal.
- 2026-06-12: `artifacts/realme-gallery-final-overlap-400.png`: screenshot visual da largura do print corrigida.
- 2026-06-12: `npm run validate:product-gallery`: 25/25 galerias OK apos ajuste de sync das setas desktop.
- 2026-06-12: `npm run validate:gallery-position`: 24/24 OK.
- 2026-06-12: `npm run validate:build`: OK.
- 2026-06-12: `artifacts/thumb-gallery-overlap-report.json`: Realme C35 em 320/375/390/430 sem sobreposicao de thumbnails e sem overflow horizontal.
- 2026-06-12: `artifacts/thumb-gallery-many-overlap-report.json`: Samsung A16 com 5 thumbnails em 320/375/390/430 com scroll interno, gaps de 16px entre cards e sem overflow horizontal de pagina.
- 2026-06-12: `artifacts/thumb-gallery-many-320.png`: captura visual da largura mais critica com miniaturas lado a lado e bordas inteiras.
- 2026-06-12: `npm run validate:gallery-position`: 24/24 OK apos ajuste adicional de spacing dos thumbnails.
- 2026-06-12: `npm run validate:product-gallery`: 25/25 OK apos ajuste adicional de spacing dos thumbnails.
## Admin OS Dashboard Upgrade - 2026-06-12

Goal: improve `admin.html` as the real Tech 7 admin surface, preserve existing product/order/pricing/report functions, add useful business dashboard data, add Service Orders, and generate printable/downloadable OS PDF.

Rules in force:
- Use `admin.html` + `assets/js/admin.js` as primary admin UI.
- Preserve CRUD/products/prices/images/categories/orders/integrations.
- ONE was searched first but is not callable in this session; use app runtime Supabase fallback and report it.
- Supabase/runtime database remains source of truth.
- Use npm commands and Chrome validation before final handoff.

Phases:
- [x] Confirm project structure and primary admin surface.
- [x] Read local `caveman` and global `planning-with-files` skills.
- [x] Discover ONE/Supabase/Chrome/Data Analytics/Creative Production tooling.
- [x] Map current admin API and UI.
- [x] Query runtime Supabase schema read-only.
- [x] Add OS schema migration.
- [x] Extend admin API with OS CRUD, order-to-OS, PDF payload, richer metrics.
- [x] Extend `admin.html` navigation and responsive operational UI.
- [x] Extend `assets/js/admin.js` with Dashboard, Products alerts, Orders -> OS, OS workspace, PDF generation/download/print/WhatsApp link.
- [x] Run migration and validations.
- [x] Validate in browser fallback and record evidence.

Errors / constraints:
- ONE MCP/plugin not found through tool discovery. Fallback: Supabase app + runtime DB via `server/lib/db.js`.
- Supabase app project list returned only an inactive project; runtime DB is `DATABASE_URL` against Supabase pooler, so implementation uses runtime source of truth.
- `npm run db:migrate` initially failed because `server/db/migrate.js` did not load `.env`; fixed by importing `dotenv/config`.
- `@chrome`/Chrome DevTools tools were not callable in this session after discovery attempts. Visual validation used Playwright fallback, with screenshots under `_validation/admin-os/`.

Follow-up bugfix - OS tab `http_404`:
- [x] Reproduced local port 3000 API state: `/api/admin/service-orders` returned 404 while `/api/admin/metrics` returned expected 401 without session.
- [x] Confirmed Supabase fallback project `lzsaaufsdcmqlasjrqck` has OS tables already migrated.
- [x] Restarted local `node server/index.js` on port 3000 so the current admin routes are loaded.
- [x] Verified unauthenticated OS route now returns expected 401 and authenticated route returns 200.
- [x] Added clearer frontend message for `http_404`.
- [x] Validated OS tab visually via Playwright fallback: no `http_404`, no load error, API status 200.

Follow-up - OS manual product sale and client PDF:
- [x] Confirmed ONE still not exposed as callable; used active Supabase plugin fallback project `lzsaaufsdcmqlasjrqck`.
- [x] Keep OS source of truth in `service_orders` and `service_order_items`; do not create fake rows in `orders`.
- [x] Add product search/selection inside manual OS form.
- [x] Ensure selected product name/price are hydrated from server catalog by `product_id`, overriding browser-provided name/price.
- [x] Count service-order products as product sales in dashboard product revenue, top products and top categories when OS is not canceled.
- [x] Keep order-to-OS flow using order item prices as existing sale context.
- [x] Update PDF header for client delivery with Tech 7 logo mark at top-left, store details, customer copy label, totals, warranty, client awareness text and signatures.
- [x] Validate API, visual flow, PDF and cleanup of test OS rows.

Follow-up - OS save FK bug and deploy:
- [x] Diagnose local save error from server logs.
- [x] Validate optional order origin before save.
- [x] Return friendly client error for invalid order origin instead of generic DB failure.
- [ ] Reproduce invalid/manual OS cases locally.
- [ ] Run validation gates.
- [ ] Commit/push to GitHub.
- [ ] Deploy/verify Vercel.

## Follow-up - OS PDF visual repair - 2026-06-13

Goal: improve the client-facing Service Order PDF so it is clean, printable, brand-consistent and visually verified.

Plugin guidance in force:
- Creative Production: professional print document, restrained Tech 7 brand accents, no random dark/orange blocks.
- Product Design: operational document first, dense readable sections, clear hierarchy, no landing-page styling.

Phases:
- [x] Read required project skills.
- [x] Locate current OS PDF generator in `server/routes/admin.js`.
- [x] Generate current PDF evidence and inspect layout.
- [x] Replace broken PDF layout with stable A4 client document.
- [x] Validate syntax/API/PDF output.
- [x] Run visual verification and save screenshots/PDF evidence.

## Follow-up - Mobile Search Suggestions Placement - 2026-06-13

Goal: fix mobile header search suggestions opening over the wrong page area after typing in the search field.

Product Design guidance:
- Keep suggestions visually anchored to the search input.
- Use a compact, scrollable overlay suitable for one-handed mobile use.
- Avoid pushing or overlapping the showcase layout in an uncontrolled way.

Phases:
- [x] Locate real search surface in `index.html` and runtime autocomplete code.
- [x] Adjust mobile dropdown positioning against the live input rectangle and visual viewport.
- [x] Validate syntax and mobile visual geometry.
- [x] Save visual evidence.
