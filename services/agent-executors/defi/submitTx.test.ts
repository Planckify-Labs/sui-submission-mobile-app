/**
 * Unit tests for `submitEvmCall` — the phantom-failure-safe submitter
 * (regression for: "withdraw said failed but my USDC actually moved").
 *
 * Run under `node:test` via `pnpm test:node`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import { keccak256, type PublicClient, type WalletClient } from "viem";
import { type EvmCallRequest, submitEvmCall } from "./submitTx.ts";

const SERIALIZED = "0x02f8650182031180" as `0x${string}`;
const EXPECTED_HASH = keccak256(SERIALIZED);

const CALL: EvmCallRequest = {
  to: "0x000000000000000000000000000000000000dEaD",
  data: "0xdeadbeef",
  value: 0n,
};

type Overrides = {
  hasAccount?: boolean;
  signThrows?: boolean;
  sendRawThrows?: boolean;
  receipt?: "success" | "reverted" | "throws";
};

function makeClients(o: Overrides) {
  const account =
    o.hasAccount === false
      ? undefined
      : {
          address: "0xabc0000000000000000000000000000000000abc",
          signTransaction: async () => SERIALIZED,
        };

  const walletClient = {
    account,
    chain: { id: 84532 },
    prepareTransactionRequest: async (req: unknown) => req,
    signTransaction: async () => {
      if (o.signThrows) throw new Error("sign failed");
      return SERIALIZED;
    },
  } as unknown as WalletClient;

  const publicClient = {
    sendRawTransaction: async () => {
      if (o.sendRawThrows) throw new Error("rpc 429 / timeout");
      return EXPECTED_HASH;
    },
    waitForTransactionReceipt: async () => {
      if (o.receipt === "throws") throw new Error("receipt timeout");
      return { status: o.receipt ?? "success" };
    },
  } as unknown as PublicClient;

  return { walletClient, publicClient };
}

test("happy path: broadcast accepted → submitted with the signed-tx hash", async () => {
  const { walletClient, publicClient } = makeClients({});
  const r = await submitEvmCall(walletClient, publicClient, CALL);
  a.equal(r.kind, "submitted");
  if (r.kind === "submitted") a.equal(r.hash, EXPECTED_HASH);
});

test("no local account → not_broadcast (nothing signed, chain unchanged)", async () => {
  const { walletClient, publicClient } = makeClients({ hasAccount: false });
  const r = await submitEvmCall(walletClient, publicClient, CALL);
  a.equal(r.kind, "not_broadcast");
});

test("sign failure (pre-broadcast) → not_broadcast (safe to say unchanged)", async () => {
  const { walletClient, publicClient } = makeClients({ signThrows: true });
  const r = await submitEvmCall(walletClient, publicClient, CALL);
  a.equal(r.kind, "not_broadcast");
});

test("broadcast errors but tx mined OK → mined+success (NOT a failure)", async () => {
  const { walletClient, publicClient } = makeClients({
    sendRawThrows: true,
    receipt: "success",
  });
  const r = await submitEvmCall(walletClient, publicClient, CALL);
  a.equal(r.kind, "mined");
  if (r.kind === "mined") {
    a.equal(r.success, true);
    a.equal(r.hash, EXPECTED_HASH);
  }
});

test("broadcast errors and tx reverted on-chain → mined+!success", async () => {
  const { walletClient, publicClient } = makeClients({
    sendRawThrows: true,
    receipt: "reverted",
  });
  const r = await submitEvmCall(walletClient, publicClient, CALL);
  a.equal(r.kind, "mined");
  if (r.kind === "mined") a.equal(r.success, false);
});

test("broadcast errors, no receipt in window → unconfirmed (never 'unchanged')", async () => {
  const { walletClient, publicClient } = makeClients({
    sendRawThrows: true,
    receipt: "throws",
  });
  const r = await submitEvmCall(walletClient, publicClient, CALL, {
    receiptTimeoutMs: 1,
  });
  a.equal(r.kind, "unconfirmed");
  if (r.kind === "unconfirmed") a.equal(r.hash, EXPECTED_HASH);
});
