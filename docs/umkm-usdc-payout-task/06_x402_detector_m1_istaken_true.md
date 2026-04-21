# Task 06 — x402 scheme detector + explicit-paste HTTPS

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.3 #2, §5.3 (Path C), milestone M1

## Why this matters

The scanner must recognize `x402://…` resource URLs so Path C (raw
x402 payments to non-Nanopayments merchants, §5.3) is reachable the
same way QRIS is. The spec pins one security rule tightly: **plain
`https://` URLs scanned via the camera must NOT be auto-probed.**
Silently hitting an arbitrary HTTPS URL because a QR told us to is a
tracking / phishing vector. Only an explicit paste (`source: "paste"`)
or the `x402://` scheme may resolve into an `x402` channel.

## Scope

1. Create `services/paymentIntent/detectors/x402.ts` exporting
   `x402Detector: Detector`.
2. Match `x402://…` unconditionally — emit an `x402` channel with
   `resourceUrl: raw`.
3. Accept plain `https://…` **only** when the caller threads a
   source hint that is `"paste"`. The detector reads this via a
   second optional `opts: { source?: "qr" | "deeplink" | "paste" }`
   argument on `detect`. When source is `"qr"` (or undefined —
   scanner default), `https://` returns `null` so the payload falls
   through to "unrecognized QR" (§9.1 `QR_UNRECOGNIZED`).
4. Extend `Detector.detect` in
   `services/paymentIntent/detectorRegistry.ts` (from task 01) to
   accept the optional `opts` arg so `classify(raw, opts)` can pass
   it through. Other detectors ignore it.
5. Priority: below TakumiPay JWS (highest), above EMVCo / wallet
   URI / wallet address — x402 scheme is unambiguous so it can short
   the structured detectors.
6. Register in boot file.
7. Add `x402.test.ts`: `x402://` URL + `source: "qr"` → hit,
   `https://…` + `source: "qr"` → `null`, `https://…` +
   `source: "paste"` → hit, non-URL garbage → `null`.

## Rules (non-negotiable)

- **No fetch.** The detector never touches the network; Path C
  execution in M5 probes the URL, not this classifier.
- **Explicit-paste gating is at the classifier level, not at
  individual call sites.** If task 07's scanner ever forgets to
  pass `source: "qr"`, `classify()` must default to the safer value
  (`"qr"`).
- **Chain-extension discipline** (memory
  `feedback_chain_extension_discipline.md`) — no chain branching
  here; network selection for an x402 payment happens server-side
  at intent creation.

## Acceptance

- [ ] `detectors/x402.ts` exists; registry / `classify()` support
      the optional `opts` arg.
- [ ] Four test cases above pass.
- [ ] `classify()` called without `opts` treats the scan as
      `source: "qr"` (conservative default).
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Fetching the x402 resource, parsing the 402 response, and wiring
  to the EIP-3009 signer (all M5 / Path C).
- Route on `/pay-merchant` — task 08 stub accepts the `x402`
  channel kind but does not execute yet.
- Deep-link entry point plumbing (agent mode,
  `takumipay://pay-merchant?intentId=…`) — §8 post-v1.
