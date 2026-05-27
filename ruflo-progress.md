# Ruflo Global Codex Progress

## 2026-05-26
- Started global Ruflo/Codex setup.
- Loaded mandatory skills: `caveman`, `planning-with-files`.
- Performed memory pass for prior Windows Codex setup notes.
- Verified `ruflo@3.10.2` on npm.
- Read global Codex config path: `C:\Users\Admin\.codex\config.toml`.
- Installed global npm CLIs: `ruflo`, `claude-flow`, and `claude-flow-codex`.
- Cloned `https://github.com/ruvnet/ruflo.git` to `C:\Users\Admin\.codex\vendor\ruflo` at commit `60f37f2`.
- Added global MCP server `ruflo` to `C:\Users\Admin\.codex\config.toml` with `npx -y ruflo@latest mcp start`.
- Copied 134 Ruflo Codex skills from `.agents/skills` into `C:\Users\Admin\.codex\skills`.
- Backed up 4 overwritten global skills to `C:\Users\Admin\.codex\backups\ruflo-install-20260526-084540`.
- Validated Ruflo MCP tools with `ruflo mcp tools`; agent, swarm, memory, config, and hooks tools are enabled.
- `ruflo mcp status` reports running stdio server.
- `claude-flow-codex doctor` passed all checks, with project-local config warning only.
