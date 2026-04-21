# Task 05 — TakumiPay JWS QR detector (ES256)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.4, §4.6 (example code), milestone M1

## Why this matters

TakumiPay issues its own signed merchant QRs (`takumipay:v1:<JWS>`)
for the "Register as Merchant" flow (§1.1.1 step 4). We verify the
JWS **offline, on-device** against a bundled public JWK so a tampered
sticker never proceeds to `/pay-merchant` and a user with no
connection can still recognize a legit merchant before quoting. The
detector is async because `jwtVerify` is async — which is why
`classify()` is async in task 01.

## Scope

1. Create `services/paymentIntent/detectors/takumipay.ts` exporting
   `takumipayDetector: Detector` exactly per §4.6's code sketch.
2. Short-circuit on `raw.startsWith("takumipay:v1:")` — anything else
   returns `null` immediately so priority short-circuits without
   wasting a `jwtVerify` call.
3. Slice off the `takumipay:v1:` prefix, `await importJWK(publicKeyJwk,
   "ES256")`, then `await jwtVerify(jws, key, { algorithms: ["ES256"] })`.
4. On success, map payload fields
   (`{ merchantId, merchantName, country, currency, amountMinor, iat,
   exp }`) into a `merchant` channel with `provider: "takumipay"`,
   `merchantId` cast to `mch_${string}`, `rawPayload: raw`.
5. On any exception (bad signature, expired, malformed) return `null`.
   **Swallow the error silently** — never log the payload, never
   forward to `/pay-merchant`. The scanner's generic "unrecognized QR"
   toast handles user feedback.
6. Priority: **highest** (lowest number) in the registry so our own
   QRs win before anything else is evaluated.
7. Add `takumipay.test.ts` covering: valid JWS, wrong-key signature,
   expired `exp`, malformed JWS string, non-`takumipay:` prefix.
   Tests generate a throwaway keypair so the JWK checked into
   `constants/takumipayKey.ts` (task 09) isn't a test dep.
8. Import `constants/takumipayKey.ts` — the file is delivered by
   task 09. Until 09 lands, coordinate via a stubbed JWK or a
   test-only export.

## Rules (non-negotiable)

- **Three-role separation** (memory `feedback_role_separation.md`) —
  verification is a wallet-side (mobile) concern because it runs
  offline. Server never re-verifies its own signature to decide
  whether a payer can proceed — trust is transitive through the
  intent id.
- **Silent failure on tampered payloads.** The detector must not
  distinguish "tampered" from "not our QR" to the caller; both are
  `null`. Anything else leaks verification state to code that
  should trust the registry, not re-derive trust.
- **No network.** `jose` runs locally; the JWK is bundled.
- **`jose` polyfill discipline** — make sure
  `react-native-quick-crypto` / `react-native-get-random-values` is
  imported before first `jose` use (§11.1 note).

## Acceptance

- [ ] `detectors/takumipay.ts` exists and is the highest-priority
      registered detector.
- [ ] Tampered-signature test returns `null` with no thrown error
      escaping `classify()`.
- [ ] Valid JWS test returns a `merchant` channel with
      `provider: "takumipay"` and a correctly-typed `merchantId`.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Generating the keypair / bundling the JWK — task 09.
- OTA rotation plumbing (runs off existing `EIP7702_ALLOWLIST`
  channel) — task 09.
- Server-side JWS minting — backend task.
- `/pay-merchant` stub consuming the decoded payload — task 08.
