/**
 * Unit tests for `settleWithFallback` — the rail cascade orchestrator
 * (x402-extensibility-spec §14 "Rail unit tests"). The SP-1 test (STOP on
 * terminal_failure, B never invoked) is the single most important one.
 *
 * Run under `node:test` via `pnpm test:node`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import type { SettleX402PaymentArgs } from "../../walletKit/types.ts";
import { createSettlementBreaker } from "./breaker.ts";
import type { SettlementRailRegistry } from "./registry.ts";
import { settleWithFallback } from "./settleWithFallback.ts";
import type {
  SettlementAttempt,
  SettlementContext,
  SettlementKind,
  SettlementRail,
} from "./types.ts";

const CHALLENGE = {
  scheme: "exact" as const,
  network: "eip155:84532",
  maxAmountRequired: "20000",
  payTo: "0x000000000000000000000000000000000000dEaD" as `0x${string}`,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  resource: "https://seller.example/api/v1/pool-safety",
  assetTransferMethod: "erc7710" as const,
};

function args(
  overrides: Partial<SettleX402PaymentArgs> = {},
): SettleX402PaymentArgs {
  return {
    wallet: { address: "0xabc" } as never,
    chain: { namespace: "eip155", chain: { id: 84532 } } as never,
    challenge: CHALLENGE,
    delegation: { salt: "0x01" } as never,
    remainingBudgetAtoms: 5_000_000n,
    ...overrides,
  };
}

/** A mock rail that records every `attempt()` call into a shared log. */
function mockRail(
  id: string,
  priority: number,
  behavior: () => SettlementAttempt | Promise<SettlementAttempt>,
  log: string[],
  kind: SettlementKind = "relayer",
): SettlementRail {
  return {
    id,
    kind,
    priority,
    supports: () => true,
    attempt: async () => {
      log.push(id);
      return behavior();
    },
  };
}

/** A registry view over a fixed rail list (priority-sorted, supports-filtered). */
function fixedRegistry(rails: SettlementRail[]): SettlementRailRegistry {
  return {
    candidates: (ctx: SettlementContext) =>
      rails
        .filter((r) => r.supports(ctx))
        .sort((x, y) => x.priority - y.priority),
  };
}

const settled = (rail: SettlementKind, txHash?: string): SettlementAttempt => ({
  outcome: "settled",
  rail,
  proof: "PROOF",
  ...(txHash ? { txHash } : {}),
  spentAtoms: 20_000n,
});
const unavailable = (): SettlementAttempt => ({
  outcome: "unavailable",
  reason: "We couldn't settle this payment. Please try again.",
});
const terminal = (): SettlementAttempt => ({
  outcome: "terminal_failure",
  reason: "We couldn't settle this payment. Please try again.",
});

test("selection order: rails are tried in ascending priority", async () => {
  const log: string[] = [];
  const rails = [
    mockRail("c", 30, () => settled("relayer", "0xc"), log),
    mockRail("a", 10, () => unavailable(), log),
    mockRail("b", 20, () => unavailable(), log),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    createSettlementBreaker(),
  );
  a.deepEqual(log, ["a", "b", "c"]); // ascending, not registration order
  a.equal(result.status, "settled");
});

test("failover on `unavailable`: A → B; A's breaker increments; B settles", async () => {
  const log: string[] = [];
  const breaker = createSettlementBreaker();
  const rails = [
    mockRail("a", 10, () => unavailable(), log),
    mockRail("b", 20, () => settled("relayer", "0xhash"), log),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    breaker,
  );
  a.deepEqual(log, ["a", "b"]);
  a.equal(breaker.health("a"), "degraded"); // recordFailure was called
  a.equal(breaker.health("b"), "healthy");
  a.equal(result.status, "settled");
  if (result.status === "settled") {
    a.equal(result.rail, "relayer");
    a.equal(result.txHash, "0xhash");
  }
});

test("SP-1: terminal_failure STOPS the chain — B is never attempted", async () => {
  const log: string[] = [];
  const rails = [
    mockRail("a", 10, () => terminal(), log),
    mockRail("b", 20, () => settled("relayer", "0xb"), log),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    createSettlementBreaker(),
  );
  a.deepEqual(log, ["a"]); // B NEVER invoked
  a.equal(result.status, "failed");
});

test("SP-2: an `attempt()` that throws is terminal — B not tried", async () => {
  const log: string[] = [];
  const rails = [
    mockRail(
      "a",
      10,
      () => {
        throw new Error("relayer 500 {raw body}");
      },
      log,
    ),
    mockRail("b", 20, () => settled("relayer", "0xb"), log),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    createSettlementBreaker(),
  );
  a.deepEqual(log, ["a"]);
  a.equal(result.status, "failed");
  // SP-8: no raw body leaks into the user-facing reason.
  if (result.status === "failed") a.doesNotMatch(result.reason, /raw body|500/);
});

test("SP-4: budget gate runs once, before any rail (zero attempts)", async () => {
  const log: string[] = [];
  const rails = [mockRail("a", 10, () => settled("relayer"), log)];
  const result = await settleWithFallback(
    args({ remainingBudgetAtoms: 10_000n }), // < 20000 requested
    fixedRegistry(rails),
    createSettlementBreaker(),
  );
  a.deepEqual(log, []); // no rail touched
  a.equal(result.status, "over_budget");
  if (result.status === "over_budget") {
    a.equal(result.requestedAtoms, 20_000n);
    a.equal(result.remainingBudgetAtoms, 10_000n);
  }
});

test("a rail's over_budget is terminal — does NOT advance", async () => {
  const log: string[] = [];
  const rails = [
    mockRail(
      "a",
      10,
      () => ({
        outcome: "over_budget",
        requestedAtoms: 30_000n,
        remainingBudgetAtoms: 5_000_000n,
      }),
      log,
    ),
    mockRail("b", 20, () => settled("relayer"), log),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    createSettlementBreaker(),
  );
  a.deepEqual(log, ["a"]);
  a.equal(result.status, "over_budget");
});

test("no usable rail → failed with friendly copy", async () => {
  const result = await settleWithFallback(
    args(),
    fixedRegistry([]),
    createSettlementBreaker(),
  );
  a.equal(result.status, "failed");
  if (result.status === "failed") a.match(result.reason, /couldn't settle/i);
});

test("SP-7: a `down`/cooling rail is skipped before attempt()", async () => {
  const log: string[] = [];
  let clock = 0;
  const breaker = createSettlementBreaker({
    failuresToDown: 3,
    cooldownMs: 60_000,
    now: () => clock,
  });
  // Drive rail "a" to `down`.
  breaker.recordFailure("a");
  breaker.recordFailure("a");
  breaker.recordFailure("a");
  a.equal(breaker.health("a"), "down");

  const rails = [
    mockRail("a", 10, () => settled("relayer", "0xa"), log),
    mockRail("b", 20, () => settled("relayer", "0xb"), log),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    breaker,
  );
  a.deepEqual(log, ["b"]); // "a" skipped while cooling
  a.equal(result.status, "settled");

  // After cooldown elapses, "a" is usable again.
  clock = 60_001;
  log.length = 0;
  const after = await settleWithFallback(args(), fixedRegistry(rails), breaker);
  a.deepEqual(log, ["a"]);
  a.equal(after.status, "settled");
});

test("Mode-B settled (settlesOnRetry, no txHash) maps to rail=facilitator", async () => {
  const log: string[] = [];
  const rails = [
    mockRail(
      "f",
      10,
      () => ({
        outcome: "settled",
        rail: "facilitator",
        proof: "SIGNED-ENVELOPE",
        settlesOnRetry: true,
        spentAtoms: 20_000n,
      }),
      log,
      "facilitator",
    ),
  ];
  const result = await settleWithFallback(
    args(),
    fixedRegistry(rails),
    createSettlementBreaker(),
  );
  a.equal(result.status, "settled");
  if (result.status === "settled") {
    a.equal(result.rail, "facilitator");
    a.equal(result.proof, "SIGNED-ENVELOPE");
    a.equal(result.txHash, undefined); // Mode B: seller settles on retry
  }
});

test("unparseable price → failed (never throws)", async () => {
  const result = await settleWithFallback(
    args({ challenge: { ...CHALLENGE, maxAmountRequired: "not-a-number" } }),
    fixedRegistry([]),
    createSettlementBreaker(),
  );
  a.equal(result.status, "failed");
});
