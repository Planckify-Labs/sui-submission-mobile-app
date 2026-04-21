/**
 * `services/nanopay/pathADirectArc.ts` — Path A direct-on-Arc settlement
 * (spec §5.1, milestone M5).
 *
 * Arc is Circle's L1 where USDC is the native gas token. No GatewayWallet
 * deposit, no Paymaster, no UserOp — paying a merchant reduces to a
 * single native-value transaction whose `value` IS the USDC amount. This
 * module orchestrates that path for the cases where Path B (Circle
 * Nanopayments) is undesirable: large transfers where the batched
 * settle latency matters, or a user who hasn't deposited into Gateway
 * yet and just wants to pay directly from their Arc USDC balance.
 *
 * Layering (§5.5, matches `gatewayDeposit.ts`):
 *   - `executePathA` is the orchestrator — sanity-check chain, delegate
 *     the actual tx build + broadcast to `kit.sendNativeTransfer`, and
 *     return the tx hash.
 *   - `watchArcPayoutEvent` blocks on `viem.waitForTransactionReceipt`
 *     against the Arc public client and resolves with the confirmed
 *     receipt so the screen can flip to "paid."
 *   - `postOnChainReceipt` soft-links the backend receipt endpoint so
 *     takumipay-api can trigger the Xendit payout leg without going
 *     through the Circle settle proxy. Endpoint may 404 during rollout
 *     — we log and swallow so the user's on-chain confirmation is
 *     never gated on backend deployment timing.
 *
 * Rules (non-negotiable):
 *   - Chain-extension discipline (memory
 *     `feedback_chain_extension_discipline.md`): Path A is Arc-only, but
 *     we do NOT branch on `chainId === 5042002`. The guard is
 *     `chain.nativeCurrency.symbol === "USDC"` — any future USDC-native
 *     chain (Arc mainnet, Arc-like L2s, …) is automatically eligible
 *     without a hardcode change. Non-Arc chains raise a typed error.
 *   - Three-role separation (memory `feedback_role_separation.md`):
 *     the wallet signs + broadcasts directly on Arc; the backend is
 *     informed after-the-fact via `postOnChainReceipt`. Mobile never
 *     asks the server to settle — the chain IS the settle.
 *   - Copy-audience rule (§3.7 of the spec): user-facing copy in
 *     `app/pay-merchant.tsx` says "Send USDC" — nothing about "native
 *     transfer," "gas," or "chainId." Those live in error messages
 *     only, and only for dev surfacing.
 */

import { HTTPError } from "ky";
import { type PublicClient } from "viem";
import type {
  ChainConfig,
  EvmChainConfig,
} from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import type { WalletKitAdapter } from "../walletKit/types.ts";

/**
 * Typed error raised when Path A is invoked on a chain where USDC is
 * not the native currency. Screens / tests catch by `name` so copy
 * lives in one place. The `chainId` and `symbol` fields let dev
 * surfaces explain what went wrong without re-parsing the message.
 */
export class PathANotOnArcError extends Error {
  readonly name = "PathANotOnArcError";
  readonly chainId: number | string | null;
  readonly nativeSymbol: string | null;
  constructor(args: {
    chainId: number | string | null;
    nativeSymbol: string | null;
  }) {
    super(
      `Path A requires a chain where USDC is the native currency (e.g. Arc); ` +
        `got chainId=${args.chainId} nativeSymbol=${args.nativeSymbol ?? "<unknown>"}.`,
    );
    this.chainId = args.chainId;
    this.nativeSymbol = args.nativeSymbol;
  }
}

/**
 * Typed error for the `/on-chain-receipt` POST — surfaced to the
 * orchestrator's debug log, but NOT bubbled up to the user: Path A
 * succeeded the moment the on-chain tx confirmed, regardless of
 * whether the backend has been informed yet. The backend watcher
 * (task 40 server-side) reconciles via `Transfer` events; this POST
 * is purely a latency hint.
 */
export class OnChainReceiptError extends Error {
  readonly name = "OnChainReceiptError";
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
 * Arguments for `executePathA`. `usdcAmount` is in 6-decimal USDC
 * atomic units (micros) — same view the rest of the payout pipeline
 * uses. Arc's native precision is technically 18 decimals, but every
 * call site (backend intent, merchant quote, UI display) is on the
 * 6-decimal ERC-20 interface view — matching that here avoids a
 * conversion dance at the boundary.
 */
export interface ExecutePathAArgs {
  /** Source-chain EOA performing the transfer. Used for telemetry only; signer is on `wallet`. */
  payer: `0x${string}`;
  /** Destination address from `intent.usdc.treasury` (§6.2). Never hardcoded. */
  merchantAddress: `0x${string}`;
  /** USDC amount in 6-decimal atomic units (micros). */
  usdcAmount: bigint;
  /** Chain the transfer is sent on. Must be Arc (or any USDC-native chain). */
  chain: ChainConfig;
  /** Payer's wallet record — passed through to the kit signer. */
  wallet: TWallet;
  /** Resolved `WalletKitAdapter` for the payer's namespace. */
  walletKit: WalletKitAdapter;
}

export interface ExecutePathAResult {
  /** EVM transaction hash of the Arc transfer. */
  txHash: `0x${string}`;
  /** Viem chain id the transfer landed on (Arc testnet / mainnet). */
  chainId: number;
}

/**
 * Arc-only guard. Returns the narrowed EVM chain when `chain` has
 * USDC as its native currency symbol (case-insensitive); throws
 * `PathANotOnArcError` otherwise. Staying on `nativeCurrency.symbol`
 * instead of a chainId allowlist means Arc mainnet cut-over (task 48)
 * requires zero changes here.
 */
function assertUsdcNativeChain(chain: ChainConfig): EvmChainConfig {
  if (chain.namespace !== "eip155") {
    throw new PathANotOnArcError({
      chainId: null,
      nativeSymbol: null,
    });
  }
  const symbol = chain.chain.nativeCurrency?.symbol;
  if (typeof symbol !== "string" || symbol.toUpperCase() !== "USDC") {
    throw new PathANotOnArcError({
      chainId: chain.chain.id,
      nativeSymbol: symbol ?? null,
    });
  }
  return chain;
}

/**
 * Orchestrates the Path A transfer:
 *
 *   1. Sanity-check the chain — must be Arc (USDC-native).
 *   2. Delegate to `walletKit.sendNativeTransfer({ to, amount })` —
 *      the kit handles signer reconstruction + broadcast. `amount`
 *      IS the USDC micros value; on Arc that's native wei.
 *   3. Return `{ txHash, chainId }`. The caller starts the watcher
 *      separately so UI can render a spinner without blocking on
 *      confirmation.
 *
 * Never logs signatures, raw tx bytes, or the wallet's private-key
 * material. Only the tx hash is surfaced.
 */
export async function executePathA(
  args: ExecutePathAArgs,
): Promise<ExecutePathAResult> {
  if (args.usdcAmount <= 0n) {
    throw new Error(
      `executePathA: usdcAmount must be > 0, got ${args.usdcAmount.toString()}`,
    );
  }
  const evmChain = assertUsdcNativeChain(args.chain);

  const txHash = (await args.walletKit.sendNativeTransfer({
    wallet: args.wallet,
    to: args.merchantAddress,
    amount: args.usdcAmount,
    chain: evmChain,
  })) as `0x${string}`;

  return {
    txHash,
    chainId: evmChain.chain.id,
  };
}

/**
 * Arguments for `watchArcPayoutEvent`. The receipt polling is delegated
 * to viem's `waitForTransactionReceipt`, which already implements the
 * right RPC polling cadence + 60 s timeout default. `publicClient` is
 * optional — the default uses `getPublicClient(chain.chain)` so the
 * module stays Arc-RPC aware without a separate seam. Tests inject a
 * stub to avoid real RPC calls.
 */
export interface WatchArcPayoutEventArgs {
  chain: ChainConfig;
  txHash: `0x${string}`;
  /** Test seam — when omitted, a fresh public client is created. */
  publicClient?: Pick<PublicClient, "waitForTransactionReceipt">;
}

export interface WatchArcPayoutEventResult {
  /** Always `"confirmed"` — failed receipts throw instead. */
  status: "confirmed";
  txHash: `0x${string}`;
  chainId: number;
  blockNumber: bigint;
}

/**
 * Blocks until the Arc tx receipt is available, then resolves with
 * `{ status: "confirmed", … }`. Reverts raise a descriptive `Error`
 * with the receipt's `status` surfaced — callers map to the shared
 * `classifyPaymentError` helper.
 */
export async function watchArcPayoutEvent(
  args: WatchArcPayoutEventArgs,
): Promise<WatchArcPayoutEventResult> {
  const evmChain = assertUsdcNativeChain(args.chain);
  // Lazy-load the production RPC client so the Node test bench never
  // pulls in `utils/clients.ts` (which reaches for React Native-tinted
  // viem exports). Tests always pass `publicClient`; production
  // `/pay-merchant` does not.
  const client =
    args.publicClient ??
    ((await import("../../utils/clients.ts")).getPublicClient(
      evmChain.chain,
    ) as Pick<PublicClient, "waitForTransactionReceipt">);

  const receipt = await client.waitForTransactionReceipt({
    hash: args.txHash,
  });

  if (receipt.status !== "success") {
    throw new Error(
      `Path A tx ${args.txHash} confirmed with status=${receipt.status}.`,
    );
  }

  return {
    status: "confirmed",
    txHash: args.txHash,
    chainId: evmChain.chain.id,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Body of `POST /v1/pay/intents/:id/on-chain-receipt`. Tells the backend
 * the user settled Path A directly on-chain so it can trigger the
 * Xendit payout leg without waiting for the (unused) Circle settle
 * response. Backend watcher still reconciles via on-chain `Transfer`
 * events — this POST is just a latency hint.
 */
export interface OnChainReceiptRequest {
  txHash: `0x${string}`;
  chainId: number;
  path: "A";
}

export interface OnChainReceiptResponse {
  id: string;
  status: string;
}

/**
 * HTTP seam. Production passes `postOnChainReceipt` wired to the shared
 * `api` ky instance (see `useIntentStatus.ts` for the analogous
 * pattern). Tests inject a stub so the Node test bench never has to
 * load `@/constants/configs/ky`.
 */
export type PostOnChainReceipt = (args: {
  intentId: string;
  body: OnChainReceiptRequest;
}) => Promise<OnChainReceiptResponse>;

/**
 * URL template for the on-chain-receipt endpoint. Exported so both
 * the Query-hook site and any future caller share exactly one copy.
 */
export function onChainReceiptEndpoint(intentId: string): string {
  return `v1/pay/intents/${encodeURIComponent(intentId)}/on-chain-receipt`;
}

/**
 * Soft-link to the backend on-chain-receipt endpoint. Endpoint may not
 * exist yet (backend Path A watcher is a separate PR) — 404 is treated
 * as success with a `__DEV__` log so the user's on-chain confirmation
 * is never blocked on backend deploy timing. Other non-2xx responses
 * surface a typed `OnChainReceiptError` the caller can log but
 * intentionally SHOULD NOT display: the chain is the source of truth.
 */
export async function postOnChainReceipt(args: {
  intentId: string;
  txHash: `0x${string}`;
  chainId: number;
  poster: PostOnChainReceipt;
}): Promise<OnChainReceiptResponse | null> {
  const body: OnChainReceiptRequest = {
    txHash: args.txHash,
    chainId: args.chainId,
    path: "A",
  };
  try {
    return await args.poster({ intentId: args.intentId, body });
  } catch (err) {
    if (err instanceof HTTPError) {
      const status = err.response.status;
      if (status === 404) {
        // Endpoint not live yet — swallow. On-chain state is canonical;
        // the backend watcher will catch up via `Transfer` events.
        if (isDevRuntime()) {
          console.log(
            `[pathADirectArc] on-chain-receipt endpoint 404 for intent ${args.intentId}; backend watcher will reconcile via Transfer events.`,
          );
        }
        return null;
      }
      throw new OnChainReceiptError({
        intentId: args.intentId,
        status,
        message: `On-chain receipt POST failed with status ${status} for intent ${args.intentId}.`,
      });
    }
    throw err;
  }
}

/**
 * `__DEV__` shim — Metro injects `__DEV__` as a global at bundle time,
 * but the Node test bench has no such binding. Reach through
 * `globalThis` to avoid a ReferenceError under Node while still
 * honouring the RN-side flag in production builds.
 */
function isDevRuntime(): boolean {
  const flag = (globalThis as unknown as { __DEV__?: boolean }).__DEV__;
  return typeof flag === "boolean" ? flag : false;
}
