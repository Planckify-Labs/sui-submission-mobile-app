# Task 17 — `services/nanopay/` Module (build + submit + hook)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.5 "New service module," §6.2, §6.5, milestone M2

## Why this matters

The pay-merchant screen composes three steps: build the typed-data payload from the intent, sign it through `WalletKitAdapter`, and POST the signed authorization to the backend proxy. Keeping each step in a dedicated module keeps the screen trivial, the pure function testable, and the TanStack Query hook consistent with the app's other `hooks/queries/` patterns.

## Scope

**NAMING CONFLICT — resolve first.** `services/nanopay/` already exists and holds `permit2/` and `siwe/` wallet-security tooling. Two options (engineer picks, document choice in PR):
- **Option A (preferred):** rename existing dir to `services/walletSecurity/` and update all imports; new Nanopay module lives at `services/nanopay/`.
- **Option B (lower risk):** nest new code under `services/nanopay/circle/` — existing permit2/siwe stays put.

Files to add (paths assume Option A; prefix with `circle/` for Option B):

1. `services/nanopay/buildAuthorization.ts` — pure: `(intent.nanopay: EvmNanopayPayload) => EIP712TypedData`. Mirrors the domain / types / message fields verbatim from §5.5 and §6.2. No side effects, no network.
2. `services/nanopay/buildAuthorization.test.ts` — unit tests for: EIP-712 domain echoes `intent.nanopay.domain` exactly; `validBefore ≥ now + 259_200` passthrough; 32-byte nonce passthrough; snapshot of typed-data shape.
3. `services/nanopay/submitAuthorization.ts` — `POST ${EXPO_PUBLIC_API_URL}/v1/pay/intents/:id/nanopay` with body `{ signature, payload }` per `NanopaySubmitRequest` (§6.2). Never POSTs to Circle directly.
4. `services/nanopay/usePaymentIntent.ts` — TanStack Query hook polling `GET /v1/pay/intents/:id` with `staleTime: 3_000`. Stops polling on terminal statuses (`SETTLED | PAID_OUT | FAILED | EXPIRED`).
5. `services/nanopay/index.ts` — barrel exports.

## Rules (non-negotiable)

- `submitAuthorization` always targets the `takumipay-api` proxy — `payload.submitTo` is informational; the request URL is derived from `EXPO_PUBLIC_API_URL`. Memory: `feedback_role_separation.md` (server never signs, mobile never blind-broadcasts).
- `buildAuthorization` is pure — no `Date.now()` drift, no env reads. Temporal fields come from `intent.nanopay.validAfter/validBefore`.
- `usePaymentIntent` uses the canonical auth/query-client conventions from `hooks/queries/` — do not fork a second query client.
- No chain-namespace switches in this module. The type guard on `NanopayPayload.kind === "evm_eip3009"` is the only discriminator; `svm_partial_tx` is handled by a sibling function in M6. Memory: `feedback_chain_extension_discipline.md`.

## Acceptance

- [ ] Naming-conflict resolution chosen and documented in the PR description.
- [ ] `buildAuthorization.test.ts` passes; covers domain parity, nonce, `validBefore` guard.
- [ ] `submitAuthorization` typed against `NanopaySubmitRequest` / `NanopaySubmitResponse`.
- [ ] `usePaymentIntent` polls with 3-s stale, halts on terminal status.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- `gatewayDeposit.ts` + `gatewayDeposit.test.ts` — onboarding one-time deposit; lives in M3 tasks 24–33.
- Screen wiring — task 18.
- Backend `/v1/pay/intents/:id/nanopay` handler — separate backend sibling PR.
