# Ruflo Global Codex Install Plan

Goal: install Ruflo from `ruvnet/ruflo` for global Codex use, including MCP and available Codex skills, without overwriting project instructions.

## Steps
- [completed] Inspect Ruflo docs, npm package, and current Codex config.
- [completed] Install Ruflo CLI globally and register MCP in `C:\Users\Admin\.codex\config.toml`.
- [completed] Extract/copy Ruflo Codex skills into `C:\Users\Admin\.codex\skills`.
- [completed] Validate CLI, MCP command, and installed skill files.

## Constraints
- Do not overwrite `AGENTS.md` in `C:\Users\Admin\Downloads\TECH7\TECH7-main`.
- Prefer global Codex config under `C:\Users\Admin\.codex`.
- Preserve existing MCP servers.

## Errors
| Error | Attempt | Resolution |
|---|---|---|
| `apply_patch` could not update `progress.md` because file contains invalid UTF-8 bytes | Append Ruflo setup log to existing `progress.md` | Created dedicated ASCII planning files for this Ruflo install |
| `codex mcp --help` failed with `Acesso negado` | Use Codex CLI to add MCP | Edited `C:\Users\Admin\.codex\config.toml` directly |
| PowerShell parser error: empty pipe element | Build validation objects inside `foreach` and pipe directly | Rebuilt arrays before piping |
| `rg` command treated quoted pieces as paths | Validate TOML block with `Select-String` | Confirmed `[mcp_servers.ruflo]` and args lines |
| `claude-flow-codex doctor` warned `config.toml Not found` | Doctor checks project-local `.agents/config.toml` | Accepted because this task installed global Codex config |
