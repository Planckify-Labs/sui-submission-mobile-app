# Solana TakumiPay Contract Integration — Engineering Spec

**Status:** Draft  
**Date:** 2025-04-25  
**Scope:** End-to-end integration of the `takumi_pay` Anchor program across Contract → Mobile App and Contract → API, with full type safety.

---

## 1. Context

The `takumi_pay` Solana program (deployed at `6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy`) mirrors the EVM `TakumiWallet` / `TakumiWalletMerchant` contracts, providing:

| Feature | EVM (existing) | Solana (this spec) |
|---|---|---|
| Product purchase settlement | `createTransaction(...)` | `createTransactionSol` / `createTransactionToken` |
| Merchant QRIS payment | `processMerchantPayment(quote, sig)` (ECDSA) | `processMerchantPaymentSol` / `processMerchantPaymentToken` (Ed25519 via instructions sysvar) |
| Point deposit | `depositPoints(token, refId, amount)` | `depositPoints(refId, refIdHash, amount)` |
| Admin / pause / withdraw | owner-only setters | owner-only + admin PDA records |
| Platform fee accounting | implicit in mapping | explicit `PlatformFeeAccount` PDAs |
| Spending limits | per-token max | `SpendingLimit` PDAs |
| Timelock withdrawals | N/A | `queue_withdrawal` → `execute_withdrawal` with configurable delay |

Two merchant payment rails already exist:

**Nanopay (Circle x402 facilitator)** — both EVM and Solana are live:
- Path B-EVM: `signTransferWithAuthorization` → `POST /intents/:id/nanopay` → Circle settle
- Path B-SVM: `signX402SvmPayment` → `POST /intents/:id/nanopay-svm` → `CircleSettleSvmClient` → Circle Solana facilitator
- The B-SVM path is already end-to-end: mobile signs a pre-built Solana tx, backend proxies to Circle's facilitator. No TakumiPay program involved.

**Onchain settlement (TakumiPay contract)** — EVM-only today:
- Mobile builds `processMerchantPayment(quote, sig)` calldata via viem, signs via `walletKit.sendContractTransaction`, broadcasts to EVM chain.
- Mobile POSTs tx hash to `POST /intents/:id/onchain`.
- API reads on-chain state via viem `readContract` (`getTransactionByRef`, `getMerchantPaymentByRef`, `getPointDepositByRef`) to verify.
- Path selector: `intent.path === "direct_arc"` → checks `walletKit.sendContractTransaction` → returns `"onchain"`.

**This spec extends the onchain rail to Solana** — calling `processMerchantPaymentSol/Token`, `createTransactionSol/Token`, and `depositPoints` on the TakumiPay Anchor program, plus API-side verification via Anchor account deserialization. The nanopay B-SVM path is untouched.

---

## 2. Architecture Principles

1. **Three-role separation** (memory: `feedback_role_separation.md`): Mobile signs and broadcasts. API verifies after-the-fact. Backend never holds user keys, mobile never blind-executes server-supplied transactions.

2. **Space docking / chain-extension discipline** (memory: `feedback_chain_extension_discipline.md`): Chain-specific capability docks onto `WalletKitAdapter` as an optional method. Shared code (path selector, pay-merchant screen, orchestrators table) dispatches via **presence-of-method** (`typeof walletKit.X === "function"`) — never via `if (namespace === "X")`. The existing B-SVM path demonstrates this pattern: `signX402SvmPayment` is an optional method on the adapter, defined only in `SolanaWalletKit`, `undefined` on `EvmWalletKit`. The path selector checks `typeof walletKit.signX402SvmPayment === "function"` without mentioning "solana" once. This spec follows the same pattern for onchain settlement.

3. **IDL-driven type safety**: The Anchor IDL (`target/idl/takumi_pay.json`) is the single source of truth. Each project (mobile app + API) keeps its own copy of the IDL and derives its TypeScript types from it — tailored to its own Solana SDK types (`PublicKey` vs `BN`, etc.) but always structurally matching the IDL. CI enforces the IDL copies stay in sync with the contract.

4. **No `@solana/web3.js` on the API** (existing constraint from task 43): The API backend uses `@coral-xyz/anchor` for account deserialization and `@solana/kit` for RPC/connection only. No direct transaction building on the server.

---

## 3. Type Safety Pipeline

### 3.1 Source of Truth

```
contract/solana/target/idl/takumi_pay.json     ← Anchor IDL (JSON)
contract/solana/target/types/takumi_pay.ts      ← Anchor-generated TS type
```

### 3.2 Per-Project Types Files

Each project maintains its own types file derived from the IDL. No shared workspace package — each repo owns its copy so they can evolve independently and use the native types of their own Solana SDK dependency (`@solana/web3.js` PublicKey on mobile, `@coral-xyz/anchor` BN on API, etc.).

#### Mobile App: `services/chains/solana/takumiPay/`

```
mobile-app/services/chains/solana/takumiPay/
├── idl.ts              ← Copy of IDL JSON exported as `const`
├── types.ts            ← Account, instruction param, and event interfaces (using @solana/web3.js PublicKey)
├── pda.ts              ← PDA derivation helpers
├── errors.ts           ← Error code enum with message map
├── refIdHash.ts        ← SHA-256 helper for refId → [u8; 32]
└── index.ts
```

#### API: `src/blockchain-verification/solana/takumi-pay/`

```
api/src/blockchain-verification/solana/takumi-pay/
├── idl.ts              ← Copy of IDL JSON exported as `const`
├── types.ts            ← Account and verification interfaces (using @coral-xyz/anchor types)
├── pda.ts              ← PDA derivation helpers
├── errors.ts           ← Error code enum
├── ref-id-hash.ts      ← SHA-256 helper
└── index.ts
```

Both files are generated/copied from the canonical `contract/solana/target/idl/takumi_pay.json` after each `anchor build`. The interfaces are tailored to each project's native Solana SDK types.

#### Mobile Types (`mobile-app/services/chains/solana/takumiPay/types.ts`)

```typescript
import type { PublicKey } from "@solana/web3.js";

export interface TakumiPayConfig {
  owner: PublicKey;
  pendingOwner: PublicKey | null;
  backendSigner: PublicKey;
  paused: boolean;
  pointDepositsPaused: boolean;
  txCounter: bigint;
  pointDepositCounter: bigint;
  withdrawalDelay: bigint;
  withdrawalNonce: bigint;
  bump: number;
}

export interface TakumiPayTransactionRecord {
  config: PublicKey;
  txId: bigint;
  walletAddress: PublicKey;
  tokenMint: PublicKey;
  bookingId: string;
  exchangeRateId: bigint;
  productVariantId: string;
  refId: string;
  amount: bigint;
  timestamp: bigint;
  bump: number;
}

export interface TakumiPayMerchantPayment {
  config: PublicKey;
  payer: PublicKey;
  tokenMint: PublicKey;
  merchantId: string;
  refId: string;
  amount: bigint;
  platformFeeAmount: bigint;
  fiatAmountMinor: bigint;
  fiatCurrency: Uint8Array; // 3 bytes
  exchangeRateId: bigint;
  timestamp: bigint;
  bump: number;
}

export interface TakumiPayPointDepositRecord {
  config: PublicKey;
  depositId: bigint;
  walletAddress: PublicKey;
  tokenMint: PublicKey;
  amount: bigint;
  refId: string;
  timestamp: bigint;
  bump: number;
}

export interface CreateTransactionParams {
  bookingId: string;
  exchangeRateId: bigint;
  productVariantId: string;
  refId: string;
  refIdHash: Uint8Array; // 32 bytes, SHA-256 of refId
  amount: bigint;
}

export interface MerchantQuoteParams {
  refId: string;
  refIdHash: Uint8Array; // 32 bytes
  merchantId: string;
  amount: bigint;
  platformFeeAmount: bigint;
  fiatAmountMinor: bigint;
  fiatCurrency: Uint8Array; // 3 bytes ASCII
  exchangeRateId: bigint;
  expiresAt: bigint;
}
```

#### Mobile PDA helpers (`mobile-app/services/chains/solana/takumiPay/pda.ts`)

```typescript
import { PublicKey } from "@solana/web3.js";

export const TAKUMI_PAY_PROGRAM_ID = new PublicKey("6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy");

export function deriveConfigPda(programId: PublicKey): [PublicKey, number];
export function deriveRefRecordPda(programId: PublicKey, config: PublicKey, refIdHash: Uint8Array): [PublicKey, number];
export function deriveTxRecordPda(programId: PublicKey, config: PublicKey, txId: bigint): [PublicKey, number];
export function deriveMerchantPaymentPda(programId: PublicKey, config: PublicKey, refIdHash: Uint8Array): [PublicKey, number];
export function derivePlatformFeePda(programId: PublicKey, config: PublicKey, tokenMint: PublicKey): [PublicKey, number];
export function deriveSpendingLimitPda(programId: PublicKey, config: PublicKey, tokenMint: PublicKey): [PublicKey, number];
export function derivePointDepositPda(programId: PublicKey, config: PublicKey, depositId: bigint): [PublicKey, number];
export function derivePointRefRecordPda(programId: PublicKey, config: PublicKey, refIdHash: Uint8Array): [PublicKey, number];
export function deriveWithdrawalPda(programId: PublicKey, config: PublicKey, nonce: bigint): [PublicKey, number];
```

#### API Types (`api/src/blockchain-verification/solana/takumi-pay/types.ts`)

```typescript
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export interface TakumiPayTransactionRecord {
  config: PublicKey;
  txId: BN;
  walletAddress: PublicKey;
  tokenMint: PublicKey;
  bookingId: string;
  exchangeRateId: BN;
  productVariantId: string;
  refId: string;
  amount: BN;
  timestamp: BN;
  bump: number;
}

export interface TakumiPayMerchantPayment {
  config: PublicKey;
  payer: PublicKey;
  tokenMint: PublicKey;
  merchantId: string;
  refId: string;
  amount: BN;
  platformFeeAmount: BN;
  fiatAmountMinor: BN;
  fiatCurrency: number[]; // 3 bytes
  exchangeRateId: BN;
  timestamp: BN;
  bump: number;
}

export interface TakumiPayPointDepositRecord {
  config: PublicKey;
  depositId: BN;
  walletAddress: PublicKey;
  tokenMint: PublicKey;
  amount: BN;
  refId: string;
  timestamp: BN;
  bump: number;
}
```

#### Error codes (same enum in both projects)

```typescript
export enum TakumiPayError {
  NotOwner = 6000,
  NotAdminOrOwner = 6001,
  ContractPaused = 6002,
  PointDepositsPaused = 6003,
  ZeroAddress = 6004,
  ZeroAmount = 6005,
  // ... all 31 error codes
  Overflow = 6030,
}

export const TAKUMI_PAY_ERROR_MESSAGES: Record<TakumiPayError, string>;
```

### 3.3 IDL Sync CI Step

Add a CI check that hashes `contract/solana/target/idl/takumi_pay.json` and compares against the IDL copy in each project's types directory. Fails if they diverge, forcing both projects to update after `anchor build`.

---

## 4. Mobile App Changes

### 4.1 New: `SolanaWalletKit.sendAnchorInstruction` (Space Docking)

Dock a new optional method onto `WalletKitAdapter`, following the same pattern as the existing optional methods:

| Existing optional method | Defined on | Purpose |
|---|---|---|
| `signTransferWithAuthorization?` | `EvmWalletKit` | Path B-EVM (Circle EIP-3009) |
| `sendUserOpWithUsdcPaymaster?` | `EvmWalletKit` | Gasless (ERC-4337 Paymaster) |
| `signX402SvmPayment?` | `SolanaWalletKit` | Path B-SVM (Circle x402 Solana) |
| `sendContractTransaction?` | `EvmWalletKit` | Onchain settlement (EVM TakumiWallet) |
| **`sendAnchorInstruction?`** | **`SolanaWalletKit`** | **Onchain settlement (Solana TakumiPay)** ← NEW |

```typescript
// services/walletKit/types.ts — add alongside existing optional method interfaces

export interface SendAnchorInstructionArgs {
  wallet: TWallet;
  chain: ChainConfig;
  instructions: TransactionInstruction[];
  /** Additional signers beyond the wallet (rare — most cases just the payer). */
  additionalSigners?: Signer[];
  /** Lookup tables for versioned transactions. */
  addressLookupTables?: AddressLookupTableAccount[];
}

// On WalletKitAdapter (alongside existing optional methods):
sendAnchorInstruction?(args: SendAnchorInstructionArgs): Promise<string>;
```

**Implementation in `SolanaWalletKit`** (`services/walletKit/solana/SolanaWalletKit.ts`):

```typescript
// Inside createSolanaWalletKit() — mirrors the signX402SvmPayment docking pattern:
async sendAnchorInstruction(args: SendAnchorInstructionArgs): Promise<string> {
  assertSolana(args.chain);
  const signer = await getSolanaSignerForWallet(args.wallet);
  if (!signer) throw new Error("No Solana signer for wallet");
  // Build versioned transaction from instructions, sign, broadcast
  // (delegates to transferService-level primitives)
  return buildSignAndBroadcast({ rpc, signer, instructions: args.instructions, ... });
},
```

`EvmWalletKit` does not define this method — it stays `undefined`. Consumers presence-check:
```typescript
if (typeof walletKit.sendAnchorInstruction === "function") { ... }
```

Zero `if (namespace === "solana")` anywhere in shared code.

### 4.2 New: `services/nanopay/pathOnchainSettlementSvm.ts`

Solana counterpart to the existing `pathOnchainSettlement.ts` (which calls `processMerchantPayment` on the EVM TakumiWallet contract via viem `encodeFunctionData`). This module calls `processMerchantPaymentSol/Token` on the TakumiPay Anchor program instead. Same role in the `"onchain"` rail, different chain primitive:

```typescript
export interface ExecuteOnchainSettlementSvmArgs {
  intent: PaymentIntentResponse;
  wallet: TWallet;
  walletKit: WalletKitAdapter;
  chain: ChainConfig;
  programId: PublicKey;
}

export async function executeOnchainSettlementSvm(
  args: ExecuteOnchainSettlementSvmArgs,
): Promise<ExecuteOnchainSettlementSvmResult>;
```

This is a self-contained Solana module — it imports from `@solana/web3.js` and `takumiPay/` directly. No Solana imports leak into `pathOnchainSettlement.ts` (EVM) or any shared nanopay code. The consumer's orchestrator table presence-checks `sendAnchorInstruction` to pick this module; the module itself asserts `chain.namespace === "solana"` at entry (same guard pattern as `SolanaWalletKit.assertSolana`).

**Flow:**
1. Assert `chain.namespace === "solana"` (entry guard, throws on mismatch).
2. Extract `quoteCommitmentSvm` from `intent`.
3. Compute `refIdHash` = SHA-256 of `quoteCommitmentSvm.refId` (via `takumiPay/refIdHash`).
4. Build `MerchantQuoteParams` from the quote commitment (via `takumiPay/types`).
5. Build the Ed25519 signature verification instruction (`Ed25519Program.createInstructionWithPublicKey`) using `intent.quoteSignatureSvm` and `intent.backendSignerPubkey`.
6. Build the `processMerchantPaymentSol` or `processMerchantPaymentToken` instruction:
   - Derive all PDAs using `takumiPay/pda`.
   - Select `Sol` vs `Token` variant based on whether `tokenMint` is native SOL.
7. Bundle `[ed25519Ix, merchantPaymentIx]` and call `walletKit.sendAnchorInstruction`.
8. POST tx signature to `POST /v1/pay/intents/:id/onchain` (same endpoint as EVM — backend discriminates by the blockchain row's `isEVM` flag, not by the mobile request).

### 4.3 New: `services/nanopay/solana/buildCreateTransaction.ts`

Builds the `createTransactionSol` / `createTransactionToken` instruction for product purchase settlement:

```typescript
export function buildCreateTransactionInstruction(params: {
  payer: PublicKey;
  programId: PublicKey;
  tokenMint: PublicKey | null; // null = native SOL
  params: CreateTransactionParams;
  txCounter: bigint; // from Config account, for PDA derivation
}): TransactionInstruction;
```

### 4.4 New: `services/nanopay/solana/buildDepositPoints.ts`

Builds the `depositPoints` instruction:

```typescript
export function buildDepositPointsInstruction(params: {
  payer: PublicKey;
  programId: PublicKey;
  tokenMint: PublicKey;
  refId: string;
  amount: bigint;
  pointDepositCounter: bigint; // from Config account
}): TransactionInstruction;
```

### 4.5 Updated: `pathSelector.ts`

The selector already handles `"onchain"` when `isOnchainSettlement(intent)` returns true (checks `intent.path === "direct_arc"`). Today it gates on `sendContractTransaction` (EVM-only) and throws `NoSuitablePayPathError` for Solana wallets.

Add `sendAnchorInstruction` as a second capability check so Solana wallets can also take the `"onchain"` path:

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

The **consumer** (pay-merchant screen / agent-mode tool) wires the `PathOrchestrators.onchain` callable based on which adapter method is present — same presence-check pattern as the other orchestrator entries:

```typescript
// In the pay-merchant screen / agent tool site:
const orchestrators: PathOrchestrators = {
  "B-EVM": () => submitNanopay(...),
  "B-SVM": () => submitNanopaySvm(...),
  A: () => executePathA(...),
  C: () => executePathC(...),
  gasless: () => executeGasless(...),
  onchain: () => {
    // Presence-check docking — no namespace string
    if (typeof walletKit.sendAnchorInstruction === "function") {
      return executeOnchainSettlementSvm({ intent, wallet, walletKit, chain, programId });
    }
    return executeOnchainSettlement({ intent, wallet, walletKit, chain, contractAddress });
  },
};
```

The selector returns `"onchain"` without knowing which chain. The orchestrator entry presence-checks the docked method to pick the right implementation. Zero `if (namespace)` in either the selector or the orchestrator wiring.

### 4.6 Updated: Quote Commitment Shape

The existing `QuoteCommitment` in `services/nanopay/types.ts` is EVM-specific — it uses `tokenAddress: \`0x${string}\`` and the backend signs it with ECDSA. For Solana, the backend signs with Ed25519 and uses base58 pubkeys.

Add `QuoteCommitmentSvm` alongside the existing type:

```typescript
// services/nanopay/types.ts (addition, existing QuoteCommitment unchanged)

export interface QuoteCommitmentSvm {
  refId: string;
  merchantId: string;
  tokenMint: string; // base58 pubkey (or "native" sentinel for SOL)
  amount: string;
  platformFeeAmount: string;
  fiatAmountMinor: string;
  fiatCurrency: string; // "IDR"
  exchangeRateId: string;
  expiresAt: string; // unix seconds
}

// On PaymentIntentResponse (addition):
export interface PaymentIntentResponse {
  // ... existing fields (quoteCommitment, quoteSignature, contractAddress for EVM)

  /** Solana quote commitment — present when path="direct_arc" and chain is Solana. */
  quoteCommitmentSvm?: QuoteCommitmentSvm;
  /** Ed25519 signature over borsh-serialized MerchantQuoteParams. Base64-encoded. */
  quoteSignatureSvm?: string;
  /** TakumiPay program ID for onchain settlement on Solana. Base58. */
  programId?: string;
  /** Backend Ed25519 signer pubkey. Base58. Must match Config.backendSigner on-chain. */
  backendSignerPubkey?: string;
}
```

Space docking: the EVM path module (`pathOnchainSettlement.ts`) reads `intent.quoteCommitment` + `intent.quoteSignature`. The Solana path module (`pathOnchainSettlementSvm.ts`) reads `intent.quoteCommitmentSvm` + `intent.quoteSignatureSvm`. Each module asserts its own field is present at entry — no shared code inspects both fields or branches on namespace to pick one.

### 4.7 Dependencies

No new external dependencies — the mobile app already has `@solana/web3.js` (via the Solana adapter) and `@noble/hashes` (for SHA-256). The types files live in-tree at `services/chains/solana/takumiPay/`.

### 4.8 Agent Mode: Solana TakumiPay Tool Executors

The agent mode already has EVM on-chain write executors in `services/agent-executors/writes.ts` (`execute_booking`, `create_purchase` — currently stubbed) and Solana basic executors in `services/agent-executors/solana.ts` (`send_sol`, `get_sol_balance`). Points have `deposit_points` in `services/agent-executors/points.ts` using the EVM `AbiTakumiPointDeposit` contract.

Add Solana TakumiPay program executors that mirror the EVM stubs — but fully implemented since we now have the IDL and types.

#### New file: `services/agent-executors/solanaTakumiPay.ts`

```typescript
import { walletKitRegistry } from "@/services/walletKit/registry";
import { computeRefIdHash } from "@/services/chains/solana/takumiPay/refIdHash";
import { buildCreateTransactionInstruction } from "@/services/nanopay/solana/buildCreateTransaction";
import { buildDepositPointsInstruction } from "@/services/nanopay/solana/buildDepositPoints";
import type { MobileToolExecutor } from "./types";

export const executeBookingSol: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    // 1. Validate wallet is Solana namespace
    // 2. Read booking params from input (booking_id, exchange_rate_id,
    //    product_variant_id, ref_id, amount, token_mint)
    // 3. Fetch Config account to get txCounter for PDA derivation
    // 4. Build createTransactionSol or createTransactionToken instruction
    //    (select variant based on token_mint === native SOL)
    // 5. Call walletKit.sendAnchorInstruction
    // 6. Return { status: "success", data: { signature, cluster, ... } }
  });

export const depositPointsSol: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    // 1. Validate wallet is Solana namespace
    // 2. Read params from input (ref_id, token_mint, amount)
    // 3. Compute refIdHash from ref_id
    // 4. Fetch Config account for pointDepositCounter
    // 5. Build depositPoints instruction
    // 6. Call walletKit.sendAnchorInstruction
    // 7. Return { status: "success", data: { signature, ... } }
  });

export const SOLANA_TAKUMI_PAY_EXECUTORS: Record<string, MobileToolExecutor> = {
  execute_booking_sol: executeBookingSol,
  deposit_points_sol: depositPointsSol,
};
```

#### Space docking in agent executors

The executors resolve the Solana kit via `walletKitRegistry.get("solana")` and call `sendAnchorInstruction` — the same docking pattern as `send_sol` uses `sendNativeTransfer`. The agent-api server selects between EVM tools (`execute_booking`) and Solana tools (`execute_booking_sol`) based on `wallet_context.namespace` in the system prompt — mobile never branches.

#### Registry updates

```typescript
// services/agent-executors/index.ts
import { SOLANA_TAKUMI_PAY_EXECUTORS } from "./solanaTakumiPay";

export const EXECUTORS: Record<string, MobileToolExecutor> = {
  ...READ_EXECUTORS,
  ...SIMULATE_EXECUTORS,
  ...WRITE_EXECUTORS,
  ...POINTS_EXECUTORS,
  ...ADDRESS_BOOK_EXECUTORS,
  ...SOLANA_EXECUTORS,
  ...SOLANA_TAKUMI_PAY_EXECUTORS,  // ← NEW
};

// Add to EXPECTED_MOBILE_TOOLS:
export const EXPECTED_MOBILE_TOOLS: ReadonlyArray<string> = [
  // ... existing entries ...
  // solana takumipay
  "execute_booking_sol",
  "deposit_points_sol",
];
```

#### Agent-API server-side tool definitions

The `takumi-agent-api` tool registry needs corresponding entries with `executor: "mobile"`:

```typescript
// takumi-agent-api/src/tools/registry.ts (additions — same pattern as existing send_sol / get_wallet_sol_balance)
execute_booking_sol: {
  name: "execute_booking_sol",
  category: "blockchain_write",
  executor: "mobile",
  capability: "write",
  description:
    "Submit a product purchase transaction on the TakumiPay Solana program " +
    "(createTransactionSol/Token). Use this when wallet_context.namespace is " +
    '"solana" and the user wants to pay for a product/booking — for EVM use ' +
    "execute_booking instead.",
  inputSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", description: "Booking UUID from the backend." },
      exchange_rate_id: { type: "string", description: "Exchange rate ID from the backend." },
      product_variant_id: { type: "string", description: "Product variant UUID." },
      ref_id: { type: "string", description: "Unique reference ID for idempotency." },
      amount: { type: "string", description: "Amount in token minor units (decimal string)." },
      token_mint: SOLANA_ADDRESS_PROP("SPL token mint address (base58). Omit for native SOL."),
    },
    required: ["booking_id", "exchange_rate_id", "product_variant_id", "ref_id", "amount"],
    additionalProperties: false,
  },
},
deposit_points_sol: {
  name: "deposit_points_sol",
  category: "points",
  executor: "mobile",
  capability: "write",
  description:
    "Deposit SPL tokens into the TakumiPay Solana program to earn points. " +
    "Use this when wallet_context.namespace is \"solana\" — for EVM use " +
    "deposit_points instead. ALWAYS call get_points_price first.",
  inputSchema: {
    type: "object",
    properties: {
      token_mint: SOLANA_ADDRESS_PROP("SPL token mint address (base58)."),
      token_amount: { type: "string", description: "Human-readable token amount (e.g. \"100\"). NOT lamports." },
      expected_points: { type: "string", description: "Expected points from get_points_price, shown in approval summary." },
    },
    required: ["token_mint", "token_amount", "expected_points"],
    additionalProperties: false,
  },
},
```

All tools are always registered — no server-side namespace filtering. The LLM picks the right tool by reading `wallet_context.namespace` from the system prompt, same as existing EVM/Solana pairs (`send_native_token` vs `send_sol`, `get_wallet_balance` vs `get_wallet_sol_balance`). The tool descriptions guide the LLM: *"Use this when wallet_context.namespace is 'solana'"* / *"for EVM use execute_booking instead"*. Both the mobile executor registry and the agent-api tool registry are flat maps containing every tool from every namespace.

#### What about `process_merchant_payment_sol`?

Merchant payments via agent mode go through the intent flow (`POST /pay/intents` → path selector → orchestrator). The agent doesn't call `processMerchantPayment` directly — it creates an intent and the pay-merchant screen handles settlement. The `"onchain"` path extension (sections 4.2/4.5) already covers this. No separate agent executor needed for merchant payments.

---

## 5. API Changes

### 5.1 New: `src/blockchain-verification/solana-verification.service.ts`

A new service dedicated to Solana program account verification.

**No admin wallet needed for reads.** The EVM TakumiWallet contract gates its view functions (`getTransactionByRef`, `getMerchantPaymentByRef`, `getPointDepositByRef`) with admin-only modifiers — the API's `BlockchainVerificationService` needs a `walletClient` built from `adminWalletPrivateKey` to pass those checks. On Solana this doesn't apply: all account data lives in PDAs (`TransactionRecord`, `MerchantPayment`, `PointDepositRecord`) which are publicly readable by anyone via `getAccountInfo`. There are no read instructions or access-control gates — if you know the PDA address, you can deserialize the data. The service only needs a `Connection` (from the blockchain's `rpcUrl`), no keypair.

The Ed25519 keypair (`SOLANA_QUOTE_SIGNER_PRIVATE_KEY`) is only needed for **quote signing** during intent creation — not for verification. These are separate concerns, kept in separate methods.

```typescript
@Injectable()
export class SolanaVerificationService {
  private connection: Connection; // RPC-only, no keypair needed for reads

  constructor(private prisma: PrismaService, private config: ConfigService) {
    // Initialize Connection from Solana blockchain's rpcUrl in DB
  }

  // ── Verification (read-only, no keypair) ──────────────────────────

  /**
   * Verify a product purchase transaction by reading the TransactionRecord
   * PDA on-chain. Equivalent to the EVM `verifyTransactionInContract`.
   */
  async verifyTransactionRecord(args: {
    programId: PublicKey;
    refId: string;
    refIdHash: Uint8Array;
    expectedWalletAddress: string;
    expectedTokenMint: string;
    expectedAmount: string;
    expectedBookingId: string;
    expectedExchangeRateId: string;
    expectedProductVariantId: string;
  }): Promise<TakumiPayTransactionRecord>;

  /**
   * Verify a merchant payment by reading the MerchantPayment PDA.
   * Equivalent to `verifyMerchantPaymentInContract`.
   */
  async verifyMerchantPayment(args: {
    programId: PublicKey;
    refId: string;
    refIdHash: Uint8Array;
    expectedPayer: string;
    expectedMerchantId: string;
    expectedTokenMint: string;
    expectedAmount: string;
    expectedFiatAmountMinor: number;
    expectedFiatCurrency: string;
    expectedExchangeRateId: number;
  }): Promise<TakumiPayMerchantPayment>;

  /**
   * Verify a point deposit by reading the PointDepositRecord PDA.
   * Equivalent to `verifyPointDeposit`.
   */
  async verifyPointDeposit(args: {
    programId: PublicKey;
    refId: string;
    refIdHash: Uint8Array;
    expectedWalletAddress: string;
    expectedTokenMint: string;
    expectedAmount: bigint;
  }): Promise<TakumiPayPointDepositRecord>;

  /**
   * Wait for a Solana tx signature to reach finalized commitment.
   * Equivalent to the EVM `waitForTransactionReceipt`.
   */
  async waitForConfirmation(
    signature: string,
    commitment?: Commitment,
  ): Promise<void>;

  // ── Quote signing (needs Ed25519 keypair) ─────────────────────────

  /**
   * Sign a MerchantQuoteParams message using the backend's Ed25519
   * keypair. The mobile app prepends this as an Ed25519 verify
   * instruction in the transaction.
   *
   * This is the ONLY method that needs the keypair — verification
   * reads above are pure RPC calls.
   */
  signMerchantQuote(params: MerchantQuoteParams): Uint8Array;
}
```

**Account deserialization:** Use `@coral-xyz/anchor`'s `Program` class initialized with the IDL from `src/blockchain-verification/solana/takumi-pay/idl.ts`. This gives typed `program.account.transactionRecord.fetch(pda)` calls that return strongly-typed account data — identical safety to viem's `readContract` on EVM, but without needing a signer.

### 5.2 Updated: `BlockchainVerificationService`

Today `BlockchainVerificationService` skips non-EVM chains in `initializeClients()` (`if (!blockchain.isEVM) continue`) and all verification methods (`verifyTransactionInContract`, `verifyMerchantPaymentInContract`, `verifyPointDeposit`) use viem `readContract`.

Add a dispatch layer in each verification method that routes to `SolanaVerificationService` when the chain is non-EVM:

```typescript
// In verifyTransactionInContract (and merchant/point deposit equivalents):
const blockchain = await this.prisma.blockchain.findUnique({ where: { id: blockchainId } });
if (!blockchain.isEVM) {
  return this.solanaVerification.verifyTransactionRecord(solanaArgs);
}
// ... existing EVM viem readContract path
```

### 5.3 Updated: Intent Creation — Solana Quote Signing

Today, when `POST /v1/pay/intents` resolves to `path: "direct_arc"` on an EVM chain, the API populates `quoteCommitment` + `quoteSignature` (ECDSA) on the response. The mobile app passes these to `pathOnchainSettlement.ts` which encodes the EVM `processMerchantPayment(quote, backendSignature)` call.

For Solana chains, the same intent creation endpoint populates the new SVM fields instead:

```typescript
// PaymentIntentResponse (Solana onchain settlement):
{
  path: "direct_arc",
  quoteCommitmentSvm: { refId, merchantId, tokenMint, amount, ... },
  quoteSignatureSvm: "base64...",  // Ed25519 signature
  backendSignerPubkey: "base58...", // matches Config.backendSigner on-chain
  programId: "6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy",
}
```

The API signs the borsh-serialized `MerchantQuoteParams` struct using the backend Ed25519 keypair configured in `SOLANA_QUOTE_SIGNER_PRIVATE_KEY`. The program verifies this signature via the Ed25519 precompile instruction that the mobile app prepends to the transaction.

### 5.4 Updated: `POST /v1/pay/intents/:id/onchain`

This endpoint already exists — mobile calls it after broadcasting the EVM `processMerchantPayment` tx. It creates an `OnchainSettlement` row with `txHash` (0x hex) and `chainId` (int), then a worker verifies via `BlockchainVerificationService`.

Extend to support Solana:

- `txHash` field accepts both EVM hex hashes and Solana base58 signatures (the column is already `String`, no migration needed).
- `chainId` → make nullable in the DTO. Add optional `cluster` field (`"mainnet-beta"` | `"devnet"`) for Solana chains.
- Verification worker checks if the blockchain row `isEVM`:
  - **EVM** (existing): viem `waitForTransactionReceipt` + `readContract` verification.
  - **Solana** (new): `SolanaVerificationService.waitForConfirmation` + Anchor account PDA fetch + field-by-field verification.

### 5.5 Updated: Prisma Schema

```prisma
model Blockchain {
  // ... existing fields
  isEVM              Boolean  @default(true)
  // New: Solana-specific fields
  solanaCluster      String?  // "mainnet-beta" | "devnet" | "testnet"
  takumiPayProgramId String?  // Solana program ID (base58)
  solanaQuoteSignerKeypair String? // backend signer keypair path/ref (server-only, never serialized)
}

model OnchainSettlement {
  // ... existing fields
  txHash         String        // EVM: 0x hex hash, Solana: base58 signature
  chainId        Int?          // nullable for Solana
  cluster        String?       // Solana cluster identifier
  // ... rest unchanged
}
```

### 5.6 API Dependencies

Add to `api/package.json`:

```json
"@coral-xyz/anchor": "^0.31.x",
"@solana/web3.js": "^1.98.x"
```

The types files live in-tree at `src/blockchain-verification/solana/takumi-pay/`.

Note: This relaxes the "no `@solana/web3.js` on backend" constraint from task 43. That constraint was specific to the Circle x402 flow (where the backend is an opaque proxy). For TakumiPay contract verification, the backend MUST deserialize Solana accounts — there is no way around importing a Solana client library. The `@coral-xyz/anchor` dependency implicitly pulls `@solana/web3.js`.

### 5.7 Environment Variables

```env
# Solana RPC endpoint (also stored in Blockchain table, but needed at boot for the verification service)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Backend Ed25519 signer for merchant quote signing on Solana.
# Base58-encoded 64-byte keypair (same format as Solana CLI keypair files).
# This is the Solana counterpart to the EVM ADMIN_WALLET_PRIVATE_KEY —
# both sign merchant quotes, just different curves (Ed25519 vs ECDSA).
SOLANA_QUOTE_SIGNER_PRIVATE_KEY=...

# Program ID (also in DB, but used as a boot-time sanity check)
TAKUMI_PAY_PROGRAM_ID=6CCTEtYrk8unNhjYQ7npiLUf1iKQQJU88JSYn8EJLNYy
```

> **Naming alignment (done):** Both EVM and Solana now follow the `{CHAIN}_QUOTE_SIGNER_PRIVATE_KEY` convention:
>
> | Chain | Env var | Purpose |
> |---|---|---|
> | EVM | `EVM_QUOTE_SIGNER_PRIVATE_KEY` | ECDSA quote signing |
> | Solana | `SOLANA_QUOTE_SIGNER_PRIVATE_KEY` | Ed25519 quote signing |

---

## 6. End-to-End Flows

### 6.1 Product Purchase (createTransaction)

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌────────────────┐
│  Mobile   │     │   API    │     │  Solana     │     │   API          │
│  App      │     │          │     │  Network    │     │  Verify Worker │
└────┬─────┘     └────┬─────┘     └──────┬─────┘     └──────┬─────────┘
     │                │                   │                   │
     │ POST /bookings │                   │                   │
     │───────────────>│                   │                   │
     │  { booking }   │                   │                   │
     │<───────────────│                   │                   │
     │                │                   │                   │
     │ Build createTransactionSol/Token   │                   │
     │ instruction using IDL types        │                   │
     │ + sign + broadcast ───────────────>│                   │
     │                │                   │                   │
     │ POST /bookings/:id/submit          │                   │
     │ { txSignature, cluster } ─────────>│                   │
     │                │                   │                   │
     │                │ waitForConfirmation│                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │ fetch TransactionRecord PDA           │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │ Verify: refId, walletAddress,         │
     │                │   tokenMint, amount, bookingId,       │
     │                │   exchangeRateId, productVariantId    │
     │                │                   │                   │
     │  { status: confirmed }             │                   │
     │<───────────────│                   │                   │
```

### 6.2 Merchant Payment (processMerchantPayment)

```
┌──────────┐     ┌──────────┐     ┌────────────┐
│  Mobile   │     │   API    │     │  Solana     │
└────┬─────┘     └────┬─────┘     └──────┬─────┘
     │                │                   │
     │ POST /pay/intents (QRIS scan)      │
     │───────────────>│                   │
     │                │                   │
     │  { intent with │                   │
     │    quoteCommitmentSvm,             │
     │    quoteSignature (Ed25519),       │
     │    backendSignerPubkey }           │
     │<───────────────│                   │
     │                │                   │
     │ 1. Build Ed25519 verify IX         │
     │    (Ed25519Program.createInstruction│WithPublicKey)
     │ 2. Build processMerchantPaymentSol/Token IX
     │    (from MerchantQuoteParams)       │
     │ 3. Bundle [ed25519Ix, paymentIx]   │
     │ 4. Sign + broadcast ──────────────>│
     │                │                   │
     │ POST /pay/intents/:id/onchain      │
     │ { txSignature, cluster } ─────────>│
     │                │                   │
     │                │ waitForConfirmation│
     │                │──────────────────>│
     │                │ fetch MerchantPayment PDA
     │                │──────────────────>│
     │                │ Verify all fields  │
     │                │                   │
     │  { status: settled }               │
     │<───────────────│                   │
```

**Ed25519 signature verification:** The Solana program reads the instructions sysvar to find the Ed25519 precompile instruction at index 0. The mobile app MUST place the Ed25519 verify instruction as the first instruction in the transaction. The message bytes are the borsh-serialized `MerchantQuoteParams`.

### 6.3 Point Deposit

```
┌──────────┐     ┌──────────┐     ┌────────────┐
│  Mobile   │     │   API    │     │  Solana     │
└────┬─────┘     └────┬─────┘     └──────┬─────┘
     │                │                   │
     │ Build depositPoints IX             │
     │ (refId, refIdHash, amount)         │
     │ + sign + broadcast ───────────────>│
     │                │                   │
     │ POST /points/deposit               │
     │ { txSignature, refId, cluster } ──>│
     │                │                   │
     │                │ waitForConfirmation│
     │                │──────────────────>│
     │                │ fetch PointDepositRecord PDA
     │                │──────────────────>│
     │                │ Verify: walletAddress, tokenMint, amount, refId
     │                │                   │
     │  { points credited }               │
     │<───────────────│                   │
```

---

## 7. Type Safety Boundaries

### 7.1 Contract → Mobile (instruction building)

| Boundary | EVM (current) | Solana (this spec) |
|---|---|---|
| ABI / IDL | Inline `as const` ABI in `pathOnchainSettlement.ts` | IDL from in-tree `takumiPay/idl.ts` |
| Instruction encoding | `encodeFunctionData` (viem) | `program.methods.X(...).instruction()` (Anchor client) or manual instruction construction from IDL types |
| Account derivation | N/A (contract-internal mappings) | PDA derivation using per-project `takumiPay/pda` helpers — compile-time checked seeds |
| Parameter types | Viem infers from ABI (`as const`) | TypeScript interfaces from per-project `takumiPay/types` |

### 7.2 Contract → API (account deserialization)

| Boundary | EVM (current) | Solana (this spec) |
|---|---|---|
| Read mechanism | `readContract(client, { abi, functionName, args })` | `program.account.transactionRecord.fetch(pda)` |
| Return type | Viem infers struct shape from ABI | Anchor returns typed account matching IDL |
| Address format | `0x${string}` (hex, 20 bytes) | `PublicKey` (base58, 32 bytes) |
| Amount format | `bigint` (uint256) | `BN` (u64) — convert to `bigint` at the service boundary |

### 7.3 Breaking Change Guard

If a field is added/removed/renamed in the Anchor program:
1. `anchor build` regenerates `target/idl/takumi_pay.json` and `target/types/takumi_pay.ts`.
2. CI IDL-hash check fails because the in-tree IDL copies in mobile-app and API diverge from the contract's canonical IDL.
3. Developer copies the updated IDL into both projects and updates each project's types/PDA files.
4. TypeScript compiler surfaces all callsites in mobile + API that need updating.

No runtime surprises.

---

## 8. Differences from EVM Integration

### 8.1 Ed25519 vs ECDSA Quote Signatures

EVM merchant payments use ECDSA — the backend signs the quote with its EVM private key, and the Solidity contract uses `ecrecover` to verify. The mobile app passes the signature as a `bytes` arg to `processMerchantPayment(quote, backendSignature)`. This already works in `pathOnchainSettlement.ts`.

Solana uses Ed25519 via the native `Ed25519Program` precompile — a fundamentally different verification mechanism. The mobile app must:
1. Receive the backend's Ed25519 signature + pubkey.
2. Build an `Ed25519Program.createInstructionWithPublicKey` instruction.
3. Place it as instruction index 0 in the transaction.
4. The on-chain program reads `Sysvar<Instructions>` to validate the signature was verified by the precompile.

### 8.2 PDA-Based Storage vs Mapping-Based Storage

EVM stores transactions in `mapping(string => Transaction)` indexed by `refId`, with admin-gated view functions (`getTransactionByRef`, `getMerchantPaymentByRef`, `getPointDepositByRef`) that require the caller to be an admin. Solana stores each record as a separate PDA account derived from seeds — and **all PDA data is publicly readable** via `getAccountInfo`. No admin wallet is needed on the API side for verification.

> **TODO (EVM contract):** The admin-gated reads on the EVM TakumiWallet contract (`onlyAdmin` modifier on view functions) don't provide real security — the same data is visible on-chain via event logs, `eth_getStorageAt`, and block explorers. The gate only prevents reads *through the contract's own functions*, not reads of the underlying storage.
>
> Removing the gate would let `BlockchainVerificationService` switch from `walletClient` to `publicClient` for verification reads. However, `ADMIN_WALLET_PRIVATE_KEY` can't be fully removed from the API env — `pay/quote-signer.service.ts` still needs it to ECDSA-sign merchant quote commitments for the onchain settlement flow. The ops scripts (`sweep-merchant-backing.ts`, `sweep-platform-fees.ts`) also reference it but are CLI-only and currently commented out.
>
> Recommended cleanup after removing the read gate:
> 1. Rename `ADMIN_WALLET_PRIVATE_KEY` → `QUOTE_SIGNER_PRIVATE_KEY` to clarify its sole runtime purpose (quote signing, not admin ops).
> 2. Move sweep scripts to a separate ops tooling env that holds the actual contract owner key — keep it out of the API runtime env entirely.
> 3. `BlockchainVerificationService` drops all `walletClient` usage and reads via `publicClient` only — aligns with how Solana verification already works.

This means:
- **Mobile** must derive PDA addresses before building instructions (accounts list is explicit in Solana).
- **API** derives PDAs to know which account to fetch, then reads them directly — no admin keypair needed (unlike EVM where the admin wallet is currently required to call the gated view functions).
- Both use equivalent `takumiPay/pda` helpers derived from the same IDL seeds.

### 8.3 SOL vs Token Instruction Variants

The Solana program splits native SOL and SPL token operations into separate instructions (`createTransactionSol` vs `createTransactionToken`). The mobile app must select the correct variant based on whether `tokenMint` is native SOL (system program) or an SPL token. Each project's `takumiPay/` module exports a helper:

```typescript
export function isNativeSol(tokenMint: PublicKey): boolean {
  return tokenMint.equals(SystemProgram.programId);
}
```

### 8.4 refIdHash

The Solana program requires a `refIdHash: [u8; 32]` (SHA-256 of the `refId` string) for PDA derivation. The EVM contract derives its mapping key from the string directly. Both mobile and API must compute `SHA-256(refId)` consistently:

```typescript
import { sha256 } from "@noble/hashes/sha256";

export function computeRefIdHash(refId: string): Uint8Array {
  return sha256(new TextEncoder().encode(refId));
}
```

Exported from each project's `takumiPay/refIdHash` module for consistency.

---

## 9. Migration Plan

### Phase 1: Contract Update + Per-Project Types (1 week)
- Update the Anchor program: swap `anchor_spl::token` → `anchor_spl::token_interface` across all 5 instruction files for Token-2022 compatibility.
- Run `anchor build` to regenerate IDL + types.
- Run existing Anchor tests to confirm no regressions.
- Create `mobile-app/services/chains/solana/takumiPay/` with IDL, types, PDA helpers, errors.
- Create `api/src/blockchain-verification/solana/takumi-pay/` with IDL, types, PDA helpers, errors.
- Unit tests for PDA derivation in both projects.
- CI step to hash-compare IDL copies against `contract/solana/target/idl/takumi_pay.json`.

### Phase 2: API — Verification Service (2 weeks)
- Add `SolanaVerificationService`.
- Add quote signing endpoint.
- Extend `OnchainSettlement` model.
- Add Solana blockchain seed data.
- Unit tests for account deserialization.
- Integration tests against localnet (anchor test validator).

### Phase 3: Mobile — Instruction Builders + Agent Executors (2 weeks)
- Dock `sendAnchorInstruction` onto `SolanaWalletKit`.
- Implement `buildCreateTransaction`, `buildDepositPoints`, `buildMerchantPayment`.
- Implement `pathOnchainSettlementSvm.ts`.
- Update path selector + orchestrators wiring.
- Implement `solanaTakumiPay.ts` agent executors (`execute_booking_sol`, `deposit_points_sol`).
- Register in `EXECUTORS` and `EXPECTED_MOBILE_TOOLS`.
- Add corresponding tool definitions in `takumi-agent-api` tool registry.
- Unit tests for instruction encoding, PDA derivation, and agent executor flows.

### Phase 4: E2E Integration (1 week)
- Devnet deployment of `takumi_pay` program.
- End-to-end tests: mobile → Solana devnet → API verification.
- Merchant payment flow with Ed25519 quote signature.
- Point deposit flow.

### Phase 5: Production Rollout (1 week)
- Mainnet deployment.
- DB seed: Solana mainnet blockchain row with `takumiPayProgramId`.
- Backend signer keypair provisioning (secrets manager).
- Feature flag: `solana_onchain_settlement` in Blockchain config.
- Gradual rollout via region/user segmentation.

---

## 10. Security Considerations

1. **Backend signer keypair rotation**: The program supports `rotateBackendSigner`. The API must handle keypair rotation without downtime — sign with both old and new keys during the overlap window, then call `rotateBackendSigner` on-chain.

2. **refIdHash collision**: SHA-256 is collision-resistant. The PDA derivation uses `[seed_prefix, config, refIdHash]` — even a hash collision would require matching the config account.

3. **Ed25519 instruction ordering**: The program MUST validate that the Ed25519 instruction is at instruction index 0 in the sysvar. The mobile app MUST enforce this ordering. A malicious frontend that omits the Ed25519 instruction will have its tx rejected by the program (error `MissingEd25519Instruction`).

4. **SPL token approve race**: For `createTransactionToken` and `processMerchantPaymentToken`, the user must approve the program's vault ATA to spend tokens. The mobile app should use `approve` with an exact amount rather than unlimited approval, and revoke after the transaction.

5. **Spending limits**: The program enforces per-token spending limits via `SpendingLimit` PDAs. The API must surface these limits in the quote response so the mobile app can pre-validate.

---

## 11. Decisions & Open Questions

### Decided

1. **Token-2022 support**: Include in this spec — the contract change is mechanical, not a refactor. The current program hardcodes `anchor_spl::token` (SPL Token only). Anchor provides `anchor_spl::token_interface` as a drop-in replacement that works with both SPL Token and Token-2022 mints transparently.

   **Contract changes** (all 5 instruction files: `transaction.rs`, `merchant.rs`, `point.rs`, `treasury.rs`, `withdraw.rs`):

   ```rust
   // Before:
   use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
   // After:
   use anchor_spl::token_interface::{self, Mint, TokenInterface, TokenAccount, TransferChecked};
   ```

   | Current type | Replace with |
   |---|---|
   | `Account<'info, Mint>` | `InterfaceAccount<'info, Mint>` |
   | `Account<'info, TokenAccount>` | `InterfaceAccount<'info, TokenAccount>` |
   | `Program<'info, Token>` | `Interface<'info, TokenInterface>` |
   | `token::transfer(ctx, amount)` | `token_interface::transfer_checked(ctx, amount, mint.decimals)` |

   The instruction signatures, account structures, PDAs, and logic stay identical. The only addition is passing `mint.decimals` to `transfer_checked` (required by Token-2022). The `token_program` account in each instruction struct becomes `Interface<TokenInterface>` — Anchor validates at runtime that the passed program is one of the two valid token programs (`TokenkegQ...` or `Tokenz...`).

   This makes the program future-proof for any stablecoin (IDRX, PYUSD, etc.) that launches as a Token-2022 mint on Solana. No additional instruction variants needed — same instructions work for both token standards.

   **Cargo.toml**: Enable the `token-interface` feature on `anchor-spl`:
   ```toml
   anchor-spl = { version = "0.31", features = ["token-interface"] }
   ```

2. **Versioned transactions**: Use v0 versioned transactions with address lookup tables. TakumiPay instructions reference multiple PDAs (config, txRecord, refRecord, spendingLimit, vault ATA, platform fee, etc.) — a single `processMerchantPaymentToken` call touches 10+ accounts. Versioned transactions with ALTs reduce the tx size significantly and avoid hitting the 1232-byte transaction limit. The mobile app already supports versioned transactions via `SolanaWalletKit` and `txVersionGuard.ts`. Implementation detail, not an architectural change.

3. **Priority fees & future gas sponsorship**: For v1, the user pays — same as any other Solana transaction. The mobile app already handles priority fees for plain SOL transfers via `ComputeBudgetProgram.setComputeUnitPrice`. For TakumiPay program calls, the instruction builders prepend the same compute budget instructions. The fee amount is estimated via `simulateTransaction` before signing, matching the existing pattern in `services/chains/solana/simulate.ts`.

   **Future: sponsored gas (user holds stablecoin only, no SOL needed).** Design the instruction builders and `sendAnchorInstruction` to support a separate `feePayer` from day one so the migration to sponsored gas is a config change, not a rewrite:

   - `SendAnchorInstructionArgs` includes an optional `feePayer?: { publicKey: PublicKey; mode: "user" | "sponsored" }` field. Default `"user"` — the wallet is the fee payer. When `"sponsored"`, the backend (or a relay service) is the fee payer.
   - Instruction builders do NOT hardcode `payer = wallet`. They accept a `feePayer` parameter and set it on the transaction. The wallet still signs for its own account authority, but the fee payer signature slot is left for the sponsor.
   - The sponsored flow mirrors the existing B-SVM x402 pattern: the backend builds a partially-signed versioned transaction with itself as `feePayer`, the mobile adds the user's signature, and the backend broadcasts. Same three-role separation — backend pays gas, mobile signs authority, chain settles.
   - On the EVM side, this is equivalent to the existing `sendUserOpWithUsdcPaymaster` gasless path (ERC-4337 + Circle Paymaster). On Solana, the equivalent is a backend-as-fee-payer relay — no ERC-4337 needed since Solana natively supports separate fee payers.
   - The path selector would add a `"gasless-svm"` discriminator (or reuse `"gasless"` with presence-check on a new adapter method like `sendSponsoredAnchorInstruction?`) following the space docking pattern.

4. **Durable nonces**: Yes — use durable nonces for merchant payments and product purchase settlements. The mobile app already has `services/chains/solana/durableNonce.ts`. Merchant payments are time-sensitive (quote expires) and high-value — a standard blockhash-based transaction that expires after ~60s during network congestion would force the user to restart the entire payment flow. Durable nonces eliminate this failure mode. The `sendAnchorInstruction` method on `SolanaWalletKit` should support an optional `durableNonce` parameter; the merchant payment and booking instruction builders pass it by default.
