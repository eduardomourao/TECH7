# Progresso - performance producao TECH7 (2026-06-13)

- 2026-06-20: iniciado objetivo de investigar por que edicoes admin de titulo, imagem, descricao e categoria nao aparecem no site.
- 2026-06-20: skills obrigatorias lidas/aplicadas: `caveman` e `planning-with-files`.
- 2026-06-20: memoria consultada para contexto do fluxo admin novo produto; final deve citar memoria usada.
- 2026-06-20: worktree ja continha alteracoes pendentes de tarefas anteriores; escopo sera preservar e corrigir somente fluxo necessario.

- 2026-06-20: iniciado objetivo `+ Novo produto` no `/Admin`.
- 2026-06-20: cwd confirmado em `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- 2026-06-20: ONE tentado primeiro, mas sem ferramentas de consulta Supabase utilizaveis nesta sessao; fallback para `@supabase` registrado.
- 2026-06-20: `@supabase` instalado/ativado e projeto `supabase-bisque-bridge` (`lzsaaufsdcmqlasjrqck`) confirmado `ACTIVE_HEALTHY`.
- 2026-06-20: arquivos obrigatorios de acompanhamento atualizados antes das alteracoes funcionais.
- 2026-06-20: schema mapeado no `@supabase`: `products`, `categories`, `product_images`, `product_categories`, `product_variants`.
- 2026-06-20: fluxo publico identificado em `server/app.js`; novo produto usa o template dinamico existente e nao um layout novo.
- 2026-06-20: admin ajustado para `+ Novo produto`, campos iniciais vazios, categoria por select com placeholder e galeria editavel.
- 2026-06-20: backend ajustado para criacao real com categoria valida, slug global unico, preco positivo e persistencia de imagens/categoria em transacao.
- 2026-06-20: `node --check assets/js/admin.js` e `node --check server/routes/admin.js` passaram.
- 2026-06-20: teste Chrome fallback encontrou bloqueio de URLs locais por `type="url"` no campo de imagem; corrigido para `type="text"` com validacao backend.
- 2026-06-20: template dinamico de produto em `server/app.js` ajustado para nao ter overflow horizontal e incluir compra/frete no produto criado pelo admin.
- 2026-06-20: validacao Chrome fallback final criou produto real, abriu pagina publica com layout dinamico existente, confirmou 2 imagens/2 thumbs, preco, titulo, compra, frete e sem overflow; evidencias em `_validation/admin-new-product/`.
- 2026-06-20: produto QA removido apos o teste; Supabase confirmou `qa_products_left = 0`.
- 2026-06-20: validacoes finais OK: `node --check assets/js/admin.js`, `node --check server/routes/admin.js`, `node --check server/app.js`, `npm run validate:assets`, `npm run validate:routes`, `npm run validate:endpoints`, `npm run validate:build`.

- 2026-06-15: iniciado ajuste exclusivo do `/Admin`: filtros, ordenacao, salvar todas alteracoes, exclusoes, tema e select de categoria por banco.
- Skills usadas: `caveman` e `planning-with-files`.
- Supabase plugin usado antes de alterar dados/admin: projeto `supabase-bisque-bridge` (`lzsaaufsdcmqlasjrqck`) confirmado ativo/healthy.
- Supabase verificado: `categories` com 11 categorias comerciais; `products` com soft delete por `active/is_active`; `orders` sem `deleted_at`; `service_orders` sem `deleted_at`.
- Estrategia definida: produto = inativacao; pedido = status `cancelled`; OS = status `cancelada`; nenhum hard delete em dados com historico/FKs.
- Escopo tecnico planejado: `admin.html`, `assets/js/admin.js`, `server/routes/admin.js`, `task_plan.md`, `findings.md`, `progress.md`.
- Implementado: filtros por status de alerta, ordenacao por preco/nome, `Salvar todas as alteracoes`, inativacao de produto, cancelamento seguro de pedido/OS, tema claro/noturno e select de categoria vindo do banco.
- Validacoes OK: `node --check assets/js/admin.js`, `node --check server/routes/admin.js`, `npm run validate:assets`, `npm run validate:routes`, `npm run validate:endpoints`.
- `@chrome` direto nao expos comandos de navegacao nesta sessao; validacao feita com Google Chrome via Playwright `channel: "chrome"` pelo `node_repl`, com evidencias em `_validation/admin-panel-release/admin-ui-validation.json` e `admin-products-after.png`.
- Resultado da validacao Chrome fallback: salvar sem reload `true`, 1 chamada de save, 1 delete produto, 1 delete pedido, 1 delete OS, tema claro/escuro alternando, sem overflow, sem console/network errors.
- Commit/push GitHub concluido na branch `main`: `b93c2566c` (`Improve admin panel controls`).
- Usuario reportou `Erro ao carregar produtos: http_404` em `/Admin`.
- Confirmado: servidor local antigo respondia 404 em `/api/admin/categories`; apos reinicio, a mesma rota responde 401 sem sessao, indicando que existe e exige auth.
- Fallback implementado em `assets/js/admin.js`: erro no carregamento de categorias nao derruba a aba Produtos.
- Evidencia adicional: `_validation/admin-panel-release/products-load-fallback-after.json` e `products-load-fallback-after.png`.
- Usuario exigiu que `Excluir produto` remova o registro do banco.
- Supabase consultado antes da mudanca: FKs bloqueantes em `cart_items` e `order_items`; cascatas/set-null nas demais dependencias.
- Implementado hard delete de produto no admin: transacao apaga `cart_items`, apaga `order_items` do produto e depois apaga `products`; cascatas removem imagens/variantes/categorias/OLX e OS fica com `product_id` null pelo FK.
- UI atualizada: botao vermelho agora mostra `Excluir definitivo`; confirmacao avisa que a acao nao pode ser desfeita.
- Botao de status `Ativo/Inativo` voltou a usar `PATCH`, para nao apagar produto por acidente.
- Validacoes OK: `node --check server/routes/admin.js`, `node --check assets/js/admin.js`, `npm run validate:endpoints`.
- Chrome fallback validou: status chama `PATCH`, excluir definitivo chama `DELETE`, linha sai da tabela. Evidencias: `_validation/admin-panel-release/product-hard-delete-ui-after.json` e `product-hard-delete-label-after.json`.
- Usuario pediu cards clicaveis na `Visao operacional`.
- Implementado: cards viraram botoes com `data-dashboard-action`; cada clique muda aba e aplica filtro real.
- Mapeamentos validados: `alert=missing_price`, `alert=missing_image`, `alert=low_stock`, `active=false`, `alert=duplicate`, `orders status=pending`, `service-orders status=open`, `service-orders status=completed`.
- Validacoes OK: `node --check assets/js/admin.js`, `node --check server/routes/admin.js`, `npm run validate:endpoints`, Chrome fallback.
- Usuario pediu melhoria visual do dashboard admin com Creative Production e Product Design.
- Implementado em `admin.html` e `assets/js/admin.js`: hero executivo, metricas compactas, graficos circulares, barras empilhadas e layout responsivo.
- Funcoes atuais preservadas: cards operacionais seguem clicaveis e filtros continuam funcionando.
- Validacao Chrome fallback final: desktop `1366x980` e mobile `390x844` sem overflow e sem console errors.
- Deploy via GitHub solicitado. Workflow encontrado: `.github/workflows/pages.yml`, dispara em push para `main` e publica GitHub Pages.
- Validacoes pre-deploy GitHub OK: `npm run validate:assets`, `npm run validate:routes`, `npm run validate:endpoints`.

- 2026-06-15: usuario reportou logo errada aparecendo na aba/Admin de `tech-7.vercel.app`.
- Inspecao: `favicon.png` de raiz e producao ja sao TECH 7 correto; `admin.html` nao tinha links de favicon e podia cair em cache/fallback antigo.
- Correcao: `admin.html` recebeu `theme-color` laranja e links explicitamente versionados para `/favicon.ico`, `/favicon.png` e `/apple-touch-icon.png`.
- Validacoes locais OK: `npm run validate:routes`, `npm run validate:assets`; `/admin` local contem `favicon.png?v=tech7-20260615`.
- Validacao Chrome fallback local OK: `_validation/admin-favicon/admin-favicon-local.png` e `_validation/admin-favicon/admin-favicon-local.json`; favicon PNG/ICO versionados responderam 200. `/api/admin/session` 401 e esperado sem login.

- 2026-06-14: usuario solicitou deploy das alteracoes recentes.
- Projeto Vercel confirmado: `tech-7`, projectId `prj_UDDtUcUUQaEg4m01BhsnR5eSjjhI`, org/team `team_yKRleuToOM89NQWd3zIxD5kc`.
- Estado local antes do deploy ainda inclui alteracoes anteriores no workspace (`assets/js/tech7-local-runtime.js`, `server/routes/admin.js`, `index.html`, assets de carrossel e paginas de duvidas). Deploy Vercel publica o workspace atual.
- Validacoes pre-deploy OK: `npm run validate:routes`, `npm run validate:assets`, `npm run validate:endpoints`.
- Nota: primeira execucao de `validate:assets` em paralelo estourou timeout; repetida isoladamente com timeout maior e passou.
- Deploy iniciado com `npx vercel deploy --prod --yes --archive=tgz`; o CLI ficou preso e estourou timeout de 10 minutos sem devolver URL.
- Producao foi validada depois do timeout e ja servia as alteracoes novas em `https://tech-7.vercel.app/duvidas-tipos-de-telas`.
- Processo `vercel deploy` travado foi encerrado apos confirmacao de producao.
- Smoke pos-deploy OK: `https://tech-7.vercel.app/duvidas-tipos-de-telas` HTTP 200 com video Drive e aviso S20-S25 Ultra; `https://tech-7.vercel.app/duvidas-servico-de-instalacao` HTTP 200 com endereco novo, sem `X3 Distribuidora`; `/api/health` HTTP 200 com `database=connected`.

- 2026-06-14: iniciado ajuste na pagina `duvidas-tipos-de-telas/index.html` para incluir video comparativo OLED vs ORIGINAL.
- Player responsivo adicionado via Google Drive preview: `https://drive.google.com/file/d/1mou1mFUSjaqS4OHiep_IO3IQZadxsWDr/preview`.
- Aviso adicionado informando que o video compara tela OLED com ORIGINAL em aparelhos Galaxy S Ultra do S20 Ultra ao S25 Ultra.
- Primeira validacao local falhou porque servidor nao estava ativo (`ERR_CONNECTION_REFUSED`).
- Tentativa `Start-Process npm` abriu processo incorreto no Windows; servidor iniciado com sucesso via `cmd /c npm run dev`, log em `_validation/types-of-screens/dev-server.log`.
- Validacoes OK: `npm run validate:assets`, `npm run validate:routes`.
- Browser MCP / Chrome DevTools MCP nao expuseram navegacao/screenshot nesta sessao; validacao visual feita com Playwright usando Google Chrome como fallback final.
- Evidencias salvas: `_validation/types-of-screens/tipos-de-telas-video-390x844.png`, `_validation/types-of-screens/tipos-de-telas-video-390x844-final.json`, `_validation/types-of-screens/drive-preview-390x844.png` e `_validation/types-of-screens/tipos-de-telas-video-390x844.json`.
- Resultado mobile 390x844: iframe presente, aviso presente, sem overflow horizontal (`scrollWidth=390`). Drive preview direto respondeu 200 e mostrou `Reproduzir`.

- 2026-06-14: iniciado ajuste textual da pagina `duvidas-servico-de-instalacao/index.html`.
- Skills aplicadas nesta tarefa: `caveman` e `planning-with-files`.
- Condicoes de instalacao reescritas para explicitar variacao de mao de obra por aparelho/modelo, limites de responsabilidade por defeitos preexistentes, reparo especifico solicitado, garantia limitada a peca vendida pela TECH 7 e politica de credito em loja.
- Endereco da pagina de servico corrigido para `Shopping Oiapoque Centro, Av. Oiapoque, NÂº 156 - Centro - CEP 30111-070 - Belo Horizonte - MG - Brasil`.
- Removidas ocorrencias institucionais de `X3 Distribuidora`/`X3` em paginas de duvidas; ocorrencias de produtos `Poco X3` foram mantidas.
- Arquivos alterados nesta tarefa: `duvidas-servico-de-instalacao/index.html`, `duvidas-alerta-de-fraude/index.html`, `duvidas-politica-de-privacidade/index.html`, `duvidas-descontos-vigentes/index.html`, `duvidas-curso-tecnico-presencial/index.html`, `duvidas-trocas-e-devolucoes/index.html`, `duvidas-troca-de-pecas-de-celular/index.html`, `task_plan.md`, `findings.md`, `progress.md`.
- Varredura textual OK: sem `X3 Distribuidora`, `Loja Virtual X3`, `CLIENTES X3`, `Rua Santos Dumont`, `Maringa` ou `MaringÃ¡` nas paginas HTML publicas verificadas.
- Validacoes OK: `npm run validate:assets` e `npm run validate:routes`.
- Browser MCP / Chrome DevTools MCP nao expuseram ferramentas de navegacao nesta sessao; validacao visual feita com Playwright usando Google Chrome como fallback final.
- Evidencias salvas: `_validation/installation-page/servico-instalacao-390x844-after.png` e `_validation/installation-page/servico-instalacao-390x844-after.json`.
- Validacao mobile 390x844: textos obrigatorios presentes, textos antigos ausentes, sem overflow horizontal (`scrollWidth=390`, viewport `390x844`). Observado 404 legado de `assets/store/img/fechar.png`, nao introduzido por esta alteracao.

- Deploy solicitado em 2026-06-14: usuario pediu deploy de todas as alteracoes feitas.
- Projeto Vercel confirmado por `.vercel/project.json`: `tech-7`, projectId `prj_UDDtUcUUQaEg4m01BhsnR5eSjjhI`, team `team_yKRleuToOM89NQWd3zIxD5kc`.
- Escopo do deploy: workspace atual completo, incluindo alteracoes preexistentes em `assets/js/tech7-local-runtime.js`, `server/routes/admin.js`, arquivos de acompanhamento e novos assets do carrossel.
- Validacoes pre-deploy OK: `npm run validate:assets`, `npm run validate:routes`, `npm run validate:endpoints`.
- Primeiro deploy via `npx vercel deploy --prod --yes` falhou por limite de arquivos (`files` > 15000) e recomendacao de `--archive=tgz`.
- Deploy de producao concluido com `npx vercel deploy --prod --yes --archive=tgz`.
- URLs retornadas: inspect `https://vercel.com/stiflerwfl1-oss-projects/tech-7/5ob4NZa2den1R8FgSdodwWAjJP4r`, production `https://tech-7-cc6h3o8zp-stiflerwfl1-oss-projects.vercel.app`, alias `https://tech-7.vercel.app`.
- Smoke pos-deploy OK: `/api/health` 200 com `database=connected` e `source=POSTGRES_URL`; `/` 200 contendo `_assets/tech7/carousel/` e `t7-carousel-picture`; WebP do carrossel 200 `image/webp`; produto Realme 200.

- Continuidade solicitada: corrigir somente o carrossel da home, sem tocar em busca, APIs, banco, precos, carrinho ou scripts de terceiros.
- Estado confirmado: `index.html` ja tinha prioridade alta no primeiro slide e lazy/low nos demais, mas ainda apontava para JPGs originais grandes.
- Ferramentas locais: `sharp`, ImageMagick e `cwebp` indisponiveis; `ffmpeg` disponivel com suporte a WebP para gerar assets derivados do carrossel sem nova dependencia.
- Correcao aplicada somente no carrossel: 30 WebPs responsivos gerados em `_assets/tech7/carousel/` para 10 slides; total dos novos assets ~147 KB.
- `index.html` atualizado no bloco `.t7-product-carousel-section` para usar `picture/source`, `srcset`, `sizes`, `decoding=async`, prioridade alta apenas no slide principal e lazy/low nos demais.
- Ajuste CSS restrito ao carrossel: `.t7-carousel-picture` preserva centralizacao e `.t7-carousel-img` usa `box-sizing:border-box`.
- Validacao Browser MCP / Chrome DevTools MCP: comandos de navegacao/screenshot nao ficaram expostos nesta sessao; usado Playwright com Google Chrome como fallback final.
- Evidencias salvas: `_validation/production-performance/carousel-after-webp-390x844.png` e `_validation/production-performance/carousel-after-webp-390x844.json`.
- Validacao mobile 390x844: sem overflow horizontal, 10 requests WebP 200 do carrossel, 0 requests JPG do carrossel, 0 erros de console.
- Validadores OK isolados: `validate:links`, `validate:assets`, `validate:routes`, `validate:endpoints`, `validate:redirects`, `validate:menu-routes`, `validate:section-filters`, `validate:api-security`, `validate:backend-prices`, `validate:product-exactness`, `validate:product-cards`.
- `npm run validate:build` agregado estourou timeout de 300s; seus comandos constituintes passaram isoladamente.

- CWD confirmado: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Dominio real alvo: `https://tech-7.vercel.app/`.
- Skills usadas: `caveman`, `planning-with-files`.
- Memoria consultada para historico TECH7/Vercel: validar dominio real, `/api/health`, Supabase envs e logs expandidos quando houver 503/lentidao.
- Estado Git inicial ja estava sujo: `findings.md`, `progress.md`, `server/routes/admin.js`, `task_plan.md` modificados e `_assets/tech7/os-logo.jpg` untracked.
- Plano/finding/progresso atualizados antes de medicÃµes profundas.
- ONE MCP nao apareceu na descoberta de ferramentas. Fallback direto Supabase usado para confirmar projeto: `supabase-bisque-bridge`, ref `lzsaaufsdcmqlasjrqck`, regiao `sa-east-1`, status `ACTIVE_HEALTHY`.
- Browser MCP / `@chrome` nao expÃ´s navegacao/click/screenshot. Chrome DevTools MCP tambem nao expÃ´s comandos de performance/navegacao. Playwright com Chrome sera fallback final para waterfall.
- Vercel confirmado por `.vercel/project.json`: projectId `prj_UDDtUcUUQaEg4m01BhsnR5eSjjhI`, team `team_yKRleuToOM89NQWd3zIxD5kc`, projeto `tech-7`.
- Vercel runtime logs consultados para producao: deployment `dpl_9TArEFFboVnUKLtQdwMSKpvvVrTN`, dominio `tech-7.vercel.app`, logs recentes 200 em `/api/products/resolve-prices` e `/api/cart/...`, 401 esperado em `/api/admin/session`.
- Medicao HTTP inicial salva: `_validation/production-performance/http-baseline.json`.
- Browser waterfall inicial salvo: `_validation/production-performance/browser-waterfall-baseline.json`.
- Causa raiz: home producao serve HTML cacheado rapido, mas carrega muitos assets estaticos pesados no primeiro load, principalmente 10 imagens eager do carrossel home e scripts do tema/runtime. Evento `load` nao completou em 45s no Chrome fallback.
- APIs medidas: `/api/products` e `/api/search` sao lentas em warm (~1.95s e ~1.39s total mediano), mas nao aparecem no waterfall inicial da home producao; banco/API nao sao gargalo principal do primeiro render da home.
- Correcao local aplicada: imagens nao iniciais do carrossel viraram `lazy`/`fetchpriority=low`; primeira imagem manteve prioridade alta; `search-index.json` pesado foi adiado para idle.
- Medicao local pos-fix: `load` 5589ms -> 4763ms; `/api/products/resolve-prices` 3096ms -> 795ms; `search-index.json` saiu do caminho critico.

---

# Progresso - mobile production gate TECH7 (2026-06-12)

- CWD confirmado: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Skills usadas: `caveman`, `planning-with-files`, `cloudflare:web-perf`, `website-building`.
- Browser MCP solicitado; descoberta de ferramentas nao retornou comandos de navegador para navegar/clicar/screenshot.
- Chrome DevTools MCP tambem nao retornou comandos de `navigate_page`, trace ou snapshot.
- Fallback final assumido: Playwright com Google Chrome, com registro explicito no relatorio final.
- Pasta de evidencias: `_validation/mobile-production-gate/`.
- Auditoria inicial Playwright Chrome fallback: 84 casos, 78 passaram, 6 bloqueados pelo runner.
- Bloqueio real confirmado: `.filter__button` do drawer de filtros ultrapassava a largura do painel em viewports estreitas por largura calculada com margem negativa.
- Falso positivo tecnico: `assets/js/tech7-local-runtime.js` apareceu como `net::ERR_ABORTED` em rotas que redirecionam; teste focado confirmou que a pagina final carregou o runtime com HTTP 200.
- Correcao aplicada em `assets/js/tech7-local-runtime.js`: botao final do filtro agora fica com `width:100%`, `max-width:100%`, `box-sizing:border-box`, margem sem valor negativo e area clicavel preservada.
- Revalidacao focada OK: `_validation/mobile-production-gate/filter-button-after-focused.json` confirmou botao dentro do painel em `320x568`, `375x667` e `414x896`.
- Auditoria final OK: `_validation/mobile-production-gate/mobile-production-audit-summary.json` com 84/84 passados, 0 bloqueadores e 0 erros.
- Interacoes reais OK: `_validation/mobile-production-gate/final-social-search-focused-390x844.json` confirmou busca com sugestoes, Instagram e WhatsApp clicaveis; `final-interactions-390x844.json` confirmou menu, busca submetida, card, comprar e carrinho.
- Validacoes OK: `node --check assets/js/tech7-local-runtime.js`, `node --check _validation/mobile-production-gate/mobile-production-audit.mjs`, `npm run validate:assets`, `npm run validate:routes`, `npm run validate:product-cards`.
- Decisao release-gatekeeper: `APROVADO PARA PRODUCAO`.

---

# Progresso - Produtos visitados imagens TECH7 (2026-06-11)

- CWD confirmado: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Skills usadas: `caveman`, `planning-with-files`; plugin solicitado: `Product Design`.
- Print de referencia carregado e problema visual confirmado: cards renderizam texto/preco, imagens caem no placeholder.
- Memoria consultada: priorizar `assets/js/tech7-local-runtime.js`, `_custom/tech7-theme.css`, validar com Chrome real quando possivel.
- Estado Git observado: stage grande preexistente; `assets/js/tech7-local-runtime.js` em estado `MM`.

---

# Progresso - filtros mobile TECH7 (2026-06-12)

- Skills usadas: `senior-fullstack`, `caveman`, `planning-with-files`.
- Memoria consultada para regras TECH7: Chrome-first/fallback e padrao de evidencias/arquivos de acompanhamento.
- Servidor local confirmado em `http://127.0.0.1:3000`, banco conectado por `DATABASE_URL`.
- Implementacao localizada em `assets/js/tech7-local-runtime.js`; CSS base em `_assets/images.tcdn.com.br/files/996644/themes/46/css/style.min__e4660e26.css`.
- Markup do filtro em paginas de catalogo usa `.button-filter`, `.box-fixed`, `.box-white`, `form.smart-filter`, `.filter__block`, `.filter__list` e `.filter__item`.
- Achado inicial: labels inconsistentes (`for` sem id real) e painel legado sem drawer mobile robusto.
- Browser MCP / `@chrome` nao ficou callable; Chrome DevTools retornou apenas ferramenta de thread, nao navegador. Fallback final usado: Playwright com Google Chrome.
- Evidencia antes salva em `_validation/mobile-filters/before-filters-390.json`, `before-filters-closed-390.png`, `before-filters-open-390.png`.
- Patch aplicado em `assets/js/tech7-local-runtime.js`: drawer mobile responsivo para filtros, labels corrigidos, faixas de preco legiveis e classe `t7-filter-open` no body.
- Validacao final salva em `_validation/mobile-filters/after-mobile-filters-validation.json`: drawer `359x844` em viewport `390x844`, `overflow-y:auto`, clique em Samsung filtra via backend, `?brand=samsung`, 100 cards, sem overflow, sem console/network local error.
- Evidencias visuais finais: `_validation/mobile-filters/after-filters-open-final-390.png` e `_validation/mobile-filters/after-filters-samsung-final-390.png`.
- Validacoes OK: `node --check assets/js/tech7-local-runtime.js`, `npm run validate:routes`, `npm run validate:assets`.
- Continuidade 2026-06-12: tentativa de regressao ampla em lote estourou timeout; abordagem alterada para casos menores.
- Regressao extra OK em `/tela-display-lcd/index.html`: viewports `320x568` e `430x932`, drawer dentro da viewport, item 44px, `overflow-y:auto`, labels OK, sem overflow e sem console error.
- Regressao cruzada OK em `/tampas-e-carcacas/index.html` `390x844`; evidencia `_validation/mobile-filters/mobile-filters-cross-route-regression.json` e screenshot `regression-tampas-390.png`.

---

# Progresso - performance de preco TECH7 (2026-06-11)

- CWD confirmado: `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Skills globais usadas: `caveman`, `planning-with-files`.
- `task_plan.md`, `findings.md`, `progress.md` atualizados no topo sem apagar historico.
- ONE buscado via `tool_search` com termos `ONE Supabase` e `one MCP Supabase`; ferramenta nao ficou callable. Fallback local/env/CLI sera usado se precisar confirmar banco.
- Subagents autorizados pelo pedido; exploradores read-only serao usados para mapear caminhos enquanto a medicao local roda.
- Subagents `Data Path Analyst`, `Frontend Render Analyst` e `Backend/Supabase Analyst` falharam por `stream disconnected before completion`; investigacao sera feita localmente para nao repetir o mesmo bloqueio.
- `@chrome`/Browser MCP e Chrome DevTools MCP foram buscados, mas nao ficaram callable; validacao visual usou Playwright com Google Chrome (`channel: "chrome"`) como fallback final registrado.
- Servidor local confirmado em `http://127.0.0.1:3000` com processo escutando na porta 3000 e resposta HTTP 200.
- Baseline salvo em `_validation/price-performance/baseline-summary.json` e screenshots `baseline-*.png`.
- Fluxo de preco mapeado:
  - `server/routes/products.js`: `/api/products` e `/api/products/resolve-prices`.
  - `server/routes/search.js`: busca retorna preco no payload.
  - `preco-loader.js`: reconciliacao de preco no frontend.
  - `assets/js/tech7-local-runtime.js`: renderizacao local de catalogo chama `Tech7Prices.syncCatalog`.
  - `cart-manager.js`: carrinho usa `Tech7Prices.resolve` para preco oficial.
- Causa raiz confirmada em `preco-loader.js`: precos existentes eram substituidos por `Preco sob consulta` antes do fetch de reconciliacao terminar.
- Correcao aplicada em `preco-loader.js`: preservar preco renderizado, cache por chave/slug, dedupe de chamadas em voo e fallback conservador em erro.
- Script de medicao criado/ajustado em `_validation/price-performance/measure-price-performance.mjs`.
- Rodada final salva em `_validation/price-performance/after-slug-cache-final-summary.json` e screenshots `after-slug-cache-final-*.png`.
- Validacoes finais:
  - `node --check preco-loader.js`: OK.
  - `node --check _validation/price-performance/measure-price-performance.mjs`: OK.
  - `npm run validate:assets`: OK, 221112 referencias.
  - `npm run validate:routes`: OK, 6 categorias, 389 redirects.
  - `npm run validate:backend-prices`: OK.
  - `npm run validate:product-cards`: OK, 23044 arquivos, 0 problemas.
- Risco de dados registrado: produto Realme C55 tem HTML estatico com `R$ 138,00`, mas backend informa preco indisponivel/zero; nao foi alterado dado real do Supabase.
- 2026-06-11: pedido do usuario para ajustar Realme C55 para `R$ 150,00`.
- 2026-06-11: ONE, Composio e plugin Supabase foram tentados via descoberta de ferramentas, mas nao ficaram callable; fallback usado foi `DATABASE_URL` do servidor.
- 2026-06-11: conexao local confirmada sem expor segredo: env `DATABASE_URL`, host `aws-1-sa-east-1.pooler.supabase.com`, usuario `postgres.lzsaaufsdcmqlasjrqck`, database `postgres`.
- 2026-06-11: banco tinha 2 linhas ativas duplicadas para slug `tela-display-lcd-realme-c55-rmx3710-com-aro`; ambas atualizadas para `price_cents=15000`.
- 2026-06-11: endpoint `/api/products/resolve-prices` e busca `realme c55` confirmaram `price_cents=15000` e `price_status=available`.
- 2026-06-11: paginas estaticas do produto em `display/...` e `tela-display-lcd/realme/...` alinhadas para `150.00`/`150,00`.
- 2026-06-11: corrigido `produto-comprar.js` para inserir a UI customizada de compra no container estavel `.fixed-info`, antes do bloco de frete, em vez de inserir em container removido.
- 2026-06-11: validacao Playwright Chrome fallback: produto mostra `R$ 150,00`, botao `Comprar` habilitado, sem overflow horizontal em 390px; evidencias `_validation/price-performance/realme-c55-150-final.json` e `_validation/price-performance/realme-c55-150-final.png`.
- 2026-06-11: validacoes finais OK: `node --check produto-comprar.js`, `node --check preco-loader.js`, `npm run validate:backend-prices`, `npm run validate:routes`, `npm run validate:product-cards`.
- 2026-06-12: usuario confirmou escopo do reajuste Galaxy Ultra: somente telas OLED/Incell/Vivid dos modelos S20 Ultra, Note 20 Ultra, S21 Ultra, S22 Ultra e S23 Ultra.
- 2026-06-12: ONE, Supabase plugin e Composio novamente nao ficaram callable; fallback usado foi `DATABASE_URL` do servidor, host `aws-1-sa-east-1.pooler.supabase.com`, projeto/ref inferido `lzsaaufsdcmqlasjrqck`.
- 2026-06-12: banco atualizado para `price_cents=95000` em quatro produtos ativos: Note 20 Ultra OLED, S20 Ultra OLED com aro, S21 Ultra OLED com aro e S23 Ultra OLED com aro.
- 2026-06-12: nenhum produto ativo S22 Ultra OLED, Incell ou Vivid encontrado dentro do escopo; nenhum update para `R$ 450,00` aplicado.
- 2026-06-12: HTML estatico principal alinhado em quatro paginas `display/samsung/...`.
- 2026-06-12: corrigido `produto-comprar.js` para detectar pagina de produto por shell `.page-product`/`.fixed-info` quando o form Tray legado ja nao existe; isso restaurou preco/botao no Note 20 Ultra.
- 2026-06-12: API `/api/products/resolve-prices` confirmou os quatro produtos com `price_cents=95000`, `price_status=available`, `found=true`.
- 2026-06-12: validacao visual por Playwright Chrome fallback em 390x844 passou nos quatro produtos: `R$ 950,00`, botao `Comprar`, sem overflow e sem erro local de console/network; evidencias `_validation/price-performance/galaxy-ultra-oled-950-validation.json` e screenshots `galaxy-ultra-oled-950-*.png`.
- 2026-06-12: validacoes finais OK: `node --check produto-comprar.js`, `node --check preco-loader.js`, `npm run validate:backend-prices`, `npm run validate:routes`, `npm run validate:assets`, `npm run validate:product-cards`.

---

# Progresso - mobile release gate TECH7 (2026-06-10)

- Skills usadas: `caveman`, `planning-with-files`, `webapp-testing`, `ui-ux-pro-max`, `frontend-developer`, `verification-quality`.
- Browser MCP / `@chrome` e Chrome DevTools MCP tentados, mas nao ficaram callable; fallback final foi Playwright com Google Chrome (`channel: "chrome"`).
- Servidor local rodado com `npm run dev` em `http://127.0.0.1:3000`.
- Evidencias criadas em `_validation/mobile-release-gate/`: 63 screenshots finais, JSON completo, summary e logs de run.
- Bugs corrigidos:
  - PMax local com redeclaracao global de `script`.
  - Busca mobile sem footer/atalhos sociais e grid apertado.
  - Banner de cookies alto demais em produto mobile.
  - Menu mobile com fechamento interceptado por header.
  - Carrinho do header acionando mini-carrinho legado e gerando `response.cart`.
  - 503 intermitente no endpoint `/api/products/resolve-prices` sob gate visual; adicionada nova tentativa curta da mesma query.
- Validacoes finais:
  - `node --check assets/js/tech7-local-runtime.js`: OK.
  - `node --check server/routes/products.js`: OK.
  - `npm run validate:assets`: OK, 221112 referencias.
  - `npm run validate:routes`: OK, 6 categorias, 389 redirects.
  - `npm run validate:product-cards`: OK, 23044 arquivos, 0 problemas.
  - Stress `/api/products/resolve-prices`: 10/10 respostas 200.
  - `_validation/mobile-release-gate/mobile-release-gate-run8.log`: OK, 63/63 sem blockers.
- Decisao release-gatekeeper: `APROVADO PARA PRODUCAO`.

---

# Progresso - hardening seguranca TECH7

- Iniciado em 2026-05-27.
- Subagentes read-only usados para auth, carrinho, webhooks e testes.
- `npm audit`: OK sem vulnerabilidades no root.
- `backend npm audit`: OK sem vulnerabilidades.
- `npm run validate:api-security`: OK 7/7.
- `npm run validate:build`: OK.
- Validacao Chrome local salva em `_validation/chrome-security-validation.json`: OK 13/13.

---

# Progresso - reajuste de produtos restantes

- 2026-06-07: iniciado fluxo com backup/preview obrigatorios.
- 2026-06-07: skills `caveman`, `planning-with-files`, `prompt-engineer` lidas.
- 2026-06-07: ONE indisponivel na descoberta de ferramentas; fallback Supabase MCP disponivel.
- 2026-06-07: arquivos de planejamento atualizados sem apagar conteudo anterior.
- 2026-06-07: seis subagentes criados; todos iniciaram sem permissao de escrita no banco.
- 2026-06-07: Display/LCD Blocklist Matcher executado em modo read-only; planilha XLSX lida via OpenXML direto, catalogo local analisado, e regras entregues em `artifacts/subagent_display_blocklist.md`.
- 2026-06-07: Backup Builder concluiu checklist em `artifacts/subagent_backup_builder.md`.
- 2026-06-07: Pricing Calculator concluiu checklist em `artifacts/subagent_pricing_calculator.md`; limites 20/20 OK.
- 2026-06-07: Backup/preview gerados para 2512 produtos; preview aprovou 1894 updates e bloqueou/revisou/ignorou 618.
- 2026-06-07: Update aplicado em transacao: 1894 produtos atualizados.
- 2026-06-07: Validacao pos-update OK: bloqueados inalterados, calculos OK, campos nao-preco preservados.
- 2026-06-07: `npm run validate:backend-prices` OK.
- 2026-06-07: `npm run validate:build` tentou com 120s e atingiu timeout; repetir com timeout maior.
- 2026-06-07: Scripts internos do `validate:build` executados isoladamente com OK: links, assets, routes, endpoints, redirects, menu-routes, section-filters, api-security, backend-prices, product-exactness, product-cards.
- 2026-06-07: `npm run validate:build` agregador tambem atingiu timeout em 10min; registrado como limitacao do agregador, nao erro dos scripts internos.
- 2026-06-07: Validacao visual por fallback Playwright OK: API, catalogo, pagina de produto e carrinho com `R$ 150,00`.
- 2026-06-07: Relatorio final `artifacts/relatorio_reajuste_produtos_restantes.json` atualizado com status `APROVADO`.
- 2026-06-08: rodape social atualizado com Instagram `@tech7i` e WhatsApp; validado em `localhost:3000` desktop/mobile via Playwright.
- Sessao atual: iniciado subagente Match Report Reader em modo read-only; sem banco, sem codigo, sem reversao de alteracoes existentes.
- Sessao atual: erro evitado registrado - heredoc Unix nao funciona em PowerShell; repetir inline Node via here-string PowerShell.
- Sessao atual: `openpyxl` ausente para leitura XLSX; usar fallback OpenXML direto via .NET/PowerShell sem instalar dependencias.
- Sessao atual: parser OpenXML ajustado para XLSX sem `sharedStrings.xml` obrigatorio.
- Sessao atual: relatorio entregue em `artifacts/subagent_match_report_reader_telas.md`; 112 matches confiaveis documentados; nenhum banco/codigo alterado.

---

# Progresso - reajuste de telas/display

- 2026-06-08: iniciado fluxo de reajuste exclusivo para telas/display.
- 2026-06-08: skills `caveman` e `planning-with-files` lidas.
- 2026-06-08: memoria consultada para regras TECH7, Supabase/ONE, `price_cents`, match de telas e validacao browser.
- 2026-06-08: ONE nao apareceu como ferramenta callable; fallback Supabase MCP direto confirmado.
- 2026-06-08: projeto Supabase ativo `supabase-bisque-bridge` / `lzsaaufsdcmqlasjrqck` confirmado.
- 2026-06-08: cinco subagentes obrigatorios criados em paralelo.
- 2026-06-08: tentativa de heredoc Bash com Python falhou no PowerShell; ajustar para here-string nativo.
- 2026-06-08: literal acentuado `Preco de venda` em Python inline sofreu encoding no PowerShell; usar indice/nome normalizado sem acento.
- 2026-06-08: Price Rule Calculator telas concluiu read-only; artefato entregue em `artifacts/subagent_price_rule_calculator_telas.md`.
- 2026-06-08: validacao local da regra sem match confiavel: 324 produtos no universo, 306 calculaveis por faixa, 18 sem calculo por preco zero/consultar/invalido.
- 2026-06-09: update aplicado em `products.price_cents`: 306 produtos por faixa, 0 por tabela porque 112 matches confiaveis ja estavam exatos.
- 2026-06-09: validacao pos-update OK: 2515 produtos antes/depois, 112 matches de tabela exatos, 306 faixas corretas, campos protegidos preservados.
- 2026-06-09: `npm run validate:build` falhou inicialmente por `.od-skills/.../example.html`; ajustado `scripts/lib/site-audit.js` para ignorar `.od-skills`.
- 2026-06-09: `npm run validate:backend-prices` OK.
- 2026-06-09: `npm run validate:build` OK apos ajuste de auditoria.
- 2026-06-09: validacao browser via Playwright canal Chrome OK: API, produto por tabela, produto por faixa, listagem e carrinho localStorage.
- 2026-06-09: relatorio final `artifacts/relatorio_reajuste_telas_display.json` consolidado com status `APROVADO`.
- 2026-06-09: verificacao read-only do restante do site: `preview_reajuste_produtos_restantes` teve 1894 elegiveis e os 1894 batem com `products.price_cents` atual no Supabase; 14 produtos com preco ficaram em revisao, 7 em consultar, e 3 carcacas novas existem no catalogo atual mas nao estavam no preview original do restante.

---

# Progresso - leitura API Loggi

- 2026-06-09: skills `api-documenter`, `caveman` e `planning-with-files` lidas.
- 2026-06-09: memoria TECH7-main consultada; servidor root `server/app.js` / `api/[...path].js` tratado como runtime real.
- 2026-06-09: pagina inicial Loggi e `llms.txt` oficiais lidos via Firecrawl.
- 2026-06-09: endpoints Loggi lidos: Auth V2, cotacao, shipment assincrono, etiqueta, detalhe, tracking, webhook, update, cancelamento, dropoff e integrador.
- 2026-06-09: checkout local inspecionado: `orders`, `payments`, Mercado Pago, Woovi, webhooks e migration inicial.
- 2026-06-09: conclusao registrada: Loggi e frete/logistica, nao API de pagamento; implementar como camada de envio acoplada ao pedido pago.
---

# Progresso - mobile release gate TECH7

- 2026-06-10: iniciado gate visual mobile.
- 2026-06-10: memoria TECH7-main consultada; regra Chrome-first e fallback Playwright confirmados.
- 2026-06-10: skills obrigatorias lidas; `webapp-testing` carregada de `.agents/skills/webapp-testing/SKILL.md`.
- 2026-06-10: Browser MCP / `@chrome` e Chrome DevTools MCP tentados via descoberta, mas nao ficaram callable; fallback Playwright sera usado se nao houver ferramenta superior.
- 2026-06-10: subagentes read-only iniciados: `layout-bug-hunter`, `mobile-visual-auditor`, `regression-agent`.
- 2026-06-10: `_validation/mobile-release-gate/` criada.

---

# Progresso - correcao pagina admin

- 2026-06-10: reproduzido bug local: `/admin` servia `admin/index.html` do Vite demo (`My Google AI Studio App`) em vez do painel TECH 7.
- 2026-06-10: corrigido `server/app.js` com rota explicita `/admin` e `/admin/` redirecionando para `/admin.html`.
- 2026-06-10: servidor local reiniciado em `http://127.0.0.1:3000`; `/admin` -> 302 -> `/admin.html` e `Admin - TECH 7` carregou.
- 2026-06-10: validacao Playwright canal Chrome OK; screenshot `artifacts/admin-route-fix.png`, relatorio `artifacts/admin-route-fix-validation.json`.
- 2026-06-10: `npm run validate:routes` OK e `npm run validate:api-security` OK 7/7.

---

# Progresso - remocao catalogo Apple errado

- 2026-06-10: mapeados 43 produtos em `section` `Iphones`, `Macs` e `Ipads`; exemplo `macbook-air-m4-hgwf3` incluido.
- 2026-06-10: backup criado em `artifacts/backup_remove_apple_wrong_catalog_2026-06-10T20-27-40-121Z.json` e `artifacts/backup_remove_apple_wrong_catalog_latest.json`.
- 2026-06-10: delete transacional aplicado via `DATABASE_URL`: 43 produtos, 1027 imagens, 251 variantes, 41 relacoes de categoria, 1 mapeamento OLX; sem carrinho/pedido afetado.
- 2026-06-10: validacao DB confirmou `target_remaining = 0`; secoes restantes: `baterias-celular`, `display-e-lcd`, `pecas-e-componentes`, `tampas-e-carcacas`.
- 2026-06-10: rota `http://127.0.0.1:3000/macs/macbook-air-m4-hgwf3/index.html` retorna 404; `api/products?category=Macs|Ipads|Iphones` retorna total 0; `api/search?q=macbook` retorna 0.
- 2026-06-10: `npm run validate:backend-prices`, `npm run validate:routes`, `npm run validate:section-filters` e `npm run validate:product-cards` OK.
- 2026-06-10: validacao Playwright canal Chrome OK; relatorio `artifacts/remove_apple_wrong_catalog_browser_validation.json`, screenshots `artifacts/remove-apple-wrong-catalog-404.png` e `artifacts/remove-apple-wrong-catalog-search.png`.

---

# Progresso - autoplay carrossel home

- 2026-06-11: skills obrigatorias `caveman` e `planning-with-files` lidas.
- 2026-06-11: memoria TECH7 consultada; regra Chrome-first e fallback Playwright registrados.
- 2026-06-11: `@chrome`/Chrome DevTools nao ficaram callable via `tool_search`; fallback Playwright canal Chrome sera usado para teste.
- 2026-06-11: primeira reproducao com Playwright falhou por `page.goto: Timeout 30000ms exceeded` usando `networkidle`; repetir com `domcontentloaded`.
- 2026-06-11: `index.html` ajustado: autoplay `delay=3000`, `stopOnLastSlide=false`, `reverseDirection=false`, `disableOnInteraction=false`, `startAutoplay()` explicito apos `swiper.update()`.
- 2026-06-11: sintaxe dos 10 scripts inline validada com `new Function`.
- 2026-06-11: teste Playwright canal Chrome OK em desktop 1440x900 e mobile 390x844; carrossel avancou 0 -> 1 -> 2, autoplay ativo e sem overflow horizontal.
- 2026-06-11: evidencias salvas em `artifacts/carousel-autoplay-validation.json`, `artifacts/carousel-autoplay-desktop.png` e `artifacts/carousel-autoplay-mobile.png`.

---

# Progresso - foco central carrossel home

- 2026-06-11: Product Design index lido; `design-qa` descartada porque nao ha mock/source separado para comparacao.
- 2026-06-11: tentativa inicial de medicao falhou com `net::ERR_CONNECTION_REFUSED` em `http://127.0.0.1:3000`; servidor local sera iniciado antes de repetir.
- 2026-06-11: servidor local `npm run dev` iniciado; `http://127.0.0.1:3000/` respondeu 200.
- 2026-06-11: medicao antes do ajuste confirmou desktop com slide ativo 409px a esquerda do centro; card central era `swiper-slide-next`.
- 2026-06-11: `index.html` ajustado com `centeredSlides=true` e laterais (`prev`/`next`) menos destacadas.
- 2026-06-11: sintaxe dos 10 scripts inline validada.
- 2026-06-11: teste Playwright canal Chrome OK em desktop 1440x900 e mobile 390x844; slide ativo delta 0px do centro, autoplay 0 -> 1 -> 2, delay 3000 e sem overflow.
- 2026-06-11: evidencias salvas em `artifacts/carousel-center-validation.json`, `artifacts/carousel-center-desktop.png` e `artifacts/carousel-center-mobile.png`.

---

# Progresso - marquee beneficios mobile

- 2026-06-11: print de referencia analisado; problema visual e a faixa mobile mostrando apenas Tecnologia/Entrega parcial.
- 2026-06-11: Product Design index, `css-animations`, `webapp-testing`, `caveman` e `planning-with-files` lidas.
- 2026-06-11: `assets/js/tech7-local-runtime.js` ajustado com CSS marquee mobile e duplicacao interna dos beneficios.
- 2026-06-11: `node --check assets/js/tech7-local-runtime.js` OK.
- 2026-06-11: `@chrome`/Chrome DevTools nao ficaram callable via `tool_search`; fallback Playwright canal Chrome usado.
- 2026-06-11: primeira validacao Playwright falhou por erro do script de teste (`ReferenceError: unique is not defined` dentro de `page.evaluate`); repetir com helper inline.
- 2026-06-11: loop mobile corrigido para usar largura real em px da sequencia original, em vez de `translate(-50%)`.
- 2026-06-11: validacao Chrome canal Playwright OK em 320, 375, 390 e 430px; todos os beneficios aparecem, reset 0ms/18000ms equivalente, sem overflow horizontal.
- 2026-06-11: desktop/tablet preservados em 768 e 1024px, sem animacao aplicada.
- 2026-06-11: evidencias salvas em `artifacts/benefits-loop-fixed-validation.json` e screenshots `artifacts/benefits-loop-fixed-320.png`, `artifacts/benefits-loop-fixed-375.png`, `artifacts/benefits-loop-fixed-390.png`, `artifacts/benefits-loop-fixed-430.png`, `artifacts/benefits-loop-fixed-768.png`, `artifacts/benefits-loop-fixed-1024.png`.
- 2026-06-11: autoplay reforcado: duracao mobile ajustada para 12s, `animation-play-state: running` explicito e watchdog para reiniciar a animacao se ela ficar parada.
- 2026-06-11: Chrome 390px validado por 14,3s: `movesWithoutTouch=true`, `loopsAfterCycle=true`, `automaticRunning=true`, todos os beneficios vistos e sem overflow; evidencia `artifacts/benefits-autoplay-loop-validation.json`.
- 2026-06-11: Chrome 320px e 430px validados: trilho move para a direita sozinho, `duration=12s`, `state=running`, sem overflow; evidencia `artifacts/benefits-autoplay-loop-extremes.json`.
- 2026-06-11: nova correcao apos relato de que ainda nao girava: motor trocado para `requestAnimationFrame`, com `animation:none!important` inline no trilho mobile para o JS controlar o `transform`.
- 2026-06-11: cache-buster aplicado no `index.html`: `/assets/js/tech7-local-runtime.js?v=20260611-js-ticker`.
- 2026-06-11: Chrome final validou script versionado, `computedAnimation=none`, movimento automatico sem toque, reset de loop em 390px, sem overflow em 320/390/430; evidencia `artifacts/benefits-js-ticker-final-validation.json`.
- 2026-06-11: apos versionar `index.html`, encoding do arquivo foi reparado e validado: `DÃºvidas frequentes` servido corretamente, sem mojibake.
- 2026-06-11: smoke final Chrome 390px OK: ticker JS moveu `-951 -> -622`, CSS animation ficou `none!important`, runtime versionado carregado, sem overflow; evidencia `artifacts/benefits-js-ticker-smoke-validation.json`.

---

# Progresso - Produtos visitados imagens TECH7

- 2026-06-11: skills obrigatorias `caveman` e `planning-with-files` lidas.
- 2026-06-11: screenshot do problema inspecionado; cards de `Produtos visitados` exibem nome/preco, mas imagem fica no placeholder.
- 2026-06-11: runtime mapeado em `assets/js/tech7-local-runtime.js`; funcoes-chave: `currentProductForVisited`, `readVisitedProducts`, `visitedProductCard`, `renderVisitedProducts`, `localAssetImage`, `cardImageCandidate`.
- 2026-06-11: Chrome real conectado via plugin `@chrome`.
- 2026-06-11: tentativa inicial de navegacao por produto teve timeout em rota existente; continuei com abordagem tolerante a timeout.
- 2026-06-11: primeira leitura do estado no Chrome falhou por acesso direto a `localStorage` no contexto isolado; proxima tentativa usa `window.localStorage`.
- 2026-06-11: reproducao Chrome desktop confirmou URLs antigas de variacao retornando 404 e caindo para placeholder.
- 2026-06-11: `assets/js/tech7-local-runtime.js` ajustado para resolver imagens por `og:image`, slug e indice local, alem de reidratar itens antigos.
- 2026-06-11: `node --check assets/js/tech7-local-runtime.js` OK.
- 2026-06-11: validacao Chrome desktop em produto OK: 0 placeholders em `Produtos visitados`, 6 imagens reais carregadas no viewport e URLs reais para cards fora do viewport.
- 2026-06-11: validacao Chrome desktop em categoria `Display Samsung` OK: 10/10 cards com imagem real, 0 placeholders.
- 2026-06-11: `npm run validate:gallery-selected-sync` sem limite excedeu 120s; PIDs do npm/script encerrados e sera repetido com limite menor.
- 2026-06-11: primeira validacao mobile Playwright fallback falhou porque `.visited-section` nao apareceu antes do timeout; diagnosticar pagina carregada antes de repetir.
- 2026-06-11: mobile 390x844 diagnosticado: pagina de produto carrega, runtime ativo, mas `.visited-section` nao permanece no DOM nesse breakpoint; sem placeholder visivel.
- 2026-06-11: mobile fallback com storage antigo simulado OK: imagens antigas foram migradas para URLs reais no storage; evidencia `_validation/visited-products/mobile-fallback-validation.json`.
- 2026-06-11: screenshots revisados: `before-runtime-fix-desktop.png` mostra placeholder; `after-runtime-fix-desktop.png` mostra imagens reais; `after-runtime-fix-mobile-playwright.png` mostra produto mobile sem secao visitados.
- 2026-06-11: `npm run validate:gallery-selected-sync -- 6` OK: 6/6.
- 2026-06-11: `npm run validate:routes` OK.
- 2026-06-11: `npm run validate:assets` OK, 221112 referencias.
- 2026-06-11: `npm run validate:section-filters` OK.
- 2026-06-11: `npm run validate:product-cards` excedeu 180s porque varre todo HTML sem limite.
- 2026-06-11: `npm run validate:build` excedeu 180s; script chama `validate-product-cards.mjs`, mesmo gate global pesado. Processo remanescente encerrado.

---

# Progresso - preco inicial errado TECH7

- 2026-06-11: cwd confirmado em `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- 2026-06-11: skills obrigatorias `caveman` e `planning-with-files` lidas.
- 2026-06-11: memoria TECH7 consultada; regra ONE-first para preco/produto/Supabase confirmada.
- 2026-06-11: `task_plan.md`, `findings.md` e `progress.md` atualizados para a investigacao.
- 2026-06-11: ONE buscado via `tool_search`; ferramenta ONE nao ficou disponivel. Fallback Supabase direto sera usado, com projeto confirmado antes de consultas.
- 2026-06-11: Supabase direto listou projeto unico `rkdyhgqtgihixnbkngek` ativo/healthy; tentativa de listar tabelas exigiu reautenticacao. Usar fallback `DATABASE_URL` local/env.
- 2026-06-11: `/api/health` validou `database=connected` e `source=DATABASE_URL`.
- 2026-06-11: banco consultado via `server/lib/db.js`; precos reais confirmados para produtos afetados da home/produto.
- 2026-06-11: bug reproduzido com atraso artificial em `/api/products/resolve-prices`: preco estatico antigo aparecia primeiro e era trocado apos resposta da API.
- 2026-06-11: `preco-loader.js` ajustado com estados `t7-prices-loading`/`t7-prices-ready`, disparo consistente `tech7:price-loaded` e recuperacao de `visitedProducts` da rota atual.
- 2026-06-11: CSS `T7-DB-PRICE-GATE` adicionado em `_assets/images.tcdn.com.br/files/996644/themes/46/css/style.min__e4660e26.css` para ocultar preco estatico ate a resolucao oficial.
- 2026-06-11: `cart-manager.js` ajustado para revalidar itens do carrinho com `/api/products/resolve-prices` e expor `T7_CART_PRICES_STATUS`.
- 2026-06-11: `carrinho/index.html` e `checkout/index.html` ajustados para mostrar `Atualizando preco`, bloquear checkout/Pix enquanto pendente e renderizar total somente apos revalidacao.
- 2026-06-11: `assets/js/tech7-local-runtime.js` ajustado para `Produtos visitados` escolher primeiro candidato de preco numerico valido e reprocessar apos `tech7:price-loaded`.
- 2026-06-11: `node --check` OK para `preco-loader.js`, `cart-manager.js` e `assets/js/tech7-local-runtime.js`.
- 2026-06-11: `git diff --check` OK nos arquivos alterados; apenas avisos LF/CRLF do Windows.
- 2026-06-11: `npm run validate:backend-prices` OK.
- 2026-06-11: `npm run validate:product-cards` OK com 23044 arquivos varridos, 0 problemas.
- 2026-06-11: `npm run validate:assets` OK, 221112 referencias.
- 2026-06-11: `npm run validate:routes` OK, 6 categorias e 389 redirects.
- 2026-06-11: `npm run validate:build` excedeu 300s sem saida util; `npm run validate:gallery-selected-sync` excedeu 180s.
- 2026-06-11: Chrome real via plugin validou home local com precos finais do banco e screenshot `_validation/price-source/home-price-after-fix-chrome.png`.
- 2026-06-11: Playwright fallback controlado validou home com API atrasada: preco antigo no DOM ficou transparente e visualmente apareceu `Carregando`; final bateu banco.
- 2026-06-11: Playwright fallback controlado validou produto S20 Ultra: inicial `Carregando`, final `R$ 1.300,00`, e `visitedProducts` migrado para `R$ 1.300,00`.
- 2026-06-11: Playwright fallback controlado validou carrinho e checkout com `localStorage` antigo `R$ 48,00`: inicial `Atualizando preco`, final `R$ 1.300,00`, sem erro de console.
- 2026-06-11: Categoria `display-e-lcd/samsung`, busca `palavra_busca=s23` e mobile home validados sem erro de console/imagem; evidencias em `_validation/price-source/`.
- 2026-06-11: solicitado deploy Vercel pos-correcao de preco.
- 2026-06-11: `.vercel/project.json` encontrado para projeto `tech-7` (`prj_UDDtUcUUQaEg4m01BhsnR5eSjjhI`); Vercel CLI 54.12.0 disponivel.
- 2026-06-11: primeira tentativa `npx vercel deploy --prod --yes` falhou por limite Vercel: 44605 arquivos, maximo 15000; retry indicado pela CLI: `--archive=tgz`.
- 2026-06-11: segunda tentativa `npx vercel deploy --prod --yes --archive=tgz` gerou pacote ~1.1GB e falhou na API da Vercel com `Internal Server`/`Worker timed out after 10 seconds`.
- 2026-06-11: terceira tentativa `npx vercel deploy --prod --yes --archive=tgz` repetiu falha na API Vercel durante upload de ~1.1GB; partir para pacote menor/deploy alternativo.
- 2026-06-11: usuario confirmou deploy de todas as atualizacoes do projeto; usar Git push na `main` para acionar Vercel, evitando limite do upload local.
- 2026-06-11: commit `a0825f4dd chore: deploy TECH7 project updates` criado com 3435 arquivos alterados; worktree limpo apos commit.
- 2026-06-11: push inicial rejeitado por `non-fast-forward`; `origin/main` tinha commit remoto `711c9f92f Corrige todos os links relativos do menu (global)`.
- 2026-06-11: tentativa de rebase gerou conflitos massivos add/add em milhares de arquivos por historicos nao relacionados; rebase abortado.
- 2026-06-11: merge controlado `-s ours --allow-unrelated-histories origin/main` criado para manter a arvore local validada e preservar o commit remoto como ancestral antes do push.
- 2026-06-11: push para `origin/main` concluido: `711c9f92f..19a1e6ed4 main -> main`; aguardando deploy Vercel.
- 2026-06-11: deploy Vercel do commit `246055045` ficou READY, mas smoke de produto achou 308 para `/tela-display-lcd/...` seguido de 404 em produtos que existem em `/display...`/`/display-e-lcd...`.
- 2026-06-11: `vercel.json` corrigido removendo redirects wildcard de aliases de display com paginas reais; mantidos redirects apenas das raizes para a categoria canonica.
- 2026-06-11: `node` parse de `vercel.json`, `npm run validate:redirects` e `npm run validate:routes` OK apos correcao dos redirects.

---

# Progresso - busca inteligente no header TECH7

- 2026-06-12: cwd confirmado em `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- 2026-06-12: skills obrigatorias `caveman` e `planning-with-files` lidas.
- 2026-06-12: worktree ja estava sujo antes desta tarefa; preservar alteracoes existentes e nao reverter.
- 2026-06-12: ONE buscado via `tool_search`; ferramenta ONE nao disponivel nesta sessao.
- 2026-06-12: Supabase direto tambem nao apareceu no `tool_search`; fallback sera runtime local/API/env do projeto, documentado.
- 2026-06-12: subagentes read-only iniciados para Search Flow Analyst, Data Accuracy Validator e Responsive QA.
- 2026-06-12: `/api/search?q=samsung&limit=3` respondeu com produtos ativos, imagem, `price_cents` e URL; primeiro item validado com `price_cents=95000`.
- 2026-06-12: autocomplete implementado em `assets/js/tech7-local-runtime.js`, usando `/api/search`, debounce de 250ms, limite visual de 8 itens, cancelamento/ignorar respostas antigas, estado vazio e fechamento por Escape/clique fora.
- 2026-06-12: `index.html` ajustado para nao acionar o autocomplete inline antigo quando o runtime compartilhado esta ativo.
- 2026-06-12: validacao visual feita por Playwright Chrome fallback porque `@chrome` nao ficou callable: desktop 1366 e mobile 390 exibiram 8 sugestoes, imagem real, categoria, `R$ 950,00`, Enter para `/busca/index.html`, Escape fecha e clique abre produto.
- 2026-06-12: evidencia salva em `_validation/search-autocomplete/search-autocomplete-validation.json`, `desktop-1366-suggestions.png`, `desktop-1366-no-results.png`, `mobile-390-suggestions.png` e `mobile-390-no-results.png`.
- 2026-06-12: validacoes finais OK: `node --check assets/js/tech7-local-runtime.js`, `npm run validate:product-cards`, `npm run validate:build`.

---

# Progresso - galeria produto mobile

- 2026-06-11: skills obrigatorias `caveman` e `planning-with-files` lidas; memoria TECH7 consultada para validar gates e fallback de navegador.
- 2026-06-11: print do problema inspecionado; galeria mobile exibia imagens lado a lado e controles/thumbs ficavam presos fora da area util.
- 2026-06-11: investigacao focada em `assets/js/tech7-local-runtime.js` e `_custom/tech7-theme.css`; confirmada solucao em runtime/CSS compartilhado, sem edicao produto por produto.
- 2026-06-11: rota local usada para QA: `/display/tela-display-lcd-realme-c55-rmx3710-com-aro/`.
- 2026-06-11: `@chrome`/Chrome plugin nao ficou callable via descoberta de ferramentas; validacao visual feita com Playwright usando canal `chrome`, conforme fallback do projeto.
- 2026-06-11: bug reproduzido em 390px: `.nav-images` ficava de `left=-120` a `right=0`, controles fora do viewport e clique em next inviavel.
- 2026-06-11: `assets/js/tech7-local-runtime.js` ajustado para, somente no mobile, reposicionar thumbs abaixo da imagem, adicionar setas sobre a imagem, sincronizar indice ativo, preservar scroll e habilitar swipe horizontal.
- 2026-06-11: `_custom/tech7-theme.css` recebeu bloco mobile equivalente; durante QA foi confirmado que a rota testada nao carrega esse CSS, entao o runtime aplica estilos criticos inline.
- 2026-06-11: `node --check assets/js/tech7-local-runtime.js` OK.
- 2026-06-11: validacao Chrome fallback mobile em 320/375/390/430 OK: proxima, anterior, swipe, thumbnail, setas visiveis, somente uma imagem principal visivel, sem overflow e sem salto de scroll; evidencia `artifacts/product-gallery-final4-validation.json`.
- 2026-06-11: validacao desktop 1440px OK: thumbnails continuam mudando a imagem, nav visivel e setas mobile ausentes; evidencia `artifacts/product-gallery-desktop-final4.png`.
- 2026-06-11: `npm run validate:product-gallery` OK: 25/25 galerias.
- 2026-06-11: `npm run validate:gallery-selected-sync` completo excedeu 300s; amostra `npm run validate:gallery-selected-sync -- 40` OK: 40/40.
- 2026-06-11: `npm run validate:build` OK.
- 2026-06-11: `npm run validate:product-images` OK: 26/26 imagens visiveis.
- 2026-06-11: `npm run validate:gallery-position` OK: 24/24.
- 2026-06-11: `npm run validate:product-gallery-static-dedupe` OK; `npm run validate:product-gallery-dedupe` excedeu 180s.
- 2026-06-12: ajuste pos-print aplicado para impedir corte/sobreposicao na galeria mobile do produto Realme C55; `style.min__e4660e26.css` tambem recebeu override porque e o CSS carregado pela pagina.
- 2026-06-12: validacao mobile do produto `/display/tela-display-lcd-realme-c55-rmx3710-com-aro/` em 320/375/400/430 OK: imagem principal com altura estavel, thumbnails abaixo, titulo abaixo da galeria, next/prev funcionando e sem overflow; evidencia `artifacts/realme-gallery-final-overlap-validation.json`.
- 2026-06-12: desktop estabilizado: setas da galeria ganharam area clicavel real e sync com eventos do Swiper para evitar estado `swiper-button-disabled` antigo apos `slideTo` externo.
- 2026-06-12: `node --check assets/js/tech7-local-runtime.js` OK.
- 2026-06-12: `npm run validate:product-gallery` OK: 25/25 galerias.
- 2026-06-12: `npm run validate:gallery-position` OK: 24/24.
- 2026-06-12: `npm run validate:build` OK.
- 2026-06-12: ajuste adicional aplicado para thumbnails mobile sem sobreposicao: cada miniatura agora usa slide `78px`, card `72px`, `gap:10px`, scroll horizontal interno e `box-sizing:border-box` no CSS efetivo e no runtime.
- 2026-06-12: QA mobile por Playwright Chrome fallback em 320/375/390/430 OK no Realme C35 e no Samsung A16 com 5 thumbs; gaps medidos de 16px entre bordas dos cards, sem overflow horizontal de pagina. Evidencias: `artifacts/thumb-gallery-overlap-report.json`, `artifacts/thumb-gallery-many-overlap-report.json` e `artifacts/thumb-gallery-many-320.png`.
- 2026-06-12: validacoes especificas apos ajuste de thumbnails OK: `npm run validate:gallery-position` 24/24 e `npm run validate:product-gallery` 25/25.
## Admin OS Dashboard Upgrade - Progress - 2026-06-12

- Started in `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Confirmed `AGENTS.md` instructions and root `admin.html`.
- Read `skills/caveman/SKILL.md` and `C:\Users\Admin\.codex\skills\planning-with-files\SKILL.md`.
- Tool discovery:
  - ONE: not callable.
  - Supabase: callable through `mcp__codex_apps__supabase`.
  - Data Analytics: `mcp__datascienceWidgets` available.
  - Creative Production: `mcp__creative_production_mcp` available and used for PDF visual direction.
  - Product Design: no dedicated static-page generator exposed; applying operational admin UX guidance directly.
- Read current `package.json`, `admin.html`, `assets/js/admin.js`, `server/routes/admin.js`, DB migrations, `server/lib/db.js`, and `server/db/migrate.js`.
- Ran read-only runtime DB schema/count inspection using Node + `dotenv/config` + app pool.
- Planning files updated with current scope and constraints.
- Added `server/db/migrations/005_service_orders.sql`.
- Updated `server/routes/admin.js` with OS CRUD, order-to-OS creation, richer metrics, and server-side PDF generation.
- Updated `admin.html` navigation/styles for Dashboard, Produtos, Pedidos, Ordens de ServiÃ§o, PreÃ§os, RelatÃ³rios and ConfiguraÃ§Ãµes.
- Updated `assets/js/admin.js` with dashboard V2, product alert chips, OS list/form/PDF/print/WhatsApp, settings tab, CSV support and pagination.
- Fixed `server/db/migrate.js` to load `.env`.
- Ran `npm run db:migrate`; applied `005_service_orders.sql`.
- Ran `npm run validate:build`; passed.
- Ran `node --check` for `assets/js/admin.js`, `server/routes/admin.js`, and `server/db/migrate.js`; passed.
- API smoke on temporary local admin credentials: login 200, metrics 200, OS create 201, PDF 200 `application/pdf`, test OS deleted.
- Visual fallback with Playwright saved `_validation/admin-os/dashboard-desktop.png`, `os-form-desktop.png`, `os-saved-desktop.png`, `dashboard-mobile.png`, and `_validation/admin-os/evidence.json`; UI test OS deleted.
- Data Analytics artifact validated and rendered.
- Re-ran `npm run validate:build` after final UI/API changes; passed.
- Tested `POST /api/admin/service-orders/from-order/:orderId` against real order `order_329222f2e6ae78184be6bdad8da3b9bc`: returned 201, created `OS-00003`, detail endpoint returned 200, PDF returned 200 `application/pdf` with 4163 bytes, then test OS was deleted. Final `service_orders` count after cleanup: 0.
- 2026-06-12 16:56: fixed reported OS tab `http_404` on local port 3000. Root cause: running `node server/index.js` process was serving an older route set; current file already had `/api/admin/service-orders`. Restarted the project server on port 3000, verified unauthenticated route changed from 404 to expected 401, then authenticated with provided admin credentials and verified `/api/admin/service-orders?limit=20&offset=0` returned 200 with `total=0`.
- Supabase fallback confirmed active project `lzsaaufsdcmqlasjrqck` has `public.service_orders` and `public.service_order_items` with 0 rows.
- Added clearer frontend message for `http_404`: API route not found; restart server or publish current API.
- Visual fallback validation passed with Playwright because `@chrome`/DevTools tools were not exposed in this session: `_validation/admin-os/os-tab-after-404-fix.png` and `_validation/admin-os/os-tab-after-404-fix.json`. OS tab loaded with no `http_404`; service-orders API response was 200.
- `npm run validate:build` was retried with a 300s timeout and hung in `scripts/validate-product-cards.mjs`; the leftover validation processes were stopped. Focused checks passed afterward: `node --check server/routes/admin.js`, `node --check assets/js/admin.js`, `node --check server/db/migrate.js`, `node scripts/validate-endpoints.js`, and `node scripts/validate-api-security.mjs`.
- 2026-06-12: implemented manual OS product picker and catalog price hydration. Files changed: `assets/js/admin.js`, `admin.html`, `server/routes/admin.js`.
- Backend now hydrates OS items by `product_id` from `products` using `applyCatalogPrices`, overriding submitted product name/unit price for catalog products.
- Dashboard metrics now merge `order_items` and `service_order_items` for top products/top categories, and include non-canceled OS product totals in service product revenue.
- PDF OS header updated for client sending: Tech 7 logo mark at top-left, store data, `VIA DO CLIENTE`, better product/totals section, warranty, awareness text and signatures.
- API validation: manual OS with product `display-samsung-lcd-sam-s20-ultra-g988-origret`, qty 2, submitted fake name and R$ 1.00 price; server saved catalog name, unit price R$ 1,500.00, product total R$ 3,000.00, labor R$ 50.00, discount R$ 10.00, final R$ 3,040.00. Test OS deleted.
- Visual fallback validation: `_validation/admin-os/os-manual-product-picker.png`, `_validation/admin-os/os-manual-product-saved.png`, `_validation/admin-os/os-manual-product-flow.json`, `_validation/admin-os/os-manual-product-client.pdf`. Console had expected pre-login 401 only. Test OS cleanup count 0.
- Latest focused checks passed: `node --check server/routes/admin.js`, `node --check assets/js/admin.js`, `node scripts/validate-endpoints.js`, `node scripts/validate-api-security.mjs`, authenticated `/api/admin/metrics`.

- 2026-06-12: OS save bug diagnosed from local server log: invalid manual order_id violated service_orders_order_id_fkey and was shown as generic database failure. Added backend preflight validation for optional order origin and global error middleware now returns explicit statusCode errors before database fallback.

## OS PDF visual repair - Progress - 2026-06-13

- Started PDF visual repair request for client-facing OS.
- Required `caveman` and `planning-with-files` skills read.
- Memory quick pass used TECH7 validation and browser fallback context.
- Current PDF generator found in `server/routes/admin.js`; issue appears to be manual filled rectangles overlapping text/boxes.
- Created test OS `OS-00020` and saved current broken PDF evidence: `_validation/os-pdf/before-os-pdf.pdf` and `_validation/os-pdf/before-os-pdf-render.png`.
- Installed temporary `pypdfium2` under `%TEMP%` for PDF rasterization because bundled `pdf2image` lacked Poppler and Chrome headless captured only the PDF viewer background.
- Reworked PDF generator to embed real `_assets/tech7/os-logo.jpg`, use clean A4 layout, move warranty/signatures to page 2, and remove `Estado de entrada` / `Defeito relatado` from the client document.
- Final visual verification saved: `_validation/os-pdf/final-os-pdf-v2.pdf`, `_validation/os-pdf/final-os-pdf-v2-page-1.png`, `_validation/os-pdf/final-os-pdf-v2-page-2.png`.
- Text validation via `pypdf`: 2 pages, no `Estado de entrada`, no `Defeito relatado`, warranty and signature text present.
- Checks passed: `node --check server/routes/admin.js`, `node scripts/validate-endpoints.js`, `node scripts/validate-api-security.mjs`.
- Test OS `os_19728a2053ec2ac0332e718dd375cf89` deleted from runtime DB after validation.
- Follow-up one-page PDF request applied: removed `Observacoes ao cliente`, `Termo de ciencia`, and `Assinatura do cliente`; warranty and Tech 7/technician signature now fit on page 1.
- New visual/text evidence: `_validation/os-pdf/one-page-os-pdf.pdf` and `_validation/os-pdf/one-page-os-pdf-page-1.png`; `pypdf` confirmed 1 page, no removed labels, warranty present, Tech 7/technician signature present.
- Checks after one-page change passed: `node --check server/routes/admin.js`, `node scripts/validate-endpoints.js`, `node scripts/validate-api-security.mjs`.
- Cleanup note: first direct DB delete of test OS failed with `ECONNRESET`; retry through project pool succeeded and deleted `os_1da5189816b6f1d0921954f2a39f498e`.

## Mobile search suggestions placement - Progress - 2026-06-13

- Started correction from user screenshot showing mobile search cards opening over the wrong content area.
- Product Design plugin did not expose a static-site editor suitable for this file; applying the UX correction directly in the runtime.
- Located autocomplete CSS/JS in `assets/js/tech7-local-runtime.js`.
- Updated mobile autocomplete positioning to force `position: fixed` over the old `suggestion-words` positioning and calculate `left/top/width/max-height` from the input plus `visualViewport`.
- Syntax validation passed: `node --check assets/js/tech7-local-runtime.js`.
- Visual fallback validation passed using Playwright with Chrome channel when available: `_validation/search-autocomplete/mobile-search-position-390x844.png`, `_validation/search-autocomplete/mobile-search-position-keyboard-sim-390x520.png`, `_validation/search-autocomplete/desktop-search-position-1366.png`.
- Geometry reports passed: `_validation/search-autocomplete/mobile-search-position-report.json` and `_validation/search-autocomplete/desktop-search-position-report.json`.
- `npm run validate:build` passed.

## Admin edit persistence - Progress - 2026-06-20
- Supabase usado para confirmar projeto lzsaaufsdcmqlasjrqck e divergencia real entre products, product_images e product_categories.
- Endpoint PUT/PATCH /api/admin/products/:id corrigido para sincronizar relacoes de imagem e categoria no save real.

- Validacao visual fallback Chrome/Playwright concluiu save pelo admin, reabertura visual do editor e pagina publica.
- Evidencias salvas em _validation/admin-edit-persistence/: edit-reproduction-before-fix.json, before-edit-admin.png, after-edit-admin.png, after-fix-products-filtered.png, after-fix-editor-before-save.png, after-fix-admin-after-save.png, after-fix-admin-reopened.png, after-fix-public-page.png, edit-validation-after-fix.json.
- Checks passaram: node --check server/routes/admin.js, node --check assets/js/admin.js, npm run validate:assets, npm run validate:routes, npm run validate:endpoints.
- Produto QA removido do banco depois da validacao; qa_products_left=0.

## Admin real QA edicao/criacao - Progress - 2026-06-20
- Pedido iniciado: teste real de funcoes de edicao/criacao do painel admin usando Chrome.
- Skills lidas: caveman, planning-with-files.
- Memoria consultada para fluxo admin/produto, Supabase e limpeza QA.
- Chrome MCP direto nao expôs namespace proprio; usarei Chrome plugin via node_repl/Playwright channel=chrome, conforme ferramenta disponivel.

- Primeira execucao Chrome falhou em seletor ambiguo para OS: `aside [data-tab=service-orders]` encontrou botao `Nova OS` e item `Ordens de Servico`. Proxima tentativa usara seletor por aria-label.

- Bug real identificado e corrigido: save inline/salvar todas nao pode perder imagens secundarias. Patch aplicado em server/routes/admin.js e sintaxe sera validada antes de repetir QA.

- Erro Supabase na validacao intermediaria: coluna fisica service_orders.code nao existe; codigo da OS e derivado no backend. Repetindo consulta sem code.

- QA Chrome completo passou apos patch: login, dashboard, produto novo em branco, criacao produto, edicao completa, salvar todas alteracoes, pagina publica, filtros/ordenacao, tema, criacao/edicao OS, cancelamento OS e exclusao produto.
- Supabase validou persistencia real: produto com categoria xiaomi, preco 34567, estoque 9, duas imagens preservadas em metadata/product_images, categoria em product_categories; OS status pronta, tecnico editado, item manual e total 11100.
- Limpeza final Supabase OK: qa_products_left=0, qa_service_orders_left=0, qa_service_items_left=0.
- Validacoes OK: node --check server/routes/admin.js, node --check assets/js/admin.js, npm run validate:assets, validate:routes, validate:endpoints, validate:product-cards.

- Teste adicional Chrome OK: produto QA filtrado testou Preco fixo da pagina e Reajuste % da pagina; ambos chamaram /api/admin/prices/bulk com 200 e produto QA foi excluido pela UI.
- Limpeza final Supabase apos bulk price OK: qa_products_left=0, qa_service_orders_left=0, qa_service_items_left=0.

# Progresso - frete TECH7 (2026-06-20)
- Skills usadas: caveman e planning-with-files.
- @supabase disponivel; projeto ativo lzsaaufsdcmqlasjrqck (supabase-bisque-bridge).
- @chrome direto nao ficou callable; fallback planejado: Playwright/Chrome local via node_repl.
- Worktree ja estava sujo antes da tarefa; preservar alteracoes existentes.
- Servidor local nao estava ativo em 127.0.0.1:3000 na primeira checagem de readiness.
- Servidor local iniciado em 127.0.0.1:3000, PID 12260, logs em `_validation/shipping/server.*.log`.
- Readiness local: Melhor Envio pronto via env token; Loggi API direta retorna 503 por `LOGGI_*` ausentes.
- API real Melhor Envio local retornou 3 opcoes: Correios - SEDEX, Jadlog, Loggi.
- API `/api/orders` local criou pedidos QA com shipping pago, Uber e retirada; frete pago somou uma vez, Uber/retirada salvaram R$0,00.
- Chrome direto nao exposto; tentativa fallback Playwright/Chrome iniciou QA, mas seletor de radio oculto exigiu clique no card visual `[data-delivery-option]`.
- Correcao aplicada em `server/routes/shipping.js`: cotacoes com preco numerico zero nao sao descartadas antes da normalizacao.
- Correcao aplicada em `checkout/index.html`: sessao PIX/pedido pendente agora tem assinatura de carrinho+cliente+frete; pedido antigo so e reutilizado quando a assinatura bate.
- Checkout tambem limpa sessao PIX ao trocar carrinho, modo de entrega, cotacao ou opcao de frete.
- Validacao Supabase confirmou pedidos QA com shipping pago, Uber e retirada salvos corretamente; os 3 pedidos QA foram marcados como `cancelled` apos conferencia.
- Validacao visual fallback Chrome/Playwright final salva em `_validation/shipping/browser-shipping-final.json` e screenshots `final-product-freight.png`, `final-cart.png`, `final-checkout-shipping.png`, `final-checkout-uber.png`, `final-checkout-pickup.png`, `final-checkout-mobile.png`.
- Resultado visual: CEP sem hifen funciona no produto sem reload; checkout mostra SEDEX/Jadlog/Loggi; troca de frete atualiza total sem duplicar; Uber e retirada ficam em R$350,00 com frete R$0,00; mobile sem overflow.
- Validacoes finais OK: `node --check server/routes/shipping.js`, sintaxe do JS inline do checkout, `npm run validate:melhor-envio`, `npm run validate:loggi`, `npm run validate:build`.

# Progresso - cupons TECH7 (2026-06-20)
- Skills obrigatorias do projeto consideradas: caveman e planning-with-files.
- @supabase disponivel e usado; projeto ativo confirmado: `lzsaaufsdcmqlasjrqck` (`supabase-bisque-bridge`).
- @chrome direto nao expôs ferramenta navegavel nesta sessao; fallback usado: Playwright via `node_repl` com canal Chrome.
- Migration local criada: `server/db/migrations/006_coupons.sql`.
- Schema real Supabase confirmado para `coupons` e campos de cupom em `orders`.
- APIs implementadas: `/api/coupons/validate` e CRUD de cupons em `/api/admin/coupons`.
- Admin implementado com aba Cupons, listagem, filtros, criar, editar e ativar/desativar.
- Carrinho implementado com campo Cupom de desconto, aplicar/remover, mensagens e resumo subtotal/desconto/frete/total.
- Checkout implementado com desconto no resumo/revisao, persistencia do cupom e envio para `/api/orders`.
- Pedido de teste local com cupom validou persistencia: subtotal 35000, desconto 1000, cupom CODEX10, frete 0, total 34000.
- Dados temporarios de QA removidos do Supabase; confirmacao final: `qa_coupons=0`, `qa_orders=0`.
- Evidencias visuais salvas em `_validation/coupons/`: `admin-coupons.png`, `cart-coupon-applied.png`, `cart-coupon-expired.png`, `checkout-coupon-summary.png`, `checkout-coupon-mobile.png`.
- Validacoes OK: `node --check server/routes/orders.js`, `node --check server/routes/coupons.js`, `node --check server/routes/admin.js`, `node --check assets/js/admin.js`, parse JS inline de carrinho/checkout, API de cupom valido/invalido/expirado/inativo/maior que subtotal, `npm run validate:product-cards`, `npm run validate:melhor-envio`, `npm run validate:build`.
