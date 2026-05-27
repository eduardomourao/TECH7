# Findings - hardening seguranca TECH7

- `server/routes/admin.js`: credenciais admin padrao hardcoded.
- `server/routes/cart.js`: endpoint publico pode inserir/alterar `products` usando snapshot do cliente.
- `server/routes/webhooks.js`: webhooks aceitam configuracao ausente/incompleta.
- `backend/src/middleware/cors.js`: CORS com `startsWith`, wildcard e credentials.
- `.gitignore`/`.vercelignore`: faltam artefatos locais de validacao.
