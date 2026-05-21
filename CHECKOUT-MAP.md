# CHECKOUT-MAP.md

## Escopo

Mapeamento do checkout TECH7 e meios de pagamento em `C:\tmp\tech7-chk-ui`.

Arquivos principais:
- `checkout/index.html`
- `checkout/checkout.js`
- `cart-manager.js`
- `server/routes/cart.js`
- `server/routes/orders.js`
- `server/routes/payments.js`
- `server/lib/woovi.js`
- `server/routes/webhooks.js`
- `backend/src/services/mercadopago.js`
- `backend/src/routes/checkout.js`

## Fluxo Ativo

O checkout público ativo está em `checkout/index.html`, com lógica inline. Ele lê o carrinho, valida contato e entrega, cria carrinho/pedido no servidor e gera PIX Woovi.

Fluxo:
1. `cart-manager.js` fornece itens do carrinho.
2. `POST /api/cart` cria carrinho no servidor.
3. `PUT /api/cart/:id/items` envia itens.
4. `POST /api/orders` cria pedido.
5. `POST /api/payments/woovi` gera cobrança PIX.
6. `GET /api/payments/woovi/:orderId/status` acompanha status.
7. Webhook Woovi atualiza `payments` e `orders`.

## Meios de Pagamento

PIX Woovi é o meio ativo no checkout público:
- `server/routes/payments.js`
- `server/lib/woovi.js`
- `server/routes/webhooks.js`

Mercado Pago existe em duas superfícies, mas não é o pagamento principal deste checkout:
- servidor raiz: `POST /api/payments/mercadopago`
- backend separado: `POST /api/checkout/create`

## Contratos Preservados

- O browser continua chamando apenas APIs locais.
- `WOOVI_APP_ID` permanece server-side.
- IDs e hooks do checkout foram preservados: `checkout-form`, `campo-*`, `data-step`, `data-next`, `data-prev`, `pix-codigo`, `pix-qrcode-container`, `payment-status`.
- O overlay PIX usa os mesmos dados retornados por `/api/payments/woovi`; não cria API nova.

## Riscos

- `checkout/checkout.js` é legado e referencia IDs antigos `co-*`; alterar apenas esse arquivo não muda o checkout atual.
- Existem dois backends de pagamento independentes no repo.
- O checkout pode duplicar pedido se a submissão não for travada; a nova implementação adiciona `pixFlowInFlight`.
- Sessão PIX antiga pode apontar para carrinho antigo; a nova implementação limpa a sessão ao receber eventos de atualização do carrinho.

## Alterações Planejadas

- Redesign premium escuro, inspirado em superfícies inline e discretas.
- Efeito 3D leve no painel principal por `pointermove`.
- Overlay PIX fullscreen aberto somente após retorno real da Woovi.
- Botões no overlay: copiar código, já paguei e mudar pagamento.
- Fallback `prefers-reduced-motion`.
