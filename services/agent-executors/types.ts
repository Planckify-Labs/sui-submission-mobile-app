/**
 * Shared types for the mobile agent tool executor registry.
 *
 * These types implement the mobile side of the Takumi Agent Protocol
 * (AGENT_PROTOCOL.md §10 "Mobile-Side Contract"). Each function in the
 * registry (see `./index.ts`) consumes a `ToolPendingPayload.input` object
 * and returns a `ToolResult` — never throws — so the SSE dispatcher in
 * task 09 can forward the result verbatim via `POST /chat/respond`.
 *
 * ---
 *
 * Deviation from the task-spec draft signature
 * --------------------------------------------
 * The task spec (task 10) proposes:
 *
 *     (input, wallet: WalletClient) => Promise<ToolResult>
 *
 * That signature assumes the executor already has a pre-built
 * `WalletClient` bound to the correct chain. In practice the mobile app
 * needs to route per-`chain_id` for every tool call (see §3 "Multi-Chain
 * Targeting" — reads may arrive in parallel for different chains), so we
 * cannot pre-build a single wallet client. Instead we pass an
 * `ExecutorContext` that carries the active wallet + account + the
 * blockchains list, and each executor calls `resolveChainClients()` from
 * `./chainRouter.ts` to obtain `{ publicClient, walletClient }` keyed on
 * `input.chain_id`.
 *
 * This keeps a single code path for read / simulate / write tools and
 * matches how `walletService.ts` / `utils/clients.ts` already manage
 * clients in the rest of the app.
 */

import type { Account, PublicClient, WalletClient } from "viem";
import type { TBlockchain } from "@/api/types/blockchain";
import type { TWallet } from "@/constants/types/walletTypes";

/**
 * Outcome shape every executor must return. Mirrors the spec in
 * AGENT_PROTOCOL.md §10 "Tool Executor" — the SSE dispatcher serializes
 * this directly as the `tool_result.data` body.
 */
export interface ToolResult {
  status: "success" | "failed";
  tx_hash?: `0x${string}`;
  tx_confirmed?: boolean;
  data?: unknown;
  error?: string;
  /**
   * Backend transaction record id created after a successful write.
   * Present when the executor successfully called `transactionApi.createTransaction`
   * (mirrors the send.tsx history-recording path). The dispatcher threads
   * this into `pendingTxStore` so the PendingTxCard can link to the
   * activity-detail screen.
   */
  transaction_id?: string;
}

/**
 * Inputs arrive from the server as `Record<string, unknown>`. Executors
 * narrow them with small type assertions — we do NOT pull in zod here
 * because the server already validated against the tool schema and
 * adding a second layer of runtime validation would just duplicate work
 * and cost bundle size.
 */
export type ToolInput = Record<string, unknown>;

/**
 * Context each executor receives. Built once by the SSE dispatcher (task
 * 09) per session, reused across every tool call in that session.
 *
 * - `wallet` — the currently connected mobile wallet (from `useWallet`).
 * - `account` — a viem Account derived via `walletService.getAccountForWallet`.
 *   May be `null` for watch-only wallets, in which case write executors
 *   must fail with `wallet_type_cannot_execute`.
 * - `blockchains` — the full list of `TBlockchain` rows from
 *   `useBlockchainsWithStorage`. Used by `chainRouter` to build per-chain
 *   viem clients. The dispatcher is responsible for keeping this fresh —
 *   executors treat it as a read-only snapshot for the duration of the
 *   call.
 */
export interface ExecutorContext {
  wallet: TWallet;
  account: Account | null;
  blockchains: TBlockchain[];
  /**
   * Chain id of the wallet's currently-active chain. Used as a
   * fallback when a tool input omits `chain_id` — the server-side
   * mobile-tool schema stub is fully permissive
   * (`properties: {}`, see `agent-api/src/chat.service.ts`), so the
   * LLM is not schema-bound to pass chain_id on every call. Falling
   * back to the active chain mirrors the "use wallet_context.chain_id
   * directly" guidance in `AGENT_PROTOCOL.md` §3.
   */
  activeChainId?: number;
}

/**
 * The signature every entry in the `EXECUTORS` map implements.
 *
 * NOTE on the deviation from the spec: the second argument is an
 * `ExecutorContext` rather than a pre-built `WalletClient`. See the
 * top-of-file block comment for the rationale.
 */
export type MobileToolExecutor = (
  input: ToolInput,
  context: ExecutorContext,
) => Promise<ToolResult>;

/**
 * Resolved per-chain client bundle returned by `chainRouter.resolveChainClients`.
 */
export interface ChainClients {
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  chainId: number;
}

/**
 * Stable string error codes that the agent protocol §9 recognises as
 * `tool_rejected.reason` values. Keep this list in sync with the server
 * tool-result handler — do not invent new codes here without a
 * corresponding server change.
 */
export const ExecutorErrorCode = {
  MissingChainId: "missing_chain_id",
  UnsupportedChain: "unsupported_chain",
  WalletCannotExecute: "wallet_type_cannot_execute",
  InsufficientFunds: "insufficient_funds",
  NetworkError: "network_error",
  NotImplemented: "not_implemented",
  InvalidInput: "invalid_input",
  // Catch-all curated code. Never surface raw runtime / response text
  // on `ToolResult.error` — that string ends up in LLM context on the
  // next turn (CLAUDE.md user-facing-error rule). `mapUnknownError`
  // falls back to this when nothing else matches.
  Unknown: "unknown_error",
} as const;

export type ExecutorErrorCodeValue =
  (typeof ExecutorErrorCode)[keyof typeof ExecutorErrorCode];

/**
 * Typed error thrown internally by helpers so `safeExecute` can map
 * known failure modes onto stable `ToolResult.error` codes.
 */
export class ExecutorError extends Error {
  public readonly code: ExecutorErrorCodeValue;
  constructor(code: ExecutorErrorCodeValue, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "ExecutorError";
  }
}

/**
 * Wraps an async executor body with the non-negotiable try/catch contract
 * from the task spec: every executor must return a `ToolResult` — never
 * throw, never reject. Known `ExecutorError` codes become the `error`
 * field verbatim; unknown errors are mapped via `mapUnknownError`.
 */
export async function safeExecute<T extends ToolResult>(
  body: () => Promise<T>,
): Promise<ToolResult> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof ExecutorError) {
      return { status: "failed", error: err.code };
    }
    return { status: "failed", error: mapUnknownError(err) };
  }
}

/**
 * Best-effort classification of a thrown error into one of the
 * agent-protocol reason codes.
 *
 * CLAUDE.md user-facing-error rule — and the agent-context equivalent:
 * never propagate raw runtime / response text into `ToolResult.error`,
 * because the server feeds that field back into the LLM on the next
 * turn. Every branch here returns a curated code. The fallback used
 * to be `String(err)`; it is now `ExecutorErrorCode.Unknown`.
 */
export function mapUnknownError(err: unknown): string {
  // Viem throws concrete subclasses — match by name so we avoid a hard
  // dependency on viem's error class identity (which has historically
  // drifted between minor versions).
  const name =
    (err instanceof Error && err.name) ||
    (err as { name?: string } | null)?.name ||
    "";
  const message =
    (err instanceof Error && err.message) ||
    (err as { message?: string } | null)?.message ||
    "";

  if (
    name === "InsufficientFundsError" ||
    /insufficient funds/i.test(message)
  ) {
    return ExecutorErrorCode.InsufficientFunds;
  }
  if (
    name === "HttpRequestError" ||
    name === "TimeoutError" ||
    name === "RpcRequestError" ||
    /network|fetch|timeout|ECONN|ENOTFOUND/i.test(message)
  ) {
    return ExecutorErrorCode.NetworkError;
  }

  // Sui typed transfer / token-kind errors (spec §4.1). Match by `name`
  // rather than `instanceof` so module-reload identity drift can't
  // silently downgrade these to "unknown error" strings. Order is
  // unspecified within this block — none of the names overlap.
  if (name === "SuiUnsupportedTokenKindError") {
    return ExecutorErrorCode.NotImplemented;
  }
  if (name === "SuiInsufficientCoinError") {
    return ExecutorErrorCode.InsufficientFunds;
  }
  if (name === "SuiRegulatedCoinDeniedError") {
    // Used to surface the typed error's `message` (which embeds the
    // coin type) so the agent could explain *why* the deny list
    // rejected. That route violated the "never put raw text on the
    // `error` field" rule — the LLM would see the message verbatim on
    // the next turn. Return a curated code instead; the typed coin
    // detail lives on `data.coin_type` for executors that want to
    // expose it cleanly.
    if (isDev() && message) {
      console.warn(
        "[mapUnknownError] SuiRegulatedCoinDeniedError suppressed:",
        message,
      );
    }
    return ExecutorErrorCode.InvalidInput;
  }
  if (name === "SuiClosedLoopPolicyDeniedError") {
    return ExecutorErrorCode.InvalidInput;
  }
  if (name === "SuiClosedLoopPolicyUnresolvedError") {
    return ExecutorErrorCode.NotImplemented;
  }

  // Catch-all — never return `String(err)`; raw runtime text would end
  // up in LLM context on the next turn. Curated code; dev sees the
  // detail via the console.warn below.
  if (isDev()) {
    console.warn(
      `[mapUnknownError] no specific mapping for ${name || "unknown"}; surfacing as unknown_error. Detail:`,
      message || err,
    );
  }
  return ExecutorErrorCode.Unknown;
}

/**
 * `__DEV__` is RN's global, but this module also imports from test
 * harnesses (Vitest, node:test) that don't define it. Guard so a
 * passing-through call site doesn't throw `ReferenceError` in those
 * contexts. In production / dev RN bundles the global is wired up by
 * the bundler so this resolves to a fast boolean read.
 */
function isDev(): boolean {
  return (
    typeof (globalThis as { __DEV__?: boolean }).__DEV__ === "boolean" &&
    (globalThis as { __DEV__?: boolean }).__DEV__ === true
  );
}

/**
 * Retryable-error predicate used by the higher-level retry wrapper in
 * AGENT_PROTOCOL §10 "Retry Logic". Exported so task 09 and the retry
 * wrapper (`./retry.ts`) can reuse it.
 *
 * The substring set here is the normative one from AGENT_PROTOCOL §10:
 * `network`, `timeout`, `fetch failed`, `nonce`, `rate limit`, and
 * `econnreset`. We additionally match the canonical `ExecutorErrorCode`
 * values and `ENOTFOUND` for DNS flaps — these are strict supersets of
 * the spec list so they don't change the retry semantics, just catch
 * the error strings viem actually produces in practice.
 */
export function isRetryableError(error: string | undefined): boolean {
  if (!error) return false;
  if (error === ExecutorErrorCode.NetworkError) return true;
  const e = error.toLowerCase();
  return (
    e.includes("network") ||
    e.includes("timeout") ||
    e.includes("fetch failed") ||
    e.includes("fetch") ||
    e.includes("nonce") ||
    e.includes("rate limit") ||
    e.includes("econnreset") ||
    e.includes("enotfound")
  );
}

/**
 * Narrow a `ToolInput` field to a 0x-prefixed hex address. Throws an
 * `ExecutorError` with `invalid_input` if the field is missing or
 * malformed — `safeExecute` will surface it to the caller.
 */
export function requireAddress(input: ToolInput, key: string): `0x${string}` {
  const value = input[key];
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new ExecutorError(
      ExecutorErrorCode.InvalidInput,
      `missing_or_invalid_${key}`,
    );
  }
  return value as `0x${string}`;
}

/**
 * Narrow a `ToolInput` field to a hex transaction hash.
 */
export function requireTxHash(input: ToolInput, key: string): `0x${string}` {
  const value = input[key];
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ExecutorError(
      ExecutorErrorCode.InvalidInput,
      `missing_or_invalid_${key}`,
    );
  }
  return value as `0x${string}`;
}

/**
 * Parse a `_wei` / bigint-ish field that the server always sends as a
 * base-10 string. Accepts a string, a number (safe integer only), or a
 * bigint (defensive — the protocol says string only). Rejects anything
 * else with `invalid_input`.
 */
export function requireBigInt(input: ToolInput, key: string): bigint {
  const value = input[key];
  try {
    if (typeof value === "string" && value.length > 0) {
      return BigInt(value);
    }
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return BigInt(value);
    }
  } catch {
    // fall through
  }
  throw new ExecutorError(
    ExecutorErrorCode.InvalidInput,
    `missing_or_invalid_${key}`,
  );
}

/**
 * Extract a required `chain_id` from the tool input. Every mobile tool
 * MUST route by `input.chain_id` (see spec §3) — we never fall back to
 * the active wallet chain, because that would silently break parallel
 * cross-chain reads.
 */
export function requireChainId(input: ToolInput): number {
  const value = input.chain_id;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ExecutorError(
      ExecutorErrorCode.MissingChainId,
      "missing chain_id",
    );
  }
  return value;
}

/**
 * Like `requireChainId` but falls back to `context.activeChainId`
 * when the tool input omits `chain_id`. Use this in executors rather
 * than `requireChainId` directly — the server's mobile tool schema
 * is a permissive `{}` stub, so the LLM is not schema-bound to pass
 * `chain_id` on every call and occasionally drops it. Falling back
 * to the active chain matches the protocol's "use
 * wallet_context.chain_id directly" guidance in §3.
 *
 * Cross-chain calls (`"check my balance on all chains"`) still work
 * because the agent passes an explicit `chain_id` per call there,
 * which takes priority over the fallback.
 */
export function resolveChainId(
  input: ToolInput,
  context: ExecutorContext,
): number {
  const value = input.chain_id;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  const fallback = context.activeChainId;
  if (
    typeof fallback === "number" &&
    Number.isInteger(fallback) &&
    fallback > 0
  ) {
    return fallback;
  }
  throw new ExecutorError(
    ExecutorErrorCode.MissingChainId,
    "missing chain_id (no input and no active chain in context)",
  );
}

/**
 * Optional string field reader. Returns `undefined` when missing,
 * throws `invalid_input` when present but wrong type.
 */
export function optionalString(
  input: ToolInput,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ExecutorError(ExecutorErrorCode.InvalidInput, `invalid_${key}`);
  }
  return value;
}

/**
 * Required string field reader.
 */
export function requireString(input: ToolInput, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ExecutorError(
      ExecutorErrorCode.InvalidInput,
      `missing_or_invalid_${key}`,
    );
  }
  return value;
}
