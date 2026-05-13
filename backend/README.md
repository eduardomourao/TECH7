# TECH 7 — Backend API

API REST para loja TECH 7 (peças para celular).

## Stack

- **Runtime:** Node.js 18+ (ESM)
- **Framework:** Express 4
- **Database:** Supabase (PostgreSQL) com fallback mock em memória
- **Payments:** Mercado Pago SDK (com fallback mock)
- **Admin:** Token simples via `ADMIN_TOKEN`

## Setup Rápido

```bash
npm install
cp .env.example .env
npm start          # modo mock (sem Supabase, sem MP)
```

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não | Porta do servidor (default: 3000) |
| `SUPABASE_URL` | Para DB real | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Para DB real | Chave service_role (server-side apenas) |
| `MERCADOPAGO_ACCESS_TOKEN` | Para pagamento real | Access token do Mercado Pago |
| `MERCADOPAGO_PUBLIC_KEY` | Para pagamento real | Public key do Mercado Pago |
| `MERCADOPAGO_WEBHOOK_SECRET` | Para webhook | Segredo do webhook MP |
| `ADMIN_TOKEN` | Sim (produção) | Token para acessar o painel admin |
| `BASE_URL` | Sim | URL base da API (para webhooks) |
| `FRONTEND_URL` | Sim | URL do frontend (para redirects) |

## Configurar Mercado Pago

1. Crie uma conta em [mercadopago.com.br](https://mercadopago.com.br)
2. Vá em **Suas integrações** → **Credenciais**
3. Copie o **Access Token** (production) e a **Public Key**
4. Preencha no `.env`:
   ```
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-123456...
   MERCADOPAGO_PUBLIC_KEY=APP_USR-1234-5678...
   ```
5. Reinicie o servidor

### Webhook do Mercado Pago

Para receber notificações de pagamento:

1. No painel MP, vá em **Webhooks & Notificações**
2. Adicione a URL: `https://SEU-DOMINIO/api/checkout/webhook`
3. Selecione o evento **payment**
4. (Opcional) Configure `MERCADOPAGO_WEBHOOK_SECRET` para validar assinatura

O webhook atualiza o status do pedido automaticamente:
`pending` → `paid` | `failed` | `cancelled` | `refunded`

## Painel Administrativo

Acesse: **`/admin.html`** (servido estaticamente pelo Express)

1. Defina um token no `.env`:
   ```
   ADMIN_TOKEN=minha-senha-secreta
   ```
2. Acesse `http://localhost:3000/admin.html`
3. Digite o token para entrar

### Funcionalidades do Admin

- **Produtos:** listar, editar preço, editar estoque, ativar/desativar
- **Pedidos:** listar, ver detalhes, alterar status

## API Routes

### Products
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/products | List products (paginated, filters: ?category=&brand=&q=) |
| GET | /api/products/:id | Get product by ID |
| POST | /api/products | Create product |
| PUT | /api/products/:id | Update product |
| DELETE | /api/products/:id | Soft-delete |

### Cart
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/cart/validate | Validate cart items (stock + price) |

### Orders
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/orders | Create order |
| GET | /api/orders | List orders |
| GET | /api/orders/:id | Get order details |

### Checkout
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/checkout/create | Create order + return payment URL |
| POST | /api/checkout/webhook | Mercado Pago payment notification |

### Admin (requires Bearer token)
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/admin/login | Verify token |
| GET | /api/admin/products | All products |
| PUT | /api/admin/products/:id | Update product |
| GET | /api/admin/orders | All orders |
| GET | /api/admin/orders/:id | Order details |
| PUT | /api/admin/orders/:id/status | Update order status |

## Mock Mode — Testar sem configurar nada

Com `MERCADOPAGO_ACCESS_TOKEN` vazio:

- `POST /api/checkout/create` retorna URL mock para `pedido-confirmado.html`
- Nenhuma chamada real ao Mercado Pago é feita
- O health check mostra `mercadoPago: "mock"`

Com `SUPABASE_URL` vazio:

- Banco em memória com 3 produtos de exemplo
- Pedidos salvos em arrays voláteis
- Dados são perdidos ao reiniciar

## Testar Pagamento Real

1. Configure `MERCADOPAGO_ACCESS_TOKEN` no `.env`
2. Faça um checkout:
   ```bash
   curl -X POST http://localhost:3000/api/checkout/create \
     -H "Content-Type: application/json" \
     -d '{
       "items": [{"productId":"7077","name":"Tela Realme C55","price":95,"qty":1}],
       "customer": {"name":"João","email":"joao@test.com"}
     }'
   ```
3. A resposta incluirá `payment.initPoint` — a URL do checkout Mercado Pago
4. Após o pagamento, o webhook atualizará o status do pedido
