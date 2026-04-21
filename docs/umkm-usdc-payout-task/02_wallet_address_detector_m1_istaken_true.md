# Task 02 — Wallet-address detector (EVM + Solana)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.3 #4 & #5, §4.2 `PayChannel.kind: "wallet"`, milestone M1

## Why this matters

Raw wallet addresses (EVM `0x…` and Solana base58) are the
lowest-priority payload the scanner recognizes — anything more
structured (TakumiPay JWS, x402, EMVCo, URI scheme) wins first. This
detector preserves the existing `app/scan-to-pay.tsx:29-62` behavior
inside the new registry so the refactor in task 07 is a pure swap, not
a feature regression.

## Scope

1. Create `services/paymentIntent/detectors/walletAddress.ts`
   exporting `walletAddressDetector: Detector`.
2. Detect EVM via the regex `^0x[0-9a-fA-F]{40}$` against the trimmed
   input. On match, return a `wallet` channel with
   `namespace: "eip155"`, `address` set, and `target: undefined`
   (raw-address scans carry no chain hint — the scanner keeps the
   current EVM `activeChain`, per §4.2 comment).
3. Detect Solana via `isValidSolanaAddress(raw)` from
   `@/utils/walletUtils`. On match, return a `wallet` channel with
   `namespace: "solana"`, `address` set, `target: undefined`.
4. Assign this detector **the highest priority number** in the
   registry (runs last) so URI / JWS / EMVCo detectors always win on
   payloads that carry more structure.
5. Register it in the boot file (`services/paymentIntent/index.ts`
   or a dedicated `bootDetectors.ts`).
6. Add `services/paymentIntent/detectors/walletAddress.test.ts`
   covering: valid EVM, valid Solana, bogus hex length, bogus base58,
   and leading/trailing whitespace.

## Rules (non-negotiable)

- **Chain-extension discipline** (memory
  `feedback_chain_extension_discipline.md`) — do not branch on
  namespace elsewhere; this detector is the sole place the two
  address shapes are tested.
- **No `ethereum:` / `solana:` prefix stripping here.** URI shapes
  belong to the wallet-URI detector (task 03); this one only matches
  bare addresses so priority ordering stays clean.
- **Pure function.** No network, no React, no `viem.getAddress`
  normalization — return the raw address as-is so the `/send` screen's
  own normalization stays the single authority.

## Acceptance

- [ ] `walletAddress.ts` + test file exist.
- [ ] Detector priority places it below every structured detector.
- [ ] Test covers EVM, Solana, and negative cases.
- [ ] Detector is registered at boot.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Wallet URI decoding (`ethereum:…@chainId`, `solana:…?cluster=…`) —
  task 03.
- Auto-switching `activeChain` on scan — lives on
  `useWallet.switchToScannedTarget(target)` (task 07).
- `/send` screen changes.
