# Task 04 — CI step: IDL hash-compare sync check

**Status:** Not taken
**Owner:** Shared / CI
**Spec reference:** `solana-contract-integration-spec.md` §3.3, §7.3.

## Why this matters

Three copies of the Anchor IDL exist: the canonical
`contract/solana/target/idl/takumi_pay.json`, the mobile copy at
`mobile-app/services/chains/solana/takumiPay/idl.ts`, and the API copy
at `api/src/blockchain-verification/solana/takumi-pay/idl.ts`. If any
diverge after an `anchor build`, TypeScript types silently mismatch
the on-chain program — runtime deserialization errors instead of
compile-time catches. This CI step makes divergence a blocking failure.

## Scope

- CI workflow step (GitHub Actions or equivalent) that:
  1. Extracts the JSON content from the canonical
     `contract/solana/target/idl/takumi_pay.json`.
  2. Extracts the JSON content from the `const` export in each
     project's `idl.ts` file.
  3. Computes SHA-256 hashes of all three.
  4. Fails if any hash differs.
- The check should run on every PR that touches:
  - `contract/solana/` (program changes)
  - `mobile-app/services/chains/solana/takumiPay/` (mobile types)
  - `api/src/blockchain-verification/solana/takumi-pay/` (API types)
- Clear error message: "IDL copies out of sync — run `anchor build`
  and copy the IDL to both projects."

## Rules (non-negotiable)

- **Hash comparison, not string diff.** JSON formatting differences
  should not cause false failures — parse and re-serialize with
  stable key order before hashing.
- **Fail-closed.** If the canonical IDL file doesn't exist (contract
  not built), the check should fail — not skip.
- **No auto-copy.** CI detects drift; engineers fix it. Automated
  copy risks masking intentional divergence during development.

## Acceptance

- [ ] CI step exists and runs on relevant path changes.
- [ ] Intentionally diverging one IDL copy causes CI failure.
- [ ] All three copies in sync passes CI.
- [ ] Error message is actionable.

## Out of scope

- Creating the IDL copies (Tasks 01/02/03).
- Automated IDL copy scripts.
