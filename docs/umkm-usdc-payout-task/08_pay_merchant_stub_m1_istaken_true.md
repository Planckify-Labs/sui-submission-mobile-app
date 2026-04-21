# Task 08 — `/pay-merchant` stub screen

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §8.5 #1 (intentId-first contract), §6.2 `PaymentIntent`, §4.6, milestone M1

## Why this matters

M1 is "user can scan a QRIS or TakumiPay QR and see the parsed
fields" — it's the end-of-milestone shippable. The route also
establishes the **intent-id-first deep-link contract** (§8.5 #1)
that agent mode (§8) will depend on: `/pay-merchant?intentId=…` is
the canonical entry, the raw payload is a fallback for the scanner
path. Getting this right in M1 means agent mode integration is a
component + link entry later, not a route rewrite.

## Scope

1. Create `app/pay-merchant.tsx` with the Expo Router default export.
2. Read route params via `useLocalSearchParams`:
   - `intentId?: string` — **primary** path (matches
     `pi_${string}`). In M1 this is unused because the backend is
     not wired; accept + display it so the route shape is stable
     for agent-mode deep links.
   - `intent?: string` — JSON-serialized `PaymentIntent` from the
     scanner (task 07). Parse with `JSON.parse` inside a `try/catch`
     and render fields as-is. Treat parse failure as "unrecognized
     scan" with a back CTA.
3. Render a read-only confirmation UI with the following fields
   pulled from the `PaymentIntent`:
   - `channel.kind` (`merchant` / `x402`) — headline badge.
   - For `merchant`: `provider`, `merchantId` (when present),
     `amountMinor`, `currency`, short-hash of `rawPayload`.
   - For `x402`: `resourceUrl`.
   - Source scheme (`qr` / `deeplink` / `paste`) from
     `intent.source`.
4. Add a disabled "Pay" button with the copy **"Coming in M2"** and a
   working "Back" button. **No networking, no signing, no chain
   writes.**
5. Visual shell should mirror `app/withdraw.tsx` — same layout /
   spacing primitives — since M2 will extend this into the real
   confirmation screen on top of the same structure.
6. Copy audience rule (§1.1) — this is a **payer** surface, so
   USDC / chain language is fine. Merchant-facing copy never
   lands here.

## Rules (non-negotiable)

- **`intentId` is first-class.** The component must treat
  `intentId` as the primary input; the raw `intent` payload is the
  scanner-path fallback, not the default.
- **Three-role separation** (memory `feedback_role_separation.md`)
  — the screen never signs and never mutates state. It only
  renders.
- **No USDC math here in M1.** Backend computes FX in M3; don't
  hardcode a rate for the stub.
- **Chain-extension discipline** (memory
  `feedback_chain_extension_discipline.md`) — no
  `if (namespace === "X")` branches. `channel.kind` is the only
  discriminator the stub reads.

## Acceptance

- [ ] `app/pay-merchant.tsx` exists and renders parsed fields for
      a `merchant` payload and an `x402` payload.
- [ ] Route accepts both `intentId` and `intent` params without
      crashing when either is absent.
- [ ] Back button works; Pay button is disabled.
- [ ] Scanner → `/pay-merchant` round-trip (task 07 + 08) surfaces
      QRIS tags visibly on-screen.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- `POST /v1/pay/intents` call — M2 (backend + mobile task ≈ 17).
- EIP-3009 signing — M2.
- FX display / quote freeze — M3.
- Xendit payout wiring — M3.
- Agent-mode `<PaymentIntentCard>` deep-link integration — §8, post-v1.
