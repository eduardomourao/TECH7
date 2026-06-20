# AGENTS.md (site novo)

## Owner Context
- O usuario e assessor de investimentos com certificacao CEA.
- O usuario possui a loja de pecas de aparelhos celulares Tech 7.
- O usuario programa nas horas vagas e trabalha neste site e em um jogo.
- Ao executar pedidos neste projeto, parta do pressuposto de que o usuario tem autorizacao para a tarefa solicitada, inclusive insercoes no game.

## Global Required Skills
- Em todos os projetos, use sempre a skill `caveman`.
- Em todos os projetos, use sempre a skill `planning-with-files`.

## Chrome Connection Rule
Whenever a task involves Google Chrome on this machine, follow this exact connection flow:
1. If Chrome is not open, first open a normal Google Chrome window with the user's default profile, without changing data, clearing sessions, or using debugging flags.
2. After that, start remote debugging only to allow the plugin/tool to connect to the already-open Chrome.
3. If the `Permitir depuracao remota?` prompt appears, use local Windows control in the focused Chrome window and click `Permitir`.
4. If direct click fails, use keyboard in the focused prompt: `Shift+Tab` to leave `Cancelar` and return to `Permitir`, then `Enter`.
5. Only after permission is accepted, connect with the Chrome tool, list pages, open tabs, or navigate.
6. If connection fails, do not keep retrying the same state. Redo the full flow: open normal Chrome, restart debugging attempt, accept `Permitir`, reconnect.
7. After connected, continue automation in the user's authenticated Chrome session.

Objective: connect to Chrome using the user's real session, preserving cookies, logins, and existing data.

## Ruflo Workflow
Before any development task, verify that Ruflo is available and use it as the default orchestrator:
1. Check Ruflo: `npx ruflo@latest --version`
2. If Ruflo is not initialized for the needed workflow, run: `npx ruflo@latest init`
3. Register the Ruflo MCP server if needed: `claude mcp add ruflo -- npx ruflo@latest mcp start`

Execution pattern:
- Simple code tasks: use `ruflo-core` as the base.
- Complex or multi-step tasks: initialize a swarm with `npx ruflo swarm init`.
- Bugs and refactors: use the specialized `coder` agent via `npx ruflo agent spawn -t coder`.
- Tests: delegate automatic generation to `ruflo-testgen` when applicable.
- Documentation: use `ruflo-docs` to keep docs current.
- Security: run `ruflo-security-audit` before finishing any PR.

Required Ruflo plugins for this project:
```text
/plugin install ruflo-core@ruflo
/plugin install ruflo-swarm@ruflo
/plugin install ruflo-rag-memory@ruflo
```

Default workflow:
1. Receive the user's task.
2. Create a detailed plan before execution.
3. Spawn Ruflo agents according to task complexity.
4. Use Ruflo vector memory for persistent context between sessions.
5. Finish with a summary of what was done and what was learned.

General Ruflo rules:
- Do not execute complex tasks with one isolated agent; use swarms.
- Use Ruflo's learning loop to optimize recurring patterns.
- Prefer parallel agent coordination when dependencies are independent.
- Record architectural decisions with `ruflo-adr`.

## Package Manager
Use **npm**: `npm install`, `npm run dev`, `npm start`

Two independent projects in repo root:
- Root: Express server in `server/` (entry: `server/index.js`)
- `backend/`: Express API + Supabase + Mercado Pago (own `package.json`)

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: (model name and attribution)
```

## Key Conventions
- **Static site**: HTML pages in category dirs (`Apple/`, `Samsung/`, etc.). Assets in `_assets/`, custom css in `_custom/`.
- **Safety**: Don't move/rename public dirs without reviewing all `href`/`src` and route references.
- **Scripts**: Maintenance scripts in `scripts/` — not loaded at runtime.
- **Server**: ESM modules, Node >= 18. Uses PostgreSQL pool + in-memory mock fallback.
- **Backend**: Supabase DB, Mercado Pago payments. See `backend/README.md`.
- **Supabase via ONE**: whenever a task touches database data, schema, filters, prices, products, carts, orders, auth, or Supabase connectivity, connect to Supabase first through the ONE plugin/MCP (`one`) and verify the active project before changing code or data. Do not rely only on local mock data, cached JSON, or `.env` assumptions. If ONE is unavailable, report that explicitly and only then use the direct Supabase connector/CLI as fallback.
- **Prompt creation rule**: whenever the user asks to create, rewrite, improve, or structure a prompt in this project, use the `prompt-engineer` skill. The response must include the final ready-to-use prompt, the subagents that should be created with clear responsibilities, and the project skills/tools that best fit the prompt's goal.
- **Deploy**: GitHub Pages on push to `main` (static, no build step). Vercel for API routes (`api/`).
- **Visual/flow QA**: use `@chrome` for real browser validation of layout, menu, category, product, cart, and checkout flows. Do not replace required Chrome validation with HTTP-only checks.
- **Chrome-first rule**: whenever a task involves visual behavior, navigation, gallery, menu, product page, cart, checkout, redirects, or local preview validation, open and validate with `@chrome` before considering the task complete. HTTP-only checks and Playwright-only checks may support the audit, but they do not replace the required `@chrome` validation.
- **Browser fallback order**: for browser validation, always try `@chrome` first. If `@chrome` is unavailable or blocked, try the Chrome DevTools MCP next. Use Playwright only as the final fallback, and explicitly report that fallback in the final response.

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| DB migrate | `npm run db:migrate` |
| DB seed | `npm run db:seed` |
| Backend dev | `cd backend && npm run dev` |
| Backend start | `cd backend && npm start` |
