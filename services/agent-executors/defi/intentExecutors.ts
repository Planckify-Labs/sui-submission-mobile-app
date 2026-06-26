/**
 * Sui Intent Engine mobile executors (spec §6.4, §8.4).
 *
 *   defi_intent_preview  (read)  — compile a plain-language goal into a PTB,
 *     dry-run it, run the guardian, stash it by opaque intent_id, and return
 *     { intent_id, human_summary, apy?, decoded, risk_flags, blocked }.
 *   defi_intent_execute  (write) — load the cached PTB by intent_id, re-guard
 *     it, sign+execute via the Sui WalletKit, return { digest, network }.
 *
 * The explicit-confirmation gate is the standard mobile approval sheet on
 * the `write` tool (same gate as `send_sui`) — NOT a card. The decline path
 * is the guardian's `block` flag (agent never offers execute) or the user
 * rejecting the sheet. SI-1: every step uses `context.wallet`, never a
 * home-screen active-wallet fallback. SI-3: only curated error codes reach
 * `ToolResult.error` — never a raw SDK/RPC string.
 */

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { compileIntentToPtb } from "@/services/chains/sui/intent/compileIntentToPtb";
import { runGuardian } from "@/services/chains/sui/intent/guardian/riskCheckRegistry";
import {
  IntentExecuteInputSchema,
  parseIntent,
} from "@/services/chains/sui/intent/intentSchema";
import { intentStore } from "@/services/chains/sui/intent/intentStore";
import { simulateSuiTransaction } from "@/services/chains/sui/simulation";
import { DefiError } from "@/services/defi/errors/defiErrors";
import { SuiSwapError } from "@/services/swap/sui/types";
import { parseToolInput } from "../parseInput";
import {
  getActiveSuiChain,
  getSuiKit,
  loadSuiTokens,
} from "../sui/executorContext";
import {
  ExecutorError,
  ExecutorErrorCode,
  type MobileToolExecutor,
  safeExecute,
} from "../types";
import { recordTransferHistory } from "../wallet/recordTransferHistory";

const SUI_NS = "sui" as const;
const SUI_NATIVE_COIN_TYPE = "0x2::sui::SUI";
/** MIST left untouched for gas when the spent input coin IS native SUI. */
const SUI_GAS_RESERVE_MIST = 50_000_000n; // 0.05 SUI

/**
 * Read the paying wallet's raw balance of `coinType`. Returns `null` on a
 * read error (fail-open: the dry-run still guards before signing). Read ONCE
 * per preview and reused for both the affordability gate and the
 * over-concentration guardian check (one RPC round-trip instead of two).
 */
async function readInputBalance(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<bigint | null> {
  try {
    const bal = await client.getBalance({ owner, coinType });
    return BigInt(bal.totalBalance);
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[intentExecutors] input balance read failed:", err);
    }
    return null;
  }
}

/**
 * Affordability guard (SI-3): a swap quote is a pure order-book calc and
 * ignores the wallet's balance, so the compiler will happily build a swap
 * the user can't fund. Fail with a clear `insufficient_balance` code — never
 * a raw RPC string. Fail-open when the balance is unknown.
 */
function assertAffordable(
  total: bigint | null,
  coinType: string,
  amountRaw: bigint,
): void {
  if (total === null) return;
  const needed =
    coinType === SUI_NATIVE_COIN_TYPE
      ? amountRaw + SUI_GAS_RESERVE_MIST
      : amountRaw;
  if (total < needed) {
    throw new ExecutorError(
      ExecutorErrorCode.InsufficientFunds,
      "insufficient_balance",
    );
  }
}

/** Map a compiler/swap/defi error to a curated ExecutorError (SI-3). */
function mapCompileError(err: unknown): ExecutorError {
  if (err instanceof ExecutorError) return err;
  if (err instanceof DefiError) {
    switch (err.code) {
      case "unsupported_chain":
        return new ExecutorError(
          ExecutorErrorCode.UnsupportedChain,
          err.message,
        );
      case "unsupported_asset":
      case "no_onchain_balance":
        return new ExecutorError(ExecutorErrorCode.InvalidInput, err.code);
      case "insufficient_funds":
        return new ExecutorError(ExecutorErrorCode.InsufficientFunds, err.code);
      case "network_error":
        return new ExecutorError(ExecutorErrorCode.NetworkError, err.code);
      default:
        return new ExecutorError(ExecutorErrorCode.InvalidInput, err.code);
    }
  }
  if (err instanceof SuiSwapError) {
    return err.code === "network_error"
      ? new ExecutorError(ExecutorErrorCode.NetworkError, err.code)
      : new ExecutorError(ExecutorErrorCode.InvalidInput, err.code);
  }
  // Unknown — keep raw detail out of ToolResult.error (CLAUDE.md).
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[intentExecutors] unmapped compile error:", err);
  }
  return new ExecutorError(ExecutorErrorCode.Unknown, "compile_failed");
}

/**
 * `defi_intent_preview` — READ. Compiles + dry-runs + guards, then returns
 * the plan + guardian verdict. Never signs. Renders `IntentPreviewCard`.
 */
export const defiIntentPreview: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    if (context.wallet?.namespace !== SUI_NS) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "wallet_not_sui",
      );
    }
    const intent = parseIntent(input);
    if (!intent) {
      throw new ExecutorError(ExecutorErrorCode.InvalidInput, "invalid_intent");
    }

    const chain = getActiveSuiChain();
    const tokens = await loadSuiTokens(context, chain);
    const ctx = { wallet: context.wallet, chain, tokens };

    let compiled: Awaited<ReturnType<typeof compileIntentToPtb>>;
    try {
      compiled = await compileIntentToPtb(intent, ctx);
    } catch (err) {
      // Preserve actionable swap reasons verbatim (curated codes, never raw
      // SDK text) so the card + agent can be specific — e.g.
      // `amount_below_minimum` instead of a generic `invalid_input`.
      if (err instanceof SuiSwapError) {
        return { status: "failed", error: err.code };
      }
      throw mapCompileError(err);
    }

    const client = new SuiJsonRpcClient({
      url: chain.rpcUrl,
      network: chain.network,
    });

    // Read the input balance ONCE: it feeds both the affordability gate here
    // and the over-concentration guardian check below (no duplicate RPC read).
    let inputBalanceRaw: bigint | null | undefined;
    if (compiled.inputCoinType) {
      inputBalanceRaw = await readInputBalance(
        client,
        context.wallet.address,
        compiled.inputCoinType,
      );
      // Fail fast if the wallet can't fund the input (the quote doesn't check).
      if (compiled.inputAmountRaw !== undefined) {
        assertAffordable(
          inputBalanceRaw,
          compiled.inputCoinType,
          compiled.inputAmountRaw,
        );
      }
    }

    const dryRun = await simulateSuiTransaction(client, {
      txBase64: compiled.ptbBase64,
      sender: context.wallet.address,
    });
    // Share the client + pre-read balance so the checks don't re-open
    // connections or re-read the same balance.
    const flags = await runGuardian({
      intent,
      compiled,
      dryRun,
      ctx,
      client,
      inputBalanceRaw,
    });
    // A dry-run that actually REVERTS (status set, ≠ success) is "blocked" — we
    // won't prepare a doomed PTB. A `null` dry-run means we couldn't reach the
    // node (transient RPC), NOT that the intent is unsafe — don't false-block
    // on it (the execute re-guard + on-chain minOut are the real gates).
    const wouldRevert = dryRun !== null && dryRun.status !== "success";
    const blocked = flags.some((f) => f.severity === "block") || wouldRevert;

    const intent_id = intentStore.put({
      ptbBase64: compiled.ptbBase64,
      intent,
      flags,
      summary: compiled.summary,
      inputCoinType: compiled.inputCoinType,
      inputAmountRaw: compiled.inputAmountRaw,
    });

    // What the guardian ACTUALLY read this run — real on-chain state, not a
    // canned warning. Surfaced so the card and the agent can say so plainly
    // ("guardian visibly reads real testnet state" is a scored bar). Each line
    // is true only when that read happened; all copy is hand-written.
    const inspected: string[] = [];
    if (dryRun?.status === "success") {
      inspected.push("Simulated this exact transaction on Sui");
    }
    if (typeof inputBalanceRaw === "bigint") {
      inspected.push("Checked your live balance");
    }
    if (compiled.poolObjectId) {
      inspected.push("Checked the pool's live state");
    }

    // All fields are JSON-safe (no bigint surfaced — §8.5).
    const data = {
      intent_id,
      human_summary: compiled.summary,
      apy: compiled.apy,
      decoded: compiled.decoded,
      risk_flags: flags,
      blocked,
      inspected,
    };
    return { status: "success", data, display: data };
  });

/**
 * `defi_intent_execute` — WRITE. The standard mobile approval sheet is the
 * explicit confirmation. Re-guards before signing (SI-5) so a blocked or
 * now-reverting intent can never be signed even if the model misbehaves.
 */
export const defiIntentExecute: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    if (!context.wallet?.address) {
      throw new ExecutorError(
        ExecutorErrorCode.WalletCannotExecute,
        "no_connected_wallet",
      );
    }
    if (context.wallet.namespace !== SUI_NS) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "wallet_not_sui",
      );
    }
    // NOTE: do NOT gate on `context.account` — that's a viem (EVM) account
    // and is ALWAYS null for Sui wallets (getAccountForWallet returns null
    // for non-eip155). Sui signs via the wallet kit (keypair derived from
    // the wallet), exactly like `send_sui`. A watch-only Sui wallet has no
    // signing material and fails in `signAndExecuteSuiPtb` below.

    // Validate via the SAME zod schema the server derives its JSON Schema
    // from (single source of truth; parity-tested). Fails as
    // `invalid_intent_id` -> surfaced on `reason`.
    const { intent_id: intentId } = parseToolInput(
      IntentExecuteInputSchema,
      input,
      "intent_id",
    );
    const entry = intentStore.get(intentId);
    if (!entry) {
      // The cached PTB expired (5-min TTL) or was never stored — a stale
      // precondition, NOT bad input. The agent's recovery is to re-preview.
      throw new ExecutorError(
        ExecutorErrorCode.StalePrecondition,
        "intent_expired",
      );
    }

    // SI-5 un-bypassable block: a previewed-blocked intent never signs. The
    // plan is no longer safe to run as-is — re-preview / adjust, don't retry.
    if (entry.flags.some((f) => f.severity === "block")) {
      throw new ExecutorError(
        ExecutorErrorCode.StalePrecondition,
        "intent_no_longer_safe",
      );
    }

    const chain = getActiveSuiChain();
    const client = new SuiJsonRpcClient({
      url: chain.rpcUrl,
      network: chain.network,
    });
    // Re-guard via dry-run (§5.3): refuse a now-reverting intent before signing.
    // A `null` result means the dry-run RPC itself failed (transient) — that is
    // NOT a safety violation, so surface a retryable network error instead of
    // claiming the intent is invalid. Only an actual revert (status ≠ success)
    // is `intent_no_longer_safe`. (`simulateSuiTransaction` returns null on a
    // thrown RPC error, a non-"success" status on an on-chain revert.)
    const dryRun = await simulateSuiTransaction(client, {
      txBase64: entry.ptbBase64,
      sender: context.wallet.address,
    });
    if (dryRun === null) {
      throw new ExecutorError(
        ExecutorErrorCode.NetworkError,
        "reguard_unavailable",
      );
    }
    if (dryRun.status !== "success") {
      // The re-guard dry-run now reverts — the on-chain world (pool / balance)
      // moved between preview and execute. A stale precondition, not bad
      // input: the agent should re-preview for a fresh intent, not retry this.
      throw new ExecutorError(
        ExecutorErrorCode.StalePrecondition,
        "intent_no_longer_safe",
      );
    }

    const kit = getSuiKit();
    if (!kit.signAndExecuteSuiPtb) {
      throw new ExecutorError(
        ExecutorErrorCode.NotImplemented,
        "sui_ptb_submit_unavailable",
      );
    }
    const digest = await kit.signAndExecuteSuiPtb({
      wallet: context.wallet,
      chain,
      ptbBase64: entry.ptbBase64,
    });
    intentStore.delete(intentId);

    const transaction_id = await recordTransferHistory({
      blockchains: context.blockchains,
      namespace: "sui",
      chainSlug: `sui-${chain.network}`,
      // TTransactionType is "TRANSFER" | "PAYMENT" in this codebase — record
      // the intent as a transfer so it surfaces in the activity feed.
      type: "TRANSFER",
      ...(entry.inputCoinType && entry.inputCoinType !== "0x2::sui::SUI"
        ? { contractAddress: entry.inputCoinType }
        : {}),
      amount: entry.inputAmountRaw?.toString() ?? "0",
      txHash: digest,
      fromAddress: context.wallet.address,
      toAddress: context.wallet.address,
    });

    // base58 digest in data.digest — never the hex-typed tx_hash (§6.4).
    return {
      status: "success",
      tx_confirmed: true,
      transaction_id,
      data: { digest, network: chain.network },
    };
  });

export const DEFI_INTENT_EXECUTORS: Record<string, MobileToolExecutor> = {
  defi_intent_preview: defiIntentPreview,
  defi_intent_execute: defiIntentExecute,
};
