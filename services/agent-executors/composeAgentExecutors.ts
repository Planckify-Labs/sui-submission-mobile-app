/**
 * `composeAgentExecutors` — local guard that mirrors the server's
 * `composeAgentTools` (see `agent-api/src/tools/internal/compose.ts`).
 *
 * Validates that every executor name in a per-agent map matches one of
 * the agent's `tool_prefixes` from the synced `agentManifests.json`.
 * Throws on misplacement so a wallet tool accidentally dropped into
 * `defi/` (or vice versa) fails at module load, not at runtime.
 *
 * Records `(toolName → agentId)` on `AGENT_FOR_EXECUTOR` so
 * `assertRegistryParity` can cross-check the prefix → owning agent
 * invariant (Task 09).
 *
 * Spec: docs/multi-agent-architecture-spec.md §5, §7.2, §7.3, §10.4.
 */

import { AGENT_MANIFEST } from "./agentManifest";
import type { MobileToolExecutor } from "./types";

/**
 * Map of `toolName → agentId` populated as side effect of each
 * `composeAgentExecutors(agentId, executors)` call. Consumed by
 * `assertRegistryParity` to verify each executor sits under the agent
 * the manifest claims owns it.
 */
export const AGENT_FOR_EXECUTOR = new Map<string, string>();

export function composeAgentExecutors(
  agentId: string,
  executors: Record<string, MobileToolExecutor>,
): Record<string, MobileToolExecutor> {
  const entry = AGENT_MANIFEST.agents.find((a) => a.id === agentId);
  if (!entry) {
    throw new Error(
      `[agent-executors/compose] unknown agent id "${agentId}" — not declared in agentManifests.json`,
    );
  }
  for (const toolName of Object.keys(executors)) {
    const ok = entry.tool_prefixes.some((prefix) =>
      prefix.endsWith("_") ? toolName.startsWith(prefix) : toolName === prefix,
    );
    if (!ok) {
      throw new Error(
        `[agent-executors/compose] tool "${toolName}" does not match any prefix of agent "${agentId}" (prefixes: ${entry.tool_prefixes.join(", ")})`,
      );
    }
    AGENT_FOR_EXECUTOR.set(toolName, agentId);
  }
  return executors;
}
