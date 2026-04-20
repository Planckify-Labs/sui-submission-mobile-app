# Task 42 — SVM x402 Signer (`signX402SvmPayment`)

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** umkm-usdc-payout-spec.md §5.2.1 Path B-SVM wire format, §5.5 adapter signature, §12 Q7 RFC tracking, milestone M6

## Why this matters

Solana carries one of the largest USDC footprints outside Ethereum. M2 reserved the `signX402SvmPayment` slot on `WalletKitAdapter` (left `undefined` on all kits) so M6 is one adapter implementation, not a refactor. Once this ships, a Solana-native payer scans the same UMKM QR as an EVM payer and pays without switching wallets — the `/pay-merchant` screen and the path selector (task 41) stay unchanged because dispatch is presence-of-method.

## Scope

1. Implement `signX402SvmPayment` on `SolanaWalletKit` at `services/walletKit/solana/` per the §5.5 signature:
   ```ts
   signX402SvmPayment({ wallet, cluster: "mainnet-beta" | "devnet", transaction: string }): Promise<string>
   ```
2. Input: a base64-encoded versioned Solana transaction pre-built by the backend (§5.2.1). Instructions in order:
   - `ComputeBudget.SetComputeUnitLimit` (instruction 0)
   - `ComputeBudget.SetComputeUnitPrice` (instruction 1)
   - SPL Token (or Token-2022) `TransferChecked` — the actual USDC transfer
   - *(optional)* SPL Memo program with `pi_<intentId>` for off-chain correlation
3. The transaction comes partially signed — `feePayer` is the facilitator's pubkey (§5.2.1). The wallet adds the user's signature over the transaction message bytes; the facilitator later adds `feePayer` signature and submits.
4. Return the updated base64 transaction with the user's signature attached. Never broadcast. Never add SOL-paying signatures. Never rewrite instructions.
5. `EvmWalletKit.signX402SvmPayment` stays `undefined` — consumers presence-check (path selector, task 41, already does).
6. Unit-test `services/walletKit/solana/signX402SvmPayment.test.ts` covering: signature attaches to the correct slot, fee-payer signature placeholder untouched, instruction array untouched, cluster mismatch rejected with a typed error.

## Rules (non-negotiable)

- Adapter signs only. Submission is the backend's job via the SVM facilitator proxy (task 43). Never POSTs from the mobile adapter. Memory: `feedback_role_separation.md`.
- No `if (namespace === "solana")` branches in shared code. EVM kits leave the method `undefined`; callers presence-check. This is the chain-extension discipline in action — M6's entire integration rides on filling one adapter slot. Memory: `feedback_chain_extension_discipline.md`.
- Private key stays in `expo-secure-store`. Signing uses the existing Solana keystore primitive already present in `SolanaWalletKit` — no raw-key export.
- Do **not** mutate the instruction list. The facilitator already expects the instructions verbatim per §5.2.1 wire format. Rewriting invalidates the scheme.
- Track the SVM-scheme RFC (`github.com/coinbase/x402/issues/646` per §12 Q7) — if the RFC resolves with breaking changes before M6 ships, re-spec before coding.

## Acceptance

- [ ] `signX402SvmPayment` implemented on `SolanaWalletKit`.
- [ ] `EvmWalletKit.signX402SvmPayment === undefined`.
- [ ] Returned base64 transaction deserializes cleanly and has the user's signature attached.
- [ ] Unit tests cover signature attachment, instruction integrity, cluster mismatch rejection.
- [ ] Path selector (task 41) routes Solana wallets to Path B-SVM when this method is defined.
- [ ] `pnpm check:syntax` clean.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Backend SVM facilitator proxy + treasury provisioning — task 43.
- EIP-3009 EVM signer — task 15 (M2).
- UserOp / Paymaster adapter — task 35 (M4).
- Path selector — task 41.
