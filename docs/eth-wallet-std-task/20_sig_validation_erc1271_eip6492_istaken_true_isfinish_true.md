# Task 20 — `EvmAdapter.verifySignature` (ERC-1271 + EIP-6492)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1b bullet 9, §10.2
ERC-1271 / ERC-6492 rows.

## Why this matters

Our own backend auth (SIWE) and future partner dApps will validate
signatures from smart wallets (Safe, Argent, Biconomy). An EOA
`ecrecover` does not verify these — ERC-1271 requires calling
`isValidSignature(hash, signature)` on the signer contract, and
EIP-6492 handles the case where the smart wallet hasn't been deployed
yet (counterfactual). Without 1271/6492, SIWE login fails for any
smart-wallet user.

## Scope

- Add `EvmAdapter.verifySignature(params): Promise<boolean>`:
  ```ts
  type VerifyParams = {
    address: `0x${string}`;
    hash: `0x${string}`;
    signature: `0x${string}`;
    chainId: number;
  };
  ```
- Implementation order:
  1. Try `viem.verifyMessage` / `viem.verifyTypedData` (ECDSA recover).
  2. If that fails or the address isn't a contract in the deployed
     sense (bytecode length 0 — counterfactual):
     a. Check EIP-6492 wrapper — last 32 bytes of signature ==
        `0x6492…` magic. Unwrap to `(factory, factoryCalldata,
        innerSig)`.
     b. Simulate factory deploy + `isValidSignature(hash, innerSig)`
        via `eth_call` with state override (viem `verifyMessage`
        already supports this).
  3. Otherwise call `isValidSignature(hash, signature)` on the
     deployed contract via `eth_call`.
- Expose the function to the SIWE flow (currently in `api/` / auth
  hooks). Backend can also use the adapter's public client for the
  same check if needed — but the adapter is the single source of
  truth client-side.
- Add a `data: {signatureScheme: "ecdsa" | "erc1271" | "eip6492"}`
  field to the SIWE intent annotation so `EvmSignMessageSheet` can
  tell the user "this signs as a smart wallet" before they approve.

## Rules (non-negotiable)

- **Never throw on invalid sig.** Return `false`. Errors in `eth_call`
  → return `false` + log.
- **No trust of `chainId` alone.** The SIWE message itself specifies
  chainId; the adapter must resolve against that chain, not the
  active one.
- **Counterfactual path requires state override support.** If the RPC
  doesn't support `eth_call` with state overrides, fall back to
  "best-effort" verification and annotate `warn`.

## Acceptance

- [ ] `verifySignature` returns true for a valid EOA signature.
- [ ] Returns true for a Safe smart-wallet ERC-1271 signature on
      Optimism.
- [ ] Returns true for an EIP-6492 wrapped signature from a
      not-yet-deployed counterfactual wallet (tested against a known
      factory pattern).
- [ ] Returns false cleanly for malformed sigs.
- [ ] SIWE login via Safe app works end-to-end.
- [ ] Unit tests per signature type.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Issuing 1271 signatures from our own smart wallets (task 26
  handles smart-wallet signing).
