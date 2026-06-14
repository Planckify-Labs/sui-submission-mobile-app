/**
 * Unit tests for `settleX402PaymentEvm` after the Part II refactor — it is
 * now a thin adapter over the rail chain. These tests prove the delegation
 * (it hands `{ registry, breaker }` to `settleWithFallback`) and an
 * end-to-end settle through the real `RelayerBroadcastRail` with a mocked
 * relayer (the Phase 5 behaviour, unchanged). Run under `node:test`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import { createSettlementBreaker } from "../../x402/settlement/breaker.ts";
import type { SettlementRailRegistry } from "../../x402/settlement/registry.ts";
import type {
  SettlementAttempt,
  SettlementRail,
} from "../../x402/settlement/types.ts";
import type { SettleX402PaymentArgs, X402Erc7710Challenge } from "../types.ts";
import {
  createRelayerBroadcastRail,
  type RelayerRailDeps,
} from "./rails/RelayerBroadcastRail.ts";
import { encodeProofEnvelope, settleX402PaymentEvm } from "./x402Settle.ts";

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

function fixedRegistry(rails: SettlementRail[]): SettlementRailRegistry {
  return {
    candidates: (ctx) =>
      rails
        .filter((r) => r.supports(ctx))
        .sort((x, y) => x.priority - y.priority),
  };
}

function scriptedRail(
  id: string,
  result: SettlementAttempt,
  onAttempt?: () => void,
): SettlementRail {
  return {
    id,
    kind: "relayer",
    priority: 10,
    supports: () => true,
    attempt: async () => {
      onAttempt?.();
      return result;
    },
  };
}

function relayerDeps(
  overrides: Partial<RelayerRailDeps> = {},
): RelayerRailDeps {
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

test("delegates to the rail chain: a scripted settled rail → settled result", async () => {
  const result = await settleX402PaymentEvm(args(), {
    registry: fixedRegistry([
      scriptedRail("r", {
        outcome: "settled",
        rail: "relayer",
        proof: "P",
        txHash: "0xabc",
        spentAtoms: 20_000n,
      }),
    ]),
    breaker: createSettlementBreaker(),
  });
  a.equal(result.status, "settled");
  if (result.status === "settled") {
    a.equal(result.rail, "relayer");
    a.equal(result.txHash, "0xabc");
  }
});

test("SP-1 surfaces through the adapter: terminal rail → failed, next not tried", async () => {
  let bTried = false;
  const result = await settleX402PaymentEvm(args(), {
    registry: fixedRegistry([
      scriptedRail("a", {
        outcome: "terminal_failure",
        reason: "We couldn't settle this payment. Please try again.",
      }),
      scriptedRail(
        "b",
        { outcome: "settled", rail: "relayer", proof: "P", spentAtoms: 1n },
        () => {
          bTried = true;
        },
      ),
    ]),
    breaker: createSettlementBreaker(),
  });
  a.equal(result.status, "failed");
  a.equal(bTried, false);
});

test("budget gate still surfaces over_budget (SI-1)", async () => {
  const result = await settleX402PaymentEvm(
    args({ remainingBudgetAtoms: 10_000n }),
    {
      registry: fixedRegistry([]),
      breaker: createSettlementBreaker(),
    },
  );
  a.equal(result.status, "over_budget");
});

test("end-to-end through the real relayer rail (mocked 1Shot) → settled", async () => {
  const result = await settleX402PaymentEvm(args(), {
    registry: fixedRegistry([
      createRelayerBroadcastRail({ enabledChainIds: [84532] }, relayerDeps()),
    ]),
    breaker: createSettlementBreaker(),
  });
  a.equal(result.status, "settled");
  if (result.status === "settled") {
    a.equal(result.rail, "relayer");
    a.equal(result.txHash, "0xhash");
    a.equal(result.spentAtoms, 20_000n);
  }
});

test("encodeProofEnvelope round-trips through base64 (re-exported)", () => {
  const proof = encodeProofEnvelope({
    challenge: challenge(),
    rail: "relayer",
    txHash: "0xfeed",
  });
  const decoded = JSON.parse(globalThis.atob(proof));
  a.equal(decoded.network, "eip155:84532");
  a.equal(decoded.txHash, "0xfeed");
});
