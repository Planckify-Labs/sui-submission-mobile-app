# Task 10 — Migrate modals to `ApprovalIntent`-shaped sheets

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §3 audit "Modals take raw EVM
params", §5 file layout, §6 Phase 1a item 5.

## Why this matters

Today `TransactionModal` accepts a raw `TEvmTxParams`, and
`WalletSelectorModal` is wired directly into the screen's queueing
state. Renderers in the new world consume only `ApprovalIntent` +
`onDecision`. Migrating modals means they can be reused from the agent
chat card (Phase 2) without parameter-shape gymnastics.

## Scope

Move and rename (don't duplicate):

- `components/dapps-browser/TransactionModal.tsx` →
  `components/dapps-browser/approvals/EvmTransactionSheet.tsx`.
  Props: `{intent: ApprovalIntent<EvmSendTxPayload>, onDecision}`.
  Wrap the body in `<ApprovalShell intent={intent}>`. Render
  decoded fields (initially raw hex — decoders land in tasks 21–22).
- `components/dapps-browser/SignMessageModal.tsx` →
  `components/dapps-browser/approvals/EvmSignMessageSheet.tsx`.
  Props: `{intent: ApprovalIntent<EvmSignMessagePayload |
  EvmSignTypedDataPayload>, onDecision}`. Branch internally on
  `payload.kind`. Wrap in `<ApprovalShell>`.
- `components/dapps-browser/WalletSelectorModal.tsx` →
  `components/dapps-browser/approvals/ConnectSheet.tsx`. Props:
  `{intent: ApprovalIntent<EvmConnectPayload>, onDecision}`.
  Decision `data` carries the chosen `walletIndex`.

Register all three in `components/dapps-browser/approvals/renderers.ts`:

```ts
export const evmRenderers: ApprovalRenderer[] = [
  { canHandle: i => i.namespace === "eip155" && i.kind === "connect",
    Component: ConnectSheet },
  { canHandle: i => i.namespace === "eip155" &&
    (i.kind === "signMessage" || i.kind === "signTypedData"),
    Component: EvmSignMessageSheet },
  { canHandle: i => i.namespace === "eip155" && i.kind === "sendTransaction",
    Component: EvmTransactionSheet },
];
```

Call `registerRenderer(...)` at bridge boot with each of them.

## Rules (non-negotiable)

- **Renderers are dumb.** No `viem`, no adapter imports, no store
  access beyond `useWallet` read selectors. Execution happens in
  `adapter.executeApproval` (task 08).
- **Decision flows back via `onDecision` only.** No callbacks, no
  `global`.
- **Visual parity.** Pre-refactor vs post-refactor screenshots should
  be identical for the three flows. Annotations banner is new but
  renders nothing today (no inspectors annotate by default — task 03's
  `HttpsInspector` only fires on `http://`).
- **Reject on hardware back.** Maintained from today.

## Acceptance

- [ ] Three new files exist under `components/dapps-browser/approvals/`.
- [ ] `renderers.ts` registers them.
- [ ] Old modal files deleted.
- [ ] QA matrix: connect → reject, connect → approve → wallet switch
      → approve, `personal_sign`, `eth_signTypedData_v4`,
      `eth_sendTransaction` → approve and reject paths. All
      behaviorally identical to pre-refactor.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Decoded Permit2/2612/SIWE rendering (tasks 21, 23).
- 5792 / 3085 / 3326 / 747 sheets (tasks 13–16).
