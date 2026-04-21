# Task 15 — EIP-3009 Signer Adapter (`signTransferWithAuthorization`)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.5, milestone M2

## Why this matters

Circle Nanopayments is the primary gasless rail for merchant scan-to-pay. The wallet must produce an EIP-3009 `TransferWithAuthorization` signature; without this adapter method the mobile app cannot participate in Path B at all. The signer path is identical to every other `signTypedData` call the app already makes — no new crypto primitives, no new keystore access — just a new typed-data shape.

## Scope

1. Extend `WalletKitAdapter` in `services/walletKit/types.ts:66` with the optional `signTransferWithAuthorization` method (full signature per §5.5).
2. Implement it on `EvmWalletKit` — route through the existing `signTypedData` primitive; zero new keystore access patterns.
3. Leave it `undefined` on `SolanaWalletKit` (M6 slot reserved via `signX402SvmPayment`, defined in same commit if convenient).
4. EIP-712 domain MUST point at Circle's `GatewayWallet` contract (`verifyingContract`, `domainName`, `domainVersion`) — pulled from `PaymentIntent.nanopay.domain`. Do NOT sign against the USDC contract's domain.
5. `validBefore` guard: reject if `< now + 259_200` (3 days). Throw a typed error the screen maps to UX.
6. Unit test `services/walletKit/evm/signTransferWithAuthorization.test.ts` covering: typed-data shape parity with Circle's fixture, `validBefore` guard, and signature length === 65 bytes.

## Rules (non-negotiable)

- Adapter signs only. Never submits. Broadcast is the caller's job via `submitAuthorization` (task 17). Memory: `feedback_role_separation.md`.
- No `if (namespace === "solana")` branches in shared code. Solana kit leaves the method `undefined`; consumers presence-check. Memory: `feedback_chain_extension_discipline.md`.
- Domain fields (`name`, `version`, `verifyingContract`, `usdc asset`, `gatewayWallet`) come from the backend `PaymentIntent.nanopay` — never hardcoded, never from env.
- Private key stays in `expo-secure-store`. Signing goes through the existing adapter path; no raw-key export.

## Acceptance

- [ ] `signTransferWithAuthorization` appears on `WalletKitAdapter` interface with the full args shape from §5.5.
- [ ] `EvmWalletKit` implementation returns `0x`-prefixed 65-byte signature.
- [ ] `signTransferWithAuthorization.test.ts` passes.
- [ ] `SolanaWalletKit.signTransferWithAuthorization` is `undefined` (presence-of-method check works at call site).
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- `signX402SvmPayment` implementation body — adapter slot only; task 43 (M6) implements Solana x402.
- Building the typed-data payload — task 17 (`buildAuthorization.ts`).
- Submitting to backend proxy — task 17 (`submitAuthorization.ts`).
- Wiring into the pay-merchant screen — task 18.
- `sendUserOpWithUsdcPaymaster` (onboarding-deposit gasless path) — deferred to M3 (onboarding tasks 24–33).
