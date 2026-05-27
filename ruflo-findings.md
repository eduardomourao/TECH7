# Ruflo Global Codex Findings

- GitHub README for `ruvnet/ruflo` says full install path uses `npx ruflo@latest init` or `npm install -g ruflo@latest`.
- README says MCP command is `npx ruflo@latest mcp start`.
- README distinguishes plugin-lite path from full install: plugin-lite does not register MCP.
- `npm view ruflo` reports latest/current version `3.10.2` and bin `ruflo`.
- Current global Codex config is `C:\Users\Admin\.codex\config.toml`.
- Current TECH7 project already has `AGENTS.md`, `.agents`, `.claude`, `.iflow`, and `.roo`; project init with `--codex` returns `Project already initialized`.
- Ruflo repo `.agents/skills` contains 134 Codex skills.
- Existing global skills had 4 name collisions: `github-automation`, `github-workflow-automation`, `security-audit`, `workflow-automation`.
- `codex.exe` is blocked by WindowsApps `Acesso negado` on this machine, so direct `codex mcp add` is not reliable here.
- Global Codex MCP block can be installed manually with:
  ```toml
  [mcp_servers.ruflo]
  command = "npx"
  args = ["-y", "ruflo@latest", "mcp", "start"]
  ```
