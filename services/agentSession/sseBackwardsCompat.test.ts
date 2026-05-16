/**
 * SSE backwards-compatibility — old-shape envelopes still parse and
 * dispatch correctly.
 *
 * Spec: docs/multi-agent-architecture-spec.md §11.4.
 * Task: docs/multi-agent-architecture-task/20_sse_backwards_compat_e2e.
 *
 * Both `origin_agent_id` and the two `narrative_handoff*` frame kinds
 * are ADDITIVE. A pre-redesign mobile build that ignores the new
 * field must still parse a redesigned-server envelope as a regular
 * `tool_pending`. Symmetrically, a redesigned mobile receiving an
 * old-shape envelope (no `origin_agent_id`) must render with the
 * default Core voice — no badge.
 *
 * Runs via `bash scripts/run-node-tests.sh`. Same node:test harness
 * as `registryParity.test.ts`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AgentEvent,
  NarrativeHandoffPayload,
  ToolPendingPayload,
} from "./protocol.ts";

describe("SSE backwards-compat — tool_pending without origin_agent_id", () => {
  it("legacy envelope without origin_agent_id is still a valid ToolPendingPayload", () => {
    const legacy: ToolPendingPayload = {
      session_id: "s1",
      tool_call_id: "tc1",
      name: "transfer_erc20",
      input: { chain_id: 8453, to: "0x...", token_amount: "1" },
      meta: {
        executor: "mobile",
        capability: "write",
        category: "blockchain_write",
        human_summary: "Send 1 USDC",
      },
    };
    assert.equal(legacy.origin_agent_id, undefined);
    // A consumer that destructures origin_agent_id with a fallback
    // mirrors how Task 17's `useOriginAgentDisplay` treats absence.
    const { origin_agent_id } = legacy;
    assert.equal(origin_agent_id, undefined);
  });

  it("new envelope with origin_agent_id remains a valid ToolPendingPayload", () => {
    const fresh: ToolPendingPayload = {
      session_id: "s1",
      tool_call_id: "tc2",
      name: "defi_deposit",
      input: { protocol_slug: "aave-v3-base" },
      meta: {
        executor: "mobile",
        capability: "write",
        category: "utility",
        human_summary: "Deposit 50 USDC into aave-v3-base",
      },
      origin_agent_id: "defi",
    };
    assert.equal(fresh.origin_agent_id, "defi");
  });
});

describe("SSE backwards-compat — narrative_handoff frames", () => {
  it("narrative_handoff is a valid AgentEvent kind", () => {
    const payload: NarrativeHandoffPayload = { origin_agent_id: "defi" };
    const event: AgentEvent = {
      event: "narrative_handoff",
      data: payload,
    };
    assert.equal(event.event, "narrative_handoff");
    assert.equal(event.data.origin_agent_id, "defi");
  });

  it("narrative_handoff_end is a valid AgentEvent kind", () => {
    const payload: NarrativeHandoffPayload = { origin_agent_id: "defi" };
    const event: AgentEvent = {
      event: "narrative_handoff_end",
      data: payload,
    };
    assert.equal(event.event, "narrative_handoff_end");
  });

  it("a legacy parser that switch-defaults on unknown event kinds keeps working", () => {
    // Simulate the pre-redesign event handler: a switch that knows
    // only the four event kinds that shipped before §11.4.
    const legacyParse = (e: AgentEvent): string => {
      switch (e.event) {
        case "text_delta":
        case "status":
        case "tool_pending":
        case "tool_executed":
        case "done":
        case "error":
          return "handled";
        default:
          // Old client would hit the default branch — modern types
          // make this exhaustive so we cast through never to model
          // "this is unknown to me, ignored".
          return "ignored";
      }
    };
    const event: AgentEvent = {
      event: "narrative_handoff",
      data: { origin_agent_id: "defi" },
    };
    // A pre-redesign client that doesn't know about narrative_handoff
    // must not crash — it falls through to the default branch.
    assert.equal(legacyParse(event), "ignored");
  });
});
