/**
 * Protocol types shared between the Takumi Agent API server and this
 * mobile app.
 *
 * SOURCE OF TRUTH: `takumi-agent-api/src/session/types.ts` — do NOT cross-
 * import from the sibling package. These types are mirrored here verbatim
 * so the mobile build is self-contained. If the server type file changes,
 * update this file to match and bump any call sites.
 *
 * Cross-reference:
 *   AGENT_PROTOCOL.md §4 "Transport"
 *   AGENT_PROTOCOL.md §8 "The Message Protocol"
 *   AGENT_PROTOCOL.md §9 "Server-Side Agent Loop"
 *   AGENT_PROTOCOL.md §10 "Mobile-Side Contract"
 */

// --- Wallet context (sent by mobile on POST /chat) --------------------------

/**
 * Public wallet information injected into every `POST /chat` request.
 * Mirrors `WalletContext` in the server types file.
 *
 * The agent only ever sees the public address — the private key and seed
 * phrase must never leave the device.
 */
export interface WalletContext {
  address: `0x${string}`;
  chain_id: number;
  chain_name: string;
  chain_symbol: string;
  label?: string;
  /**
   * Whether the mobile has a stored access token for the points /
   * redemption API keyed to this wallet address. Computed locally by
   * `checkPointsAuth()` before every `POST /chat` — the server never
   * mints or validates this flag, it's purely a hint that lets the
   * agent skip `request_authentication` when the user is already
   * signed in. Added in protocol v1.1 §13.
   */
  points_authenticated?: boolean;
}

// --- Tool classification ----------------------------------------------------

/**
 * Factual classification of what a tool does. The mobile maps capability
 * to a UX treatment via `resolveUxTreatment` — the server never dictates
 * friction level, it only declares the action type.
 */
export type ToolCapability = "read" | "simulate" | "write";

/**
 * Logical grouping for policy rules. Kept as a widened string to match
 * the server type — the server upstream may extend the enum without
 * coordinating a mobile release, and the mobile should treat unknown
 * categories as opaque metadata.
 */
export type ToolCategory = string;

// --- SSE event payloads (server → mobile) ----------------------------------

/** `text_delta` — a streaming chunk of assistant text. */
export interface TextDeltaPayload {
  content: string;
}

/** `status` — a lightweight progress indicator label ("Checking balance…"). */
export interface StatusPayload {
  message: string;
}

/**
 * `tool_pending` — emitted for every tool with `executor: "mobile"`. The
 * mobile MUST execute and reply via `POST /chat/respond` (or reject).
 *
 * Mirrors `ToolPendingPayload` in the server types file.
 */
export interface ToolPendingPayload {
  session_id: string;
  tool_call_id: string;
  name: string;
  input: Record<string, unknown>;
  meta: {
    executor: "mobile";
    capability: ToolCapability;
    category: ToolCategory;
    human_summary: string;
    amount_usd?: number;
  };
}

/**
 * `tool_executed` — informational event emitted after a server-side
 * (non-onchain) tool completes. Mobile uses it to render intermediate
 * state (e.g. a product list, a booking preview). No response required.
 */
export interface ToolExecutedPayload {
  tool_call_id: string;
  name: string;
  display_result: unknown;
}

/** `done` — the agent has finished reasoning; mobile closes the SSE. */
export interface DonePayload {
  session_id: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/** `error` — terminal or transient failure surfaced from the agent loop. */
export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Discriminated union of every SSE event the server can emit.
 *
 * The mobile dispatcher MUST exhaust this union — unknown events are
 * logged but must not crash the session (see `agentSession.ts`).
 */
export type AgentEvent =
  | { event: "text_delta"; data: TextDeltaPayload }
  | { event: "status"; data: StatusPayload }
  | { event: "tool_pending"; data: ToolPendingPayload }
  | { event: "tool_executed"; data: ToolExecutedPayload }
  | { event: "done"; data: DonePayload }
  | { event: "error"; data: ErrorPayload };

// --- Mobile → server response (POST /chat/respond) --------------------------

/**
 * The `ToolResult` body returned on success. Identical shape to
 * `services/agent-executors/types.ts` — kept as a structural type here
 * so this file doesn't import from the executor package (which pulls in
 * viem + native modules).
 *
 * Mirrors `ToolResult` in the server types file.
 */
export interface ToolResult {
  status: "success" | "failed";
  tx_hash?: `0x${string}`;
  tx_confirmed?: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Mobile response body posted back to `POST /chat/respond`. Either a
 * successful tool result or a rejection with a reason string.
 *
 * Mirrors `MobileResponse` in the server types file.
 */
export type MobileResponse =
  | {
      type: "tool_result";
      session_id: string;
      tool_call_id: string;
      result: ToolResult;
    }
  | {
      type: "tool_rejected";
      session_id: string;
      tool_call_id: string;
      reason: "user_declined" | "insufficient_funds" | "network_error" | string;
    };

// --- POST /chat request body ------------------------------------------------

/**
 * Body of the initial `POST /chat` request that opens the SSE stream.
 * `messages` is a loose `unknown[]` because mobile-side message shapes
 * come from the `ai` SDK and vary by user input; the server validates.
 *
 * On reconnect (see §4 "SSE Reconnect Mid-Turn") the mobile re-sends this
 * with the existing `session_id` and an empty `messages` array.
 */
export interface ChatRequest {
  session_id?: string;
  messages: unknown[];
  wallet_context: WalletContext;
}
