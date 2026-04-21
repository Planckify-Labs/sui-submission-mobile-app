# Task 46 — Agent-mode integration slot (preserve §8.5 contract)

**Status:** Not taken
**Owner:** Mobile + Backend
**Spec reference:** umkm-usdc-payout-spec.md §8.1, §8.4, §8.5,
cross-cutting (lands across M1 + M3)

## Why this matters

§8 says agent mode ships **post-v1** as a thin connector, but only if
v1 leaves three specific primitives intact. If any of them drifts —
the `/pay-merchant` route takes raw payload instead of `intentId`, the
intent endpoint isn't idempotent, or the merchant-lookup URL is
unclaimed — the post-v1 integration becomes a rewrite of the payment
primitives. This task locks those three slots now so the agent
integration later is one MCP file + one `<PaymentIntentCard>` + one
linking entry, per §8.5.

## Scope

1. **Intent-id as primary param** — `app/pay-merchant.tsx` accepts
   `intentId` (of form `pi_…`) as the route param and fetches the
   intent via `GET /v1/pay/intents/:id`. It does **not** accept raw
   QR payload as an alternative shape. Task 08 scaffolds this; this
   task verifies end-to-end that scan→classify→`POST /intents`
   →navigate-with-`intentId` is the only path into the screen.
2. **Idempotency on `POST /v1/pay/intents`** — backend dedupes on
   `(userId, merchantId, amountMinor, currency)` within a 30 s
   window, returning the same `pi_…` id. Low-effort M3 change per
   §8.5 #3. Cover with an integration test that posts twice in 5 s
   and asserts identical `intentId`.
3. **Deep-link wiring** — `app/_layout.tsx` linking config registers
   scheme `takumipay://pay-merchant?intentId=<id>` so a future agent
   card's tap handler lands on the same pay screen. No UI shipped yet
   — just the config entry and a smoke test (`Linking.canOpenURL`).
4. **Stub `GET /v1/merchants/lookup?q=…`** on `takumipay-api`
   returning `501 Not Implemented` with a stable OpenAPI entry. This
   locks the URL shape so the post-v1 MCP tool (§8.2) can be added
   without renegotiating the endpoint path.

## Rules (non-negotiable)

- **Three-role separation** — no agent code signs anything; no
  `sign_payment` tool is added; `<PaymentIntentCard>` is **not**
  shipped in v1. User → request, server → thinking, wallet → execute
  stays intact.
- **Chain-extension discipline** — the intent endpoint and the
  pay-merchant screen never branch on `namespace`. The
  `NanopayPayload` discriminator resolves server-side per §6.2; the
  screen just renders what it receives.
- **Filter at source** — intent lookup is by `intentId` against the
  API. Mobile never re-derives intent state from cached QR payload.

## Acceptance

- [ ] `app/pay-merchant.tsx` resolves via `intentId` only.
- [ ] `POST /v1/pay/intents` returns identical id for a repeat call
      within 30 s; integration test passes.
- [ ] `takumipay://pay-merchant?intentId=…` is reachable via
      `Linking` config (smoke test).
- [ ] `GET /v1/merchants/lookup` returns 501 with documented shape.
- [ ] `pnpm check:syntax` + `pnpm biome:check` pass.

## Out of scope

- `<PaymentIntentCard>` component (post-v1, §8.3).
- MCP tools on `takumi-agent-api` (post-v1, §8.2).
- Agent wallet-context prompt changes (already covered by memory
  `feedback_agent_prompt_namespace.md`).
