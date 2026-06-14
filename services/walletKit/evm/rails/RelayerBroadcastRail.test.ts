/**
 * Unit tests for `RelayerBroadcastRail` — the Mode-A submission-boundary
 * classification (§9.2 / SP-1, §14 "Submission boundary (1Shot, Mode A)").
 * Run under `node:test`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import type {
  SettleX402PaymentArgs,
  X402Erc7710Challenge,
} from "../../types.ts";
import {
  createRelayerBroadcastRail,
  type RelayerRailConfig,
  type RelayerRailDeps,
} from "./RelayerBroadcastRail.ts";

const KEY = "x402|eip155:84532|payto|asset|20000|res";

function challenge(
  overrides: Partial<X402Erc7710Challenge> = {},
): X402Erc7710Challenge {
  return {
    scheme: "exact",
    network: "eip155:84532",
    maxAmountRequired: "20000",
    payTo: "0x000000000000000000000000000000000000dEaD",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    resource: "https://seller.example/api/v1/pool-safety",
    assetTransferMethod: "erc7710",
    ...overrides,
  };
}

function args(
  overrides: Partial<SettleX402PaymentArgs> = {},
): SettleX402PaymentArgs {
  return {
    wallet: { address: "0xabc" } as never,
    chain: { namespace: "eip155", chain: { id: 84532 } } as never,
    challenge: challenge(),
    delegation: {
      delegate: "0x4e44e22ee6da76c2ad19baaaffb52f676230fa06",
      delegator: "0x000000000000000000000000000000000000bEEF",
      authority:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      caveats: [],
      salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
      signature: "0xdead",
    } as never,
    remainingBudgetAtoms: 5_000_000n,
    ...overrides,
  };
}

function deps(overrides: Partial<RelayerRailDeps> = {}): RelayerRailDeps {
  return {
    getCapabilities: async () => ({
      84532: {
        targetAddress: "0xf1ef956eff4181Ce913b664713515996858B9Ca9",
        feeCollector: "0xE936e8FAf4A5655469182A49a505055B71C17604",
        tokens: [],
      },
    }),
    getFeeData: (async () => ({ minFee: 1_000n, tokenDecimals: 6 })) as never,
    estimate: async () => ({
      success: true,
      requiredPaymentAmount: 10_000n,
      context: "fee-ctx",
    }),
    send: async () => ({ taskId: "0xtask" }),
    getStatus: async () => ({
      status: "success",
      statusCode: 200,
      transactionHash: "0xhash",
    }),
    pollIntervalMs: 0,
    pollTimeoutMs: 1000,
    now: () => 0,
    sleep: async () => {},
    ...overrides,
  };
}

const CFG: RelayerRailConfig = { enabledChainIds: [84532] };

test("supports() gates on the configured chain ids", () => {
  const rail = createRelayerBroadcastRail({ enabledChainIds: [1] });
  a.equal(rail.supports({ chainId: 84532, challenge: challenge() }), false);
  a.equal(
    createRelayerBroadcastRail(CFG).supports({
      chainId: 84532,
      challenge: challenge(),
    }),
    true,
  );
});

test("happy path → settled with a tx-hash proof envelope", async () => {
  const rail = createRelayerBroadcastRail(CFG, deps());
  const res = await rail.attempt(args(), KEY);
  a.equal(res.outcome, "settled");
  if (res.outcome !== "settled") return;
  a.equal(res.rail, "relayer");
  a.equal(res.txHash, "0xhash");
  a.equal(res.spentAtoms, 20_000n);
  const decoded = JSON.parse(globalThis.atob(res.proof));
  a.equal(decoded.txHash, "0xhash");
  a.equal(decoded.rail, "relayer");
});

test("pre-boundary: estimate failure → unavailable (failover-safe)", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({ estimate: async () => ({ success: false, error: "sim failed" }) }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});

test("pre-boundary: missing feeCollector → unavailable", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({ getCapabilities: async () => ({}) as never }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});

test("cost-based failover (§9.3): fee over bound → unavailable", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({
      estimate: async () => ({
        success: true,
        requiredPaymentAmount: 6_000_000n, // > $5 safety ceiling
        context: "fee-ctx",
      }),
    }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});

test("budget: requested + fee over remaining → over_budget (not failover)", async () => {
  const rail = createRelayerBroadcastRail(CFG, deps());
  const res = await rail.attempt(args({ remainingBudgetAtoms: 25_000n }), KEY);
  a.equal(res.outcome, "over_budget");
  if (res.outcome === "over_budget") {
    a.equal(res.requestedAtoms, 30_000n); // 20000 payment + 10000 fee
  }
});

test("SP-1 boundary: send() throws → terminal_failure (STOP)", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({
      send: async () => {
        throw new Error("relayer 500 raw body");
      },
    }),
  );
  const res = await rail.attempt(args(), KEY);
  a.equal(res.outcome, "terminal_failure");
  // SP-8: friendly copy only.
  if (res.outcome === "terminal_failure") {
    a.doesNotMatch(res.reason, /raw body|500/);
  }
});

test("SP-1 boundary: poll timeout → terminal_failure (tx may be in flight)", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({ pollTimeoutMs: 0 }), // deadline already passed → immediate timeout
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "terminal_failure");
});

test("rail-attested terminal-failed with NO txHash → unavailable (safe to fail over)", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({
      getStatus: async () => ({ status: "failed", statusCode: 500 }),
    }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});

test("terminal-failed WITH a txHash (broadcast then reverted) → terminal_failure", async () => {
  const rail = createRelayerBroadcastRail(
    CFG,
    deps({
      getStatus: async () => ({
        status: "failed",
        statusCode: 500,
        transactionHash: "0xreverted",
      }),
    }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "terminal_failure");
});
