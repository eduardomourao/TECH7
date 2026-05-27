DEPRECATED BACKEND

This `backend/` folder is legacy and should not be used as the primary runtime.

Active backend:
- `server/` (root project)

Why:
- Avoid duplicated business rules and divergent APIs.
- Keep database schema, payment flow, cart, order and webhook logic in a single service.

Next step:
- Migrate any remaining frontend/API dependencies to `server/`.
- Freeze new feature development in `backend/`.
