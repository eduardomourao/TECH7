# Findings - performance producao TECH7 (2026-06-13)

## Admin `/Admin` - persistencia de edicao produto - 2026-06-20
- Memoria relevante: criacao de produto admin usa `products.price_cents`, `primary_image_url`, ``metadata.images``, `product_images`, `product_categories`; pagina publica dinamica esta em `server/app.js`.
- Estado inicial do worktree ja tinha alteracoes pendentes anteriores em admin/runtime e assets; preservar, nao reverter.
- Codigo atual indica que `POST /api/admin/products` sincroniza `product_images` e `product_categories`, mas `PUT/PATCH /api/admin/products/:id` ainda atualiza apenas `products`.
- Hipotese inicial a validar: edicao salva ``metadata.images``/`section`, mas nao sincroniza tabelas relacionais, e pode deixar caminhos publicos/admin inconsistentes apos categoria/imagem.

## Admin `/Admin` - criar novo produto - 2026-06-20
- Skills obrigatorias aplicadas: `caveman` e `planning-with-files`.
- Skills uteis disponiveis e lidas para esta tarefa: `prompt-library`, `prompt-engineering`, `webapp-testing`, `Verification & Quality Assurance`, `app-builder`, `api-testing-observability-api-mock`, `accessibility-compliance-accessibility-audit`.
- ONE: ferramentas de consulta/descoberta necessarias para validar Supabase nao ficaram disponiveis nesta sessao; fallback autorizado usado com `@supabase`.
- `@supabase` confirmado: projeto ativo `supabase-bisque-bridge`, ref `lzsaaufsdcmqlasjrqck`, regiao `sa-east-1`, status `ACTIVE_HEALTHY`.
- Schema validado no `@supabase`: `products` possui `price_cents`, `price`, `description_text`, `description_html`, `stock`, `availability`, `primary_image_url`, `metadata`, `active` e `is_active`; `categories` possui `slug/name`; `product_images` e `product_categories` existem.
- Categorias reais do banco para select: `acessorios`, `iphones`, `apple-watch`, `macs`, `ipads`, `iphones-novos`, `iphones-seminovos`, `macs-novos`, `macs-seminovos`, `robos`, `xiaomi`.
- `product_images` e `product_categories` tinham 0 linhas antes desta tarefa; runtime publico atual usa `products.`metadata.images``, `primary_image_url`, `image_url` e `section`.
- Layout publico dinamico identificado em `server/app.js`: produto por `/{section}/{slug}` ou `/{section}/{brand}/{slug}`, com header, galeria, titulo, preco, descricao e compra no mesmo template dinamico.
- O admin ja tinha um editor parcial, mas o novo produto nascia com categoria/preco/status preenchidos e imagens em textarea. Isso nao atendia ao requisito de campos em branco e controle claro de galeria.
- Correcoes aplicadas: botao `+ Novo produto`, formulario com categoria placeholder, preco/estoque em branco, status inicial inativo, marca opcional e gerenciador de imagens com adicionar/remover/subir/descer/principal.
- Backend alterado: `POST /api/admin/products` agora valida categoria existente no banco, exige slug globalmente unico para novos produtos, exige preco positivo, salva em transacao e sincroniza `product_images`/`product_categories`.
- Durante o teste visual, `type="url"` nos campos de imagem bloqueou caminhos locais como `/_assets/...`; corrigido para `type="text"` com validacao no backend.
- Durante a validacao publica, o template dinamico do produto criado tinha overflow horizontal e nao expunha botao/form de compra de forma robusta; `server/app.js` recebeu container responsivo, `#form_comprar`, `#bt_comprar` e bloco `.box-frete`.
- Validacao final com Google Chrome via Playwright fallback criou produto real `prod_8dbe8f4788b35b36161e0696367930b0`, confirmou pagina publica com titulo, preco `R$ 123,45`, 2 imagens, 2 thumbs, header, galeria, compra, frete e sem overflow (`scrollWidth=1366`, `innerWidth=1366`).
- Produto QA foi removido apos o teste. Supabase confirmou `qa_products_left = 0`.
- Evidencias salvas em `_validation/admin-new-product/`: `admin-new-product-blank-form-final.png`, `admin-new-product-after-save-final.png`, `public-created-product-page-final.png`, `admin-new-product-validation-final.json`.
- Estado inicial do git tem alteracoes preexistentes nao relacionadas em `_custom/tech7-theme.css`, `assets/js/tech7-local-runtime.js` e `_assets/tech7/apple-importados.jpg`; preservar e nao reverter.

## Admin `/Admin` - filtros, massa, exclusoes e tema - 2026-06-15
- Supabase plugin disponivel e usado. Projeto ativo: `supabase-bisque-bridge`, ref `lzsaaufsdcmqlasjrqck`, regiao `sa-east-1`, status `ACTIVE_HEALTHY`.
- Categorias reais em `public.categories`: `acessorios`, `iphones`, `apple-watch`, `macs`, `ipads`, `iphones-novos`, `iphones-seminovos`, `macs-novos`, `macs-seminovos`, `robos`, `xiaomi`.
- Secoes atualmente usadas em `products.section`: `pecas-e-componentes`, `display-e-lcd`, `tampas-e-carcacas`, `baterias-celular`. Isso difere das categorias comerciais cadastradas; UI deve mostrar categorias do banco e preservar valor atual quando nao existir na tabela.
- `products` tem `active` e `is_active`; backend ja inativa produto via `DELETE /api/admin/products/:id` com `active=false`, `is_active=false`, `availability='NO'`.
- `orders` nao tem `deleted_at`; status reais: `pending` 22, `failed` 2, `paid` 1. Exclusao segura deve marcar `cancelled`, sem apagar linhas e sem quebrar FKs.
- `service_orders` nao tem `deleted_at`; status real: `entregue` 1. Exclusao segura deve marcar `cancelada`, preservando OS/itens.
- Advisor Supabase anterior apontou RLS desabilitado em tabelas sensiveis como `orders` e `service_orders`; fora do escopo aplicar politica agora.
- Validacao visual/funcional local: Google Chrome via Playwright `channel: "chrome"` testou produtos, filtros, ordenacao, salvar todas alteracoes sem reload, excluir produto, excluir pedido, excluir OS e alternar tema. Evidencia: `_validation/admin-panel-release/admin-ui-validation.json` e `admin-products-after.png`.
- Limitacao: sem senha admin em texto no `.env`, a validacao de painel autenticado usou respostas mockadas no navegador. Supabase foi usado para confirmar estrutura/dados reais antes da implementacao.
- Bug pos-commit reportado pelo usuario: aba Produtos em `/Admin` mostrava `Erro ao carregar produtos: http_404`.
- Causa confirmada localmente: processo dev antigo ainda estava servindo sem `GET /api/admin/categories`; a Promise de produtos falhava quando categorias retornava 404.
- Correcao adicional: `loadCategories()` agora tem fallback local e nao bloqueia render de produtos se o endpoint de categorias falhar. Servidor local foi reiniciado; `/api/admin/categories` agora retorna 401 sem sessao, confirmando rota existente.
- Novo pedido: botao `Excluir` de produto deve remover dados do banco, nao inativar.
- Supabase FKs para `products`: `cart_items.product_id` e `order_items.product_id` usam `NO ACTION`; `service_order_items.product_id` usa `SET NULL`; `product_images`, `product_categories`, `product_variants`, `olx_ads`, `olx_category_mappings` usam `CASCADE`.
- Para hard delete funcionar, API precisa apagar `cart_items` e `order_items` do produto antes de apagar `products`; demais dependencias seguem regras FK.
- Endpoint admin alterado para hard delete real em transacao. Observacao: linhas de `order_items` daquele produto sao removidas; totais agregados do pedido em `orders` permanecem.
- UI separa status e exclusao: botao `Ativo/Inativo` usa `PATCH`; botao vermelho `Excluir definitivo` usa `DELETE`.
- Cards de `Visao operacional` agora sao botoes: precos invalidos, sem imagem, estoque baixo, produtos inativos e duplicados levam para Produtos com filtro aplicado; pedidos pendentes leva para Pedidos; OS abertas/concluidas levam para Ordens de Servico.
- API admin ganhou filtro `alert=duplicate` em produtos e `status=open|completed` em OS para suportar os atalhos.
- Evidencia Chrome fallback: `_validation/admin-panel-release/dashboard-card-shortcuts-after.json` confirmou todos os filtros esperados.
- Dashboard admin recebeu faixa executiva, 4 metricas compactas, 4 graficos ring, barras empilhadas para catalogo/pedidos e layout visual mais forte sem remover atalhos existentes.
- Validacao visual final: `_validation/admin-panel-release/dashboard-improved-final-validation.json` confirmou desktop e mobile sem overflow, 8 cards clicaveis, 4 rings e 7 barras empilhadas, sem erros de console.

## Remover logo errada do site/admin - 2026-06-15
- O print indica icone errado na aba do navegador em `/Admin`, nao logo de conteudo.
- `favicon.png` local e `https://tech-7.vercel.app/favicon.png` ja sao a marca TECH 7 correta.
- `admin.html` nao tinha favicon explicito; o navegador podia usar fallback/cache antigo do dominio.
- Correcao aplicada em `admin.html`: adicionados `theme-color`, `shortcut icon`, `icon` PNG e `apple-touch-icon` com query `?v=tech7-20260615` para forcar refresh do favicon correto TECH 7.
- Validacao local em `/admin`: links de favicon versionados presentes; requests para `/favicon.ico?v=tech7-20260615` e `/favicon.png?v=tech7-20260615` retornaram 200.

## Ajuste pagina Tipos de Telas - video OLED vs Original - 2026-06-14
- Pagina alvo localizada em `duvidas-tipos-de-telas/index.html`.
- O conteudo anterior explicava OLED/AMOLED apenas em texto, sem demonstracao visual.
- Foi adicionado player responsivo por `iframe` do Google Drive usando URL `/preview` para o video `1mou1mFUSjaqS4OHiep_IO3IQZadxsWDr`.
- Aviso adicionado: o video e comparativo visual de tela OLED vs ORIGINAL para aparelhos Galaxy linha S Ultra, do S20 Ultra ao S25 Ultra.
- Validacoes `npm run validate:assets` e `npm run validate:routes` passaram.
- Validacao mobile 390x844 com Chrome via Playwright fallback confirmou iframe presente, aviso presente, `scrollWidth=390` e sem overflow horizontal. Evidencias: `_validation/types-of-screens/tipos-de-telas-video-390x844.png`, `_validation/types-of-screens/tipos-de-telas-video-390x844-final.json`.
- Drive preview direto respondeu 200 e exibiu texto `Reproduzir`, sem sinal de bloqueio de acesso. Evidencia: `_validation/types-of-screens/drive-preview-390x844.png`.
- Observacoes de rede fora do HTML alterado: Google Drive dispara um 403 em endpoint de sharing client e o tema legado ainda solicita `/assets/store/img/fechar.png` com 404.

## Ajuste textual - Servico de Instalacao - 2026-06-14
- A pagina `duvidas-servico-de-instalacao/index.html` ainda tinha condicoes antigas, prazo fixo de 1 dia util, endereco antigo e mencao a `X3 Distribuidora`.
- A pagina foi reescrita para deixar explicito que cada aparelho/modelo possui valor proprio de mao de obra, que o reparo cobre somente o servico solicitado e que defeitos preexistentes precisam ser declarados antes do atendimento.
- A responsabilidade foi limitada a peca vendida pela TECH 7 e ao servico contratado para essa peca; defeitos posteriores de placa, software, perifericos, oxidacao, queda, mau uso ou problemas nao ligados diretamente a peca vendida ficam fora da responsabilidade da loja.
- O texto agora informa que prazos podem variar, trocas de tela e bateria normalmente sao feitas no mesmo dia quando a peca esta disponivel e nao ha defeitos adicionais, e que eventual restituiÃ§Ã£o pode ser revertida em credito na loja, sem devolucao em especie.
- Ocorrencias institucionais antigas de `X3 Distribuidora` foram substituidas por `TECH 7`; a pagina de alerta de fraude tambem teve mencoes genericas a `X3` substituidas por `TECH 7`. Mencoes de produto como `Poco X3` foram preservadas.
- Validacao local mobile 390x844 confirmou texto obrigatorio presente, textos antigos ausentes, `scrollWidth=390` e sem overflow horizontal. Evidencias: `_validation/installation-page/servico-instalacao-390x844-after.png` e `_validation/installation-page/servico-instalacao-390x844-after.json`.
- Risco remanescente fora do escopo textual: o tema legado ainda solicita `http://127.0.0.1:3000/assets/store/img/fechar.png` e recebe 404. Esse asset nao foi introduzido por esta alteracao.

## Estado inicial
- URL alvo confirmada pelo pedido: `https://tech-7.vercel.app/`.
- Investigacao deve comeÃ§ar por medicao; nenhuma alteracao funcional feita ainda.
- Memoria relevante: producao TECH7 em Vercel ja teve historico de `/api/health`, envs Supabase, `PGSSL_REJECT_UNAUTHORIZED`, `WHATSAPP_APP_SECRET` opcional e necessidade de `vercel logs --expand`.
- Worktree ja possui mudancas anteriores; preservar e nao reverter.

## Hipoteses a medir
- Cold start de funcao Vercel/API.
- TTFB alto no HTML por render/roteamento server-side.
- API inicial lenta (`/api/products`, `/api/search`, `/api/products/resolve-prices`).
- Conexao Supabase/pooler/SSL/envs.
- Assets JS/CSS/imagens grandes ou bloqueantes.
- Integracoes opcionais inicializadas de forma bloqueante.

## Medicoes iniciais
- `https://tech-7.vercel.app/api/health`: `ok=true`, `database=connected`, `source=POSTGRES_URL`.
- HTTP baseline salvo em `_validation/production-performance/http-baseline.json`.
- Browser waterfall salvo em `_validation/production-performance/browser-waterfall-baseline.json`.
- Home producao: HTML cache `HIT`, TTFB warm baixo (~33ms no HTTP baseline), mas `load` nao completou em 45s no Chrome fallback por assets estaticos pendurados.
- APIs producao:
  - `/api/products?limit=24`: primeiro total 5744ms, warm mediano 1951ms, TTFB warm mediano 750ms.
  - `/api/search?q=iphone&limit=24`: warm mediano 1387ms, TTFB warm mediano 822ms.
  - `/api/products/resolve-prices`: warm mediano 282ms.
  - `/api/health`: warm mediano 377ms.
- Home producao no waterfall nao chamou API inicial; gargalo do primeiro load veio de assets estaticos.

## Causa raiz comprovada
- `index.html` carregava 10 imagens do carrossel principal com `loading="eager"`, todas com arquivos grandes (~172KB a 288KB cada) e dimensoes declaradas `2000x2000`.
- No waterfall de producao, essas imagens e scripts estaticos do tema/runtime ficaram com duracoes de 13s a 42s, impedindo o evento `load`.
- `assets/js/tech7-local-runtime.js` tambem disparava `/_assets/tech7/search-index.json` (~2,8MB) cedo no fluxo local, disputando rede com render e reconciliacao de preco.

## Correcao local aplicada
- `index.html`: primeira imagem do carrossel segue `eager` com `fetchpriority="high"`; as demais usam `loading="lazy"`, `fetchpriority="low"` e `decoding="async"`.
- `assets/js/tech7-local-runtime.js`: `loadCardSearchIndex()` agora agenda o fetch pesado via `requestIdleCallback`/timeout, em vez de disputar o caminho critico.
- Medicao local pos-fix: `load` 5589ms -> 4763ms; `/api/products/resolve-prices` 3096ms -> 795ms; `search-index.json` deixou de aparecer no caminho critico inicial.

## Correcao pontual do carrossel solicitada
- Escopo: somente carrossel da home (`.t7-product-carousel-section` em `index.html`) e assets derivados das suas 10 imagens.
- Problema: os slides ainda dependiam dos JPGs originais de ~168KB a ~281KB cada; com clones do Swiper, o navegador ainda podia baixar JPGs do carrossel mesmo apos `lazy`.
- Correcao aplicada: geradas 3 variantes WebP por slide (`160w`, `240w`, `360w`) em `_assets/tech7/carousel/`, totalizando ~147KB para 30 arquivos.
- Markup: cada slide agora usa `picture/source` com `srcset`/`sizes`; o `img src` tambem aponta para WebP para impedir fallback JPG nos clones do Swiper. O JPG original ficou apenas em `data-original-src`.
- CSS restrito: `.t7-carousel-picture` preserva centralizacao do card e `.t7-carousel-img` usa `box-sizing:border-box`.
- Evidencia: `_validation/production-performance/carousel-after-webp-390x844.json` registrou 10 requests WebP HTTP 200, 0 requests JPG do carrossel, 0 erros de console e `noHorizontalOverflow=true`.
- Screenshot: `_validation/production-performance/carousel-after-webp-390x844.png`.

---

# Findings - mobile production gate TECH7 (2026-06-12)

## Estado inicial
- Pedido: testar todo o site localmente em mobile antes de producao, usando Browser MCP.
- Browser MCP / Chrome DevTools MCP: ferramentas de navegacao, clique, screenshot e trace nao ficaram callable via descoberta nesta sessao.
- Fallback final registrado: Playwright com Google Chrome (`channel: "chrome"`).
- Evidencias desta rodada serao salvas em `_validation/mobile-production-gate/`.

## Checklist aplicado
- Overflow horizontal: `document.documentElement.scrollWidth <= window.innerWidth`.
- Header/logo/menu/busca mobile.
- Cards de produto: imagem, titulo, preco e CTA/link.
- Filtros mobile em catalogos.
- Produto individual, carrinho e checkout acessivel.
- Footer com Instagram/WhatsApp.
- Console/network local sem erro critico.
- Screenshots por viewport/rota-chave.
- Performance basica por Navigation Timing quando DevTools trace nao estiver disponivel.

## Bug confirmado

| Pagina | Viewport | Elemento/seletor | Causa provavel | Correcao aplicada | Evidencia final |
|---|---:|---|---|---|---|
| `/tela-display-lcd/samsung/index.html` redirecionando para `/display-e-lcd/samsung/` | 320x568, 375x667, 414x896 | `.page-catalog .filter__button` | CSS do drawer mobile usava `width: calc(100% + 32px)` com margem negativa, fazendo o botao final passar da largura do painel em viewports estreitas | Ajustado para `width: 100%`, `max-width: 100%`, `box-sizing: border-box`, margem sem negativo e `display:flex` | `_validation/mobile-production-gate/filter-button-after-focused.json`, screenshots `filter-button-after-*.png` |

## Resultado final da auditoria
- `_validation/mobile-production-gate/mobile-production-audit-summary.json`: 84/84 casos passaram, 0 bloqueadores, 0 erros.
- Rotas testadas: 12.
- Viewports testadas: 7.
- Console local: sem erro critico na auditoria final.
- Network local: sem 404/5xx de CSS, JS, imagem principal ou asset critico na auditoria final.
- Overflow horizontal: `scrollWidth <= innerWidth` em todos os casos.
- Interacoes finais: menu abre/fecha, busca com sugestao e resultado, clique de card, botao comprar, Instagram e WhatsApp.

---

# Findings - Produtos visitados imagens TECH7 (2026-06-11)

## Estado inicial
- Print do usuario mostra cards de `Produtos visitados` com nome/avaliacao/preco, mas imagem de fallback `TECH 7 - Imagem indisponivel`.
- Memoria do projeto indica que runtime compartilhado de produto/card fica em `assets/js/tech7-local-runtime.js`; evitar edicao por pagina.
- Worktree ja possui stage grande e alteracoes locais nao relacionadas; preservar.

---

# Findings - filtros mobile TECH7 (2026-06-12)

## Estado inicial
- Filtros de catalogo ficam no HTML legado dentro de `.sidebar-category .box-fixed .box-white`.
- Botao visivel para mobile/desktop: `.button-filter`.
- Form real: `form.smart-filter`; runtime de aplicacao backend fica em `assets/js/tech7-local-runtime.js`.
- CSS legado do tema define `.filter__list`, `.filter__title`, `.filter__item`, `.filter__label`, mas nao adapta claramente `.box-fixed/.box-white` como drawer mobile.
- Problema estrutural encontrado no HTML legado: alguns labels de categoria usam `for="c-APPLE"` enquanto inputs tÃªm `id="APPLE"`, reduzindo area clicavel em mobile. CorreÃ§Ã£o deve normalizar labels via JS sem editar todas as paginas.

## Evidencia antes
- `_validation/mobile-filters/before-filters-390.json`: em 390x844, painel aberto tinha `.box-white` em `305x1121`, ultrapassando a viewport.
- Primeiro label do filtro: `for="c-APPLE"` com input `id="APPLE"`.
- Sem overflow horizontal, mas com rolagem/formato ruim por painel maior que a tela e conteudo estreito.

## Correcao aplicada
- `assets/js/tech7-local-runtime.js`:
  - adiciona `ensureMobileCatalogFilterStyles()` com CSS mobile para `.page-catalog .box-fixed`;
  - transforma filtro em drawer lateral de `min(92vw, 420px)`, altura `100dvh`, rolagem interna e overlay;
  - adiciona classe `body.t7-filter-open` para bloquear scroll do fundo;
  - aumenta area clicavel dos filtros para minimo de 44px;
  - normaliza `label[for]` para bater com `input.id`;
  - gera texto legivel para faixas de preco vazias, ex. `AtÃ© R$ 349,99`;
  - preserva o backend filter existente e nao altera rotas/produtos.

## Evidencia depois
- `_validation/mobile-filters/after-mobile-filters-validation.json`:
  - drawer aberto: `359x844` em viewport `390x844`;
  - `overflow-y: auto`;
  - label corrigido: `APPLE` -> `APPLE`;
  - clique em `Samsung` marcou checkbox, atualizou URL para `?brand=samsung` e renderizou 100 cards filtrados;
  - sem overflow horizontal, sem erro de console e sem erro local de network.

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

## Reajuste Galaxy Ultra OLED - 2026-06-12
- Escopo confirmado antes de alterar: somente telas OLED/Incell/Vivid dos modelos S20 Ultra, Note 20 Ultra, S21 Ultra, S22 Ultra e S23 Ultra.
- ONE, Supabase plugin e Composio nao ficaram callable via descoberta de ferramentas; fallback foi o runtime local com `DATABASE_URL`.
- Projeto Supabase inferido pelo host/usuario do runtime: pooler `aws-1-sa-east-1.pooler.supabase.com`, usuario `postgres.lzsaaufsdcmqlasjrqck`.
- Atualizados no banco para `price_cents=95000`:
  - `tela-display-lcd-samsung-note-20-ultra-n986-oled`
  - `tela-display-lcd-samsung-s20-ultra-g988-oled-com-aro`
  - `tela-display-lcd-samsung-s21-ultra-original-nacional-com-aro`
  - `tela-display-lcd-samsung-s23-ultra-5g-s918-oled-com-aro`
- Nenhum produto ativo S22 Ultra OLED foi encontrado no banco; a pagina estatica `display/apple/tela-display-lcd-samsung-s22-ultra-5g-s908-oled-com-aro/index.html` esta fora do escopo ativo e foi preservada.
- Nenhum produto ativo Incell/Vivid foi encontrado dentro dos modelos confirmados; nenhum item foi atualizado para `R$ 450,00`.
- API `/api/products/resolve-prices` retornou `price_cents=95000`, `price_status=available` e `found=true` para os quatro produtos.
- Bug visual/compra encontrado no Note 20 Ultra: o form Tray legado podia desaparecer antes de `produto-comprar.js` recriar a UI; resultado era pagina sem preco principal/botao local em algumas execucoes.
- CorreÃ§Ã£o aplicada em `produto-comprar.js`: detectar pagina de produto por shell `.page-product`/`.fixed-info` alem do form legado, permitindo inserir `.t7-buy-wrapper` com preco e botao mesmo se o form ja tiver sido removido.
- Validacao visual final por Playwright Chrome fallback em 390x844:
  - quatro paginas com `R$ 950,00` em `.t7-buy-wrapper .t7-buy-price`;
  - botao `.btn-comprar` habilitado;
  - sem overflow horizontal;
  - sem erro local de console/network; apenas warning legado `JQMIGRATE`.
- Evidencias: `_validation/price-performance/galaxy-ultra-oled-950-validation.json` e screenshots `galaxy-ultra-oled-950-note20ultra.png`, `galaxy-ultra-oled-950-s20ultra.png`, `galaxy-ultra-oled-950-s21ultra.png`, `galaxy-ultra-oled-950-s23ultra.png`.

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
- Colunas reais: `Produto`, `Custo`, `Adicional`, `PreÃ§o de venda`.
- A planilha e de telas, mas nomes como `Motorola E13 Sem aro` nao trazem `display/lcd/tela`; por isso a planilha inteira deve ser fonte de bloqueio por contexto.
- `_assets/tech7/search-index.json` tem 3279 itens; categorias `display` 690, `display-e-lcd` 65 e `touchs-e-visores` 25.
- O indice tem 37 itens com `display/lcd/tela` fora de categorias de display/touch, incluindo `Aro LCD`, `Flex LCD` e telas cadastradas em `baterias`.
- `vidro` e `frontal` geram falsos positivos fortes quando usados sozinhos: lente de camera e camera frontal.
- Supabase ativo confirmado: `supabase-bisque-bridge` / `lzsaaufsdcmqlasjrqck`, regiao `sa-east-1`.
- `products` contem 2512 produtos; 2493 ativos; 27 com `price_cents` ausente/menor que 200.
- Campo oficial usado pelo site/admin/carrinho e `products.price_cents`; campos legados `price` e `price_text` existem e devem ficar sincronizados quando uma linha for atualizada.
- Secoes atuais: `pecas-e-componentes`, `display-e-lcd`, `tampas-e-carcacas`, `baterias-celular`, `Iphones`, `Macs`, `Ipads`.
- Preview final: `Atualizar` 1894, `Bloqueado: Display/LCD/tela` 597, `Revisar: possÃ­vel Display/LCD/tela` 7, `Revisar: produto duplicado ou ambÃ­guo` 7, `Ignorar: preÃ§o Consultar` 7.
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
- CorreÃ§Ã£o escolhida: resolver `Produtos visitados` por imagem canonica do produto atual (`og:image`/imagem principal) e, para itens antigos, reidratar por slug/rota/titulo usando o indice local antes de aceitar placeholder.
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

---

# Findings - galeria produto mobile

- A galeria compartilhada da pagina de produto fica em `assets/js/tech7-local-runtime.js`; a correcao nao exigiu editar paginas/produtos individuais.
- No mobile, a coluna de thumbnails herdava comportamento de desktop: `.nav-images` ficava parcialmente fora do viewport, exemplo reproduzido em 390px com `left=-120` e `right=0`.
- A rota testada nao carregava `_custom/tech7-theme.css`, entao o CSS sozinho nao resolveria o problema; o runtime agora aplica inline os estilos criticos no breakpoint mobile.
- A solucao mobile reposiciona os thumbnails abaixo da imagem principal, cria setas acessiveis sobre a imagem, mantem o indice ativo sincronizado e adiciona swipe horizontal com tolerancia para scroll vertical.
- `setActiveGalleryIndex` preserva o scroll no mobile para evitar salto ao clicar em seta/thumb e mantÃ©m o desktop fora do caminho mobile.
- Desktop continua sem setas mobile e com thumbnails funcionando; comportamento novo fica limitado ao `max-width: 767px`.
- O Chrome/plugin `@chrome` nao ficou callable nesta sessao; a validacao visual foi executada com Playwright usando `channel: chrome`.
- Validacao mobile final em 320/375/390/430 confirmou proximo, anterior, swipe, thumbnail, setas visiveis, uma imagem principal visivel e ausencia de overflow horizontal.
- A regressao visual do print em 2026-06-12 vinha de dois pontos combinados: CSS mobile original ainda carregado em `style.min__e4660e26.css` jogava `.nav-images` para fora do fluxo, e o runtime precisava travar largura/altura dos slides principais em px no mobile para impedir uma imagem vazar sobre a outra.
- `_custom/tech7-theme.css` nao e carregado na rota Realme C55; por isso o override tambem foi aplicado em `_assets/images.tcdn.com.br/files/996644/themes/46/css/style.min__e4660e26.css`, que e o CSS efetivo da pagina.
- As setas desktop tinham risco separado: em alguns cenarios ficavam parcialmente fora do viewport ou presas em `swiper-button-disabled` apos chamadas diretas de `mainSwiper.slideTo`. A solucao foi dar area clicavel real ao controle e sincronizar estado via eventos do Swiper principal.
- Validacao final: produto Realme C55 em 320/375/400/430 sem corte/sobreposicao, `validate:product-gallery` 25/25, `validate:gallery-position` 24/24 e `validate:build` OK.
- O problema residual dos thumbnails vinha da rail mobile nao reservar uma area propria suficiente para cada slide/card depois do Swiper aplicar medidas. A correcao final fixa o fluxo horizontal com flex sem wrap, gap explicito, slide de 78px, card de 72px, margin zerada e overflow lateral apenas dentro de `.nav-images .list`.
- No produto com 5 miniaturas, a rail agora tem scroll interno (`navScrollWidth=438` em 320px) sem aumentar `documentElement.scrollWidth`; os pares adjacentes mantiveram 16px de separacao entre bordas.

---

# Findings - busca inteligente no header TECH7

- Campo alvo: `form.search-header[data-search="suggestion"]` com `input[name="palavra_busca"][data-input="suggestion"]`, presente no header das paginas estaticas.
- Endpoint confiavel para sugestoes: `/api/search`, montado em `server/routes/search.js`; ele consulta produtos ativos no banco/API, aplica `applyCatalogPrices`, retorna `price_cents`, imagem normalizada e URL canonica.
- `_assets/tech7/search-index.json` nao deve ser usado como fonte final de preco porque nao possui preco confiavel; serve apenas como apoio interno de rota/imagem no backend.
- Havia uma logica inline antiga de autocomplete na home, sem debounce/abort e interceptando eventos com `stopImmediatePropagation`; ela foi neutralizada quando o runtime novo esta ativo para evitar comportamento duplo.
- Correcao aplicada no runtime compartilhado: debounce 250ms, `AbortController`, sequencia para ignorar respostas antigas, ranking leve no cliente, dedupe por id/url/slug, limite de 8 sugestoes e estado `Nenhum produto encontrado`.
- O Enter permanece como submit tradicional para `/busca/index.html`, e clique em sugestao navega para o produto.
- Layout validado sem scroll horizontal: desktop 1366 (`scrollWidth=clientWidth=1366`) e mobile 390 (`scrollWidth=clientWidth=390`).
- `@chrome` nao ficou callable nesta sessao; validacao visual foi feita por Playwright usando canal Chrome/fallback, com evidencias em `_validation/search-autocomplete/`.
## Admin OS Dashboard Upgrade - Findings - 2026-06-12

- Primary admin surface confirmed: root `admin.html`; `admin/` folder exists but was not treated as the main surface.
- Current admin JS: `assets/js/admin.js`.
- Current admin API: `server/routes/admin.js`, mounted under `/api/admin`.
- Current admin functions include login/session/logout, product list/detail/create/update/deactivate, bulk price update, order list/detail/status, metrics, CSV export, dashboard/products/orders/pricing/reports tabs.
- Runtime DB source: `DATABASE_URL` loaded by `server/lib/db.js`; host is Supabase pooler `aws-1-sa-east-1.pooler.supabase.com` with password masked in logs.
- ONE unavailable in current tool surface. Direct Supabase app is available, but project discovery returned one inactive project, so runtime DB is the reliable source for this checkout.
- Real public tables include `products`, `orders`, `order_items`, `payments`, `carts`, `cart_items`, `shipments`, `shipping_quotes`, `product_images`, `product_variants`, `categories`, `product_categories` plus CRM/OLX tables.
- Current counts from runtime DB: `products` 2472, `orders` 25, `order_items` 25, `payments` 6, `carts` 339, `cart_items` 53, `shipments` 5, `shipping_quotes` 12.
- Existing metrics cover product counts, active/inactive, invalid price, brand/category distribution, order revenue, ticket, status, payments, top products.
- Missing metrics requiring new work: product image alerts from metadata/image fields, low stock, delivery/freight usage, recurring customers, service order status, labor revenue, products revenue split.
- OS requires new schema because no `service_orders` table exists in current runtime DB.
- PDF visual direction from Creative Production: white printable document, Tech 7 black/orange accents, dense readable sections, clear totals, warranty, and signature lines; avoid dark PDF backgrounds and landing-page styling.
- New migration `005_service_orders.sql` creates `service_orders` and `service_order_items`.
- New OS API surface: list/detail/create/update/create-from-order/pdf under `/api/admin/service-orders`.
- PDF is generated server-side as `application/pdf` without adding npm dependencies.
- Test OS created through API returned `OS-00001`, total `15`, PDF `application/pdf` with 4016 bytes; test OS was deleted after validation.
- Playwright visual fallback created an OS through UI, saved screenshots, then deleted the UI test OS. One console 401 was from the expected pre-login session check.
- Data Analytics artifact validated after schema corrections and rendered as `Tech 7 Admin Metrics Baseline`.
- Order-to-OS flow works with a real order: `order_329222f2e6ae78184be6bdad8da3b9bc` created `OS-00003` with one item and PDF output; the validation OS was deleted afterward.
- Reported OS tab error `Erro ao carregar OS: http_404` was caused by the local port 3000 process serving an older route set. The current `server/routes/admin.js` already had `/api/admin/service-orders`, and after restarting `node server/index.js`, unauthenticated `/api/admin/service-orders` changed from 404 to expected 401.
- Supabase plugin fallback is active and confirmed project `lzsaaufsdcmqlasjrqck`; `public.service_orders` and `public.service_order_items` exist with 0 rows, so the bug was not a missing migration.
- Authenticated validation with provided admin credentials returned 200 for `/api/admin/service-orders?limit=20&offset=0`, with `total=0`.
- UI validation fallback saved `_validation/admin-os/os-tab-after-404-fix.png`; the OS tab loaded without `http_404` or `Erro ao carregar OS`.
- Manual OS now supports selecting a real catalog product from `products` through the admin product API. UI sends `product_id`, and the server hydrates final `product_name` and `unit_price_cents` from the catalog via `applyCatalogPrices`, so altered browser price/name are not trusted.
- Products used in non-canceled OS now count as product sales in dashboard product revenue, top products and top categories. This avoids fake `orders` rows while still reflecting counter/service sales.
- Order-to-OS keeps order item prices from the original order by calling the normalizer with `useCatalogPrices: false`; this preserves historical sold price from the actual order.
- Client PDF was updated with a Tech 7 logo mark at the upper-left, store contact block, `VIA DO CLIENTE`, cleaner product/totals section, warranty, awareness text and signature lines.
- Validation forced a payload with wrong product name and R$ 1 unit price for product `display-samsung-lcd-sam-s20-ultra-g988-origret`; saved OS used catalog name `LCD Samsung S20 Ultra G988 Original Retirada`, unit price R$ 1.500,00, qty 2, product total R$ 3.000,00, labor R$ 50,00, discount R$ 10,00, final total R$ 3.040,00.
- Visual/API evidence saved under `_validation/admin-os/os-manual-product-flow.json`, `os-manual-product-picker.png`, `os-manual-product-saved.png`, and `os-manual-product-client.pdf`; test OS rows were deleted after validation.

- OS save screenshot root cause: optional Pedido origem had/kept a non-existing order id. Postgres raised service_orders_order_id_fkey; app middleware mapped it to database_connection_error. Fix: validate order_id before insert/update and return friendly order_not_found, while empty order origin remains null for manual OS.

## OS PDF visual repair - Findings - 2026-06-13

- Current PDF is generated manually in `server/routes/admin.js`, function `buildServiceOrderPdf(order)`.
- Current layout draws a black band, orange block, black overlay, and later draws orange total background plus a bordered `kv()` box on top. This explains random-looking colors and broken header/total area.
- PDF generator uses simple Type1 Helvetica fonts and vector drawing; best fix is restrained one-page A4 layout with explicit sections, thin borders, small orange accent, and no overlapping filled blocks.
- Logo should be a clean vector Tech 7 mark in the top-left, not a color block collision.
- Before screenshot `_validation/os-pdf/before-os-pdf-render.png` confirmed: logo subtitle rendered dark over black band, the left logo block overlaps header structure, sections are too tight, `Endereco` collides with `Aparelho`, and final total block is visually heavy/random.
- Final PDF uses real logo image from `_assets/tech7/os-logo.jpg` in the top-left only; no improvised text/subtitle logo remains.
- Client PDF now uses two pages: page 1 for OS/customer/device/service/products/totals, page 2 for warranty/observations/signatures. This prevents footer/signature overlap on real service text.
- `Estado de entrada` and `Defeito relatado` were removed from the PDF because diagnosis/services now carry that information.
- Final visual evidence saved as `_validation/os-pdf/final-os-pdf-v2.pdf`, `final-os-pdf-v2-page-1.png`, and `final-os-pdf-v2-page-2.png`.
- Follow-up change: user requested one-page PDF and removal of `Observacoes ao cliente`, `Termo de ciencia`, and `Assinatura do cliente`. Final layout now fits on one page with warranty and only `Assinatura Tech 7 / tecnico`.
- One-page evidence saved as `_validation/os-pdf/one-page-os-pdf.pdf` and `_validation/os-pdf/one-page-os-pdf-page-1.png`; text extraction confirmed one page and no removed sections.

## Mobile search suggestions placement - Findings - 2026-06-13

- Search surface is the real home header form: `form.search-header[data-search="suggestion"]` with `input[name="palavra_busca"][data-input="suggestion"]`.
- The autocomplete renderer is in `assets/js/tech7-local-runtime.js`, using `/api/search` as the product source.
- The reported mobile bug is a placement issue, not a data issue: suggestions are rendered as an overlay but the mobile positioning only set `top`, leaving width/left/max-height insufficiently anchored to the input and viewport when the keyboard changes available space.
- The legacy `suggestion-words` class still forced absolute positioning. Mobile now applies priority inline fixed positioning, left, top, width and max-height calculated from the live input and `visualViewport`.
- Validation confirmed mobile 390x844 and keyboard-simulated 390x520 both keep the dropdown under the input, horizontally aligned, inside the viewport and without horizontal page overflow.

## Admin edit persistence - Findings - 2026-06-20
- Supabase confirmou o bug antes da correcao no produto QA prod_18112cf1de5aaf339c1619c94a1530b5: products recebeu title/name/description/section/image metadata novos, mas product_images permaneceu com /favicon.png e product_categories permaneceu com iphones.
- Causa raiz: PUT/PATCH /api/admin/products/:id atualizava somente products. O endpoint de criacao ja chamava syncProductRelations, mas o endpoint de edicao nao sincronizava product_images nem product_categories.
- Correcao aplicada: updateProduct agora valida categoria alterada contra categories e sincroniza product_images/product_categories dentro da mesma transacao do update em products.

- Validacao apos correcao: save pelo admin retornou 200; Supabase mostrou products, product_images e product_categories alinhados. Valores finais: name/title Produto QA Persistencia Final 1781967717414, section/category ipads, imagens /favicon.png e /_assets/tech7/product-placeholder.svg, descricoes finais, preco 11111 centavos, estoque 4, ativo true.
- Pagina publica validada em http://127.0.0.1:3001/ipads/qa/produto-qa-persistencia-1781967717414/index.html: status 200, titulo/descricao/preco/categoria/imagens exibidos, sem erro de console publico.
- @chrome e Chrome DevTools nao expuseram ferramentas de navegacao/click nesta sessao; validacao visual foi feita com Playwright usando canal Chrome como fallback final.
- Produto QA de teste foi removido do Supabase apos evidencias; qa_products_left=0.

## Admin real QA edicao/criacao - Findings - 2026-06-20
- Chrome QA real encontrou bug em Salvar todas as alteracoes: save inline de nome/preco/categoria preservava apenas a imagem principal e sobrescrevia `metadata.images`/product_images, removendo imagens secundarias.
- Causa raiz: `buildProductPayload` sempre recalculava `metadata.images` usando fallback de `primary_image_url`/`image_url`, mesmo quando payload nao tinha `images`, `image_url` ou `primary_image_url`.
- Correcao aplicada: `buildProductPayload` agora preserva `currentMeta.images` quando imagens nao foram tocadas pelo payload; so recalcula galeria quando imagem foi enviada ou na criacao.


- Resultado final QA admin: funcoes testadas e aprovadas no Chrome apos correcao do bug de perda de imagens no save inline/salvar todas.
- Console Chrome: apenas 401 esperado de /api/admin/session antes do login; sem requestfailed e sem erro publico na pagina do produto.
- Evidencias finais em _validation/admin-real-qa/: screenshots 01-18, phase1-create-edit-results.json, phase2-delete-results.json.

- Bulk price isolado validado no Chrome com produto QA filtrado: Preco fixo da pagina e Reajuste % da pagina passaram sem tocar catalogo real.

---

# Findings - frete TECH7

- Backend principal de frete: server/routes/shipping.js com /api/shipping/melhor-envio/quote e /api/shipping/loggi/quote.
- Checkout usa /api/shipping/melhor-envio/quote, deliveryMode shipping/uber/pickup e salva shipping em /api/orders.
- Orders tem delivery_mode, shipping_total_cents, shipping_provider, shipping_quote_id, shipping_service_id, shipping_service_label e endereco de entrega.
- Produto usa assets/js/tech7-local-runtime.js para calcular frete pelo Melhor Envio apos resolver id/preco do produto.
- Supabase ativo confirmado: lzsaaufsdcmqlasjrqck. Tabelas shipping_quotes, provider_oauth_tokens, orders e shipments existem.
- Supabase advisors reportou RLS desabilitado em tabelas sensiveis; registrar no relatorio final como risco separado.
- Causa raiz corrigida 1: checkout reutilizava `tech7_checkout_pix_state_v1` quando pedido salvo estava pending/failed, sem comparar carrinho, cliente, endereco, modo de entrega, quoteId, opcao e total atuais. Isso podia manter PIX/pedido antigo com frete antigo apos troca de frete.
- Causa raiz corrigida 2: normalizeMelhorEnvioOptions descartava cotacao com `price` numerico `0` antes de normalizar, porque filtrava com `quote.price || quote.custom_price`.
- Patch: checkout agora gera assinatura de carrinho+cliente+frete e so reutiliza pedido PIX se a assinatura atual bater; tambem limpa sessao PIX quando carrinho, modo de entrega, cotacao ou opcao de frete mudam.
- Patch: server/routes/shipping.js aceita preco zero real desde que o campo exista, mantendo validacao posterior `priceCents >= 0`.
- API real local Melhor Envio retornou opcoes solicitadas: Correios - SEDEX, Jadlog (service .Package exibido como Jadlog) e Loggi (service Loggi Ponto exibido como Loggi).
- Supabase validou pedidos QA: shipping pago Loggi via Melhor Envio total 35000 + 1459 = 36459; Uber total 35000 e frete 0; retirada total 35000 e frete 0. Pedidos QA foram cancelados depois da conferencia.
- Validacao visual fallback Chrome/Playwright: produto aceitou CEP `30111070` sem hifen e nao recarregou; checkout trocou SEDEX/Loggi/Jadlog atualizando total sem duplicar; Uber/retirada continuaram R$0,00; mobile sem overflow.

---

# Findings - cupons TECH7

- Supabase ativo confirmado: `lzsaaufsdcmqlasjrqck` (`supabase-bisque-bridge`).
- Schema criado/confirmado: tabela `public.coupons` com `id`, `code`, `discount_cents`, `expires_at`, `active`, `created_at`, `updated_at`.
- `public.orders` agora possui `discount_cents`, `coupon_id`, `coupon_code` e `coupon_discount_cents`.
- O Admin real fica em `admin.html` + `assets/js/admin.js`, consumindo `/api/admin`; nao ha SPA separada ativa para esta tela.
- Cupom e validado por `/api/coupons/validate`; o endpoint rejeita codigo ausente, inexistente, expirado, inativo e desconto maior que subtotal.
- O carrinho guarda cupom aplicado em `localStorage` (`t7_coupon_v1`) com subtotal original; se o carrinho mudar, o cupom e removido para evitar total incorreto.
- O checkout le o mesmo cupom, exibe desconto no resumo/revisao e envia `coupon` para `/api/orders`.
- `/api/orders` revalida o cupom no servidor antes de salvar o pedido, entao o cliente nao consegue forcar desconto invalido pelo navegador.
- O total do pedido e calculado como `subtotal - desconto + frete`; o frete continua baseado no subtotal original dos produtos.
- A sessao PIX agora inclui assinatura de cupom para nao reaproveitar PIX antigo quando o cupom muda.

## Findings - atualizacao AGENTS.md Ruflo (2026-06-20)

- O `AGENTS.md` local ja continha as regras duraveis principais do TECH7: npm, projetos root/backend, ONE-first para Supabase e Chrome-first para QA visual.
- Ruflo ja responde no projeto como `ruflo v3.12.4`; nao foi necessario rodar `init` para esta atualizacao documental.
- As skills `caveman` e `planning-with-files` existem em `C:\Users\Admin\.codex\skills` e foram lidas antes da edicao.

## Admin upload imagens produto - Findings - 2026-06-20
- Supabase Storage consultado via @supabase: nao ha buckets em storage.buckets.
- Persistencia real de imagens de produto neste projeto usa products.image_url, products.primary_image_url, products.metadata.images e public.product_images.url/position/is_primary.
- Como nao ha bucket/chave Storage no runtime, upload foi implementado em pasta estatica do projeto: _assets/uploads/products/<slug-ou-id>/arquivo, com URL publica /_assets/uploads/products/... e posterior vinculo no save do produto.
- Endpoint criado: POST /api/admin/product-images/upload, protegido por adminAuth, aceita multipart/form-data, valida JPG/PNG/WebP/GIF, maximo 5MB por imagem e 24MB por lote.
- Admin agora permite upload multiplo tanto em produto novo quanto em produto existente, mantendo tambem entrada manual por URL.
- O upload mostra preview no editor, permite marcar imagem principal, remover e reordenar antes de salvar; o vinculo final acontece no save de produto em products/product_images.
- Exemplos de descricao curta e descricao completa aparecem como ajuda visual abaixo dos campos e nao preenchem automaticamente os valores.
- Primeiro QA encontrou falso negativo no upload de edicao porque o script anexava arquivo antes do editor terminar de re-renderizar; handler do botao foi tornado idempotente e o QA passou.
- QA final criou produto `qa-upload-prod-1781979398832`, enviou duas imagens, salvou, validou pagina publica, editou, enviou nova imagem, removeu/redefiniu principal, salvou e validou pagina publica novamente.
- Console do QA teve apenas 401 esperado de /api/admin/session antes do login; sem requestfailed.
- Dados QA foram removidos do Supabase e pastas locais `qa-upload-*` foram removidas depois da validacao.

## Migracao Admin upload para Supabase Storage - Findings - 2026-06-20
- ONE nao expôs ferramenta callable nesta sessao; fallback @supabase usado conforme regra.
- @supabase confirmou projeto ativo `supabase-bisque-bridge`, ref `lzsaaufsdcmqlasjrqck`, status `ACTIVE_HEALTHY`, regiao `sa-east-1`.
- Bucket `product-images` criado/atualizado em Supabase Storage: publico, limite 5242880 bytes, MIME types image/jpeg, image/png, image/webp, image/gif.
- Politica `Public read product images` criada em `storage.objects` para leitura publica do bucket.
- Runtime root nao tinha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` nem `SUPABASE_PRODUCT_IMAGES_BUCKET` no ambiente local; upload real exige service role no servidor.
- Endpoint `POST /api/admin/product-images/upload` agora envia imagens para Supabase Storage via REST API usando service role server-side, sem dependencia nova.
- URLs retornadas seguem `https://<project>.supabase.co/storage/v1/object/public/product-images/...` e continuam persistidas no save em `products`/`product_images`.
- Script `scripts/migrate-product-images-to-storage.mjs` migra apenas URLs locais `/_assets/uploads/products/`, preservando ordem/principal e gerando relatorio em `_validation/storage-migration/`.
- Smoke local autenticado sem service key retornou 503 com `supabase_storage_not_configured`, confirmando falha clara e sem gravar em filesystem.
- Teste de upload real para Storage nao foi executado localmente porque `SUPABASE_SERVICE_ROLE_KEY` nao esta disponivel no ambiente desta sessao.

## Vercel config/deploy Storage - Findings - 2026-06-20
- Projeto Vercel local confirmado: `tech-7`, projectId `prj_UDDtUcUUQaEg4m01BhsnR5eSjjhI`, team `team_yKRleuToOM89NQWd3zIxD5kc`, dominio `tech-7.vercel.app`.
- Vercel ja possuia `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em Production, Preview e Development.
- `SUPABASE_PRODUCT_IMAGES_BUCKET=product-images` foi adicionado em Production, Preview e Development.

## Admin produtos invalid_session ao abrir aba - Findings - 2026-06-20
- Causa raiz: `server/routes/admin.js` guardava sessoes admin em `const sessions = new Map()`.
- Em Vercel/serverless, `/api/admin/session` e `/api/admin/products` podem cair em instancias diferentes; a segunda instancia nao conhece o token criado na primeira e retorna `invalid_session`.
- Isso explica o bug intermitente: primeira abertura da aba Produtos falha, mas atualizar depois funciona quando a chamada cai em instancia quente que ja conhece a sessao.
- Correcao: login agora emite cookie de sessao assinado/stateless com HMAC; `adminAuth` valida assinatura/expiracao sem depender de memoria.
- Compatibilidade mantida: tokens antigos ainda podem validar pelo `sessions Map` enquanto existirem na mesma instancia.

## Admin upload erro bucket NAME invalid - Findings - 2026-06-20
- Causa provavel: `SUPABASE_PRODUCT_IMAGES_BUCKET` vindo do ambiente com aspas ou caractere extra; backend usava o valor cru na URL `/storage/v1/object/<bucket>/...`.
- Correcao aplicada: backend agora normaliza o bucket, remove aspas/backticks ao redor e valida o nome antes de chamar Supabase Storage.
- Nome canonico mantido: `product-images`.
## 2026-06-21 - missing-samsung-s-models-agent

- Ruflo verificado: `ruflo v3.12.4`.
- Worktree inicial limpo.
- Memória do projeto confirma regra Tech7: Supabase/DB deve ser ONE-first; se ONE falhar, fallback documentado para Supabase direto.
- ONE indisponível na descoberta MCP desta sessão; Composio também não apareceu. Fallback usado: `@supabase`.
- Supabase ativo confirmado: `lzsaaufsdcmqlasjrqck` / `supabase-bisque-bridge` / `ACTIVE_HEALTHY`.
- Tabelas reais relevantes: `products`, `product_images`, `categories`, `product_categories`.
- Aviso do Supabase: várias tabelas com RLS desativado; não faz parte do escopo de importação e não será alterado neste fluxo.
- Modelos Tech7 existentes no escopo: S20, S20 FE, S20 Plus, S20 Ultra, S21, S21 FE, S21 Plus, S21 Ultra, S22, S22 Plus, S22 Ultra, S23, S23 FE, S23 Plus, S23 Ultra, S24, S24 FE, S24 Plus, S24 Ultra, S25, S25 Plus, S25 Ultra.
- Firecrawl encontrou produtos fonte para modelos já existentes e também `S8`, `S10 Plus`, `S26 Plus`, `S26 Ultra`.
- `S8` e `S10 Plus`: fora da lista S20-S25 do prompt. Não importar.
- `S26 Plus` e `S26 Ultra`: `BLOQUEADO_MODELO_INCERTO`; fora da lista-alvo e sem equivalência validada no Tech7.
- Produtos aprovados para importação: 0.
- Manifest imagem-produto: vazio, porque nenhum produto foi aprovado.
- Validação visual fallback: `/display-e-lcd/samsung/tela-display-lcd-samsung-s25-ultra-s938-original-retirada-sem-aro`, `/display-e-lcd/samsung/tela-display-lcd-samsung-s23-ultra-5g-s918-oled-com-aro`, `/busca?q=samsung%20s25%20ultra` retornaram 200, sem overflow mobile, sem console errors.
- Evidências visuais: `_validation/missing-samsung-s-models/visual-smoke-1.png`, `visual-smoke-2.png`, `visual-smoke-3.png`, `visual-smoke-results.json`.
- Correção de escopo do usuário: análise deve considerar somente modelos Samsung linha S com qualidade `Original` ou `Original Retirada`, especialmente telas/display; demais peças não contam como modelo existente.
- Análise estrita concluída:
  - Tech7 já tem display/tela original/retirada: S20, S20 Plus, S20 Ultra, S21, S21 Plus, S21 Ultra, S22, S22 Plus, S23, S23 FE, S24 FE, S24 Plus, S25 Ultra.
  - Tech7 não tem display/tela original/retirada: S20 FE, S21 FE, S22 Ultra, S23 Plus, S23 Ultra, S24, S24 Ultra, S25, S25 Plus.
  - Fonte Firecrawl tem candidatos válidos para importar: S20 FE, S22 Ultra, S23 Ultra, S24, S24 Ultra, S25, S25 Plus.
  - Faltam no Tech7 mas não encontrei fonte válida clara: S21 FE, S23 Plus.
  - Nenhuma importação feita nesta etapa; relatório salvo para confirmação.

### Importacao de candidatos aprovados - 2026-06-21
- Usuario confirmou importacao dos candidatos aprovados.
- Supabase ativo reconfirmado: `lzsaaufsdcmqlasjrqck` / `supabase-bisque-bridge`.
- ONE e Composio continuam sem ferramenta callable nesta sessao; fallback `@supabase` usado e registrado.
- Duplicidade pre-insert: nenhum dos 7 ids/slugs propostos existia em `products`.
- `public.categories` nao possui `display-e-lcd`; padrao real do catalogo de pecas usa `products.section='display-e-lcd'`, entao nao foi criada categoria nova nem relacao em `product_categories`.
- Firecrawl confirmou por pagina individual todos os 7 produtos como frontal/tela/display Samsung linha S qualidade Original.
- Produtos criados em `products`: S20 FE, S22 Ultra, S23 Ultra, S24, S24 Ultra, S25, S25 Plus.
- Imagens criadas em `product_images`: 31 linhas, todas com `source='firecrawl:x3'`, `source_kind='gallery'`, `is_primary=true` apenas na primeira imagem de cada produto.
- Descricoes foram reescritas para o padrao Tech 7; nao foi copiado o texto institucional longo da fonte.
- Validacao Supabase pos-insert: 7 produtos ativos e `is_active=true`, precos persistidos e contagem de imagens por produto confirmada.
- Validacao visual fallback Playwright mobile 390x844: todas as 7 paginas publicas retornaram 200, exibiram titulo, preco, imagens, descricao, sem overflow, sem console errors e sem request failures relevantes.
- Busca local `/busca?q=s25%20plus%20original` retornou 200 e exibiu S25 Plus.
- Validacoes npm OK: `validate:routes`, `validate:product-images`, `validate:product-cards`.

### Layout unico de produto para novos produtos - 2026-06-21
- Causa raiz: produtos novos criados via banco eram servidos por `renderDynamicProductHtml()` em `server/app.js`, que montava um HTML proprio e mais simples, com header `t7-dynamic-header` e estrutura diferente das paginas estaticas antigas.
- Correcao: renderer dinamico agora carrega um template real de produto existente (`display-e-lcd/xiaomi-redmi/tela-display-lcd-xiaomi-redmi-note-14-pro-5g-poco-x7-incell/index.html`) e substitui somente a area de produto pelos dados do produto novo.
- Estrutura visual preservada: header/footer do tema, CSS original, scripts do tema, galeria com `box-gallery`, coluna de produto, caixa de preco, botao comprar, frete, descricao geral e ficha tecnica.
- Fallback antigo foi mantido como `renderMinimalDynamicProductHtml()` caso o template estatico nao esteja disponivel.
- Validacao em servidor novo `127.0.0.1:3010`: produto novo S25 Plus retornou shell estatico, sem `t7-dynamic-header`, com preco, imagens, comprar, frete, footer e sem overflow.
- Validacao visual fallback Playwright: `_validation/product-layout-parity/layout-parity-validation.json` e screenshots mobile/desktop.
- `@chrome` direto nao apareceu como ferramenta callable; usada validacao final com Playwright fallback.

### Correcao para template Samsung de referencia - Findings - 2026-06-21
- Causa raiz refinada: a primeira correcao usava um shell estatico real, mas nao o shell exato do produto Samsung indicado como referencia pelo usuario.
- Correcao aplicada: `PRODUCT_PAGE_TEMPLATE_PATH` agora aponta para `display/samsung/tela-display-lcd-samsung-note-20-ultra-n986-oled/index.html`.
- O renderer dinamico continua trocando somente o bloco de produto, mantendo header, menu, scripts, relacionados e footer do template de referencia.
- Blocos reforcados para paridade com a referencia: `list-seal-product`, `line-info`, `produto-bonus`, `produto-formas-pagamento`, `box-price`, `bt_comprar`, `box-frete`, `page-info-product`.
- Supabase confirmou projeto ativo `lzsaaufsdcmqlasjrqck` e 7 produtos importados de `firecrawl:x3`.
- Imagens confirmadas em `product_images`: S20 FE 3, S22 Ultra 6, S23 Ultra 3, S24 7, S24 Ultra 4, S25 4, S25 Plus 4; todos com imagem principal.
- Validacao HTTP local em `127.0.0.1:3012`: todos os 7 produtos retornaram 200, sem `t7-dynamic-header`, com `box-col-product`, `box-gallery`, frete, relacionados e footer.
- `@chrome` nao foi exposto nesta sessao; validacao visual foi feita com Playwright fallback em desktop 1366x900 e mobile 390x844.
- Evidencias: `_validation/product-layout-reference/layout-reference-validation.json`, `reference-*.png`, `s24-fixed-*.png`, `s25-plus-fixed-*.png`.
- Console/Network: o unico warning foi `JQMIGRATE: jQuery.isFunction() is deprecated`, tambem presente no produto de referencia; falhas de request foram chamadas externas de Google/analytics abortadas no ambiente local.

### Layout Samsung S Original Retirada - Findings - 2026-06-21
- O renderer dinamico ja usa o shell Samsung de referencia, mas o bloco gerado em `server/app.js` ainda omitia secoes presentes nas paginas antigas, especialmente formas de pagamento ocultas e comentarios/avaliacoes.
- Para atender "todas as paginas devem ser iguais", a correcao deve ser compartilhada no renderer dinamico e manter os blocos estruturais da pagina de referencia em todos os novos produtos.
- Correcao aplicada: `server/app.js` agora inclui no bloco dinamico as secoes antigas de formas de pagamento e comentarios/avaliacoes, mantendo os IDs/seletores esperados no HTML cru para todos os novos produtos.
- Validacao final: os 7 produtos importados passaram em 14 casos desktop/mobile, sem `t7-dynamic-header`, sem overflow, com a mesma assinatura de seletores da referencia apos JS e com HTML cru contendo compra/preco/pagamento/botao.
- Evidencia final: `_validation/product-layout-reference/layout-reference-final-validation.json` e screenshots `final-*.png`.
- Novo problema visual reportado por imagem: uma aba local mostrava novamente o layout minimo branco com logo grande e link `Carrinho`, indicando que o fluxo ainda podia cair em `renderMinimalDynamicProductHtml()` quando o shell de referencia nao era encontrado/carregado no processo em execucao.
- Correcao final: `renderDynamicProductHtml()` agora localiza o bloco de produto por regex tolerante e nao usa mais o fallback minimo; se o template antigo faltar, falha explicitamente em vez de renderizar uma pagina diferente.
- Chrome real via plugin/node_repl validou S24, S25 Plus e referencia em desktop/mobile: layout antigo completo, header/menu pretos, galeria, compra, frete, descricao, ficha, relacionados e footer; sem `t7-dynamic-header`, sem overflow e sem erros de console internos.
- Evidencia Chrome real: `_validation/product-layout-reference/real-chrome-product-layout-report.json` e screenshots `real-chrome-*.png`.

### Produtos visitados sem imagens - Findings - 2026-06-21
- Causa raiz: os cards de `Produtos visitados` eram montados dinamicamente com `class="swiper-lazy transform"`. O tema deixa essas imagens opacas ate o lazy-loader/carrossel marcar o carregamento; como a secao e recriada pelo runtime, alguns cards ficavam com area branca apesar de terem `src`.
- Correcao aplicada: imagens de cards visitados agora saem com classe `lazyloaded`, CSS da secao forca `visibility: visible` e `opacity: 1`, e `ensureProductCardImagesVisible()` roda imediatamente apos o HTML do carrossel ser inserido.
- Robustez adicional: itens antigos do `localStorage` sem imagem real passam por hidratacao assincrona; o runtime busca a URL do produto, extrai `og:image` ou imagem principal e atualiza o historico salvo.
- Validacao Chrome real: os cards testados passaram a carregar imagem com `naturalWidth > 0` e `opacity: 1`; o item S25 Plus sem imagem armazenada recebeu imagem recuperada da pagina.

### Veja tambem com faixa laranja vazia - Findings - 2026-06-21
- Causa raiz: em `Veja tambem`, o hover/focus do tema aplicava fundo laranja e cor laranja ao proprio `<p>Produto Indisponível</p>`, tornando o texto invisivel e deixando apenas uma faixa laranja vazia.
- A correcao deve ficar limitada a `.product-related`, porque selos como `DESTAQUE` e botoes globais ainda precisam manter fundo laranja.
- Correcao aplicada: o CSS injetado de cards relacionados agora zera o background de `.box-price`, `.price`, `.product-price`, `.price-off` e `<p>` e reforca texto laranja em hover/focus.
- Validacao Chrome real confirmou que cards indisponiveis e cards com preco continuam legiveis, sem faixa laranja vazia.

### Performance/correcao de carregamento de precos - Findings - 2026-06-22
- Causa raiz: paginas estaticas exibiam preco antigo/mockado do HTML/localStorage antes do `preco-loader`; o loader ainda aguardava debounce de 160ms, podia executar duas vezes por script relativo/absoluto e carrinho/checkout preservavam preco local quando o backend ainda nao tinha confirmado.
- Fonte correta confirmada no Supabase `lzsaaufsdcmqlasjrqck`: `products.price_cents` e o unico campo completo de preco; `products.price` e parcial.
- Produto de validacao: `display-e-lcd-samsung-frontal-tela-display-samsung-s24-s921-com-aro-original`, `price_cents=119900`, `price_text=R$ 1.199,00`.
- Correcao: loading neutro antes de qualquer preco estatico, `Tech7Prices.resolve` usando o mesmo batch/cache dos cards, loader idempotente, dedupe de sync identico, carrinho em lote e sem fallback para preco local antigo.
- Busca/listagens dinamicas usam `price_cents` ja no payload inicial (`/api/search` e `/api/products`); o re-sync extra apos filtro backend foi removido.
- Endpoint `/api/products/resolve-prices` agora seleciona somente os campos necessarios para preco/URL/imagem.
- Medicao antes: home desktop mostrava `R$ 50,00` estatico aos 816ms; produto mostrava `R$ 750,00` aos 208ms e ate `R$ 1,23` vindo de historico; carrinho/checkout mostravam `R$ 1,23` antes do backend.
- Medicao final Chrome fallback: `wrongFlashCount=0` em home, categoria, busca, produto, carrinho e checkout, desktop/mobile. Evidencia em `_validation/price-load-performance/after-price-load.json` e screenshots `final2-*.png`.
- Tempos finais ate primeiro preco correto: home desktop 1840ms, categoria desktop 2534ms, busca desktop 1639ms, produto desktop 1188ms, carrinho desktop 639ms, checkout desktop 525ms; mobile: home 1886ms, categoria 2860ms, busca 1503ms, produto 1143ms, carrinho 771ms, checkout 679ms.
- Validacoes finais OK: `validate:backend-prices`, `validate:product-cards`, `validate:endpoints`, `validate:routes`, `validate:build`.

### Regressao geral apos correcao de precos - Findings - 2026-06-23
- Smoke real de navegador nao encontrou impacto em home, categoria, busca, pagina de produto, produtos visitados, compra pelo botao, carrinho, checkout ou mobile.
- O painel Admin nao foi alterado funcionalmente pelas mudancas de preco; a tela de login carregou, endpoints protegidos continuaram retornando 401 sem sessao e login invalido falhou sem crash.
- O falso positivo inicial do Admin era apenas o Chrome registrando os 401 esperados como mensagens de recurso; revalidacao filtrando esses 401 ficou 6/6 OK.
- Evidencias salvas em `_validation/price-regression/regression-smoke.json`, `_validation/price-regression/admin-smoke.json` e screenshots.
- Validadores finais do projeto passaram, incluindo `validate:build`.

### Regressao avancada pos-precos - Findings - 2026-06-23
- Achado real 1: `preco-loader.js` marcava nos visiveis como loading antes de detectar que a assinatura de catalogo ja tinha sido sincronizada. Em DOM novo com mesmos produtos, isso podia deixar card em `Carregando preco`. Correcao: reaplicar valores do cache verificado na saida `cached`.
- Achado real 2: `assets/js/tech7-local-runtime.js` extraia slug de visitados assumindo URL `secao/marca/slug`; URL `secao/slug` ficava sem slug e nao chamava hidratacao. Correcao: parser aceita 1, 2 ou 3 segmentos e hidrata historico salvo mesmo sem `.visited-section` na pagina atual.
- Validacao real Chrome fallback: `_validation/price-regression/advanced-regression.json` terminou `passed=9`, `failed=0`, `localBrowserEvents=[]`.
- Evidencia de preco correto: produto S24 usado na validacao retornou `price_cents=119900` no endpoint em lote e apareceu como `R$ 1.199,00` em produto, carrinho, checkout e produto visitado.
- Busca/categoria: `/api/search?q=s24` retornou 15 resultados; categoria real `/display-e-lcd/samsung/` carregou 48 cards, 102 ocorrencias de preco e `loadingCount=0`.
- Admin: endpoint protegido `/api/admin/products` continuou retornando 401 sem sessao, comportamento esperado para usuario nao autenticado.
- Risco fora do escopo: `backend/src/routes/orders.js` ainda tem detalhe de pedido por ID publico enquanto lista usa `adminAuth`. Nao foi alterado porque pode envolver fluxo de rastreio/cliente e nao foi causado pelo patch de preco.

### API de frete Melhor Envio - Findings - 2026-06-23
- Causa raiz em producao: Vercel nao tinha `MELHOR_ENVIO_ORIGIN_ZIPCODE` nem `MELHOR_ENVIO_TOKEN`/OAuth. `/api/shipping/melhor-envio/readiness` retornava 503 com `missingConfig=["MELHOR_ENVIO_ORIGIN_ZIPCODE","MELHOR_ENVIO_TOKEN_OR_OAUTH"]`.
- Local ja funcionava com `.env`: readiness `ready=true`, `authSource=env`, `apiHost=melhorenvio.com.br`.
- Correcao operacional aplicada no Vercel Production via CLI autenticada: adicionadas `MELHOR_ENVIO_API_URL`, `MELHOR_ENVIO_ORIGIN_ZIPCODE`, `MELHOR_ENVIO_TOKEN`; `MELHOR_ENVIO_SERVICE_IDS` tentou ser sincronizada, mas e opcional porque o codigo usa default `2,3,34`.
- Validacao local real: `POST /api/shipping/melhor-envio/quote` retornou 201 para CEP `30111070` e produto S24, com opcoes Correios SEDEX, Jadlog e Loggi.
- Validacao navegador real via Playwright+Chrome instalado: produto exibiu SEDEX/Jadlog/Loggi; checkout com produto no carrinho exibiu as mesmas opcoes e somou frete no fluxo.
- Evidencias locais: `_validation/shipping-api/local-quote-after.json`, `_validation/shipping-api/product-shipping-smoke.json`, `_validation/shipping-api/checkout-shipping-smoke.json`.
- Deploy novo e necessario para Vercel carregar envs novas; sera feito por commit/push em `main` conforme pedido.
