# Task 12 — `SolanaWalletKit` implementation

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §4.5, §6.1, §7.6.

## Why this matters

This task binds the Solana primitives (Tasks 07–11) behind the
`WalletKitAdapter` interface (Task 04) so screens, onboarding sheets,
and the bridge signer can all dispatch through one seam. When this
lands, `walletKitRegistry.get("solana")` returns a functional kit and
the rest of the feature becomes wire-up.

## Scope

- `services/walletKit/solana/SolanaWalletKit.ts`: `createSolanaWalletKit()`
  factory per §7.6 pulling together:
  - `validateAddress`, `validatePrivateKey`, `validateMnemonic` → Task
    09 helpers + `@scure/bip39`.
  - `createWalletFromPrivateKey` / `createWalletFromMnemonic` → Task 09
    helpers.
  - `generateMnemonic` → `generateWalletMnemonic` (shared BIP-39 via
    `walletService`).
  - `getSignerForWallet` → `getSolanaSignerForWallet` (Task 10).
  - `getNativeBalance` → `getSolanaBalance(createSolanaRpc(chain.rpcUrl), address)`.
  - `sendNativeTransfer` → reconstruct signer + call
    `buildAndSendSolTransfer`.
  - `estimateMaxTransferable` → `balance - FEE_RESERVE_LAMPORTS`
    (`5_000n + 890_880n`).
  - `formatNativeAmount` → `(n / 1_000_000_000).toFixed(4) + " SOL"`.
  - `parseNativeAmount` → `BigInt(Math.round(float * 1_000_000_000))`.
  - `truncateAddress` → start/end slice like EVM kit.
  - `supportsTokenTransfer: () => false` (SPL deferred, F6).
  - `displayName: () => "Solana"`, `iconUrl` optional.
- Narrow every `ChainConfig`-accepting method to `namespace === "solana"`
  at entry; throw `"expected solana chain"` on mismatch.
- Update `services/walletKit/boot.ts` — add the second `register` call:
  `walletKitRegistry.register(createSolanaWalletKit())`.
- `services/walletKit/solana/SolanaWalletKit.test.ts` — kit round-trip
  with a fixture keypair:
  - `createWalletFromMnemonic` → address matches Task 07 golden vector.
  - `getNativeBalance` against a mocked RPC returns expected `bigint`.
  - `sendNativeTransfer` against mocked RPC returns signature `string`.

## Rules (non-negotiable)

- **No signing path outside `walletService`.** `sendNativeTransfer`
  calls `getSolanaSignerForWallet` — it does not reconstruct a signer
  itself.
- **Narrow, don't cast.** At each method entry, use
  `if (chain.namespace !== "solana") throw …` — never `as any`.
- **Fee reserve is a named constant.** `FEE_RESERVE_LAMPORTS` documents
  5,000 signature-fee lamports + 890,880 rent-exempt buffer. Magic
  numbers in the kit body are rejected in review.
- **No display coupling to mnemonic.** `generateMnemonic` delegates to
  the shared `generateWalletMnemonic` — BIP-39 entropy is not kit-
  specific.

## Acceptance

- [ ] `createSolanaWalletKit()` exported and registered at boot.
- [ ] After boot, `walletKitRegistry.get("solana")` returns a kit whose
      methods round-trip the fixture wallet.
- [ ] Unit tests cover create / balance / send / estimate / format.
- [ ] `pnpm check:syntax` passes; `pnpm run test` passes.

## Out of scope

- Screens consuming the kit (Tasks 13–16).
- Bridge signer (Task 17).
