# Task 44 — `<PaymentError>` component + error-code copy table

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §9.1, cross-cutting (lands
with M1; extended row-by-row as M2–M4 wire in their error codes)

## Why this matters

Every error surface on scan→pay→settle today is a one-off `Alert.alert`
or inline toast. §9.1 collapses all 22 failure modes into a single
table with deterministic copy, primary CTA, and secondary fallback. A
single component that switches on `code` means i18n, A/B tests, and new
rows are one-file changes — and every row the user sees also emits a
telemetry event, so we get a funnel for free.

## Scope

1. Create `constants/paymentErrors.ts` exporting
   `PAYMENT_ERRORS: Record<PaymentErrorCode, PaymentErrorCopy>`. Cover
   all 22 codes from §9.1 verbatim: `QR_UNRECOGNIZED`, `QR_TAMPERED`,
   `MERCHANT_NOT_ONBOARDED`, `PAN_ALREADY_CLAIMED`, `QUOTE_EXPIRED`,
   `INSUFFICIENT_GATEWAY_BALANCE`, `REQUIRES_DEPOSIT`,
   `SIGNATURE_INVALID`, `NONCE_REUSED`, `AUTHORIZATION_EXPIRED`,
   `CIRCLE_UPSTREAM_ERROR`, `PAYMASTER_UNAVAILABLE`,
   `DEPOSIT_PENDING_ATTESTATION`, `DEPOSIT_FAILED`,
   `CHAIN_RPC_UNREACHABLE`, `WALLET_NAMESPACE_MISMATCH`,
   `XENDIT_PAYOUT_DECLINED`, `XENDIT_PAYOUT_LIMIT_EXCEEDED`,
   `INTENT_EXPIRED`, `SCAN_PERMISSION_DENIED`, `NETWORK_OFFLINE`.
2. Each `PaymentErrorCopy` entry carries `{ title, primaryCta,
   secondaryCta?, autoAction? }` plus i18n key `paymentErrors.<code>.*`
   so `i18next` swap-in is a later wiring task, not a rewrite.
3. Create `components/payment/PaymentError.tsx`. Props:
   `{ code: PaymentErrorCode; intentId?: string; merchantId?: string;
   onPrimary?: () => void; onSecondary?: () => void }`. Renders title +
   primary CTA button + optional secondary link per the copy row.
4. On mount, emit `payment_error_shown` telemetry with
   `{ code, intentId?, merchantId? }` exactly as §9.1 specifies. Use
   the existing analytics hook — no new provider.
5. Unit tests: snapshot one happy row + one silent row
   (`INTENT_EXPIRED`) + one auto-retry row (`QUOTE_EXPIRED`).

## Rules (non-negotiable)

- **Three-role separation** — the component never asks the user for
  bank creds, private keys, or raw Xendit/Circle tokens, regardless of
  which error fires.
- **Chain-extension discipline** — no `if (ns === "X")` branches; any
  namespace-specific error (e.g. `WALLET_NAMESPACE_MISMATCH`) routes
  via the existing adapter surface.
- **Filter at source** — error codes come from API / SDK boundaries
  already; the component never re-derives a code from a free-form
  string.
- **Copy lives in `constants/paymentErrors.ts` only.** The component is
  layout-only; never inline a user-facing string.

## Acceptance

- [ ] `constants/paymentErrors.ts` covers all 22 codes from §9.1.
- [ ] `components/payment/PaymentError.tsx` switches on `code`.
- [ ] Telemetry `payment_error_shown` fires with
      `{ code, intentId?, merchantId? }`.
- [ ] Snapshot tests pass.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Actual i18n catalog wiring (follow-up after base English copy lands).
- Error emission itself — each call site (tasks 07, 18, 24, 29, 34,
  36) imports and renders `<PaymentError>` with its own code.
- The `REFUNDED` intent state used by task 49.
