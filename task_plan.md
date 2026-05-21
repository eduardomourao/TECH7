# Plano de Trabalho - Redesign premium do checkout TECH 7

## Objetivo
Refazer a tela de checkout da TECH 7 com acabamento mais premium, mantendo a identidade visual atual e preservando o fluxo funcional existente de carrinho, pedido e PIX.

## Fases
- [completed] Mapear a implementação atual do checkout e identificar limites seguros de edição.
- [completed] Definir a direção visual do redesign e os elementos de preview.
- [completed] Aplicar o redesign no checkout sem quebrar o fluxo existente.
- [completed] Subir preview local e validar visual e comportamento principal.
- [in_progress] Revisar diff final e registrar resultados.

## Restrições
- Manter a linguagem visual preta/laranja da TECH 7.
- Preservar os contratos atuais de checkout, pedido, carrinho e PIX.
- Não reverter alterações alheias já existentes no repositório.
- Criar um preview verificável antes de encerrar.

## Riscos
- `checkout/index.html` concentra CSS, HTML e JS inline; alterações amplas exigem cuidado para não afetar listeners e estados.
- O repositório está com muitas mudanças não relacionadas; o escopo deve ficar isolado ao checkout e aos arquivos de planejamento.

## Erros Encontrados
- O browser MCP não estava conectado à extensão nesta sessão; o preview visual foi validado com servidor local + Playwright e screenshots salvos no repositório.
