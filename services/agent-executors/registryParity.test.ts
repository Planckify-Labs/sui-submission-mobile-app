/**
 * Parity tests for the prefix → owning-agent invariant.
 *
 * Spec: docs/multi-agent-architecture-spec.md §5, §7.3, §10.4.
 * Task: docs/multi-agent-architecture-task/09_assert_registry_parity_extension.
 *
 * Runs via `node --test --experimental-strip-types` per
 * `scripts/run-node-tests.sh`. The full `EXECUTORS` map is exercised at
 * app bootstrap (`assertRegistryParity()`); this file covers the pure
 * pieces (`resolveAgentForTool`, `composeAgentExecutors`) that don't
 * require the whole runtime executor tree.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_MANIFEST,
  resolveAgentForTool,
} from "./agentManifest.ts";
import { composeAgentExecutors } from "./composeAgentExecutors.ts";
import type { MobileToolExecutor } from "./types.ts";

const noopExecutor: MobileToolExecutor = async () => ({ status: "success" });

describe("AGENT_MANIFEST", () => {
  it("declares the three expected agents", () => {
    const ids = AGENT_MANIFEST.agents.map((a) => a.id).sort();
    assert.deepEqual(ids, ["core", "defi", "wallet"]);
  });

  it("Core's prefix is exactly ['core_'] (§4.1 invariant)", () => {
    const core = AGENT_MANIFEST.agents.find((a) => a.id === "core");
    assert.ok(core);
    assert.deepEqual(core.tool_prefixes, ["core_"]);
  });

  it("DeFi status is 'stub' (load-bearing signal for Core paraphrase)", () => {
    const defi = AGENT_MANIFEST.agents.find((a) => a.id === "defi");
    assert.equal(defi?.status, "stub");
  });

  it("no two agents share a tool_prefix", () => {
    const seen = new Map<string, string>();
    for (const a of AGENT_MANIFEST.agents) {
      for (const prefix of a.tool_prefixes) {
        const existing = seen.get(prefix);
        assert.equal(
          existing,
          undefined,
          `prefix "${prefix}" claimed by both "${existing}" and "${a.id}"`,
        );
        seen.set(prefix, a.id);
      }
    }
  });
});

describe("resolveAgentForTool", () => {
  it("routes core_ family to Core", () => {
    assert.equal(resolveAgentForTool("core_clarify"), "core");
    assert.equal(resolveAgentForTool("core_handoff"), "core");
  });

  it("routes get_ family to Wallet", () => {
    assert.equal(resolveAgentForTool("get_balance"), "wallet");
    assert.equal(resolveAgentForTool("get_wallet_sol_balance"), "wallet");
  });

  it("routes exact-name entries (e.g. read_contract) to Wallet", () => {
    assert.equal(resolveAgentForTool("read_contract"), "wallet");
    assert.equal(resolveAgentForTool("estimate_gas"), "wallet");
    assert.equal(resolveAgentForTool("write_contract"), "wallet");
  });

  it("routes defi_ family to DeFi", () => {
    assert.equal(resolveAgentForTool("defi_deposit"), "defi");
    assert.equal(resolveAgentForTool("defi_list_opportunities"), "defi");
  });

  it("returns undefined for unknown tool", () => {
    assert.equal(resolveAgentForTool("does_not_exist"), undefined);
  });
});

describe("composeAgentExecutors", () => {
  it("accepts a wallet tool under wallet", () => {
    assert.doesNotThrow(() =>
      composeAgentExecutors("wallet", { get_balance: noopExecutor }),
    );
  });

  it("accepts a defi tool under defi", () => {
    assert.doesNotThrow(() =>
      composeAgentExecutors("defi", { defi_deposit: noopExecutor }),
    );
  });

  it("rejects a wallet tool dropped under defi", () => {
    assert.throws(
      () =>
        composeAgentExecutors("defi", {
          get_balance: noopExecutor,
        }),
      /tool "get_balance" does not match any prefix of agent "defi"/,
    );
  });

  it("rejects an unknown agent id", () => {
    assert.throws(
      () =>
        composeAgentExecutors("ghost", {
          ghost_tool: noopExecutor,
        }),
      /unknown agent id "ghost"/,
    );
  });
});
