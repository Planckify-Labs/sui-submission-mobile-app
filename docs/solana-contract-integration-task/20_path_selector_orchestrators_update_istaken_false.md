# Task 20 — pathSelector + orchestrators: `sendAnchorInstruction` presence-check

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.5.

## Why this matters

The path selector currently gates onchain settlement on
`sendContractTransaction` (EVM-only). Solana wallets hit
`NoSuitablePayPathError` when the intent resolves to `"direct_arc"`.
This task adds `sendAnchorInstruction` as a second capability check
so Solana wallets can also take the `"onchain"` path — and wires the
orchestrator entry to dispatch between EVM and Solana implementations.

## Scope

### `pathSelector.ts` update

```typescript
// Current (EVM-only):
if (isOnchainSettlement(intent)) {
  if (typeof walletKit.sendContractTransaction !== "function") {
    throw new NoSuitablePayPathError(...);
  }
  return "onchain";
}

// Updated (EVM + Solana):
if (isOnchainSettlement(intent)) {
  if (
    typeof walletKit.sendContractTransaction !== "function" &&
    typeof walletKit.sendAnchorInstruction !== "function"
  ) {
    throw new NoSuitablePayPathError(...);
  }
  return "onchain";
}
```

The selector returns `"onchain"` without knowing which chain.

### Orchestrator wiring update

In the pay-merchant screen / agent tool site:

```typescript
const orchestrators: PathOrchestrators = {
  // ... existing entries ...
  onchain: () => {
    if (typeof walletKit.sendAnchorInstruction === "function") {
      return executeOnchainSettlementSvm({
        intent, wallet, walletKit, chain, programId
      });
    }
    return executeOnchainSettlement({
      intent, wallet, walletKit, chain, contractAddress
    });
  },
};
```

Presence-check docking — no namespace string. If `sendAnchorInstruction`
is defined (Solana), use the SVM path. Otherwise fall through to EVM.

### `programId` resolution

The orchestrator needs `programId` for the Solana path. Resolve from
`intent.programId` (populated by API in Task 13). Parse as `PublicKey`.

## Rules (non-negotiable)

- **Zero `if (namespace === "solana")` or `if (namespace === "evm")`.** The
  selector and orchestrator dispatch purely on method presence.
- **Existing EVM onchain path unchanged.** When `sendContractTransaction`
  is present, the existing `executeOnchainSettlement` runs as before.
- **Selector returns `"onchain"` — not `"onchain-evm"` or
  `"onchain-svm"`.** The rail name is chain-agnostic.

## Acceptance

- [ ] Solana wallet with `sendAnchorInstruction` resolves to `"onchain"`.
- [ ] EVM wallet with `sendContractTransaction` still resolves to
      `"onchain"`.
- [ ] Wallet with neither throws `NoSuitablePayPathError`.
- [ ] Orchestrator dispatches to `executeOnchainSettlementSvm` when
      `sendAnchorInstruction` is present.
- [ ] Orchestrator dispatches to `executeOnchainSettlement` when
      `sendContractTransaction` is present.
- [ ] No string "solana" or "evm" in selector or orchestrator code.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- `executeOnchainSettlementSvm` implementation (Task 19).
- `sendAnchorInstruction` implementation (Task 15).
- API intent creation (Task 13).
