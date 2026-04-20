# Task 18 — Wire `app/pay-merchant.tsx` for Path B-EVM Happy Path

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.5 "Happy-path wiring," §2 steps 6–7, §6.2, milestone M2

## Why this matters

This is the screen the user lands on after a scan. It composes everything M2 ships: intent creation, typed-data build, EIP-3009 sign, proxy submit, status poll. The target UX is sub-500 ms "PAID" after the user confirms — that's what makes scan-to-pay feel native, not crypto-ish. The screen is also the deep-link target for agent-mode intents (§8.5 #1), so it must treat `intentId` as the source of truth.

## Scope

1. `app/pay-merchant.tsx` accepts `intentId` as its primary route param (not raw QR payload). If absent, fall back to `merchant + amountMinor + currency` that triggers `api.createIntent`.
2. Happy-path sequence:
   ```ts
   const intent  = await api.createIntent({ merchant, amountMinor, currency: "IDR" });
   const payload = buildAuthorization(intent.nanopay);             // task 17, pure
   const sig     = await kit.signTransferWithAuthorization(payload); // task 15, sign only
   const result  = await submitAuthorization(intent.id, { signature: sig, payload }); // task 17
   // result.status === "SETTLED" within <500 ms
   ```
3. UI elements:
   - Merchant `displayName` (from `intent.merchant.displayName`).
   - Local-fiat amount as source of truth (IDR; `intent.fiat.amountMinor` formatted).
   - USDC cost (`intent.usdc.amountMicros` formatted) displayed as a derived secondary value.
   - PIN / biometric prompt reusing the existing sign-typed-data UX.
   - Terminal state: big green "PAID" with merchant name; auto-dismiss timer.
4. Path selector integration (§5.6): if `activeWallet.namespace !== "eip155"`, render the "Switch to EVM wallet" / "Top up USDC" sheet instead of signing. Presence-of-method check on `kit.signTransferWithAuthorization` — no `if (ns === "X")`.
5. Error surfaces: map `NanopayFailureCode` (§6.2) + `NanopayFailureCode`-adjacent errors to the `PaymentError` component keyed by §9.1 codes.

## Rules (non-negotiable)

- User approves IDR, not USDC micros. Fiat amount is the source of truth shown in the sign prompt. Memory / spec §9 FX-manipulation rule.
- Three-role separation: server creates the intent (thinking), wallet signs (execute), user confirms with PIN (request). Screen never forwards unsigned intent to Circle directly. Memory: `feedback_role_separation.md`.
- No `if (namespace === …)` branches — namespace detection is presence-of-method on the adapter. Memory: `feedback_chain_extension_discipline.md`.
- `intentId` is the canonical deep-link key; agent mode reuses this screen (§8.5).
- Clipboard hygiene (§9): never copy intent id or merchant token to clipboard.

## Acceptance

- [ ] Screen opens from scanner and from deep-link `?intentId=pi_…` and renders identically.
- [ ] Happy path completes in <500 ms median after sign (measured against local/testnet backend).
- [ ] Non-EVM active wallet shows the switch/top-up sheet; no sign attempted.
- [ ] Error states route through `components/payment/PaymentError.tsx` (task 44 delivers the component; stub until then).
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- `PaymentError` component implementation — task 44 error matrix.
- Path A (direct on Arc) and Path C (raw x402) wiring — tasks 34–38 (M4) and beyond.
- Onboarding deposit flow (`requires_deposit: true`) — tasks 24–33 (M3).
- Agent-mode `<PaymentIntentCard>` renderer — task 46.
- i18n — strings live in `constants/paymentErrors.ts` per §9.1; copy baseline is English.
