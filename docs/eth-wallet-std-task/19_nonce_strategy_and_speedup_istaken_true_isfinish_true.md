# Task 19 — Nonce strategy + speed up / cancel

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1b bullet 8.

## Why this matters

Users routinely get stuck when a low-gas tx is pending for hours, or
when they submit two txs in quick succession and nonces collide. Every
mature wallet offers "speed up" (replace with higher fee) and "cancel"
(replace with self-send). Without it, support tickets pile up.

## Scope

- Create `services/bridge/nonceTracker.ts`:
  - Keyed by `(walletAddress, chainId)`.
  - Tracks: `{nextNonce, pendingByNonce: Map<number, {hash, submittedAt}>}`.
  - `reserveNonce()` → claims + returns.
  - `markConfirmed(nonce, hash)`.
  - `markFailed(nonce)`.
  - `detectStuck(now)` → returns nonces where `now - submittedAt > 60s`
    and the tx hasn't mined.
- `EvmAdapter.executeApproval` for `sendTransaction` uses `reserveNonce`
  when the dApp didn't specify one.
- Poll `detectStuck` every 15s while the app is foreground; surface
  stuck txs in a new `components/dapps-browser/approvals/StuckTxCard.tsx`
  — not a pending `ApprovalIntent`, but a banner in the tx-history
  screen with two buttons:
  - **Speed up** → prompt sign of a new tx: `nonce = stuck.nonce`,
    `maxFeePerGas = stuck.maxFeePerGas * 1.5`, same `to/value/data`.
  - **Cancel** → prompt sign of: `nonce = stuck.nonce`, `to = self`,
    `value = 0`, `data = 0x`, `maxFeePerGas = stuck.maxFeePerGas * 1.5`.
- Both speed-up and cancel are regular `ApprovalIntent<EvmSendTxPayload>`
  with an extra `annotations: [{code: "tx.replace", severity: "info",
  title: "Replaces pending tx …"}]` attached.

## Rules (non-negotiable)

- **Gas bump is ≥10%.** Most nodes enforce this; we use 50% for UX
  headroom. Below 10% gets rejected by the mempool.
- **Same nonce required.** Speed up and cancel set `nonce` explicitly;
  without it the replacement is a brand-new tx.
- **Idempotent detection.** `detectStuck` returning the same nonce
  twice in a row must not double-notify.
- **No auto-speed-up.** Always user-initiated. Auto-bumping is a
  footgun (silent overpayment).
- **Cancel is a self-send, not a voided tx.** There is no "void a
  signed tx" in Ethereum; we replace with a zero-value self-send.

## Acceptance

- [ ] Submitting two txs in quick succession allocates correct
      sequential nonces; no collision.
- [ ] Simulating a stuck tx (fee too low) surfaces the banner within
      ~60s; speed-up and cancel both work end-to-end on a testnet.
- [ ] Nonce tracker persists across app relaunch (still tracks stuck
      txs).
- [ ] Unit tests for `reserveNonce`, `markConfirmed`, `detectStuck`
      idempotency.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Auto-cancel on app exit.
- Batch replace (one ApprovalIntent for multiple stuck txs).
