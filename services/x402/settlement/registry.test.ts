/**
 * Unit tests for the settlement registry + two-tier config (§12.1, §14
 * "Config merge"). Run under `node:test`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_SETTLEMENT_RAILS,
  isEnabled,
  parseRailOverride,
  priorityOf,
  RELAYER_FREE_PROFILE,
  resolveSettlementRails,
  type SettlementRailConfig,
} from "./config.ts";
import {
  __resetRailsForTests,
  registeredRailIds,
  registerRail,
  settlementRailRegistry,
} from "./registry.ts";
import type {
  SettlementContext,
  SettlementKind,
  SettlementRail,
} from "./types.ts";

const CTX: SettlementContext = {
  chainId: 84532,
  challenge: {
    scheme: "exact",
    network: "eip155:84532",
    maxAmountRequired: "20000",
    payTo: "0x000000000000000000000000000000000000dEaD",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    resource: "https://seller.example/api",
    assetTransferMethod: "erc7710",
  },
};

function rail(
  id: string,
  priority: number,
  supports = true,
  kind: SettlementKind = "relayer",
): SettlementRail {
  return {
    id,
    kind,
    priority,
    supports: () => supports,
    attempt: async () => ({ outcome: "unavailable", reason: "x" }),
  };
}

// ── config merge ───────────────────────────────────────────────────────

test("resolveSettlementRails() with no remote = the in-binary defaults", () => {
  const cfg = resolveSettlementRails();
  a.equal(isEnabled(cfg, "oneshot-relayer"), true);
  a.equal(isEnabled(cfg, "erc7710-facilitator"), false); // ships disabled
});

test("remote enabled:false for oneshot-relayer wins over the default", () => {
  const remote: SettlementRailConfig[] = [
    { id: "oneshot-relayer", kind: "relayer", enabled: false, priority: 10 },
  ];
  const cfg = resolveSettlementRails(remote);
  a.equal(isEnabled(cfg, "oneshot-relayer"), false);
});

test("remote unknown id is ignored (not added to the resolved set)", () => {
  const remote: SettlementRailConfig[] = [
    { id: "mystery-rail", kind: "direct", enabled: true, priority: 1 },
  ];
  const cfg = resolveSettlementRails(remote);
  a.equal(
    cfg.find((c) => c.id === "mystery-rail"),
    undefined,
  );
  a.equal(cfg.length, DEFAULT_SETTLEMENT_RAILS.length);
});

// ── parseRailOverride: untrusted remote config validation (OQ-2) ─────────

test("parseRailOverride accepts a well-formed override end to end", () => {
  const parsed = parseRailOverride([
    {
      id: "oneshot-relayer",
      kind: "relayer",
      enabled: false,
      priority: 30,
      feeCapUsdcAtoms: "2000000",
    },
    {
      id: "erc7710-facilitator",
      kind: "facilitator",
      enabled: true,
      priority: 5,
      allowedFacilitators: ["https://facilitator.example"],
    },
  ]);
  a.ok(parsed);
  if (!parsed) return;
  a.equal(parsed.length, 2);
  // Round-trips through the merge → relayer off, facilitator promoted.
  const cfg = resolveSettlementRails(parsed);
  a.equal(isEnabled(cfg, "oneshot-relayer"), false);
  a.equal(isEnabled(cfg, "erc7710-facilitator"), true);
  a.equal(priorityOf(cfg, "erc7710-facilitator", 99), 5);
});

test("parseRailOverride drops malformed entries, keeps valid ones", () => {
  const parsed = parseRailOverride([
    { id: "ok", kind: "relayer", enabled: true, priority: 10 },
    { id: 123, kind: "relayer", enabled: true, priority: 10 }, // bad id
    { id: "bad-kind", kind: "wormhole", enabled: true, priority: 10 },
    { id: "bad-enabled", kind: "relayer", enabled: "yes", priority: 10 },
    { id: "bad-prio", kind: "relayer", enabled: true, priority: "high" },
    null,
    "garbage",
  ]);
  a.deepEqual(
    parsed?.map((c) => c.id),
    ["ok"],
  );
});

test("parseRailOverride returns undefined for non-array payloads (→ defaults)", () => {
  a.equal(parseRailOverride(undefined), undefined);
  a.equal(parseRailOverride({ id: "x" }), undefined);
  a.equal(parseRailOverride("nope"), undefined);
  // An empty array is a valid (if no-op) override, not undefined.
  a.deepEqual(parseRailOverride([]), []);
});

test("parseRailOverride ignores non-string entries in allowedFacilitators", () => {
  const parsed = parseRailOverride([
    {
      id: "erc7710-facilitator",
      kind: "facilitator",
      enabled: true,
      priority: 5,
      allowedFacilitators: ["https://ok.example", 42],
    },
  ]);
  // The whole array is rejected when any element is non-string (defensive).
  a.equal(parsed?.[0].allowedFacilitators, undefined);
});

test("RELAYER_FREE_PROFILE flips facilitator on / relayer off", () => {
  const cfg = resolveSettlementRails(RELAYER_FREE_PROFILE);
  a.equal(isEnabled(cfg, "erc7710-facilitator"), true);
  a.equal(isEnabled(cfg, "oneshot-relayer"), false);
  a.equal(priorityOf(cfg, "erc7710-facilitator", 99), 10); // promoted to the top
});

// ── registry ───────────────────────────────────────────────────────────

test("registerRail is idempotent per id; candidates filters by enabled + supports", () => {
  __resetRailsForTests();
  registerRail(rail("oneshot-relayer", 10));
  registerRail(rail("oneshot-relayer", 10)); // duplicate id — replaced, not added
  registerRail(rail("erc7710-facilitator", 20, true, "facilitator"));
  a.deepEqual(registeredRailIds().sort(), [
    "erc7710-facilitator",
    "oneshot-relayer",
  ]);

  // Default config → only the relayer is enabled.
  const reg = settlementRailRegistry();
  const ids = reg.candidates(CTX).map((r) => r.id);
  a.deepEqual(ids, ["oneshot-relayer"]);
  __resetRailsForTests();
});

test("candidates sorts by CONFIG priority so a remote reorder takes effect", () => {
  __resetRailsForTests();
  registerRail(rail("a", 99)); // intrinsic priorities are overridden by config
  registerRail(rail("b", 99));

  const order = (cfg: SettlementRailConfig[]) =>
    settlementRailRegistry(() => cfg)
      .candidates(CTX)
      .map((r) => r.id);

  a.deepEqual(
    order([
      { id: "a", kind: "relayer", enabled: true, priority: 20 },
      { id: "b", kind: "relayer", enabled: true, priority: 10 },
    ]),
    ["b", "a"],
  );
  a.deepEqual(
    order([
      { id: "a", kind: "relayer", enabled: true, priority: 10 },
      { id: "b", kind: "relayer", enabled: true, priority: 20 },
    ]),
    ["a", "b"],
  );
  __resetRailsForTests();
});

test("candidates drops a rail whose supports() is false for this challenge", () => {
  __resetRailsForTests();
  registerRail(rail("oneshot-relayer", 10, /* supports */ false));
  const reg = settlementRailRegistry();
  a.deepEqual(reg.candidates(CTX), []);
  __resetRailsForTests();
});
