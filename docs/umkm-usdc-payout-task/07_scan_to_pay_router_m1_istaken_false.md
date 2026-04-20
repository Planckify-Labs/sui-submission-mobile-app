# Task 07 — Refactor `scan-to-pay.tsx` to route via `classify()`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §4.6 (entire section), milestone M1

## Why this matters

`app/scan-to-pay.tsx:29-62` handles two things today: strip
`ethereum:` / `solana:` prefixes and regex-match addresses. It throws
away `@chainId` hints, never touches `activeChain`, and has no seam
for EMVCo / TakumiPay JWS / x402 payloads. The spec's refactor
collapses all of that behind `classify()` and adds a new
`useWallet.switchToScannedTarget(target)` helper so a user scanning a
Solana address while on Ethereum lands on a correct `/send` — the bug
the spec explicitly calls out at §4.6's last paragraph.

## Scope

1. In `app/scan-to-pay.tsx:handleBarCodeScanned`, replace the
   address-regex block with
   `const intent = await classify(result.data.trim(), { source: "qr" });`.
2. On `intent === null`: keep the current "unrecognized QR" error
   path but surface it as a visible toast (new or existing toast
   utility — don't block on new infra; `console.error` is already
   in place).
3. Switch on `intent.channel.kind`:
   - `"wallet"` → `await switchToScannedTarget(intent.channel)` then
     `router.replace("/send", { recipientAddress, amount, token })`.
   - `"merchant"` → `router.replace("/pay-merchant", { intent:
     JSON.stringify(intent) })` (the stub screen in task 08 parses
     it back).
   - `"x402"` → same `/pay-merchant` route.
4. Add `switchToScannedTarget(target: PayChannel & { kind: "wallet" })`
   to `hooks/useWallet.ts`. It must:
   - Be a `useWallet` helper, **not** a new `WalletKitAdapter`
     method (activation is wallet-app state, not chain protocol —
     §4.6 final paragraph).
   - Resolve the destination `ChainConfig` from `supportedChains`
     (EVM, see `constants/configs/chainConfig.ts:68`) or the
     Solana cluster table when `target?.namespace === "solana"`.
   - If `activeWallet.namespace` matches target namespace: call
     `setActiveChain(config)`.
   - Otherwise: `setActiveWallet(indexOfFirstWalletInTargetNamespace)`
     **then** `setActiveChain(config)` — mirroring the
     namespace-align pattern at `app/wallet.tsx:68-85`.
   - If `target` is `undefined` (raw-address scan): keep the
     current `activeChain` but still align to the correct namespace.
5. Gate the whole `handleBarCodeScanned` so it awaits the
   classifier without freezing the camera if the scan fails —
   `setScanned(false)` in the finally branch.

## Rules (non-negotiable)

- **Chain-extension discipline** (memory
  `feedback_chain_extension_discipline.md`) — no
  `if (namespace === "solana")` / `"eip155"` branches in
  `scan-to-pay.tsx`. All namespace divergence lives inside
  `switchToScannedTarget`.
- **Three-role separation** (memory `feedback_role_separation.md`) —
  the scanner only classifies and routes. It never signs, never
  mutates server state.
- **`source: "qr"` is always passed.** Pasted deep-links that route
  here in a future task must pass the appropriate source — do not
  default inside the scanner to something permissive.
- **Do not regress the today-works path.** EVM `0x…` and raw
  Solana base58 scans continue to land on `/send` with the correct
  active chain.

## Acceptance

- [ ] `handleBarCodeScanned` calls `classify()` and dispatches on
      `channel.kind`.
- [ ] `useWallet.switchToScannedTarget` exists and handles all
      three target cases (matching ns, differing ns, `undefined`).
- [ ] Manual regression: scan a Solana address while on Arc →
      wallet + chain switch, `/send` renders with the Solana
      wallet active.
- [ ] Manual regression: scan a QRIS sticker → routes to
      `/pay-merchant` with the parsed intent.
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` passes.

## Out of scope

- `/pay-merchant` UI beyond the stub (task 08).
- `/send` screen param handling for `amount` / `token` (these
  params already flow through `router.replace`; send-screen
  consumption is existing behavior).
- Chain-config DB wiring for Arc Testnet — task 15 (M2).
