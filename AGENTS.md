# AGENTS.md (site novo)

Este repositório contém:

- Um site estático grande (páginas HTML por categoria/pasta).
- Assets públicos em `_assets/` e customizações em `_custom/`.
- Um servidor Node/Express em `server/` (entrada: `server/index.js`) usado para rotas auxiliares, busca e APIs locais.
- Um projeto separado em `backend/` (tem seu próprio `package.json`).

Regras de segurança para não quebrar o site:

- Não mover/renomear pastas públicas (categorias, `_assets/`, `_custom/`, `busca/`, `loja/`, etc.) sem revisar todos os `href/src` e rotas.
- Scripts de manutenção ficam em `scripts/` e não são carregados pelo site em runtime.

