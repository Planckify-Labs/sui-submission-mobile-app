# EIP-7702 Delegator Allowlist — Spec

**Status:** Draft — needs decision before GA
**Owner:** Wallet team
**Spec reference:** `dapp-bridge-spec.md` §6 Phase 1c (task 27), §8 open question 3
**Code reference:** `services/chains/evm/EvmAdapter.ts:53` (`AUTHORIZED_DELEGATORS`)

---

## 1. What this decides

Which EIP-7702 delegator contracts the TakumiAI Wallet will co-sign
`signAuthorization` intents for. A delegator is the contract whose code an
EOA temporarily "sets" on itself via a 7702 authorization; while the
authorization is live, every call to the EOA runs the delegator's code
with the EOA's authority. A malicious delegator can drain the wallet.

Therefore: the wallet refuses to sign an authorization for a delegator
that isn't on a hardcoded allowlist. Changing the list is a release, not
a setting.

## 2. Why this matters

Once the wallet signs `signAuthorization(delegator, chainId, nonce)`, any
subsequent call to the EOA runs delegator code until the authorization
expires. Concretely the delegator controls:

- Token transfers (`transfer`, `transferFrom`, ERC-721/1155 variants).
- ERC-20 `approve` for any spender.
- Paymaster-aware batching (good) or unauthorized fee extraction (bad).
- `selfdestruct` on delegator-created sub-contracts.
- Any future call that hits the EOA.

The authorization signature itself is valid until its expiration — it
can't be revoked client-side once a dApp has it (§10.4 invariant 7,
extended). The wallet's only defense is refusing to sign it in the first
place.

## 3. Current state

- `AUTHORIZED_DELEGATORS` in `services/chains/evm/EvmAdapter.ts` contains
  only the zero address placeholder.
- `EvmAdapter.execSignAuthorization` rejects with `-32602` on any
  non-allowlisted delegator.
- The 7702 path is therefore dead code today. Task 27 shipped the
  plumbing; this spec is what unblocks it.

## 4. Decision required

Pick **one default** delegator to ship. Document the choice and the
audit report here.

### 4.1 Candidates

| Candidate | Maintainer | Audited by | Used in production by | Notes |
|---|---|---|---|---|
| MetaMask Delegator (`MetaMaskSmartAccount`) | MetaMask | [fill in] | MetaMask Smart Account | Widely reviewed; sets the UX baseline; MetaMask-branded. |
| Biconomy Nexus / `BaseAccount` | Biconomy | [fill in] | Biconomy SDK | Strong paymaster integration; modular architecture. |
| Coinbase Smart Wallet delegator | Coinbase | [fill in] | Coinbase Wallet | Coinbase-operated infra; well-tested on Base. |
| ZeroDev Kernel | ZeroDev | [fill in] | Rhinestone, several others | Modular; plugin ecosystem. |
| Self-deployed fork | us | us | — | Maximum control, maximum audit cost. |

### 4.2 Selection criteria (rank these)

- **Audit coverage.** At least one tier-1 firm (OpenZeppelin, Trail of
  Bits, Spearbit, ChainSecurity); prefer two independent audits.
- **Deployment footprint.** Is this address already deployed and
  battle-tested across multiple chains we plan to support (Ethereum,
  Base, Optimism, Arbitrum, Polygon)? Avoid chains where the
  contract is not deployed or is a different version.
- **Upgradeability posture.** Is the delegator itself immutable, or
  behind a proxy? An upgradeable delegator shifts trust to whoever
  holds the upgrade key. Prefer immutable; if proxied, the admin must
  be a credible multisig.
- **Functionality.** Does it support paymaster calls (needed for task
  28), ERC-4337 co-existence, atomic batch semantics our sheets
  assume?
- **Brand signal.** A delegator labeled "MetaMask" or "Coinbase" in
  block explorers is easier to explain in the sheet than a custom name.
- **Support.** If the contract has a bug, who patches it and how fast?

## 5. Format in code

Today `AUTHORIZED_DELEGATORS` is a flat `Set<string>` of lowercased
hex addresses. Two problems:

1. **Per-chain deployments differ.** The "same" delegator often has a
   different address on every chain. A flat set will both over-permit
   (address A on chain X matching a wallet attempt on chain Y) and
   under-permit (refusing a legitimate delegator on a chain we
   forgot to add).
2. **No metadata for the UI.** The `AuthorizationSheet` already wants
   a human-readable name and an "audited by" badge. Today it has
   neither.

Replace with:

```ts
// services/chains/evm/delegators.ts
export interface DelegatorEntry {
  name: string;                          // "MetaMask Smart Account"
  address: `0x${string}`;                // deployed address on this chain
  chainId: number;
  auditReports: string[];                // URLs — shown in the sheet
  immutable: boolean;                    // true = code cannot change
  proxyAdmin?: `0x${string}`;            // if !immutable
  notes?: string;                        // sheet footnote
}

export const DELEGATORS: DelegatorEntry[] = [ /* filled per decision */ ];

export function isAllowlistedDelegator(
  address: `0x${string}`,
  chainId: number,
): boolean {
  const a = address.toLowerCase();
  return DELEGATORS.some(
    (d) => d.chainId === chainId && d.address.toLowerCase() === a,
  );
}

export function getDelegator(
  address: `0x${string}`,
  chainId: number,
): DelegatorEntry | null { /* … */ }
```

Update:

- `EvmAdapter.execSignAuthorization` calls `isAllowlistedDelegator` instead
  of the flat set. Error message becomes
  `"Delegator {address} is not allowlisted on chain {chainId}"`.
- `AuthorizationSheet` renders the `DelegatorEntry` — name,
  `auditReports` as links, `notes` as a footnote, `immutable` badge.
- Sheet shows a **`danger`** annotation if `!immutable` and no
  `proxyAdmin` is a well-known multisig.

## 6. Per-chain coverage plan

Fill in addresses per chain we plan to support at GA. An empty cell
means 7702 delegation is unavailable on that chain until the row is
filled.

| Chain | ChainID | Delegator | Audit reference |
|---|---|---|---|
| Ethereum | 1 | TBD | |
| Base | 8453 | TBD | |
| Base Sepolia | 84532 | TBD | (test-only) |
| Optimism | 10 | TBD | |
| Arbitrum | 42161 | TBD | |
| Polygon | 137 | TBD | |

## 7. Change process

- Adding a new delegator requires: a link to the audit report, the
  deployer address, chainId, and approval from the security reviewer
  (`@bryanwahyukp95` or delegate).
- Removing a delegator must be a release — once removed, any authorization
  previously signed for it remains valid until it expires. There is no
  on-chain revoke-all; the best we can do is refuse to sign new ones
  and surface a settings entry that lists active authorizations.
- The list lives under `services/chains/evm/delegators.ts` and is
  reviewed at every tagged release.

## 8. Expiration policy

- Default authorization expiry: **24 hours** (task 27 spec).
- After expiry the wallet re-prompts, re-validating the delegator is
  still allowlisted at prompt time. A delegator removed from the list
  between prompts will fail the re-prompt — correct behavior.
- The sheet shows the expiration time in the user's local format.

## 9. Observability

Every `signAuthorization` emission writes a `BridgeEvent.intent` with
the delegator address + chain + expiry, redaction-safe. Telemetry later
can spot anomalous spikes (one chain, one delegator, many wallets) that
might indicate a compromise without revealing private data.

## 10. Open questions

1. **Fallback on audit revocation.** If a new disclosure retroactively
   invalidates a delegator, what do we tell users with active
   authorizations? Proposal: emergency release that removes the
   delegator and surfaces a "revoke via `authorizationNonce++`" action
   in settings.
2. **User-advanced paste.** Do we ever let power users paste an
   arbitrary delegator address via a hidden settings flag? Proposal:
   no for Phase 1c. Revisit only with a major UX disclaimer and a
   signed-typed-data confirmation.
3. **Per-origin policy.** Should some dApps be pre-approved for
   specific delegators? Proposal: no for GA. Single global list.
4. **Recovery signer interaction.** §6 Phase 1c last bullet: "Recovery
   signer intents are not allowed through this path." Confirm this
   spec still holds once 4337 + recovery ship; an authorization that
   could be used to bypass recovery should never be signed.

## 11. Acceptance (what "done" looks like)

- [ ] At least one delegator address filled for every chain listed in
      §6. Empty chains documented in release notes as "7702 unavailable
      on chain X at launch".
- [ ] Every entry has a non-empty `auditReports` URL.
- [ ] `AuthorizationSheet` renders name, audit links, immutable badge.
- [ ] Unit test: unknown chain → reject; unknown address → reject;
      known but expired → re-prompt; known and valid → pass.
- [ ] Security review sign-off on the chosen list before first store
      submission (§10.5 GA checklist).
