/**
 * Unit tests for the inspector pipeline.
 *
 * Covers the full contract from dapp-bridge-spec §4.6:
 * - strictest-verdict merge (block > require-extra-confirmation > allow)
 * - annotation dedup by code
 * - timeout → "skipped" info annotation
 * - error inside inspector → "error" warn annotation
 * - security-critical payload fields are NOT patched
 * - on-demand inspectors don't fire in the auto pipeline
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/bridge/inspector.test.ts
 */

// @ts-expect-error — RN runtime global, not defined in Node test runner.
globalThis.__DEV__ = false;

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { ApprovalIntent } from "./approval.ts";
import {
  type IntentAnnotation,
  type IntentInspector,
  InspectorRegistry,
  runPipeline,
  runSingleInspector,
} from "./inspector.ts";

function intent(): ApprovalIntent {
  return {
    id: "intent-1",
    namespace: "eip155",
    kind: "sendTransaction",
    origin: { url: "https://x.test" },
    wallet: null,
    payload: { to: "0xrecipient", value: 1n, data: "0x" },
    annotations: [],
    createdAt: 0,
  };
}

beforeEach(() => {
  InspectorRegistry.clear();
});

describe("InspectorRegistry", () => {
  it("sorts registered inspectors by priority ascending", () => {
    const a: IntentInspector = mkInspector({ name: "a", priority: 5 });
    const b: IntentInspector = mkInspector({ name: "b", priority: 1 });
    const c: IntentInspector = mkInspector({ name: "c", priority: 10 });
    InspectorRegistry.register(a);
    InspectorRegistry.register(b);
    InspectorRegistry.register(c);
    const list = InspectorRegistry.list("auto");
    assert.deepEqual(list.map((i) => i.name), ["b", "a", "c"]);
  });

  it("filters by mode (auto vs on-demand)", () => {
    InspectorRegistry.register(mkInspector({ name: "auto1", mode: "auto" }));
    InspectorRegistry.register(
      mkInspector({ name: "od1", mode: "on-demand" }),
    );
    assert.equal(InspectorRegistry.list("auto").length, 1);
    assert.equal(InspectorRegistry.list("on-demand").length, 1);
    assert.equal(InspectorRegistry.list("auto")[0]?.name, "auto1");
  });

  it("register is idempotent by name", () => {
    InspectorRegistry.register(mkInspector({ name: "x" }));
    InspectorRegistry.register(mkInspector({ name: "x" }));
    assert.equal(InspectorRegistry.list("auto").length, 1);
  });

  it("get by name returns null when absent", () => {
    assert.equal(InspectorRegistry.get("missing"), null);
  });
});

describe("runPipeline — annotation merge", () => {
  it("concatenates annotations from all inspectors", async () => {
    InspectorRegistry.register(
      mkInspector({
        name: "a",
        result: {
          annotations: [ann("a.one")],
          verdict: "allow",
        },
      }),
    );
    InspectorRegistry.register(
      mkInspector({
        name: "b",
        priority: 5,
        result: { annotations: [ann("b.one")], verdict: "allow" },
      }),
    );
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    assert.deepEqual(
      r.annotations.map((a) => a.code),
      ["a.one", "b.one"],
    );
  });

  it("deduplicates annotations by code (first-write wins)", async () => {
    InspectorRegistry.register(
      mkInspector({
        name: "a",
        result: {
          annotations: [ann("dup", "from-a")],
          verdict: "allow",
        },
      }),
    );
    InspectorRegistry.register(
      mkInspector({
        name: "b",
        priority: 5,
        result: {
          annotations: [ann("dup", "from-b")],
          verdict: "allow",
        },
      }),
    );
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    assert.equal(r.annotations.length, 1);
    assert.equal(r.annotations[0]?.title, "from-a");
  });
});

describe("runPipeline — verdict merge (strictest wins)", () => {
  it("block beats require-extra-confirmation beats allow", async () => {
    InspectorRegistry.register(
      mkInspector({ name: "a", result: { annotations: [], verdict: "allow" } }),
    );
    InspectorRegistry.register(
      mkInspector({
        name: "b",
        priority: 2,
        result: {
          annotations: [],
          verdict: "require-extra-confirmation",
        },
      }),
    );
    InspectorRegistry.register(
      mkInspector({
        name: "c",
        priority: 3,
        result: { annotations: [], verdict: "block" },
      }),
    );
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    assert.equal(r.verdict, "block");
  });

  it("allow + allow stays allow", async () => {
    InspectorRegistry.register(
      mkInspector({ name: "a", result: { annotations: [], verdict: "allow" } }),
    );
    InspectorRegistry.register(
      mkInspector({
        name: "b",
        priority: 2,
        result: { annotations: [], verdict: "allow" },
      }),
    );
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    assert.equal(r.verdict, "allow");
  });
});

describe("runPipeline — security-critical patch guard", () => {
  it("drops `to`, `value`, `data` from the merged patch", async () => {
    InspectorRegistry.register(
      mkInspector({
        name: "evil",
        result: {
          annotations: [],
          verdict: "allow",
          patch: {
            // @ts-expect-error — deliberately violating the type to prove
            // the runtime guard catches it.
            to: "0xevil",
            value: 99999999n,
            data: "0xdeadbeef",
            // non-security field is allowed through:
            humanSummary: "fine to patch",
          },
        },
      }),
    );
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    const patch = (r.patch ?? {}) as Record<string, unknown>;
    assert.equal(patch.to, undefined);
    assert.equal(patch.value, undefined);
    assert.equal(patch.data, undefined);
    assert.equal(patch.humanSummary, "fine to patch");
  });

  it("also blocks patching `delegator` (7702) and `transaction` (solana)", async () => {
    InspectorRegistry.register(
      mkInspector({
        name: "evil",
        result: {
          annotations: [],
          verdict: "allow",
          patch: {
            // @ts-expect-error — runtime guard test.
            delegator: "0xbad",
            transaction: "0xbad",
            safe: "ok",
          },
        },
      }),
    );
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    const patch = (r.patch ?? {}) as Record<string, unknown>;
    assert.equal(patch.delegator, undefined);
    assert.equal(patch.transaction, undefined);
    assert.equal(patch.safe, "ok");
  });
});

describe("runPipeline — timeout and error handling", () => {
  it("times out an inspector and adds a 'skipped' info annotation", async () => {
    InspectorRegistry.register({
      name: "slow",
      priority: 1,
      mode: "auto",
      async inspect(_i, _prior, signal) {
        // Hang until aborted, longer than the 2s pipeline timeout.
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => {
            resolve({ annotations: [], verdict: "allow" });
          }, 10_000);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
      },
    });
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    assert.ok(
      r.annotations.some((a) => a.code === "inspector.skipped.slow"),
      "expected an inspector.skipped annotation",
    );
    assert.equal(r.verdict, "allow");
  });

  it("catches a throw in an inspector and adds an 'error' warn annotation", async () => {
    InspectorRegistry.register({
      name: "broken",
      priority: 1,
      mode: "auto",
      async inspect() {
        throw new Error("kaboom");
      },
    });
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    assert.ok(
      r.annotations.some((a) => a.code === "inspector.error.broken"),
      "expected an inspector.error annotation",
    );
    assert.equal(r.verdict, "allow");
  });
});

describe("runPipeline — namespace filter", () => {
  it("skips inspectors whose namespaces don't include the intent namespace", async () => {
    InspectorRegistry.register({
      name: "solana-only",
      priority: 1,
      mode: "auto",
      namespaces: ["solana"],
      async inspect() {
        return {
          annotations: [ann("solana.heuristic")],
          verdict: "allow",
        };
      },
    });
    const r = await runPipeline(intent(), "auto", new AbortController().signal);
    // eip155 intent — solana-only inspector should not have run.
    assert.equal(r.annotations.length, 0);
  });
});

describe("runSingleInspector — on-demand path", () => {
  it("runs only the named inspector", async () => {
    InspectorRegistry.register(
      mkInspector({
        name: "agent",
        mode: "on-demand",
        result: { annotations: [ann("agent.ran")], verdict: "allow" },
      }),
    );
    InspectorRegistry.register(
      mkInspector({
        name: "other",
        mode: "on-demand",
        result: { annotations: [ann("other.ran")], verdict: "allow" },
      }),
    );
    const r = await runSingleInspector(
      "agent",
      intent(),
      new AbortController().signal,
    );
    assert.ok(r);
    assert.equal(r.annotations.length, 1);
    assert.equal(r.annotations[0]?.code, "agent.ran");
  });

  it("returns null for unknown inspector", async () => {
    const r = await runSingleInspector(
      "missing",
      intent(),
      new AbortController().signal,
    );
    assert.equal(r, null);
  });
});

// --- helpers --------------------------------------------------------------

function ann(code: string, title = code): IntentAnnotation {
  return { code, severity: "info", title, source: "test" };
}

function mkInspector(opts: {
  name: string;
  priority?: number;
  mode?: "auto" | "on-demand";
  result?: Awaited<ReturnType<IntentInspector["inspect"]>>;
}): IntentInspector {
  return {
    name: opts.name,
    priority: opts.priority ?? 1,
    mode: opts.mode ?? "auto",
    async inspect() {
      return opts.result ?? { annotations: [], verdict: "allow" };
    },
  };
}
