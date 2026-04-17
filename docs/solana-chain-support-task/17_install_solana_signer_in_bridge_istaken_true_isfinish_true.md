# Task 17 — `installSolanaSigner` + `services/bridge/boot.ts` wiring

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-chain-support-spec.md` §3.2, §7.8, §8.

## Why this matters

`SolanaAdapter` has been in the bridge since v2.0 as a scaffold — its
`signMessage` / `signTransaction` / `signAndSendTransaction` paths call
whatever is handed to `registerSolanaSigner`, and no one has ever
called it. Wiring `installSolanaSigner` to the new `SolanaWalletKit`
(Task 12) is what makes in-WebView Solana dApps actually work. Bridge
path and mobile UI share the same kit — they cannot diverge.

## Scope

- `services/chains/solana/signer.ts`: `installSolanaSigner(deps)` per
  §7.8:
  - Resolve `const kit = walletKitRegistry.get("solana")` (single
    source of truth).
  - `signMessage(address, message)`:
    - Look up wallet via `deps.getWalletByAddress`.
    - `kit.getSignerForWallet(wallet)` → `KeyPairSigner | null`.
    - Encode message to bytes; call `signer.signMessages([{ content, signatures: {} }])`.
    - Return the signature as base58.
  - `signTransaction(address, txBase64)`:
    - Decode base64 via `codec.base64ToTransaction`.
    - `signer.signTransactions([tx])`; encode first result back to
      base64.
  - `signAndSendTransaction(address, txBase64, cluster)`:
    - Decode → sign.
    - Resolve RPC via `deps.getRpcForCluster(cluster)`.
    - If `rpcSubs` present, use `sendAndConfirmTransactionFactory`;
      otherwise fallback to `rpc.sendTransaction(getBase64EncodedWireTransaction(signed)).send()`.
    - Return `getSignatureFromTransaction(signed)`.
- `services/bridge/boot.ts`: call `installSolanaSigner` immediately
  after `createSolanaAdapter()`, with `deps` per §7.8 tail:
  - `getWalletByAddress`: pull from `opts.getContext().wallets`, match
    on `w.address === addr`.
  - `getRpcForCluster`: read `EXPO_PUBLIC_SOLANA_*_RPC` env per
    cluster, construct `createSolanaRpc(url)`. Subscriptions omitted
    this task (public RPCs rate-limit WS).

## Rules (non-negotiable)

- **Single kit source.** `installSolanaSigner` resolves the kit at
  install time, not per-request — mobile UI and bridge share the
  reference.
- **Address confusion is guarded at the adapter layer.** No need to
  re-filter namespace here; `SolanaAdapter.handleRequest` already
  scopes to Solana wallets (§8).
- **No WebSocket dependency.** v2.3 RPC fallback is the transaction-
  only path; the subscription path lights up when a user supplies a
  private RPC via `EXPO_PUBLIC_SOLANA_*_RPC_SUBSCRIPTIONS` (future).
- **No private material logged.** The bridge signer paths may log
  error messages in `__DEV__` but never log `message`, `txBase64`,
  signer internals.

## Acceptance

- [ ] A devnet Solana dApp in the in-app browser completes
      `connect()` + `signMessage` + `signAndSendTransaction` round-trip
      (§9.3 step 12).
- [ ] Disabling `installSolanaSigner` (temporary) makes
      `SolanaAdapter.executeApproval` return `code: -32603 "No Solana
      signer registered"` — regression test.
- [ ] EVM bridge flow unchanged — the `installSolanaSigner` call is
      additive.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Wallet Standard v1.1 announce semantics (N6 / F4).
- WalletConnect v2 Solana namespace negotiation (N7 / F5).
- SIWS for backend auth (F8).
