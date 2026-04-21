/**
 * `services/nanopay/gatewayDeposit.ts` — one-time Gateway deposit
 * orchestrator for the Circle-Paymaster "gasless UX" path (spec §5.4
 * gasless table, §5.5 service module layout, milestone M4).
 *
 * Why this module exists. UMKM onboarding needs a single transport-
 * agnostic callable the deposit screen (task 34) invokes after the
 * user confirms the deposit amount. Branching on "is paymaster live on
 * this chain?" happens here, behind an opaque API — the caller passes
 * `{ payer, chain, usdc…, gatewayWallet, paymasterAddress, bundlerUrl }`
 * and gets back a tx hash plus the `gatewayDepositId` the backend
 * returned from `/deposit-receipt`.
 *
 * Layering (§5.5):
 *   - pure function `buildGatewayDepositUserOp` encodes calldata + the
 *     paymaster / usdc fields the task-35 adapter consumes.
 *   - `depositAndRecordReceipt` orchestrates: adapter-sign → bundler
 *     poll for tx hash → POST deposit-receipt. This module never holds
 *     bundler keys, never broadcasts directly — it delegates to the
 *     `WalletKitAdapter` (signer) and `api` (ky HTTP client).
 *
 * Rules (non-negotiable):
 *   - Chain-extension discipline (memory
 *     `feedback_chain_extension_discipline.md`): presence-of-method
 *     check on `kit.sendUserOpWithUsdcPaymaster`; throw a typed error
 *     for adapters that leave it `undefined` (Solana). No `if
 *     (namespace === "X")` branches.
 *   - Three-role separation (memory `feedback_role_separation.md`):
 *     the backend owns "does this intent require a deposit?" via
 *     `intent.gasless.requiresDeposit` (§6.2). This service only
 *     signs + submits + records the receipt. Never logs signatures,
 *     permit sigs, or raw call data.
 *   - Permit handling: EIP-2612 `permit` is a property of USDC on the
 *     source chain (Base mainnet supports it; some deployments don't).
 *     Per spec §5.4, Circle Paymaster pulls USDC via permit — but that
 *     happens inside the paymaster's own preamble, not ours. The
 *     mobile-side approve that the task-35 adapter prepends is enough
 *     for M4. Full EIP-2612 `permit` signing for the GatewayWallet-
 *     bound approve is a per-chain follow-up (see TODO below).
 */

import { HTTPError } from "ky";
import { encodeFunctionData } from "viem";
import type { ChainConfig } from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import type {
  SendUserOpResult,
  SendUserOpWithUsdcPaymasterArgs,
  WalletKitAdapter,
} from "../walletKit/types.ts";

/**
 * Circle `GatewayWallet.deposit(uint256 amount, address to)` — the one
 * method the onboarding tx calls. Inline ABI fragment so this pure
 * module does not reach into a shared ABI barrel.
 *
 * Signature reference: `deposit(uint256 amount, address to) external`
 * (spec §5.4, GatewayWallet batched-wallet contract).
 */
export const GATEWAY_WALLET_DEPOSIT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
] as const;

/**
 * Typed error raised when a caller passes a non-EVM adapter (Solana)
 * into the deposit service. Screens catch by `name` so the error copy
 * stays in one place instead of re-parsing the message string.
 */
export class PaymasterDepositNotSupportedError extends Error {
  readonly name = "PaymasterDepositNotSupportedError";
  readonly namespace: string;
  constructor(namespace: string) {
    super(
      `Gateway deposit via Circle Paymaster requires an EVM wallet kit; got namespace=${namespace}.`,
    );
    this.namespace = namespace;
  }
}

/**
 * Typed error for the `/deposit-receipt` POST — the onboarding screen
 * catches by `name` to decide between "retry deposit" and "contact
 * support" (spec §9.1 `DEPOSIT_FAILED`).
 */
export class DepositReceiptError extends Error {
  readonly name = "DepositReceiptError";
  readonly status: number | null;
  readonly intentId: string;
  constructor(args: {
    intentId: string;
    status: number | null;
    message: string;
  }) {
    super(args.message);
    this.status = args.status;
    this.intentId = args.intentId;
  }
}

/**
 * Arguments for `buildGatewayDepositUserOp`. `payer` is the source-chain
 * USDC owner — goes into `deposit(amount, to)` as the `to` recipient
 * so the GatewayWallet credits the user's own Gateway-ledger row.
 */
export interface BuildGatewayDepositUserOpArgs {
  wallet: TWallet;
  chain: ChainConfig;
  payer: `0x${string}`;
  usdcTokenAddress: `0x${string}`;
  usdcAmount: bigint;
  gatewayWalletAddress: `0x${string}`;
  paymasterAddress: `0x${string}`;
  bundlerUrl: string;
  /**
   * Max USDC (6-decimal units) the paymaster may pull for gas. Defaults
   * to a conservative 10 USDC cap — adapter-side approve; keep it snug
   * per task-35's "never `type(uint256).max`" rule.
   */
  paymasterApproveAmount?: bigint;
}

/**
 * Default paymaster-approve cap (10 USDC = 10_000_000 micros). Bounded
 * so a bug in the paymaster can't drain the EOA beyond this.
 */
export const DEFAULT_PAYMASTER_APPROVE_MICROS = 10_000_000n;

/**
 * Pure: produces the argument bag the task-35
 * `WalletKitAdapter.sendUserOpWithUsdcPaymaster` consumes.
 *
 * Encodes `GatewayWallet.deposit(amount, payer)` as the target
 * calldata. The task-35 adapter prepends a bounded USDC→paymaster
 * approve inside the UserOp batch so the paymaster can pull gas in
 * USDC — we do NOT add that here, it lives in the adapter so every
 * consumer gets identical approve-preamble semantics.
 *
 * TODO(base/arbitrum): Some USDC deployments expose EIP-2612 `permit`,
 * which would let us collapse the USDC→GatewayWallet approval into a
 * single typed-data signature instead of a second on-chain approve tx.
 * Gated on the chain-config flag once task 21's enriched
 * `/v1/blockchains` response surfaces a `usdc.supportsPermit2612`
 * field to mobile. For M4 we rely on Circle's GatewayWallet contract
 * accepting a just-deposited balance (the GatewayWallet pulls via the
 * paymaster context for permit-capable chains, otherwise the
 * onboarding flow expects a separate pre-approve path — not in scope
 * here).
 */
export function buildGatewayDepositUserOp(
  args: BuildGatewayDepositUserOpArgs,
): SendUserOpWithUsdcPaymasterArgs {
  if (args.chain.namespace !== "eip155") {
    throw new PaymasterDepositNotSupportedError(args.chain.namespace);
  }
  if (args.usdcAmount <= 0n) {
    throw new Error(
      `buildGatewayDepositUserOp: usdcAmount must be > 0, got ${args.usdcAmount.toString()}`,
    );
  }

  const callData = encodeFunctionData({
    abi: GATEWAY_WALLET_DEPOSIT_ABI,
    functionName: "deposit",
    args: [args.usdcAmount, args.payer],
  });

  return {
    wallet: args.wallet,
    chain: args.chain,
    target: args.gatewayWalletAddress,
    callData,
    value: 0n,
    paymasterAddress: args.paymasterAddress,
    usdcTokenAddress: args.usdcTokenAddress,
    paymasterApproveAmount:
      args.paymasterApproveAmount ?? DEFAULT_PAYMASTER_APPROVE_MICROS,
    bundlerUrl: args.bundlerUrl,
  };
}

/**
 * Backend response shape for `/v1/pay/intents/:id/deposit-receipt`
 * (spec §6.2 `DepositReceiptResponse`).
 */
export interface DepositReceiptResponse {
  depositId: string;
  status: "PENDING_ATTESTATION" | "CONFIRMED" | "FAILED";
}

/**
 * Body of `POST /v1/pay/intents/:id/deposit-receipt` (spec §6.2).
 * Exported so tests can assert the exact JSON shape without duplicating
 * the literal field names across modules.
 */
export interface DepositReceiptRequest {
  txHash: `0x${string}`;
  chainId: number;
  useCirclePaymaster: boolean;
}

/**
 * HTTP seam. Production passes `postDepositReceipt` wired to the shared
 * `api` ky instance (see `useGatewayDeposit.ts`). Tests inject a stub
 * so the Node test bench never has to load `@/constants/configs/ky`
 * (which reaches into expo-router / expo-secure-store).
 */
export type PostDepositReceipt = (args: {
  intentId: string;
  body: DepositReceiptRequest;
}) => Promise<DepositReceiptResponse>;

export interface DepositAndRecordReceiptArgs
  extends BuildGatewayDepositUserOpArgs {
  /** Intent id the deposit is being recorded against (backend correlates via `intent.gasless`). */
  intentId: string;
  /** The WalletKit adapter for the payer's namespace. Presence-checked for EVM. */
  walletKit: WalletKitAdapter;
  /**
   * Optional hook for polling the bundler for the underlying tx hash.
   * When omitted, callers pass the `userOpHash` itself as the tx hash
   * (acceptable for M4 since the backend receipt endpoint accepts
   * either and de-dupes via Circle's own `POST /v1/deposits` lookup;
   * see task 38 §6.5). Override for tests / advanced bundler wiring.
   */
  waitForUserOpTxHash?: (userOpHash: `0x${string}`) => Promise<`0x${string}`>;
  /**
   * Optional HTTP poster. Defaults to the ky-backed `api` helper. Tests
   * inject a stub to skip loading the production HTTP client (which
   * pulls in `expo-router` / `expo-secure-store` and can't run under
   * plain Node).
   */
  postReceipt?: PostDepositReceipt;
}

export interface DepositAndRecordReceiptResult {
  /** Underlying source-chain tx hash (post bundler inclusion). */
  txHash: `0x${string}`;
  /** `gateway_deposits.id` returned by the backend receipt endpoint. */
  gatewayDepositId: string;
  /** Status at the moment the receipt was recorded. */
  status: DepositReceiptResponse["status"];
  /** Always `true` from this service — Paymaster branch only. */
  usedCirclePaymaster: true;
}

/**
 * Orchestrates the full M4 deposit flow:
 *
 *   1. Presence-check `walletKit.sendUserOpWithUsdcPaymaster` — throws
 *      `PaymasterDepositNotSupportedError` on a non-EVM kit.
 *   2. Build the adapter args via `buildGatewayDepositUserOp` and call
 *      the adapter to submit the UserOp.
 *   3. Poll the bundler for the underlying tx hash (or fall back to
 *      the `userOpHash` when the hook is omitted).
 *   4. POST the receipt to `/v1/pay/intents/:id/deposit-receipt` per
 *      spec §6.2. Typed failure surface `DepositReceiptError`.
 *
 * Never logs signatures, raw call data, or permit sigs — only intent
 * id, tx hash, and status strings.
 */
export async function depositAndRecordReceipt(
  args: DepositAndRecordReceiptArgs,
): Promise<DepositAndRecordReceiptResult> {
  if (typeof args.walletKit.sendUserOpWithUsdcPaymaster !== "function") {
    throw new PaymasterDepositNotSupportedError(args.walletKit.namespace);
  }

  const userOpArgs = buildGatewayDepositUserOp({
    wallet: args.wallet,
    chain: args.chain,
    payer: args.payer,
    usdcTokenAddress: args.usdcTokenAddress,
    usdcAmount: args.usdcAmount,
    gatewayWalletAddress: args.gatewayWalletAddress,
    paymasterAddress: args.paymasterAddress,
    bundlerUrl: args.bundlerUrl,
    paymasterApproveAmount: args.paymasterApproveAmount,
  });

  const sendResult: SendUserOpResult =
    await args.walletKit.sendUserOpWithUsdcPaymaster(userOpArgs);

  // Pragmatic fallback: if no bundler-poll hook was supplied, treat the
  // `userOpHash` as the tx hash. Backend's `/v1/deposits` lookup (§6.5
  // via task 38) matches on depositor + amount so either hex identifier
  // lets the row land — ops can ignore the shape at ingestion time.
  const txHash = args.waitForUserOpTxHash
    ? await args.waitForUserOpTxHash(sendResult.userOpHash)
    : sendResult.userOpHash;

  const chainId =
    args.chain.namespace === "eip155" ? args.chain.chain.id : null;
  if (chainId === null) {
    // This path is unreachable — `buildGatewayDepositUserOp` throws on
    // non-EVM chains. Kept as a defensive narrow so the body below is
    // `number`-typed rather than `number | null`.
    throw new PaymasterDepositNotSupportedError(args.chain.namespace);
  }

  const body: DepositReceiptRequest = {
    txHash,
    chainId,
    useCirclePaymaster: true,
  };

  if (!args.postReceipt) {
    throw new Error(
      "depositAndRecordReceipt: `postReceipt` is required. Callers should pass `defaultPostDepositReceipt` from `useGatewayDeposit.ts`, or a stub in tests.",
    );
  }

  let response: DepositReceiptResponse;
  try {
    response = await args.postReceipt({ intentId: args.intentId, body });
  } catch (err) {
    if (err instanceof HTTPError) {
      throw new DepositReceiptError({
        intentId: args.intentId,
        status: err.response.status,
        message:
          err.response.status === 404
            ? `Deposit receipt endpoint not available yet (intent ${args.intentId}).`
            : `Deposit receipt POST failed with status ${err.response.status} for intent ${args.intentId}.`,
      });
    }
    throw err;
  }

  return {
    txHash,
    gatewayDepositId: response.depositId,
    status: response.status,
    usedCirclePaymaster: true,
  };
}

/**
 * URL template for the deposit-receipt endpoint. Exported so both the
 * Query-hook module (which wraps `api`) and any future caller can
 * share exactly one copy of the path.
 */
export function depositReceiptEndpoint(intentId: string): string {
  return `v1/pay/intents/${encodeURIComponent(intentId)}/deposit-receipt`;
}
