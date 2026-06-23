# Tech 7 Defensive Security Audit Plan

## Goal
Audit Tech 7 defensively across frontend, backend, Admin, Supabase, APIs, cart, checkout, coupons, uploads, public routes, production configuration, and secrets exposure. Keep all tests controlled, non-destructive, documented, and inside Tech 7-owned local/production surfaces.

## Scope
- Local checkout: `C:\Users\Admin\Downloads\TECH7\TECH7-main`
- Local site/API if runnable from this checkout.
- Production Tech 7 URLs discovered from config or repo docs.
- Admin panel and project-owned APIs only.
- Supabase project connected to this repo.

## Safety Guardrails
- No third-party attacks.
- No DDoS, aggressive brute force, destructive stress test, or out-of-scope exploitation.
- No printing, committing, or leaking secrets.
- No production data deletion or mutation without explicit approval.
- Write/destructive tests use test data only and clean up only when safe.
- Findings must include severity, route/file, evidence, impact, recommendation, and status.

## Tool Status
- Required skills loaded: `caveman`, `planning-with-files`.
- Ruflo availability: confirmed with `npx ruflo@latest --version` -> `ruflo v3.12.4`.
- `@chrome`: not exposed as a direct tool in this Codex session. Chrome DevTools MCP is available and will be used as the documented browser fallback unless `@chrome` becomes available.
- ONE Supabase plugin: not exposed by tool discovery in this session.
- `@supabase`: Supabase MCP is available and will be used for database/schema/RLS/advisor checks.

## Subagent Workstreams
- `security-scope-guard`: scope, safety, destructive-test checks.
- `auth-admin-security-agent`: Admin auth/session and sensitive route access.
- `supabase-security-agent`: Supabase schema, RLS, advisors, sensitive fields.
- `api-security-agent`: endpoints, methods, validation, CORS, error leakage.
- `frontend-xss-agent`: XSS and escaping in public/Admin surfaces.
- `upload-security-agent`: upload validation, MIME/extension/path traversal.
- `cart-checkout-security-agent`: cart, freight, coupon, totals, orders.
- `headers-config-agent`: security headers, cache, CSP, CORS, production config.
- `chrome-qa-agent`: real browser validation via available Chrome fallback.

## Phases
| Phase | Status | Notes |
|---|---|---|
| 1. Confirm tools, repo rules, URLs | complete | Skills/Ruflo checked; browser/Supabase tool fallback documented. |
| 2. Map repo routes, APIs, Admin, scripts | complete | Root server and backend legacy routes mapped. |
| 3. Start local app safely | complete | Root app tested on `3107`; backend legacy tested on `3108`; both stopped after validation. |
| 4. Supabase audit | complete | Supabase MCP advisors, table/RLS summary, and XSS-pattern count completed. |
| 5. HTTP/API defensive tests | complete | Admin auth, public files, CORS, invalid cart/coupon/search payloads tested. |
| 6. Browser/Admin/public flow QA | complete | Direct `@chrome` unavailable; Chrome DevTools MCP unsupported; Playwright fallback screenshots saved under `_validation/security-audit/`. |
| 7. Secrets/public files/dependencies audit | complete | `.env*` local files ignored/untracked; values not printed; root/backend audits clean. |
| 8. Fix confirmed safe issues | complete | Static sensitive path blocking and backend legacy auth fixes applied. |
| 9. Validation commands | complete | `node --check` and `npm run validate:build` passed. |
| 10. Final report | in_progress | Summarize executive results, evidence, fixes, pending items. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| `npx ruflo@latest --version` failed in sandbox due npm cache-only network state | 1 | Re-ran with approved external access; Ruflo v3.12.4 confirmed. |
| `@chrome` direct tool not found | 1 | Documented fallback to Chrome DevTools MCP per project fallback rule. |
| ONE plugin not found | 1 | Documented fallback to Supabase MCP per AGENTS.md. |
| Supabase policy summary SQL used unqualified `schemaname`/`tablename` columns | 1 | Corrected query to use `c.table_schema`/`c.table_name`. |
