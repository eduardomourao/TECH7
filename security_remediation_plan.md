# Tech 7 Security Remediation Plan

## Goal
Resolve all pending security findings from `security_findings.md` without breaking Admin, storefront, cart, checkout, payments, shipping, coupons, uploads, or production data.

## Current Pending Findings
| ID | Severity | Area | Target Status |
|---|---|---|
| SEC-001 | Critical | Supabase RLS disabled on sensitive tables | Fix with tested RLS policies |
| SEC-002 | Critical | `provider_oauth_tokens` exposed in public schema | Lock down or move tokens server-only |
| SEC-003 | Medium | `product-images` bucket broadly listable | Restrict storage object listing |
| SEC-004 | Medium | Public callable `SECURITY DEFINER` function | Revoke public execute or redesign |
| SEC-005 | Low | DB hardening warnings | Harden function search path and extension placement |
| SEC-007 | Medium | CSP report-only with unsafe inline/eval | Move toward enforceable CSP |
| SEC-008 | Low | Admin login user enumeration | Generic login failure response |

## Safety Rules
- No destructive production DB changes without backup and rollback SQL.
- First test schema/RLS changes on Supabase branch or migration dry run.
- Do not print token values, secrets, customer PII, or OAuth payloads.
- Do not change production data contents except policy/privilege metadata after approval.
- Keep storefront public catalog readable.
- Keep Admin/server-side flows working through service role/server DB connection.

## Phase 0 - Baseline and Backup
Status: complete

Tasks:
- Verify active Supabase project is still `lzsaaufsdcmqlasjrqck`.
- Export schema-only backup for public tables, policies, grants, functions and storage policies.
- Capture current policy/grant inventory:
  - `pg_policies`
  - table RLS status
  - table grants for `anon`, `authenticated`, `service_role`
  - function execute grants
  - storage bucket/object policies
- Run current validation suite before changes.

Acceptance:
- Baseline artifacts saved under `_validation/security-remediation/`.
- Rollback SQL drafted before any production policy change.

## Phase 1 - Supabase RLS Design
Status: complete

Principle:
- Public clients should read only catalog tables needed by storefront.
- Orders, payments, carts, service orders, OAuth tokens, webhook events and shipping internals should be server-only unless a narrow public use case exists.

Policy design:
- `products`, `product_images`, `product_categories`, `categories`:
  - Keep public read for active catalog data.
  - Deny public writes.
- `orders`, `order_items`, `payments`, `shipments`, `shipment_events`, `service_orders`, `service_order_items`, `provider_oauth_tokens`, `webhook_events`:
  - Enable RLS.
  - No anon/authenticated direct access by default.
  - Server continues using backend DB/service role.
- `coupons`:
  - Prefer server-only. Public should validate coupon through `/api/coupons/validate`, not direct Supabase.
- `carts`, `cart_items`, `shipping_quotes`:
  - Prefer server-only because current app has backend endpoints for cart/shipping/order.
  - If future direct client Supabase access is required, add signed/session-bound IDs, not broad public policies.

Acceptance:
- Written migration SQL reviewed before apply.
- Expected access matrix documented per table.

## Phase 2 - Supabase RLS Implementation
Status: complete

Tasks:
- Apply migration on Supabase branch if available; otherwise apply during maintenance window.
- Enable RLS on sensitive public tables.
- Revoke excessive direct grants from `anon` and `authenticated` where appropriate.
- Add/verify catalog read policies.
- Verify service-role/server operations still work.

Validation:
- `@supabase` policy summary shows sensitive tables `rls_enabled=true`.
- `anon` cannot select token/order/payment/service-order rows directly.
- Storefront product/category/search routes still work.
- Admin products/orders/coupons/service-orders still work through server auth.
- Checkout creates test order only in controlled test path, then cleanup if safe.

Acceptance:
- SEC-001 fixed.
- No public direct access to sensitive rows.
- No storefront regression.

## Phase 3 - OAuth Token Storage Lockdown
Status: partially complete

Preferred path:
- Move `provider_oauth_tokens` to a private schema such as `private.provider_oauth_tokens`.
- Update server SQL references to use private schema.
- Revoke all `anon`/`authenticated` privileges.

Fallback path:
- Keep table in `public`, but enable RLS with no public policies and revoke table privileges from `anon`/`authenticated`.

Validation:
- Supabase advisor no longer flags sensitive columns exposed.
- Melhor Envio/OAuth readiness still works server-side.
- No token values appear in logs, frontend JS, reports or artifacts.

Acceptance:
- SEC-002 fixed.

## Phase 4 - Storage Bucket Listing Restriction
Status: complete

Tasks:
- Inspect current `storage.objects` policies for bucket `product-images`.
- Preserve public object URL read behavior if storefront needs it.
- Remove broad list policy.
- Add path-scoped read policy only if required.
- Ensure uploads remain Admin/server-only through `/api/admin/product-images/upload`.

Validation:
- Public image URLs still load.
- Anonymous bucket listing is denied.
- Admin upload still rejects unauthenticated request and accepts only valid authenticated image upload.

Acceptance:
- SEC-003 fixed.

## Phase 5 - Function/RPC Hardening
Status: complete

Tasks:
- Inspect `public.olx_private_header_ok()` definition and callers.
- If not public, run:
  - `revoke execute on function public.olx_private_header_ok() from anon, authenticated;`
- If public behavior is required, convert to `SECURITY INVOKER` or move private logic server-side.

Validation:
- Supabase advisor no longer reports public executable security definer function.
- OLX/private integration still works through intended server path.

Acceptance:
- SEC-004 fixed.

## Phase 6 - DB Hardening Cleanup
Status: complete

Tasks:
- Set explicit `search_path` on `public.set_updated_at`.
- Evaluate moving `pg_trgm` from `public` to an extension schema.
- If moving extension is risky, document exception and leave for maintenance window.

Validation:
- Supabase advisors re-run.
- Existing triggers still update `updated_at`.
- Product search still works.

Acceptance:
- SEC-005 fixed or documented as accepted low risk with reason.

## Phase 7 - Admin Login Generic Failure
Status: complete

Tasks:
- Change `/api/admin/login` failure responses:
  - wrong username -> `401 { error: "invalid_credentials" }`
  - wrong password -> `401 { error: "invalid_credentials" }`
- Keep rate limit unchanged.
- Update `assets/js/admin.js` friendly error text.
- Add/update validation test in `scripts/validate-api-security.mjs`.

Validation:
- Unknown user and wrong password return same public response.
- Admin login success still works.
- `npm run validate:api-security` passes.

Acceptance:
- SEC-008 fixed.

## Phase 8 - CSP Hardening
Status: partially complete

Stage 1:
- Inventory inline scripts/styles and eval usage.
- Keep `Content-Security-Policy-Report-Only`.
- Remove `'unsafe-eval'` if no runtime dependency requires it.

Stage 2:
- Move inline scripts to static JS where practical.
- Add nonces or hashes for unavoidable inline scripts.
- Narrow `script-src`, `style-src`, `connect-src`, `img-src`.

Stage 3:
- Switch from report-only to enforced `Content-Security-Policy`.
- Keep report-only stricter policy for next tightening pass.

Validation:
- Home, category, product, search, cart, checkout, Admin login and Admin dashboard render without CSP violations.
- Browser validation evidence saved.
- No script execution from controlled XSS payload.

Acceptance:
- SEC-007 fixed or reduced to documented staged hardening if full enforcement requires layout/runtime refactor.

## Phase 9 - Full Regression Gate
Status: complete

Commands:
- `node --check server/app.js`
- `node --check server/routes/admin.js`
- `node --check server/routes/orders.js`
- `node --check server/routes/cart.js`
- `npm run validate:api-security`
- `npm run validate:assets`
- `npm run validate:routes`
- `npm run validate:endpoints`
- `npm run validate:build`
- `npm audit --omit=dev`
- `cd backend && npm audit --omit=dev`

Browser flows:
- Home
- Category page
- Product page
- Search with special characters
- Cart add/update
- Coupon validation
- Checkout with controlled test cart
- Admin login/session/logout
- Admin protected endpoints without auth
- Image upload rejection without auth

Supabase checks:
- Security advisors.
- RLS/policy summary.
- Direct anon access denial for sensitive tables.
- Catalog read still allowed.

Acceptance:
- All commands pass.
- Browser evidence saved under `_validation/security-remediation/`.
- `security_findings.md` statuses updated.
- Final remediation report created.

## Execution Order
1. SEC-008 first: low-risk code-only fix.
2. SEC-003 and SEC-004 next: scoped Supabase policy/privilege changes.
3. SEC-001 and SEC-002 together: critical DB access model, needs backup and rollback.
4. SEC-005: hardening cleanup after critical access model stable.
5. SEC-007 last: CSP may require frontend/runtime refactor and broad visual QA.

## Rollback Strategy
- Code changes: revert specific commit or patch.
- Supabase policy changes:
  - Keep pre-change grant/policy dump.
  - Keep rollback SQL per migration.
  - Avoid data mutation; rollback should only alter policies/grants/schema placement.
- CSP:
  - Revert enforced header to report-only if browser flows break.

## Deliverables
- `_validation/security-remediation/baseline/`
- `_validation/security-remediation/after/`
- `supabase/security_rls_migration.sql` or equivalent migration path
- `security_remediation_report.md`
- Updated `security_findings.md`
