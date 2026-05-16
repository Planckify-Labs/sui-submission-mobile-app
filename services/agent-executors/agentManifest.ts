/**
 * Mobile-side agent manifest helpers.
 *
 * Reads the shared `agentManifests.json` (mirror of the server-
 * authoritative file in `agent-api/src/agents/manifests/`) and provides
 * a pure `resolveAgentForTool()` so the parity check (this file's
 * sibling `index.ts`) and the CI lint (`pnpm check:agents`, Task 18)
 * use one source of truth.
 *
 * Spec: docs/multi-agent-architecture-spec.md §5, §7.3, §10.4.
 */

import manifest from "./agentManifests.json";

export type AgentManifestEntry = {
  id: string;
  display_name?: string;
  tool_prefixes: string[];
  status: "ready" | "stub" | "disabled";
};

export type AgentManifest = {
  version: number;
  agents: AgentManifestEntry[];
};

/** Frozen manifest as bundled with the app. */
export const AGENT_MANIFEST: AgentManifest = manifest as AgentManifest;

/**
 * Longest-prefix-wins lookup mirroring the server-side registry in
 * `agent-api/src/agents/registry.ts`. Exact-name entries
 * (e.g. `read_contract`) win over family prefixes (e.g. a hypothetical
 * `read_`).
 *
 * Pure function — no I/O at module load.
 */
export function resolveAgentForTool(
  toolName: string,
  m: AgentManifest = AGENT_MANIFEST,
): string | undefined {
  // Pass 1: exact-name entries.
  for (const entry of m.agents) {
    for (const prefix of entry.tool_prefixes) {
      if (!prefix.endsWith("_") && prefix === toolName) {
        return entry.id;
      }
    }
  }
  // Pass 2: family prefixes — longest wins on ties.
  let best: { id: string; len: number } | undefined;
  for (const entry of m.agents) {
    for (const prefix of entry.tool_prefixes) {
      if (prefix.endsWith("_") && toolName.startsWith(prefix)) {
        if (!best || prefix.length > best.len) {
          best = { id: entry.id, len: prefix.length };
        }
      }
    }
  }
  return best?.id;
}
