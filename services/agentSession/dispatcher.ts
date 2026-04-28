/**
 * SSE `tool_pending` dispatcher.
 *
 * Called once per `tool_pending` event with the parsed payload and the
 * current `AgentSession`. Decides — via `resolveUxTreatment` — whether
 * to execute silently, show a preview, show an approval sheet, or
 * reject the call outright. This file is the routing layer; actual
 * tool execution goes through `executeToolWithRetry` → `EXECUTORS`.
 *
 * Strict rules (spec §10, non-negotiables for this task):
 *
 *   1. NO executor logic here. We only call `executeToolWithRetry`.
 *   2. NO UI imports. Preview / approval sheet callbacks are injected
 *      into the session via `AgentSessionUIBindings` — tasks 13 / 14
 *      wire them from the chat screen.
 *   3. Dedupe by `tool_call_id` against `session.pending_approvals`
 *      BEFORE any `await`, so a reconnect-triggered re-emit never
 *      races with the original invocation.
 *   4. Add the payload to `pending_approvals` before any `await` (same
 *      reason). Remove on the resolved path.
 */

import { pendingTxStore } from "../pendingTxStore.ts";
import {
  type ConnectedWallet,
  resolveUXTreatment,
  type TransferInfo,
  type UXTreatment,
} from "../resolveUxTreatment.ts";
import { NATIVE_TOKEN_KEY } from "../transferThresholdStore.ts";
import type { AgentSession } from "./agentSession.ts";
import { postProgress, postRespond, rejectTool } from "./networkHelpers.ts";
import type { ToolPendingPayload, ToolResult } from "./protocol.ts";

/**
 * Delay after which we ping the server with a progress hint so it can
 * emit a natural "please wait" message on the SSE. Kept short so the
 * user gets acknowledgement before they assume the app froze, but long
 * enough that fast tool calls never pay for a mini inference.
 */
const DELAY_HINT_MS = 3000;

/**
 * Entry point called by the SSE event loop. Never throws — all errors
 * are caught and surfaced via `session.ui.showError` / `rejectTool`.
 */
export async function handleToolPending(
  payload: ToolPendingPayload,
  session: AgentSession,
): Promise<void> {
  const toolCallId = payload.tool_call_id;

  // --- Dedupe: reconnect re-emit guard -----------------------------
  // The SSE client already dedupes, but a second layer here protects
  // against any future transport swap (e.g. a real EventSource on
  // web) that doesn't.
  if (session.pending_approvals.has(toolCallId)) {
    return;
  }

  // Reserve the slot BEFORE any async work.
  session.pending_approvals.set(toolCallId, payload);

  // Inline the tool as a part on the current assistant message so the
  // registered StructuredUI card renders at the correct position in
  // the thread (generative-ui-spec §4.3). State flips to
  // `output-available` / `output-error` when the tool resolves in
  // `runNonInteractive`.
  try {
    session.ui.upsertToolPart?.({
      toolCallId,
      toolName: payload.name,
      input: payload.input,
      state: "input-available",
    });
  } catch (err) {
    console.warn(
      `[agentSession] upsertToolPart(pending) threw: ${String(err)}`,
    );
  }

  const wallet = getConnectedWallet(session);
  if (!wallet) {
    // No wallet bound — we can't reason about policy. Reject the
    // tool so the agent sees a typed failure rather than a hang.
    session.pending_approvals.delete(toolCallId);
    await safeReject(payload, session, "wallet_type_cannot_execute");
    return;
  }

  let treatment: UXTreatment;
  try {
    treatment = resolveUXTreatment(
      payload.meta.capability,
      payload.name,
      wallet,
      session.session_id,
      payload.meta.amount_usd,
      extractTransferInfo(payload),
    );
  } catch (err) {
    session.pending_approvals.delete(toolCallId);
    session.ui.showError?.(
      `[agentSession] resolveUXTreatment failed: ${String(err)}`,
      false,
    );
    await safeReject(payload, session, "network_error");
    return;
  }

  switch (treatment) {
    case "silent": {
      await runNonInteractive(payload, session);
      return;
    }

    case "preview": {
      // Hand off to the UI — task 13 (PreviewCard) implements the
      // showPreviewCard callback. The dispatcher provides the
      // onConfirm / onDismiss callbacks, which execute the tool or
      // reject it respectively.
      const onConfirm = async () => {
        await runNonInteractive(payload, session);
      };
      const onDismiss = async () => {
        session.pending_approvals.delete(toolCallId);
        try {
          session.ui.upsertToolPart?.({
            toolCallId,
            toolName: payload.name,
            input: payload.input,
            state: "output-error",
            error: "user_declined",
          });
        } catch {}
        await safeReject(payload, session, "user_declined");
      };
      try {
        session.ui.showPreviewCard(payload, onConfirm, onDismiss);
      } catch (err) {
        session.pending_approvals.delete(toolCallId);
        session.ui.showError?.(
          `[agentSession] showPreviewCard threw: ${String(err)}`,
          false,
        );
        await safeReject(payload, session, "network_error");
      }
      return;
    }

    case "confirm": {
      // Hard stop — task 14 provides the approval sheet. User tap
      // drives onApprove / onReject.
      const onApprove = async () => {
        await runNonInteractive(payload, session);
      };
      const onReject = async () => {
        session.pending_approvals.delete(toolCallId);
        try {
          session.ui.upsertToolPart?.({
            toolCallId,
            toolName: payload.name,
            input: payload.input,
            state: "output-error",
            error: "user_declined",
          });
        } catch {}
        await safeReject(payload, session, "user_declined");
      };
      try {
        session.ui.showApprovalSheet(payload, onApprove, onReject);
      } catch (err) {
        session.pending_approvals.delete(toolCallId);
        session.ui.showError?.(
          `[agentSession] showApprovalSheet threw: ${String(err)}`,
          false,
        );
        await safeReject(payload, session, "network_error");
      }
      return;
    }

    case "blocked": {
      // Watch-only wallet or equivalent — cannot execute. Drop the
      // slot and reject immediately with the canonical reason.
      session.pending_approvals.delete(toolCallId);
      await safeReject(payload, session, "wallet_type_cannot_execute");
      return;
    }

    default: {
      // Exhaustiveness check: compile-time guarantee that every
      // UXTreatment case is handled. If the union grows and this
      // stops compiling, add a case above.
      const _exhaustive: never = treatment;
      session.pending_approvals.delete(toolCallId);
      console.warn(
        `[agentSession] unknown UX treatment, rejecting: ${String(_exhaustive)}`,
      );
      await safeReject(payload, session, "wallet_type_cannot_execute");
      return;
    }
  }
}

// --- Internals --------------------------------------------------------------

/**
 * Non-interactive path used by `silent` and by the `preview` /
 * `confirm` callbacks after the user has acknowledged the action.
 * Runs the executor through `executeToolWithRetry`, posts the result,
 * then removes the pending slot.
 */
async function runNonInteractive(
  payload: ToolPendingPayload,
  session: AgentSession,
): Promise<void> {
  // Start the delay-hint timer BEFORE kicking off the executor. If the
  // executor resolves (success or failure) within DELAY_HINT_MS we
  // cancel the timer and no hint is sent; otherwise the timer fires
  // once, the server streams a "please wait" message on the SSE, and
  // the executor keeps running in parallel. Fire-and-forget — we never
  // await the hint POST.
  const hintTimer = setTimeout(() => {
    void postProgress(session.session_id, payload.tool_call_id);
  }, DELAY_HINT_MS);

  let result: ToolResult;
  try {
    // Dynamic import keeps `../agent-executors/retry.ts` — which
    // transitively pulls in viem and `@/utils/clients` — out of the
    // module graph until an actual tool call needs to run. Tests
    // exercising the `blocked` / rejection paths never hit this code
    // path, so they can load `dispatcher.ts` under plain Node
    // without the RN runtime.
    const { executeToolWithRetry } = await import(
      "../agent-executors/retry.ts"
    );
    result = await executeToolWithRetry(
      payload.name,
      payload.input,
      session.executorContext,
    );
  } catch (err) {
    // `executeToolWithRetry` is documented as never-throw, but treat
    // any escaped exception as a failed tool result so the agent
    // still sees a typed response rather than timing out.
    result = {
      status: "failed",
      error: `unexpected_executor_error: ${String(err)}`,
    };
  } finally {
    clearTimeout(hintTimer);
  }

  // --- Task 15: optimistic pending-tx UI hook ----------------------
  // The ONLY call site that adds records to `pendingTxStore` from the
  // dispatcher. For write tools we drop a "submitted" card the moment
  // a hash comes back, and a "failed" card if the executor returned a
  // failure WITH a hash (reverted-but-submitted) so the UI can still
  // surface the explorer link.
  //
  // After a successful submission we also kick off a background receipt
  // poller so the card auto-transitions to confirmed/failed without
  // requiring the agent to call `get_transaction` explicitly.
  if (payload.meta.capability === "write" && result.tx_hash) {
    // Agent may omit `chain_id` from the tool input (common for points
    // tools that infer it from wallet context), so fall back to the
    // executor context's active chain — otherwise the card is stuck
    // on "submitting" forever because pollReceipt early-exits on
    // chain_id 0.
    const chainIdRaw = payload.input.chain_id;
    const chainId =
      typeof chainIdRaw === "number" && chainIdRaw > 0
        ? chainIdRaw
        : (session.executorContext.activeChainId ?? 0);

    // Some executors (e.g. `deposit_points`) wait for the receipt
    // themselves before returning. Respect their `tx_confirmed` flag
    // so the card goes straight to the terminal state — no need to
    // re-poll what the executor already verified.
    const confirmedByExecutor =
      result.status === "success" && result.tx_confirmed === true;

    pendingTxStore.add({
      tx_hash: result.tx_hash,
      chain_id: chainId,
      description: payload.meta.human_summary,
      state:
        result.status === "failed"
          ? "failed"
          : confirmedByExecutor
            ? "confirmed"
            : "submitted",
      error: result.status === "failed" ? result.error : undefined,
      transactionId: result.transaction_id,
      confirmed_at: confirmedByExecutor ? Date.now() : undefined,
    });

    if (result.status === "success" && !confirmedByExecutor) {
      const txHash = result.tx_hash;
      // Fire-and-forget — we do NOT await this. The poller updates the
      // store via `markConfirmed` / `markFailed` as a side-effect;
      // errors inside `pollReceipt` are swallowed there.
      import("./receiptPoller.ts")
        .then(({ pollReceipt }) => {
          pollReceipt(txHash, chainId, session.executorContext).catch(() => {});
        })
        .catch(() => {});
    }
  }

  // Mirror the tool result into the message parts so MessageContent
  // re-renders the inline card with `state: output-available` (or
  // `output-error`). The registered component then transitions from
  // the preview/pending UI to the terminal receipt.
  try {
    session.ui.upsertToolPart?.({
      toolCallId: payload.tool_call_id,
      toolName: payload.name,
      input: payload.input,
      state: result.status === "failed" ? "output-error" : "output-available",
      output: result,
      error: result.status === "failed" ? result.error : undefined,
    });
  } catch (err) {
    console.warn(`[agentSession] upsertToolPart(result) threw: ${String(err)}`);
  }

  try {
    await postRespondWithPolicy(session, payload, result);
  } catch (err) {
    session.ui.showError?.(
      `[agentSession] failed to POST tool result: ${String(err)}`,
      true,
    );
    // Leave the slot in pending_approvals — a reconnect will re-emit
    // the tool_pending and we'll retry from the top of the loop.
    return;
  }

  session.pending_approvals.delete(payload.tool_call_id);
}

// --- postRespond delivery policy --------------------------------------------

/**
 * Maximum extra delivery attempts after the first. Mirrors the default
 * in `services/agent-executors/retry.ts` so the read-tool delivery loop
 * has the same shape (3 total attempts) the executor itself uses.
 */
const POST_RESPOND_MAX_RETRIES = 2;
const POST_RESPOND_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Deliver a `ToolResult` back to the server with capability-aware retry.
 *
 * Mirrors the §10 retry rules used by `executeToolWithRetry`:
 *   - Read tools retry transient delivery failures with linear backoff
 *     (`baseDelayMs * (attempt + 1)`), then fall through to a
 *     `tool_rejected{reason: "network_error"}` so the server pairs the
 *     assistant tool_call with a typed result instead of timing out.
 *   - Write / simulate tools never auto-retry — anything that moved (or
 *     could have moved) value gets a single delivery attempt. If that
 *     fails the slot is left in `pending_approvals` and a reconnect /
 *     manual recovery is required. This matches the anti-double-spend
 *     invariant in `retry.ts` rule 2 (any `tx_hash` is final).
 *
 * Throws on permanent failure for non-read capabilities so the caller's
 * existing error path (showError + leave slot) keeps working.
 */
async function postRespondWithPolicy(
  session: AgentSession,
  payload: ToolPendingPayload,
  result: ToolResult,
): Promise<void> {
  const capability = payload.meta.capability;

  if (capability !== "read") {
    // Write / simulate: single attempt, no retry. Per the design,
    // anything that touched chain state must not double-deliver.
    await postRespond(session.session_id, payload.tool_call_id, result);
    return;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= POST_RESPOND_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(POST_RESPOND_BASE_DELAY_MS * attempt);
    }
    try {
      await postRespond(session.session_id, payload.tool_call_id, result);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  // Read-tool delivery exhausted all retries. Pair the server-side
  // tool_call with a typed rejection so the agent loop doesn't sit on
  // an orphan until the 5-minute timeout. Falling back to rejectTool
  // (instead of fabricating a server-side marker) keeps the
  // `mobile→execute, mobile→respond` invariant intact.
  console.warn(
    `[agentSession] postRespond exhausted retries for ${payload.tool_call_id} (${payload.name}): ${String(lastError)}`,
  );
  await rejectTool(payload, session, "network_error");
}

/**
 * Wrapper around `rejectTool` that never throws. We don't want a
 * network blip on the rejection path to corrupt the session — log it
 * and carry on.
 */
async function safeReject(
  payload: ToolPendingPayload,
  session: AgentSession,
  reason: string,
): Promise<void> {
  try {
    await rejectTool(payload, session, reason);
  } catch (err) {
    console.warn(
      `[agentSession] rejectTool failed for ${payload.tool_call_id}: ${String(err)}`,
    );
  }
}

/**
 * Extract the `ConnectedWallet` (the shape `resolveUxTreatment`
 * expects) from the session. The agent session owns the source of
 * truth — we don't re-read wallet state from hooks because the
 * dispatcher runs outside the React component tree.
 *
 * Returns `null` when the session has no wallet bound (shouldn't
 * happen in practice — the chat screen won't start a session without
 * one — but defensive handling keeps us safe against init races).
 */
function getConnectedWallet(session: AgentSession): ConnectedWallet | null {
  return session.connectedWallet ?? null;
}

/**
 * Pull `TransferInfo` (chain id + token) out of the tool payload for
 * value-moving tools so the resolver can consult per-token thresholds.
 *
 * Returns `undefined` for any tool that isn't a recognised transfer —
 * the resolver then falls back to the policy's legacy single-threshold
 * logic. We intentionally only handle `send_native_token` and
 * `transfer_erc20`: those are the two tools whose payloads carry an
 * unambiguous transfer-target token. `write_contract` could in theory
 * also move value, but inferring "this is a transfer" from arbitrary
 * calldata is the kind of guesswork that produces wrong-bucket
 * thresholds — better to leave those on the legacy path until the
 * server tags them explicitly.
 */
function extractTransferInfo(
  payload: ToolPendingPayload,
): TransferInfo | undefined {
  const input = payload.input as Record<string, unknown>;
  const chainIdRaw = input.chain_id;
  const chainId =
    typeof chainIdRaw === "number" && Number.isInteger(chainIdRaw)
      ? chainIdRaw
      : undefined;
  if (chainId === undefined || chainId <= 0) return undefined;

  if (payload.name === "send_native_token") {
    return {
      chainId,
      contractAddressOrNative: NATIVE_TOKEN_KEY,
      isNative: true,
    };
  }

  if (payload.name === "transfer_erc20") {
    const contract = input.contract_address;
    if (typeof contract !== "string" || !contract.startsWith("0x")) {
      return undefined;
    }
    return {
      chainId,
      contractAddressOrNative: contract.toLowerCase(),
      isNative: false,
    };
  }

  return undefined;
}
