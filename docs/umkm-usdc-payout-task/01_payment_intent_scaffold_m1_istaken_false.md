# Task 01 — `services/paymentIntent` module scaffold

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.1, §4.2, §4.5, milestone M1

## Why this matters

Scan-to-pay today only recognizes raw EVM/Solana addresses at
`app/scan-to-pay.tsx:29-62`. The spec's normalization layer replaces that
with a **pure, async classifier** and a detector registry so adding
QRIS, TakumiPay JWS QRs, x402 URLs, or a future country's national QR
becomes `register(detector)` in a boot file — not a new branch in the
scanner. This task lands the module skeleton; subsequent M1 tasks
(02–06) register each detector into it.

## Scope

1. Create `services/paymentIntent/types.ts` with `RawScan`,
   `PaymentIntent`, `PayChannel` exactly as defined in §4.2 (the
   `wallet | merchant | x402` discriminated union with `target?`,
   `amount?`, `token?` on wallet channels).
2. Create `services/paymentIntent/detectorRegistry.ts` with the
   `Detector` interface, module-private `detectors: Detector[]`,
   `register(d)`, and `runAll(raw)` — priority-sorted, first match
   wins. Match §4.5 verbatim.
3. Create `services/paymentIntent/classify.ts` exporting
   `classify(raw: string): Promise<PaymentIntent | null>`. **Must be
   async** so the TakumiPay JWS detector (task 05) can await
   `jwtVerify`. Loop through registry in priority order, `await` each
   `detector.detect(raw)`, return the first hit.
4. Create `services/paymentIntent/index.ts` re-exporting `classify`,
   `register`, and the types.
5. Create `services/paymentIntent/classify.test.ts` with a smoke test
   that registers a fake detector and asserts `classify()` returns its
   result — the real detector tests land in tasks 02–06.

## Rules (non-negotiable)

- **Pure module.** No React, no networking, no `fetch`, no
  `expo-*` imports. Runs under a Node harness in tests.
- **Chain-extension discipline** (memory
  `feedback_chain_extension_discipline.md`) — no
  `if (namespace === "X")` branches in `classify.ts` or the registry.
  Every per-chain rule lives inside a detector.
- **Detector priority is numeric, not positional.** `register` sorts
  on push so boot order doesn't matter.
- **Never mutate the exported registry from tests** — add a
  `__resetForTest()` (internal) if needed for isolation.

## Acceptance

- [ ] `services/paymentIntent/{types,classify,detectorRegistry,index}.ts`
      exist and compile.
- [ ] `classify()` returns a `Promise<PaymentIntent | null>`.
- [ ] `classify.test.ts` passes and asserts priority ordering.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Any concrete detector (walletAddress → task 02, walletUri → task 03,
  EMVCo → task 04, TakumiPay JWS → task 05, x402 → task 06).
- Wiring `classify()` into `app/scan-to-pay.tsx` (task 07).
- `/pay-merchant` screen (task 08).
- **Naming note — `services/nanopay/`.** The wallet-security batch
  already claims `services/nanopay/` for SIWE / permit2 tooling. M2's
  Circle Nanopayments module must coexist there without filename
  collisions (tracked in task 17). Nothing in this scaffold touches
  `services/nanopay/`.
