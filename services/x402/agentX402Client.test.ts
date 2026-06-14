/**
 * Unit tests for `runAgentX402Fetch` — the §4.1 loop (spec Phase 5 §8:
 * full loop, budget gate, error sanitisation). Run under `node:test`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import type {
  SettleX402PaymentResult,
  WalletKitAdapter,
} from "../walletKit/types.ts";
import { runAgentX402Fetch } from "./agentX402Client.ts";

const URL = "https://seller.example/api/v1/pool-safety";

function challenge402(amount = "20000") {
  return new Response(
    JSON.stringify({
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0x000000000000000000000000000000000000dEaD",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          maxAmountRequired: amount,
          extra: { assetTransferMethod: "erc7710" },
        },
      ],
    }),
    { status: 402 },
  );
}

/** A kit whose `settleX402Payment` returns a scripted result. */
function kitReturning(result: SettleX402PaymentResult): WalletKitAdapter {
  return {
    settleX402Payment: async () => result,
  } as unknown as WalletKitAdapter;
}

const WALLET = { address: "0xabc" } as never;
const CHAIN = { namespace: "eip155", chain: { id: 84532 } } as never;
const DELEGATION = { salt: "0x01" } as never;

test("full loop: probe(402) → settle → retry(200) returns payload + advances ledger", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === 1) return challenge402("20000");
    return new Response(
      JSON.stringify({ pools: [{ poolId: "aave-v3-usdc" }] }),
      {
        status: 200,
      },
    );
  }) as unknown as typeof fetch;

  let spent = 0n;
  const result = await runAgentX402Fetch({
    url: URL,
    kit: kitReturning({
      status: "settled",
      proof: "PROOF",
      rail: "relayer",
      txHash: "0xhash",
      spentAtoms: 20_000n,
    }),
    wallet: WALLET,
    chain: CHAIN,
    delegation: DELEGATION,
    remainingBudgetAtoms: 5_000_000n,
    onSettled: (atoms) => {
      spent += atoms;
    },
    fetchImpl,
  });

  a.equal(result.status, "ok");
  if (result.status !== "ok") return;
  a.equal(result.paid, true);
  a.equal(result.amountAtoms, 20_000n);
  a.equal(result.rail, "relayer");
  a.equal(result.txHash, "0xhash");
  a.deepEqual(result.data, { pools: [{ poolId: "aave-v3-usdc" }] });
  a.equal(spent, 20_000n);

  // Retry carried the X-PAYMENT proof.
  const retryHeaders = calls[1].init?.headers as Record<string, string>;
  a.equal(retryHeaders["X-PAYMENT"], "PROOF");
});

test("budget gate: requested over remaining → over_budget, settle never called", async () => {
  const fetchImpl = (async () =>
    challenge402("20000")) as unknown as typeof fetch;
  let settleCalled = false;
  const result = await runAgentX402Fetch({
    url: URL,
    kit: {
      settleX402Payment: async () => {
        settleCalled = true;
        return { status: "failed", reason: "x" } as SettleX402PaymentResult;
      },
    } as unknown as WalletKitAdapter,
    wallet: WALLET,
    chain: CHAIN,
    delegation: DELEGATION,
    remainingBudgetAtoms: 10_000n, // < 20000 requested
    fetchImpl,
  });
  a.equal(result.status, "over_budget");
  if (result.status === "over_budget") {
    a.equal(result.requestedAtoms, 20_000n);
    a.equal(result.remainingBudgetAtoms, 10_000n);
  }
  a.equal(settleCalled, false);
});

test("freely-available resource (200 on probe) → paid:false, no settlement", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ free: true }), {
      status: 200,
    })) as unknown as typeof fetch;
  const result = await runAgentX402Fetch({
    url: URL,
    kit: kitReturning({ status: "failed", reason: "unused" }),
    wallet: WALLET,
    chain: CHAIN,
    delegation: DELEGATION,
    remainingBudgetAtoms: 5_000_000n,
    fetchImpl,
  });
  a.equal(result.status, "ok");
  if (result.status === "ok") a.equal(result.paid, false);
});

test("unrecognisable 402 challenge → friendly failure (no raw body)", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ nope: 1 }), {
      status: 402,
    })) as unknown as typeof fetch;
  const result = await runAgentX402Fetch({
    url: URL,
    kit: kitReturning({ status: "failed", reason: "unused" }),
    wallet: WALLET,
    chain: CHAIN,
    delegation: DELEGATION,
    remainingBudgetAtoms: 5_000_000n,
    fetchImpl,
  });
  a.equal(result.status, "failed");
  if (result.status === "failed") {
    a.doesNotMatch(result.reason, /nope/);
  }
});

test("settlement failure surfaces the kit's friendly reason", async () => {
  const fetchImpl = (async () =>
    challenge402("20000")) as unknown as typeof fetch;
  const result = await runAgentX402Fetch({
    url: URL,
    kit: kitReturning({
      status: "failed",
      reason: "We couldn't settle this payment. Please try again.",
    }),
    wallet: WALLET,
    chain: CHAIN,
    delegation: DELEGATION,
    remainingBudgetAtoms: 5_000_000n,
    fetchImpl,
  });
  a.equal(result.status, "failed");
  if (result.status === "failed") {
    a.match(result.reason, /couldn't settle/);
  }
});

test("missing settleX402Payment capability → friendly failure", async () => {
  const fetchImpl = (async () =>
    challenge402("20000")) as unknown as typeof fetch;
  const result = await runAgentX402Fetch({
    url: URL,
    kit: {} as unknown as WalletKitAdapter, // no settleX402Payment
    wallet: WALLET,
    chain: CHAIN,
    delegation: DELEGATION,
    remainingBudgetAtoms: 5_000_000n,
    fetchImpl,
  });
  a.equal(result.status, "failed");
  if (result.status === "failed")
    a.match(result.reason, /EVM spending delegation/);
});
