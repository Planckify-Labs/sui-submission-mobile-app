# Task 27 — EIP-7702 delegation + `signAuthorization` intent

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1c bullet 3, §8
open question 3 (default delegator), §10.2 EIP-7702.

## Why this matters

EIP-7702 lets a regular EOA temporarily run smart-account code (via
`set-code` authorization) so a user keeps their existing address
*and* gains atomic batching + paymaster support. It's the
"no-migration" path to modern wallet UX and went live on mainnet
with Pectra (May 2025).

## Scope

- New `ApprovalKind: "signAuthorization"` + payload:
  ```ts
  export type EvmAuthorizationPayload = {
    delegator: `0x${string}`;  // contract code to set
    chainId: number;
    nonce: number;
    expiresAt?: number;         // optional app-side expiry hint
  };
  ```
- `EvmAdapter.handleRequest` exposes an internal `requireAuthorization`
  helper (not a dApp-callable RPC — it's called from our own
  `executeApproval` for `sendCalls` when the active wallet is EOA
  and the dApp or user opted into 7702 batching):
  - If the EOA already has a valid authorization for this `(chainId,
    delegator)` and `nonce` still matches, skip prompting.
  - Else build a `signAuthorization` intent.
- Renderer: new
  `components/dapps-browser/approvals/AuthorizationSheet.tsx`:
  - `<ApprovalShell>`.
  - Large disclosure: "This grants `{delegator short name}` permission
    to run code on your behalf until `{expiresAt}`. You keep your
    address and funds."
  - Shows the delegator contract address + link to explorer +
    "audited by" badge pulled from a static allowlist (Biconomy's
    BaseAccount, MetaMask delegator — §8 open question 3 picks the
    default).
  - Warn banner if the delegator isn't in the allowlist.
- `executeApproval` for `signAuthorization`:
  - viem's `signAuthorization` on the EOA's private key.
  - Persist the signed auth under `TWallet.authorizationByChain[chainId]`
    (per task 25's Smart7702 field; applies equally to a regular EOA
    that opts in for one batch).
- Update `sendCalls` execution (task 16) to splice a signed
  authorization into the tx when the wallet is EOA + 7702-opted-in.
- `wallet_getCapabilities` reports `atomicBatch.supported: true` for
  EOAs with a valid, non-expired authorization.

## Rules (non-negotiable)

- **Delegator allowlist is app-level config.** Users cannot paste
  arbitrary delegator addresses in Phase 1c. A settings-level
  "advanced" entry may relax this later.
- **Authorization is per-chain.** Re-prompt on chain switch.
- **Re-prompt on nonce change.** A used authorization is dead; a
  new batch needs a fresh auth signed with the current nonce.
- **Expiration is enforced.** Default 24h if the dApp/user doesn't
  set one. After expiry, re-prompt.
- **Recovery signer intents are not allowed through this path.**
  See §6 Phase 1c last bullet (guardrail).

## Acceptance

- [ ] Opting an EOA into 7702 delegation via `sendCalls` produces
      one `AuthorizationSheet` prompt, followed by the batch
      execution in a single tx.
- [ ] A second batch within the authorization window does not
      re-prompt.
- [ ] After 24h, the next batch re-prompts.
- [ ] Authorization for a non-allowlisted delegator is blocked with
      a clear warn.
- [ ] Unit tests for allowlist gating, expiry, nonce re-prompt.
- [ ] `pnpm check:syntax` passes.

## Out of scope

- Revoking an authorization before expiry (covered in settings; may
  be its own task later).
- Automatic renewal before expiry without user confirmation (user
  always confirms).
