# `api/` strategies module and endpoints

**Phase 1 — MVP**

Refer to `../defi-strategies-spec.md` §13 for the backend module surface.
Create `api/src/strategies/strategies.controller.ts` with the JWT-guarded endpoints:
- `GET /v1/strategies`
- `POST /v1/strategies`
- `PATCH /v1/strategies`
- `DELETE /v1/strategies`
- `GET /v1/strategies/opportunities`
- `GET /v1/strategies/opportunities/:slug`
- `GET /v1/strategies/positions`
- `GET /v1/strategies/positions/:id`
- `POST /v1/strategies/positions/:id/refresh`

Implement the backing services.