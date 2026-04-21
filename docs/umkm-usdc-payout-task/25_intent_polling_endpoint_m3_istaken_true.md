# Task 25 — Intent Polling Endpoint (GET /v1/pay/intents/:id)

**Status:** Not taken
**Owner:** Backend (takumipay-api)
**Spec reference:** umkm-usdc-payout-spec.md §6.2, §6.3, milestone M3

## Why this matters
Mobile drives the live status UX via TanStack Query polling against this single endpoint — there is no SSE, no websocket. The spec (§6.3) is explicit: "SSE is not in v1 scope — polling is cheap because Nanopay attestation is sub-second." The endpoint must return the same `PaymentIntent` shape as the create endpoint so the receipt screen (task 31) and the push-on-PAID-OUT flow (task 32) can render status transitions without a second fetch.

## Scope
1. Implement `GET /v1/pay/intents/:id` returning the canonical `PaymentIntent` shape from §6.2.
2. Authenticated on the existing SIWE session — only the `payer_user_id` on the intent row may read it. 403 otherwise, never leak existence.
3. Echo `displayName` from the joined `merchants` row so mobile can render the receipt without a merchant lookup.
4. Status transition ordering surfaced: `QUOTED → SIGNED → SETTLED → PAID_OUT | FAILED | EXPIRED`.
5. Respect the `expires_at` column: if `status = QUOTED` and `now > expires_at`, flip to `EXPIRED` on read (idempotent sweep) and return the new status.
6. Include `fx`, `fees`, `nanopay`, `x402`, `gasless` blocks on every response — full shape, not a trimmed one.

## Rules (non-negotiable)
- Three-role separation: the endpoint never reveals Circle attestation UUIDs raw — the `attestation.id` field on `PaymentIntent` is the only public handle. No Xendit ids, webhook tokens, or provider names in the response.
- Chain-extension discipline: `PaymentIntent.nanopay` is the discriminated union; do not strip `kind` or branch on `namespace` in the serializer. SVM rows (M6) flow through the same endpoint unchanged.
- Filter-at-source: mobile TanStack Query uses a 3-s stale-time (not shorter — Circle settle is <500 ms so one poll post-submit is normally enough). Do NOT add client-side throttling — the server stays honest about what it knows.

## Acceptance
- [ ] Controller returns full `PaymentIntent` shape for happy path.
- [ ] Authorization: 403 for intents not owned by the caller; covered by test.
- [ ] Expiry auto-flip: `QUOTED` past `expires_at` returns `EXPIRED` without a write-through mutation endpoint.
- [ ] Response contract matches the Zod schema shared with mobile (colocated per §11.1 deps guidance).
- [ ] `pnpm run test -- --testPathPattern=intent-get` green.
- [ ] `pnpm check:syntax` and `pnpm biome:check` clean.

## Out of scope
- Mobile-side TanStack Query wiring + invalidation-on-submit (task 31).
- FCM/APNs push on `PAID_OUT` (task 32).
- Webhook-driven `PAID_OUT` / `FAILED` transitions (task 30).
