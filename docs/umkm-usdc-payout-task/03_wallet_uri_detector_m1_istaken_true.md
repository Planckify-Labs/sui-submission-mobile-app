# Task 03 — Wallet-URI detector (EIP-681 + Solana Pay)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.3 #4, §4.2 `PayChannel.target`, milestone M1

## Why this matters

When a QR carries a `ethereum:0x…@137` or `solana:<pubkey>?cluster=…`
payload, the classifier must extract the target chain so the scanner
can pre-switch `activeChain` before routing to `/send`. Today's scanner
strips the scheme and throws away the `@chainId` / `?cluster` — a user
scanning a Polygon URL while on Arc lands on a broken send screen.
This detector fixes that at the source.

## Scope

1. Create `services/paymentIntent/detectors/walletUri.ts` exporting
   `walletUriDetector: Detector`.
2. Handle EIP-681: `ethereum:<address>(@<chainId>)?` with optional
   `?value=<wei>` / `?uint256=<units>` / `/transfer?address=<to>&uint256=<amt>`
   params for ERC-20 transfers. Parse `chainId` into a number; populate
   `target: { namespace: "eip155", chainId }`. Populate `amount` when a
   value/uint256 param is present. Populate `token` when the URI's path
   contains an ERC-20 `/transfer` call with an `address` segment.
3. Handle Solana Pay: `solana:<address>(?cluster=mainnet-beta|devnet)`
   with optional `amount`, `spl-token`. Populate
   `target: { namespace: "solana", cluster }` (default `mainnet-beta`
   when omitted). Populate `amount` and `token` from query params when
   present.
4. Priority **below** TakumiPay JWS (task 05), x402 (task 06), EMVCo
   (task 04), **above** the raw wallet-address detector (task 02).
5. Register in the boot file.
6. Add `walletUri.test.ts` covering: EIP-681 with chainId, EIP-681
   without chainId, ERC-20 transfer variant, Solana with cluster,
   Solana with SPL token, malformed URIs that should return `null`.

## Rules (non-negotiable)

- **Chain-extension discipline** (memory
  `feedback_chain_extension_discipline.md`) — the two scheme branches
  live inside this detector and only this detector. No caller touches
  `ethereum:` / `solana:` prefix parsing.
- **`target` is authoritative.** When the URI carries a chain hint,
  the detector emits it; consumers (task 07 router) switch on `target`,
  never re-parse the URI.
- **Never fetch anything.** Pure function; RPC resolution of token
  metadata is the send screen's job.
- **`amount` is `bigint`** per the `PayChannel` type — decode
  wei/uint256 as decimal/hex `BigInt`, not `Number`.

## Acceptance

- [ ] `walletUri.ts` + test file exist.
- [ ] Both schemes parse correctly with and without chain hints.
- [ ] Priority ordering: below structured detectors, above
      `walletAddress`.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- Consuming `target` to switch wallets — task 07 (`switchToScannedTarget`).
- QRIS / EMVCo parsing — task 04.
- Validating that `token` exists on the target chain — send screen's
  existing token-resolution path handles it.
