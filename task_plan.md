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
