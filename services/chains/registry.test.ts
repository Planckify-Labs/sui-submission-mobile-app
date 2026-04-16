/**
 * Unit tests for `ChainAdapterRegistry`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/chains/registry.test.ts
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { ChainAdapterRegistry } from "./registry.ts";
import type { ChainAdapter } from "./types.ts";

function makeAdapter(
  namespace: ChainAdapter["namespace"],
): ChainAdapter {
  return {
    namespace,
    getInjectedScript: () => "",
    handleRequest: async () => ({ status: "resolved", value: null }),
    executeApproval: async () => null,
  };
}

beforeEach(() => {
  ChainAdapterRegistry.clear();
});

describe("ChainAdapterRegistry", () => {
  it("register + get round-trips an adapter by namespace", () => {
    const evm = makeAdapter("eip155");
    ChainAdapterRegistry.register(evm);
    assert.equal(ChainAdapterRegistry.get("eip155"), evm);
  });

  it("get returns null for an unregistered namespace", () => {
    assert.equal(ChainAdapterRegistry.get("solana"), null);
  });

  it("list returns all registered adapters", () => {
    const a = makeAdapter("eip155");
    const b = makeAdapter("solana");
    ChainAdapterRegistry.register(a);
    ChainAdapterRegistry.register(b);
    const list = ChainAdapterRegistry.list();
    assert.equal(list.length, 2);
    assert.ok(list.includes(a));
    assert.ok(list.includes(b));
  });

  it("re-registering overwrites the prior entry for the same namespace", () => {
    const first = makeAdapter("eip155");
    const second = makeAdapter("eip155");
    ChainAdapterRegistry.register(first);
    ChainAdapterRegistry.register(second);
    assert.equal(ChainAdapterRegistry.get("eip155"), second);
    assert.equal(ChainAdapterRegistry.list().length, 1);
  });

  it("clear removes everything", () => {
    ChainAdapterRegistry.register(makeAdapter("eip155"));
    ChainAdapterRegistry.register(makeAdapter("solana"));
    ChainAdapterRegistry.clear();
    assert.equal(ChainAdapterRegistry.list().length, 0);
    assert.equal(ChainAdapterRegistry.get("eip155"), null);
  });
});
