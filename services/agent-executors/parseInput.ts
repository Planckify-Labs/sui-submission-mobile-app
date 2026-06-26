/**
 * parseToolInput — the standard zod guard at the executor boundary.
 *
 * The shared way to validate a tool's `input` against a zod schema and fail
 * with the project's curated error envelope. Use this for any NEW tool that
 * has a non-trivial input shape: define ONE zod schema (which doubles as the
 * `z.infer` type and, via `z.toJSONSchema`, the LLM-facing JSON Schema), and
 * validate with it here. That collapses "what the LLM may send" and "what the
 * executor accepts" into a single source of truth instead of a hand-written
 * JSON Schema on the server drifting from an ad-hoc `requireString` guard on
 * the device.
 *
 * On failure it throws `ExecutorError(invalid_input, "invalid_<field-path>")`
 * — a CURATED, stable reason derived from the offending field path, NEVER the
 * raw zod message (which can embed user/runtime values; CLAUDE.md
 * user-facing-errors). `safeExecute` surfaces that reason on
 * `ToolResult.reason`, and `agentErrorCopy` maps it to friendly UI copy.
 *
 * Context-derived values (e.g. the active-chain fallback in `resolveChainId`)
 * are deliberately NOT in scope here — those are resolution, not input
 * validation, and stay in their own helpers. Run `parseToolInput` first to
 * validate the literal input, then resolve context.
 */

import type { z } from "zod";
import { ExecutorError, ExecutorErrorCode } from "./types";

export function parseToolInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  label = "input",
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  // Curated reason from the FIRST issue's field path — e.g.
  // path ["amount","human"] -> "invalid_amount_human"; empty path ->
  // "invalid_<label>". Never the raw `issue.message` (CLAUDE.md).
  const path = parsed.error.issues[0]?.path?.map((p) => String(p)).join("_");
  throw new ExecutorError(
    ExecutorErrorCode.InvalidInput,
    path ? `invalid_${path}` : `invalid_${label}`,
  );
}
