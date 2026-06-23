# Tech 7 Defensive Security Remediation Report

## Executive Summary
Remediation executed for confirmed security findings across Admin login, API validation, Supabase access control, storage listing, CSP headers, static file exposure and legacy backend auth.

Critical Supabase exposure was reduced: sensitive tables now have RLS enabled and no direct `anon`/`authenticated` grants, while catalog read remains available. Admin login enumeration was fixed. CSP is enforced and no longer permits `unsafe-eval`.

Remaining work is bounded and documented:
- Remove CSP `'unsafe-inline'` only after static-site inline script/style modernization.

## Scope Tested
- Local root app: `http://127.0.0.1:3000`
- Supabase project: `supabase-bisque-bridge` (`lzsaaufsdcmqlasjrqck`)
- Admin login/session protection.
- Public routes: home, category, cart, checkout, search.
- APIs: Admin protected route, cart security validation, webhook fail-closed checks.
- Headers/CSP and dependency audit.

## Tools Used
- Skills: `caveman`, `planning-with-files`
- Ruflo check: `ruflo v3.12.4`
- Supabase MCP fallback: project/schema/RLS/grants/policies/migration checks.
- `@chrome`: unavailable in this session.
- Browser fallback: local Google Chrome launched through Playwright with temporary profile.
- HTTP/API tests: `npm run validate:api-security` and browser request checks.
- Dependency audit: root and `backend/` `npm audit --omit=dev`.

## Findings by Severity
### Critical
- SEC-001 Supabase RLS disabled on sensitive tables: fixed in Supabase.
- SEC-002 `provider_oauth_tokens` public exposure risk: fixed by RLS plus revoked public grants; private-schema move remains recommended.

### High
- SEC-006 Root static exposure: fixed locally.
- SEC-009 Legacy backend API auth: fixed locally.
- SEC-010 Legacy backend static exposure: fixed locally.

### Medium
- SEC-003 Storage object listing: fixed by removing broad `storage.objects` product-image policy.
- SEC-004 Public callable `SECURITY DEFINER` function: fixed in Supabase by revoking public execute and removing public OLX header-secret policies/grants.
- SEC-007 CSP report-only/unsafe eval: fixed to safe stage; enforced CSP active and `unsafe-eval` removed. `'unsafe-inline'` remains because the current static storefront depends heavily on inline code.

### Low
- SEC-005 DB hardening: fixed in Supabase; `set_updated_at` has explicit `search_path` and `pg_trgm` is in `extensions`.
- SEC-008 Admin login enumeration: fixed locally.

## Corrections Made
- `server/routes/admin.js`: wrong username and wrong password now return `401 invalid_credentials`.
- `assets/js/admin.js`: login error text normalized.
- `scripts/validate-api-security.mjs`: added regression test for non-enumerating login failure.
- `server/app.js`: enforced CSP added, `unsafe-eval` removed, extra directives added.
- `vercel.json`: production CSP aligned with server header.
- Supabase migration `tech7_security_hardening_20260621`: RLS/grants/storage policy/function hardening applied.
- Supabase migration `tech7_olx_rpc_pgtrgm_hardening_20260622`: public OLX RPC path blocked and `pg_trgm` moved to `extensions`.

## Supabase Evidence
- Baseline: `_validation/security-remediation/baseline/supabase-baseline-summary.md`
- Migration SQL: `_validation/security-remediation/migrations/2026-06-21_supabase_security_hardening.sql`
- Rollback SQL: `_validation/security-remediation/migrations/2026-06-21_supabase_security_hardening_rollback.sql`
- Follow-up migration SQL: `_validation/security-remediation/migrations/2026-06-22_supabase_olx_rpc_pgtrgm_hardening.sql`
- Follow-up rollback SQL: `_validation/security-remediation/migrations/2026-06-22_supabase_olx_rpc_pgtrgm_hardening_rollback.sql`
- After summary: `_validation/security-remediation/after/supabase-after-summary.md`
- Follow-up after summary: `_validation/security-remediation/after/supabase-after-followup-2026-06-22.md`

Validated:
- Sensitive tables have RLS enabled and no direct `anon`/`authenticated` grants.
- `anon` direct select on `public.orders` returns permission denied.
- `anon` catalog read on `public.products` still works.
- `storage.objects` broad product-image policy count is 0.
- `public.set_updated_at()` includes `SET search_path TO 'public'`.
- `public.olx_private_header_ok()` has no `anon`/`authenticated` execute grants.
- Policies referencing `olx_private_header_ok()` = 0.
- `pg_trgm` extension schema is `extensions`.
- `anon` catalog/title search still works after moving `pg_trgm`.

## Browser Evidence
Saved in `_validation/security-remediation/browser/`:
- `home.png`
- `category-apple.png`
- `cart.png`
- `checkout.png`
- `admin-login.png`
- `search-xss.png`
- `browser-validation.json`

Final smoke saved in `_validation/security-remediation/browser-final/`:
- `home.png`
- `search-xss.png`
- `browser-final-validation.json`

Checks passed:
- Home rendered with enforced CSP header.
- Category/cart/checkout/Admin login shell rendered.
- Admin API without session returned `401 missing_session`.
- Search payload `<script>alert(1)</script>` opened 0 dialogs.

## CSP Inline Assessment
Static scan found:
- 43,109 inline `<script>` blocks.
- 13,489 inline `<style>`/`style=` occurrences.
- 7,771 inline `on*=` event attributes.

Because this storefront is a mirrored static site with many generated HTML files, removing `'unsafe-inline'` directly from CSP would break current pages. Current production-safe CSP state is enforced, removes `unsafe-eval`, blocks objects, sets `base-uri`, limits form destinations and denies framing. Full no-inline CSP is a separate static modernization/refactor.

## Validations Run
- `node --check server/app.js`
- `node --check server/routes/admin.js`
- `node --check assets/js/admin.js`
- `node --check scripts/validate-api-security.mjs`
- `node -e "JSON.parse(...vercel.json...)"`
- `npm run validate:api-security`
- `npm run validate:assets`
- `npm run validate:routes`
- `npm run validate:endpoints`
- `npm run validate:build`
- `npm audit --omit=dev`
- `cd backend && npm audit --omit=dev`

All final validation commands passed. First parallel `validate:build` timed out at 124s; isolated rerun passed in 195.6s.

## Pending
- Deploy and repeat production smoke/security checks after release.
- Remove CSP `'unsafe-inline'` after frontend inline-script refactor or nonce/hash/hash-header implementation.
