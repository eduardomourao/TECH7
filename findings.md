# Findings - Produtos visitados imagens TECH7 (2026-06-11)

## Estado inicial
- Print do usuario mostra cards de `Produtos visitados` com nome/avaliacao/preco, mas imagem de fallback `TECH 7 - Imagem indisponivel`.
- Memoria do projeto indica que runtime compartilhado de produto/card fica em `assets/js/tech7-local-runtime.js`; evitar edicao por pagina.
- Worktree ja possui stage grande e alteracoes locais nao relacionadas; preservar.

---

# Findings - performance de preco TECH7 (2026-06-11)

## Estado inicial
- ONE/Supabase MCP nao apareceu como ferramenta callable via `tool_search`; fallback local/env/CLI autorizado pela regra do projeto apos registro.
- Hipoteses a verificar:
  - HTML estatico renderiza produto/card primeiro e preco depois via JS separado.
  - `resolve-prices` pode ser chamado tarde, duplicado ou sob N+1.
  - API/Supabase pode ter cold connection ou retry lento.
  - UI pode ocultar/preencher preco apos DOM pronto em vez de usar payload inicial.

## Evidencias
- Baseline salvo em `_validation/price-performance/baseline-summary.json`:
  - `/`: cards visiveis aos 3246ms, primeiro estado de preco era `Preco sob consulta`; `/api/products/resolve-prices` levou 5624ms.
  - `/Apple/index.html`: preco real aos 1173ms, mas o script trocou para `Preco sob consulta` aos 2237ms antes de voltar ao preco real.
  - `/tampas-e-carcacas/index.html`: preco real aos 1545ms, depois `Preco sob consulta` aos 1798ms e retorno do backend em seguida.
  - `/display/tela-display-lcd-realme-c55-rmx3710-com-aro`: preco real aos 1727ms, depois `Por: R$ Preco sob consulta` aos 1857ms.
- Causa raiz:
  - `preco-loader.js` coletava cards e, antes do fetch de `/api/products/resolve-prices`, sobrescrevia todos os nodes de preco para `Preco sob consulta` e limpava parcelamento.
  - A pagina ja tinha preco estatico ou preco vindo no payload inicial, mas o reconciliador visual apagava esse preco ate a API responder.
  - A sincronizacao podia ser chamada por DOM ready, `load`, `MutationObserver` e `Tech7LocalRuntime`, gerando fetches redundantes.
- Correcao aplicada:
  - `preco-loader.js` nao apaga mais precos existentes antes do backend responder.
  - Adicionado cache de preco por chave completa e por slug.
  - Adicionado compartilhamento de chamadas em voo por lote e por produto.
  - Em falha de reconciliacao, a UI conserva o preco ja renderizado e registra warning.
  - `_validation/price-performance/measure-price-performance.mjs` ajustado para medir `.result-card .price`, aceitar `--label` e continuar quando screenshot travar em fonte externa.
- Evidencia final salva em `_validation/price-performance/after-slug-cache-final-summary.json`:
  - `/`: primeiro preco real junto com cards aos 7639ms; sem console error relevante; preco final `R$ 900,00`.
  - `/Apple/index.html`: primeiro preco real junto com cards aos 1959ms; sem `Preco sob consulta` final; preco final `R$ 35,00`.
  - `/tampas-e-carcacas/index.html`: primeiro preco real junto com cards aos 1180ms; preco final `R$ 60,00`; ha itens reais de consulta no catalogo, sem apagao global.
  - `/display/tela-display-lcd-realme-c55-rmx3710-com-aro`: primeiro preco real aos 908ms; preco final `R$ 138,00`.
  - `/busca/?palavra_busca=iphone`: primeiro preco real aos 4483ms junto com resultados; sem chamada separada de `resolve-prices`.
  - `/carrinho/`: carregou sem erro; carrinho vazio nao exibe preco.
- Risco remanescente:
  - Resolvido em 2026-06-11: o produto `tela-display-lcd-realme-c55-rmx3710-com-aro` foi ajustado para `price_cents=15000` nas duas linhas ativas duplicadas do mesmo slug. ONE, Composio e Supabase plugin nao ficaram callable; fallback usado foi a `DATABASE_URL` do proprio servidor, conectada ao Supabase pooler `aws-1-sa-east-1.pooler.supabase.com` com usuario `postgres.lzsaaufsdcmqlasjrqck`.
  - As copias estaticas do produto em `display/tela-display-lcd-realme-c55-rmx3710-com-aro/index.html` e `tela-display-lcd/realme/tela-display-lcd-realme-c55-rmx3710-com-aro/index.html` foram alinhadas para `150.00`/`150,00`.
  - Bug adicional corrigido em `produto-comprar.js`: a UI customizada era inserida em um container removido do DOM, deixando a pagina de produto sem preco principal/botao apos remover o form Tray.
- Validacoes:
  - `node --check preco-loader.js`: OK.
  - `node --check produto-comprar.js`: OK.
  - `node --check _validation/price-performance/measure-price-performance.mjs`: OK.
  - `npm run validate:assets`: OK.
  - `npm run validate:routes`: OK.
  - `npm run validate:backend-prices`: OK.
  - `npm run validate:product-cards`: OK.
  - Browser fallback Playwright Chrome: `/display/tela-display-lcd-realme-c55-rmx3710-com-aro` mostra `R$ 150,00`, botao `Comprar` habilitado e `scrollWidth=innerWidth=390`. Evidencias: `_validation/price-performance/realme-c55-150-final.json` e `_validation/price-performance/realme-c55-150-final.png`.

---

# Findings - mobile release gate TECH7 (2026-06-10)

## Bugs encontrados e corrigidos

| Pagina | Viewport | Elemento/seletor | Causa provavel | Correcao aplicada | Evidencia final |
|---|---:|---|---|---|---|
| `/Apple/index.html` | varios | `_assets/images.tcdn.com.br/pmax/static/main__6b95a42c.js` | `const script` global reexecutado via script legado, gerando `Identifier 'script' has already been declared` | trocar declaracao para `var script` no asset PMax local | `mobile-release-gate-run8.log`, summary com 0 blockers |
| `/busca/?palavra_busca=iphone` e busca sem resultado | mobile | `busca/index.html`, footer/header/grid | pagina de busca sem footer social/header actions e grid estreito demais em 320/360 | adicionar atalhos Inicio/Carrinho, footer Instagram/WhatsApp e grid 1 coluna em telas estreitas | screenshots `busca-com-resultado-*` e `busca-sem-resultado-*` |
| paginas de produto | mobile | `#cookie-banner[class*="adopt-"]` | banner de cookies alto demais, cobrindo area critica em mobile | compactar banner no runtime mobile, ocultando corpo longo e reduzindo botoes | `product-cookie-after.png`, gate final 0 blockers |
| paginas com menu mobile | 390x844 | `.nav-mobile`, `.close-nav`, `.wrapper.menu-icons` | header com z-index/pointer-events interceptava fechamento do menu | elevar z-index do menu, proteger pointer-events do menu e desativar header enquanto aberto | `product-menu-after-fix.png`, gate final 0 blockers |
| paginas com carrinho no header | 390x844 | `.cart-header .area` | clique acionava mini-carrinho legado que esperava `response.cart` e quebrava JS | interceptar clique e navegar para `/carrinho/` local | `cart-click-after-fix.png`, gate final 0 blockers |
| `/api/products/resolve-prices` | 320/414 em stress visual | endpoint de preco | conexao PostgreSQL/Supabase local oscilava e retornava 503 em leitura de precos | retry curto na query de leitura de `/resolve-prices`, sem alterar SQL/calc/dados | stress 10/10 OK e `mobile-release-gate-run8.log` 0 blockers |

## Resultado final
- Gate final: 9 rotas x 7 viewports = 63 validacoes.
- Sem overflow horizontal detectado.
- Sem pageerror/console error relevante no run final.
- Sem 4xx/5xx local critico no run final.
- Screenshots e JSON salvos em `_validation/mobile-release-gate/`.

---

# Findings - hardening seguranca TECH7

- `server/routes/admin.js`: credenciais admin padrao hardcoded.
- `server/routes/cart.js`: endpoint publico pode inserir/alterar `products` usando snapshot do cliente.
- `server/routes/webhooks.js`: webhooks aceitam configuracao ausente/incompleta.
- `backend/src/middleware/cors.js`: CORS com `startsWith`, wildcard e credentials.
- `.gitignore`/`.vercelignore`: faltam artefatos locais de validacao.

---

# Findings - reajuste de produtos restantes

- Skills exigidas localizadas no disco: `caveman`, `planning-with-files`, `prompt-engineer`.
- ONE/MCP nao apareceu como ferramenta carregavel via `tool_search`; Supabase MCP direto esta disponivel com `list_projects`, `list_tables` e `execute_sql`.
- Repo esta com muitas alteracoes pendentes anteriores; esta execucao deve isolar artefatos em `artifacts/` e scripts dedicados, sem reverter mudancas existentes.
- Campo de preco provavelmente e `products.price_cents` no server atual; confirmar em schema Supabase antes de alterar.
- Planilha de exclusao existe: `artifacts/tabela_precos_venda_telas.xlsx`.

---

# Findings - Display/LCD Blocklist Matcher

- `artifacts/tabela_precos_venda_telas.xlsx` tem 13 abas; `Tabela Completa` tem 589 linhas nao vazias, 585 precos numericos e 4 linhas `Consultar`.
- Colunas reais: `Produto`, `Custo`, `Adicional`, `Preço de venda`.
- A planilha e de telas, mas nomes como `Motorola E13 Sem aro` nao trazem `display/lcd/tela`; por isso a planilha inteira deve ser fonte de bloqueio por contexto.
- `_assets/tech7/search-index.json` tem 3279 itens; categorias `display` 690, `display-e-lcd` 65 e `touchs-e-visores` 25.
- O indice tem 37 itens com `display/lcd/tela` fora de categorias de display/touch, incluindo `Aro LCD`, `Flex LCD` e telas cadastradas em `baterias`.
- `vidro` e `frontal` geram falsos positivos fortes quando usados sozinhos: lente de camera e camera frontal.
- Supabase ativo confirmado: `supabase-bisque-bridge` / `lzsaaufsdcmqlasjrqck`, regiao `sa-east-1`.
- `products` contem 2512 produtos; 2493 ativos; 27 com `price_cents` ausente/menor que 200.
- Campo oficial usado pelo site/admin/carrinho e `products.price_cents`; campos legados `price` e `price_text` existem e devem ficar sincronizados quando uma linha for atualizada.
- Secoes atuais: `pecas-e-componentes`, `display-e-lcd`, `tampas-e-carcacas`, `baterias-celular`, `Iphones`, `Macs`, `Ipads`.
- Preview final: `Atualizar` 1894, `Bloqueado: Display/LCD/tela` 597, `Revisar: possível Display/LCD/tela` 7, `Revisar: produto duplicado ou ambíguo` 7, `Ignorar: preço Consultar` 7.
- Match independente com planilha de telas: 153 produtos; todos tambem cobertos por bloqueio forte, nenhum exclusivo por match.

---

# Findings - rodape social Tech 7

- Paginas de produto servidas em `localhost:3000` carregam o CSS minificado do tema Tray, nao `_custom/tech7-theme.css`.
- Fix visual do rodape precisa entrar tambem via `assets/js/tech7-local-runtime.js`, que ja roda nas paginas de produto.
- No mobile, o tema fecha `.footer .box .overflow` com `max-height: 0` e `transform: scaleY(.6)`; o bloco social deve ficar fora desse wrapper.

---

# Findings - Match Report Reader telas

- Sessao read-only: analisar `artifacts/price-match-report.json`, `artifacts/price-update-preview.csv` e, se necessario, aba `Tabela Completa` de `artifacts/tabela_precos_venda_telas.xlsx`.
- Saida obrigatoria: `artifacts/subagent_match_report_reader_telas.md`.
- Eixo de match esperado neste fluxo: modelo comercial + qualidade da tela; near-neighbor variants devem ser tratados como risco.
- JSON consolidado tem 112 matches confiaveis em `produtos_atualizados`; todos conferem contra XLSX por linha/produto/preco.
- CSV tem os mesmos 112 IDs como `aprovado_sem_mudanca`, mas uma divergencia de linha para Moto G10/G20/G30 com Aro: CSV linha 43 e JSON linha 458, ambas R$ 125,00.
- Linha 188 da tabela (`Samsung A13 5G Com aro`) aparece em 2 produtos site aprovados; risco de rastreabilidade 1:N.

---

# Findings - reajuste de telas/display

- Skills lidas: `caveman` e `planning-with-files`.
- ONE nao ficou callable nesta sessao; Supabase MCP direto disponivel.
- Projeto Supabase ativo confirmado: `supabase-bisque-bridge` / `lzsaaufsdcmqlasjrqck`.
- Advisory Supabase fora do escopo: RLS desabilitado em tabelas de carrinho/pedido; nao aplicar SQL automaticamente.
- Artefatos base existem: `artifacts/price-match-report.json`, `artifacts/price-update-preview.csv`, `artifacts/tabela_precos_venda_telas.xlsx`.
- Memoria previa indica `products.price_cents` como campo autoritativo e `precos.json` fora do fluxo backend/API.
- Regra de faixa para telas sem match confiavel deve usar `products.price_cents` atual/base em centavos; match confiavel segue usando exatamente `Preco de venda` da planilha.
- Relatorio consolidado tem 436 telas/display, 112 matches confiaveis, 251 sem match e 73 em revisao; universo sem match confiavel para faixa = 324.
- Cruzamento local com `artifacts/.price-match-before-snapshot.json`: 306 calculaveis por faixa e 18 sem calculo por `price_cents = 0`; nenhum id ausente no snapshot.
- Implementacao futura nao deve usar `artifacts/build_sales_price_table.py` como referencia direta para esta regra, pois ele ainda agrupa `<=99` em `+60`.
- `npm run validate:build` falhou inicialmente porque `validate-links` varria `.od-skills/web-prototype-*/example.html`, conteudo oculto de ferramenta nao publicado; `scripts/lib/site-audit.js` deve ignorar `.od-skills`.

---

# Findings - API Loggi

- Indice oficial atual: `https://docs.api.loggi.com/llms.txt`; paginas `.md` contem blocos OpenAPI por endpoint.
- Auth V2: `POST /v2/oauth2/token`, body `client_id`, `client_secret`, retorna `idToken` e `expiresIn`; Auth V1 esta depreciada.
- Base URLs oficiais: `https://stg.api.loggi.com` e `https://api.loggi.com`.
- Endpoints protegidos usam OAuth2 com token no header `Authorization`.
- Cotacao: `POST /v1/companies/{company_id}/quotations`; body inclui `shipFrom`, `shipTo`, `packages` e deve usar `externalServiceIds` ou `pickupTypes`, nunca ambos; `pickupTypes` consta depreciado.
- Dinheiro Loggi usa formato Google Money: `currencyCode`, `units`, `nanos`; centavos = `nanos / 10000000`.
- Pacote para cotacao exige `weightG`, `lengthCm`, `widthCm`, `heightCm`, `goodsValue`; limites documentados incluem 30000g e 100cm por dimensao.
- Shipment assincrono: `POST /v1/companies/{company_id}/async-shipments`; retorna `202`; exige `shipTo`, `shipFrom`, `packages`, `externalServiceId`.
- Etiqueta: `POST /v1/companies/{company_id}/labels`; exige `loggiKeys` e `responseType`; deve ocorrer depois da criacao/confirmacao do pacote.
- Tracking: `GET /v1/companies/{company_id}/packages/{tracking_code}/tracking`; detalhe: `GET /v1/companies/{company_id}/packages/{tracking_code}`.
- Webhook Loggi: endpoint HTTPS com Basic Auth; deve responder `200` ou `201`; payload traz `packages[].loggiKey`, `trackingCode`, `status`, `location`, `promisedDate`, `requestTime`, `trackingHistory`.
- Status relevantes incluem `1 Adicionado`, `2 Cancelado`, `5 Entregue`, `11 Em rota`, `14 Coletado`, `21 Endereco errado`, `22 Aguardando acao do remetente`, `26 Dados incorretos ou invalidos`, `27 Pacote nao integrado`.
- Cancelamento: `POST /v1/companies/{company_id}/packages/cancel`; usa `loggi_key` ou `tracking_code`; se ambos forem enviados, `loggi_key` prevalece; em rota de entrega, cancelamento nao e garantido.
- Atualizacao de pacote: `PATCH /v1/companies/{company_id}/packages`; body `package`, com `shipTo` e `updateMask`.
- Dropoff: `POST /dropoff/locations`; body `categories`; lista Loggi Pontos.
- Integrador: `POST /v1/integrator/activate`; para plataforma/integrador agir em nome de cliente; docs alertam para nao pedir `client_id`/`client_secret` de terceiros.
- TECH7-main local: `server/db/migrations/001_init.sql` ainda nao tem campos de endereco/frete/envio em `orders`; implementar Loggi exige migration.
- TECH7-main local: `server/routes/orders.js` cria pedido apenas de `cartId` e soma itens; frete precisa entrar antes/na criacao de pedido.
- TECH7-main local: `server/routes/payments.js` cria Mercado Pago/Woovi usando `orders.total_cents`; total precisa incluir frete antes de gerar pagamento.

---

# Findings - remocao catalogo Apple errado

- ONE apareceu apenas com executor generico, sem acao Supabase descoberta; fallback usado: `DATABASE_URL` local validado.
- Produtos completos importados de `ggimportsbh.com.br` estavam no Supabase em `section` `Iphones`, `Macs` e `Ipads`.
- Escopo removido: 43 produtos, 1027 imagens, 251 variantes, 41 categorias relacionadas e 1 mapeamento OLX.
- Nenhum `cart_items` ou `order_items` referenciava esses produtos; hard delete nao quebrou pedido/carrinho.
- Nao havia diretorios estaticos `Iphones`, `Macs` ou `Ipads` nem entradas correspondentes no `_assets/tech7/search-index.json`; rotas eram dinamicas via DB.
- Pecas corretas com nome iPhone em `baterias-celular`, `display-e-lcd`, `tampas-e-carcacas` e `pecas-e-componentes` foram preservadas.
---

# Findings - mobile release gate TECH7

- Skills carregadas do disco: `caveman`, `planning-with-files`, `webapp-testing`, `ui-ux-pro-max`, `frontend-developer`, `verification-quality`.
- Browser MCP / `@chrome` e Chrome DevTools MCP nao ficaram callable via descoberta de ferramentas nesta sessao; fallback final sera Playwright, com registro explicito.
- Worktree tem muitas alteracoes pendentes anteriores; esta tarefa deve preservar tudo e limitar edicoes a artefatos de QA e fixes pontuais reproduzidos.
- Pasta de evidencias criada: `_validation/mobile-release-gate/`.

## Bugs
| ID | Pagina | Viewport | Elemento/seletor | Causa provavel | Correcao aplicada | Evidencia final |
|----|--------|----------|------------------|----------------|-------------------|-----------------|

---

# Findings - autoplay carrossel home

- O Swiper da home esta em `index.html` e usa Swiper 4.5.0 local.
- Antes do ajuste, o autoplay estava em `delay: 2550` e era desabilitado quando `prefers-reduced-motion: reduce` fosse verdadeiro.
- Para cumprir o pedido de troca a cada 3 segundos, o delay foi fixado em `3000` e o autoplay passou a iniciar explicitamente apos `swiper.update()`.
- O restart por `visibilitychange`/`focus` reduz risco de o carrossel parar depois de a aba ficar oculta.

---

# Findings - foco central carrossel home

- Antes do ajuste, `centeredSlides=false`; no desktop o slide ativo ficava 409px a esquerda do centro e o card no centro era `swiper-slide-next`.
- O foco visual correto exige `centeredSlides=true`, com o slide ativo sendo tambem o mais proximo do centro do carrossel.
- Os slides laterais precisaram perder destaque visual para nao competir com o card central principal.

---

# Findings - marquee beneficios mobile

- A versao mobile da faixa de beneficios precisa duplicar internamente os 4 itens para formar um trilho continuo: Tecnologia, Entrega Rapida, Site Seguro e Atendimento.
- O loop baseado em `translate(-50%)` era fragil porque dependia da largura final do trilho duplicado; pequenas diferencas de gap/render podiam tornar o reset perceptivel.
- A correcao usa `--t7-benefits-loop-width` medido em px a partir da sequencia original e anima de `-loopWidth` ate `0`, mantendo o primeiro frame e o frame final com a mesma sequencia visual.
- A animacao continua limitada ao mobile por media query e respeita `prefers-reduced-motion`, deixando desktop/tablet sem movimento.
- Para o movimento ficar claramente automatico, a duracao mobile foi reduzida de 18s para 12s e o trilho recebeu `animation-play-state: running` explicito.
- Um watchdog leve verifica o `transform` no mobile e reinicia a animacao se ela for pausada ou ficar parada por scripts/CSS externos.
- A solucao CSS ainda podia falhar no ambiente do usuario por cache do runtime ou por configuracao/estilo externo; o `index.html` agora carrega o runtime versionado.
- O movimento final nao depende mais de CSS animation: no mobile, o JS cancela a animacao CSS com prioridade `important` e aplica `translate3d(...)` continuamente via `requestAnimationFrame`.

---

# Findings - Produtos visitados imagens TECH7

- Reproducao Chrome real antes do fix: `Produtos visitados` renderizava cards com nome/preco, mas os `img.src` caiam para `/_assets/tech7/product-placeholder.svg`.
- Causa raiz compartilhada: itens antigos/atuais podiam salvar `image` com URL de variacao local inexistente, exemplo `...note_20_ultra..._variacao_3826...jpg` e `...s23_fe...7716_1...jpg`, ambas 404 no servidor local.
- A recuperacao anterior falhava porque os itens salvos em `visitedProducts` tinham URL sem segmento de marca (`/display/tela...`) e o match por titulo do indice nao era identico ao nome exibido no card.
- O indice `_assets/tech7/search-index.json` tem imagens reais validas para os mesmos slugs, exemplo `tela-display-lcd-samsung-note-20-ultra-n986-oled` e `tela-display-lcd-samsung-s23-fe-s771-original-retirada-sem-aro`.
- Correção escolhida: resolver `Produtos visitados` por imagem canonica do produto atual (`og:image`/imagem principal) e, para itens antigos, reidratar por slug/rota/titulo usando o indice local antes de aceitar placeholder.
- Nao foi necessario tocar em Supabase, produto, API ou dado remoto; portanto regra ONE-first nao foi acionada para alteracao de dados.
- Validacao Chrome real desktop pos-fix: cards de `Produtos visitados` trocaram placeholder por imagens reais, com 0 placeholders no viewport.
- Validacao Chrome real categoria `Display Samsung`: 10 primeiros cards continuam com imagens reais, 0 placeholders.
- Mobile 390x844 via fallback Playwright: `.visited-section` nao permanece no DOM nesse breakpoint; sem placeholder visivel. O storage antigo simulado foi migrado para imagens reais.

---

# Findings - preco inicial errado TECH7

- Tarefa iniciada em `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Regra de memoria/AGENTS confirmada: tarefas de preco/produto/Supabase devem tentar ONE primeiro e so usar fallback apos registrar indisponibilidade.
- ONE indisponivel via `tool_search`: buscas por `ONE Supabase active project` e `one active project supabase` nao expuseram ferramenta ONE; apenas Supabase direto ficou callable. Fallback Supabase direto sera usado.
- Supabase direto listou projeto unico `rkdyhgqtgihixnbkngek` (`ACTIVE_HEALTHY`, `stiflerwfl2@gmail.com's Project`), mas `_list_tables` exigiu reautenticacao. Fallback final: `DATABASE_URL` local/env, sem expor segredo.
- `/api/health` confirmou DB conectado via `DATABASE_URL`.
- Precos reais consultados no banco para reproducao: iPhone 16 JK R$ 450,00; iPhone 16 Plus JK R$ 450,00; iPhone 16 Pro Max JK R$ 970,00; Samsung S20 Ultra G988 R$ 1.300,00; Samsung S23 S911 R$ 1.080,00; Samsung S23 Plus S916 R$ 900,00; Samsung S23 Ultra S918 R$ 970,00.
- Causa raiz principal: HTML estatico da home/produto/categorias mantinha precos antigos visiveis ate `preco-loader.js` concluir `/api/products/resolve-prices`.
- Exemplo reproduzido com API atrasada: iPhone 16 Pro Max aparecia como `R$ 48,00` antes de virar `R$ 970,00`; S23 aparecia como `R$ 1.050,00` antes de virar `R$ 1.080,00`; S23 Plus aparecia como `R$ 650,00` antes de virar `R$ 900,00`; S23 Ultra aparecia como `R$ 720,00` antes de virar `R$ 970,00`.
- Fix aplicado: CSS global `T7-DB-PRICE-GATE` oculta visualmente os seletores de preco ate `html.t7-prices-ready`; `preco-loader.js` marca loading/ready e troca o texto por preco do banco ou `Preco sob consulta`.
- Carrinho/checkout tinham risco separado: renderizavam preco salvo em `localStorage` antes de revalidar com API. `cart-manager.js` agora revalida itens salvos contra `/api/products/resolve-prices` e publica `T7_CART_PRICES_STATUS`.
- `carrinho/index.html` e `checkout/index.html` agora exibem `Atualizando preco` e bloqueiam avancos enquanto o carrinho nao esta revalidado; em falha, nao mostram preco antigo como definitivo.
- `Produtos visitados` tinha risco de gravar preco de `dataLayer`/DOM antes do preco oficial. O runtime passou a escolher o primeiro candidato numerico valido e o `preco-loader.js` recupera itens antigos da rota atual no `visitedProducts`.
- Busca usa `/api/search` e `price_cents` da API para renderizar resultados, nao `search-index.json` como fonte final de preco.
- Validacao Chrome real pos-fix: home abriu com `html.t7-prices-ready` e cards com precos finais do banco; evidencia `_validation/price-source/home-price-after-fix-chrome.png`.
- Validacoes controladas com atraso artificial da API confirmaram que preco antigo fica transparente e o texto visivel e `Carregando`; depois entra o preco do banco.
- Validacao de carrinho/checkout com item propositalmente stale em `localStorage` confirmou estado inicial `Atualizando preco`, botoes bloqueados, e final `R$ 1.300,00` apos revalidacao.
