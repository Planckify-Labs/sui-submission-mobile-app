/**
 * `useOriginAgentDisplay` — resolves a specialist agent id to a
 * display name for the "via {displayName} specialist" badge.
 *
 * Spec: docs/multi-agent-architecture-spec.md §6.4, §10.1.
 * Task: docs/multi-agent-architecture-task/17_mobile_via_specialist_badge.
 *
 * Reads the bundled `services/agent-executors/agentManifests.json` (a
 * mirror of `agent-api/src/agents/manifests/`). Returns:
 *  - `undefined` when no badge should render (id missing, or id is
 *    `core`/`wallet` — those are the default Takumi voice).
 *  - The `display_name` for any other specialist (e.g. "DeFi specialist"
 *    for `defi`). Falls back to the verbatim id if the manifest entry
 *    is missing a `display_name` (CLAUDE.md user-facing-error rule:
 *    never crash, never render an error label).
 */

import { useMemo } from "react";

import { AGENT_MANIFEST } from "@/services/agent-executors/agentManifest";

const DEFAULT_VOICE_AGENTS = new Set(["core", "wallet"]);

export function useOriginAgentDisplay(
  originAgentId?: string | null,
): string | undefined {
  return useMemo(() => {
    if (!originAgentId) return undefined;
    if (DEFAULT_VOICE_AGENTS.has(originAgentId)) return undefined;
    const entry = AGENT_MANIFEST.agents.find((a) => a.id === originAgentId);
    if (!entry) return originAgentId;
    return entry.display_name ?? originAgentId;
  }, [originAgentId]);
}
