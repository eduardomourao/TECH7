# 2026-05-26 - Instalar Skills/MCPs/Plugins Locais no Codex Global

## Descoberta Inicial
- Origem local detectada: `.mcp.json`, `skills/`, `.agents/`, `.claude`, `GEMINI.md` e `skills-lock.json`.
- Memoria relevante desta maquina: sync global confiavel copia diretorios locais para `C:\Users\Admin\.codex\skills` e valida `MISSING=0`.
- CLI `codex` via WindowsApps pode falhar com `Acesso negado`; fallback pragmatico e editar `C:\Users\Admin\.codex\config.toml` e validar filesystem/TOML.

## Inventario Unico Instalado
- Skills locais unicas: `cavecrew`, `caveman`, `caveman-commit`, `caveman-compress`, `caveman-help`, `caveman-review`, `caveman-stats`, `compress`, `webapp-testing`.
- Muitas pastas ocultas (`.adal`, `.augment`, `.claude`, `.roo`, etc.) continham copias duplicadas da mesma familia caveman; foi instalado o conjunto unico.
- `compress` nao estava em `skills/`, mas existia em `.adal\skills\compress` e foi promovida.
- `.mcp.json` continha apenas o MCP `vercel` HTTP em `https://mcp.vercel.com`.
- Nenhum config local de plugin Codex alem do ecossistema Vercel foi encontrado. O global ja tinha `vercel@openai-curated` e `vercel-plugin@plugins-cli` habilitados.

## Validacao
- `MISSING_SKILLS=0`.
- `config.toml` parse OK via `tomllib`.
- `mcp_servers.vercel` presente no global.
- Endpoint `https://mcp.vercel.com` respondeu HTTP 401, indicando endpoint online e exigindo autenticacao.
