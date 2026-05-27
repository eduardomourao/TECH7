# AGENTS.md (site novo)

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
