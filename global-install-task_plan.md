# 2026-05-26 - Instalar Skills/MCPs/Plugins Locais no Codex Global

## Objetivo
Migrar para escopo global do Codex tudo que este projeto tem localmente: skills, MCPs e plugins detectaveis.

## Plano
- [completed] Inventariar origem local: `skills/`, `.agents/`, `.mcp.json`, configs de plugins e lockfiles.
- [completed] Sincronizar skills locais para `C:\Users\Admin\.codex\skills` com backup em caso de colisao.
- [completed] Mesclar MCPs locais no `C:\Users\Admin\.codex\config.toml`.
- [completed] Instalar/ativar plugins locais detectados quando houver correspondencia global segura.
- [completed] Validar contagens, TOML e startup basico dos MCPs instalados.

## Validacao Esperada
- `MISSING_SKILLS=0`.
- `config.toml` parse OK.
- MCPs locais presentes no escopo global.

## Resultado
- Skills globais presentes: `cavecrew`, `caveman`, `caveman-commit`, `caveman-compress`, `caveman-help`, `caveman-review`, `caveman-stats`, `compress`, `webapp-testing`.
- Backup de colisoes: `C:\Users\Admin\.codex\backups\tech7-global-sync-20260526-104644`.
- MCP global adicionado: `[mcp_servers.vercel] url = "https://mcp.vercel.com"`.
- Plugins Vercel globais ja estavam habilitados: `vercel@openai-curated` e `vercel-plugin@plugins-cli`.
- Validacao: `MISSING_SKILLS=0`, `TOML_OK=1`, `VERCEL_MCP_HTTP_STATUS=401`.

## Erros Encontrados
| Erro | Tentativa | Resolucao |
|---|---|---|
| `progress.md` com byte invalido UTF-8 bloqueou `apply_patch` | Append nos arquivos padrao | Criados arquivos dedicados `global-install-*` para nao corromper historico antigo |
| Consultas PowerShell com pipeline apos `foreach` e aspas em regex falharam | Inventario rapido | Repetidas com arrays intermediarios e `Select-String` simples |
