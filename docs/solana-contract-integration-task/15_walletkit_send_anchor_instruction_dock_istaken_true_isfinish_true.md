# Task 15 — `WalletKitAdapter` + `SolanaWalletKit`: dock `sendAnchorInstruction`

**Status:** Not taken
**Owner:** Mobile (mobile-app)
**Spec reference:** `solana-contract-integration-spec.md` §4.1, §11
Decision 2/4.

## Why this matters

The TakumiPay Anchor program needs a way to broadcast Solana
transactions containing program instructions. `sendAnchorInstruction`
is the Solana counterpart to the EVM `sendContractTransaction` — it
docks onto `WalletKitAdapter` as an optional method following the
space-docking pattern established by `signX402SvmPayment` and
`sendContractTransaction`.

## Scope

### `services/walletKit/types.ts`

Add the interface and optional method alongside existing optional
methods:

```typescript
export interface SendAnchorInstructionArgs {
  wallet: TWallet;
  chain: ChainConfig;
  instructions: TransactionInstruction[];
  additionalSigners?: Signer[];
  addressLookupTables?: AddressLookupTableAccount[];
  /** Optional durable nonce for time-sensitive txs (merchant payments). */
  durableNonce?: { nonceAccount: PublicKey; nonceAuthority: Signer };
  /** Optional separate fee payer (future: sponsored gas). Default: wallet. */
  feePayer?: { publicKey: PublicKey; mode: "user" | "sponsored" };
}

// On WalletKitAdapter (alongside existing optional methods):
sendAnchorInstruction?(args: SendAnchorInstructionArgs): Promise<string>;
```

### `services/walletKit/solana/SolanaWalletKit.ts`

Implement the method inside `createSolanaWalletKit()`:

```typescript
async sendAnchorInstruction(args: SendAnchorInstructionArgs): Promise<string> {
  assertSolana(args.chain);
  const signer = await getSolanaSignerForWallet(args.wallet);
  if (!signer) throw new Error("No Solana signer for wallet");

  // 1. Build versioned transaction (v0) from instructions
  // 2. Add compute budget instructions (priority fee estimation)
  // 3. Use durable nonce if provided, else recent blockhash
  // 4. Include ALTs if provided
  // 5. Sign with wallet signer + any additionalSigners
  // 6. Broadcast and return signature (base58)
}
```

### `EvmWalletKit`

Does NOT define this method — it stays `undefined`. The existing
pattern already works this way for `signX402SvmPayment`.

## Rules (non-negotiable)

- **Space docking.** No `if (namespace === "solana")` in shared code.
  Consumers presence-check: `typeof walletKit.sendAnchorInstruction === "function"`.
- **Versioned transactions (v0).** TakumiPay instructions touch 10+
  accounts — must use ALTs to stay under the 1232-byte tx limit
  (spec §11 Decision 2).
- **Durable nonce support from day one.** The `durableNonce` param is
  optional but wired — merchant payments use it by default (spec §11
  Decision 4).
- **`feePayer` field designed for future sponsored gas.** Default
  `"user"` — wallet is fee payer. `"sponsored"` mode is not
  implemented yet but the field exists to avoid a future rewrite
  (spec §11 Decision 3).
- **Compute budget estimation.** Prepend
  `ComputeBudgetProgram.setComputeUnitPrice` + `setComputeUnitLimit`
  based on `simulateTransaction`, same pattern as existing SOL
  transfers in `services/chains/solana/simulate.ts`.

## Acceptance

- [ ] `SendAnchorInstructionArgs` interface added to `types.ts`.
- [ ] `sendAnchorInstruction` optional method on `WalletKitAdapter`.
- [ ] Implementation in `SolanaWalletKit` — builds v0 tx, signs,
      broadcasts, returns signature.
- [ ] `EvmWalletKit` does not define it (stays `undefined`).
- [ ] `pnpm check:syntax` passes.
- [ ] `pnpm biome:check` clean.

## Out of scope

- Instruction builders that use this method (Tasks 17/18/19).
- Path selector wiring (Task 20).
- Sponsored gas implementation (future).
