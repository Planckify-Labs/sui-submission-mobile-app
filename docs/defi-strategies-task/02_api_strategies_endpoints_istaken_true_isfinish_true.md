# `api/` strategies module and endpoints

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §13 for the backend module surface.
Create `api/src/strategies/strategies.controller.ts` with the JWT-guarded endpoints:
- `GET /strategies`
- `POST /strategies`
- `PATCH /strategies`
- `DELETE /strategies`
- `GET /strategies/opportunities`
- `GET /strategies/opportunities/:slug`
- `GET /strategies/positions`
- `GET /strategies/positions/:id`
- `POST /strategies/positions/:id/refresh`

Implement the backing services.