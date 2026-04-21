/**
 * Unit tests for Path C (raw x402) — `services/nanopay/pathCRawX402.ts`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/nanopay/pathCRawX402.test.ts
 *
 * Pure tests — no real network, no keystore. Every `fetch` call is a
 * stub passed in via `executePathC({ fetchImpl })`. The wallet kit is a
 * hand-rolled stub whose `signTransferWithAuthorization` returns a
 * canned signature so we can assert the handshake end-to-end without
 * pulling viem into the test harness.
 *
 * Coverage:
 *   - `parseX402Challenge` pulls the first `accepts[]` entry with
 *     `scheme === "exact"` and all required fields.
 *   - `buildPathCAuthorization` rejects a caller chain mismatch.
 *   - `buildPathCAuthorization` rejects `validBefore < now + 3 days`.
 *   - `executePathC` golden path: 402 → sign → 200 → `paid`.
 *   - `executePathC` handles 202 pending → polls → `paid`.
 *   - `executePathC` fails loudly when merchant returns non-402 probe.
 *   - `executePathC` refuses when the wallet kit has no EIP-3009 method.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { EvmChainConfig } from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import type {
  SignTransferWithAuthorizationArgs,
  WalletKitAdapter,
} from "../walletKit/types.ts";
import { AuthorizationValidityTooShortError } from "../walletKit/types.ts";
import {
  buildPathCAuthorization,
  executePathC,
  parseX402Challenge,
  type X402Challenge,
  X402FetchError,
} from "./pathCRawX402.ts";

const ARC_TESTNET_ID = 5042002;

const GATEWAY_WALLET: `0x${string}` =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const USDC: `0x${string}` = "0x3600000000000000000000000000000000000000";
const PAYER: `0x${string}` = "0x1111111111111111111111111111111111111111";
const MERCHANT_PAYTO: `0x${string}` =
  "0x2222222222222222222222222222222222222222";
const NONCE: `0x${string}` =
  "0xabababababababababababababababababababababababababababababababab";

const MIN_WINDOW = 259_200; // 3 days in seconds.

const EVM_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  // Minimal stub — we only read `chain.id` for the challenge/chain match guard.
  chain: { id: ARC_TESTNET_ID } as EvmChainConfig["chain"],
};

const PAYER_WALLET = { address: PAYER } as unknown as TWallet;

function makeChallenge(overrides: Partial<X402Challenge> = {}): X402Challenge {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    scheme: "exact",
    network: `eip155:${ARC_TESTNET_ID}`,
    maxAmountRequired: "1500000",
    payTo: MERCHANT_PAYTO,
    asset: USDC,
    resource: "https://merchant.example/widget",
    maxTimeoutSeconds: 60,
    facilitator: null,
    extra: {
      verifyingContract: GATEWAY_WALLET,
      name: "GatewayWalletBatched",
      version: "1",
      chainId: ARC_TESTNET_ID,
    },
    nonce: NONCE,
    validAfter: 0,
    validBefore: nowSeconds + MIN_WINDOW + 120,
    ...overrides,
  };
}

function makeAcceptsBody(challenge: X402Challenge): object {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: challenge.scheme,
        network: challenge.network,
        maxAmountRequired: challenge.maxAmountRequired,
        payTo: challenge.payTo,
        asset: challenge.asset,
        resource: challenge.resource,
        maxTimeoutSeconds: challenge.maxTimeoutSeconds,
        facilitator: challenge.facilitator,
        extra: challenge.extra,
        nonce: challenge.nonce,
        validAfter: challenge.validAfter,
        validBefore: challenge.validBefore,
      },
    ],
  };
}

function make402Response(challenge: X402Challenge): Response {
  return new Response(JSON.stringify(makeAcceptsBody(challenge)), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  });
}

function makeKit(capturedArgs: {
  value?: SignTransferWithAuthorizationArgs;
}): WalletKitAdapter {
  return {
    namespace: "eip155",
    async signTransferWithAuthorization(args) {
      capturedArgs.value = args;
      return `0x${"cd".repeat(65)}` as `0x${string}`;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as WalletKitAdapter;
}

describe("parseX402Challenge", () => {
  it("picks the first accepts[] entry with scheme=exact and all fields", async () => {
    const challenge = makeChallenge();
    const response = make402Response(challenge);
    const parsed = await parseX402Challenge(
      response,
      "https://merchant.example/widget",
    );
    assert.equal(parsed.scheme, "exact");
    assert.equal(parsed.network, `eip155:${ARC_TESTNET_ID}`);
    assert.equal(parsed.payTo, MERCHANT_PAYTO);
    assert.equal(parsed.asset, USDC);
    assert.equal(parsed.maxAmountRequired, "1500000");
    assert.equal(parsed.extra.verifyingContract, GATEWAY_WALLET);
    assert.equal(parsed.extra.chainId, ARC_TESTNET_ID);
    assert.equal(parsed.nonce, NONCE);
  });

  it("falls back to the resource URL when accepts[].resource is missing", async () => {
    const challenge = makeChallenge();
    const body = makeAcceptsBody(challenge) as {
      accepts: Array<Record<string, unknown>>;
    };
    // biome-ignore lint/performance/noDelete: intentional — simulate the merchant omitting the field
    delete body.accepts[0].resource;
    const response = new Response(JSON.stringify(body), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
    const parsed = await parseX402Challenge(
      response,
      "https://merchant.example/widget",
    );
    assert.equal(parsed.resource, "https://merchant.example/widget");
  });

  it("throws X402ChallengeParseError when the body is neither valid JSON nor a header", async () => {
    const response = new Response("not-json", {
      status: 402,
      headers: { "Content-Type": "text/plain" },
    });
    await assert.rejects(
      parseX402Challenge(response, "https://merchant.example/x"),
      (err: unknown) =>
        err instanceof Error && err.name === "X402ChallengeParseError",
    );
  });
});

describe("buildPathCAuthorization", () => {
  it("shapes the challenge into the SignArgs shape the kit consumes", () => {
    const challenge = makeChallenge();
    const args = buildPathCAuthorization({
      wallet: PAYER_WALLET,
      chain: EVM_CHAIN,
      challenge,
      resourceUrl: "https://merchant.example/widget",
    });
    assert.equal(args.gatewayWallet, GATEWAY_WALLET);
    assert.equal(args.domainName, "GatewayWalletBatched");
    assert.equal(args.domainVersion, "1");
    assert.equal(args.usdc, USDC);
    assert.equal(args.from, PAYER);
    assert.equal(args.to, MERCHANT_PAYTO);
    assert.equal(args.valueMicros, 1_500_000n);
    assert.equal(args.nonce, NONCE);
  });

  it("rejects caller chain.id mismatch vs challenge.extra.chainId", () => {
    const challenge = makeChallenge({
      extra: {
        verifyingContract: GATEWAY_WALLET,
        name: "GatewayWalletBatched",
        version: "1",
        chainId: 1, // mainnet — mismatched
      },
    });
    assert.throws(
      () =>
        buildPathCAuthorization({
          wallet: PAYER_WALLET,
          chain: EVM_CHAIN,
          challenge,
          resourceUrl: "https://merchant.example/widget",
        }),
      /does not match challenge chainId/,
    );
  });

  it("rejects validBefore < now + 3 days via the shared signer guard", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const challenge = makeChallenge({
      validBefore: nowSeconds + MIN_WINDOW - 1,
    });
    assert.throws(
      () =>
        buildPathCAuthorization({
          wallet: PAYER_WALLET,
          chain: EVM_CHAIN,
          challenge,
          resourceUrl: "https://merchant.example/widget",
        }),
      (err: unknown) => err instanceof AuthorizationValidityTooShortError,
    );
  });

  it("refuses non-EVM chains — the SVM variant is a separate module", () => {
    const solanaChain = {
      namespace: "solana",
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
    } as unknown as EvmChainConfig;
    assert.throws(
      () =>
        buildPathCAuthorization({
          wallet: PAYER_WALLET,
          chain: solanaChain,
          challenge: makeChallenge(),
          resourceUrl: "https://merchant.example/widget",
        }),
      /expected eip155 chain/,
    );
  });
});

describe("executePathC — golden path", () => {
  it("does 402 → sign → 200 with paid status", async () => {
    const challenge = makeChallenge();
    const calls: Array<{ url: string; method: string }> = [];
    const stub: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (method === "GET") return make402Response(challenge);
      // POST
      return new Response(
        JSON.stringify({ settlement: "circle_tx_0xdeadbeef" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const captured: { value?: SignTransferWithAuthorizationArgs } = {};
    const kit = makeKit(captured);

    const result = await executePathC({
      resourceUrl: "https://merchant.example/widget",
      wallet: PAYER_WALLET,
      chain: EVM_CHAIN,
      kit,
      fetchImpl: stub,
    });

    assert.deepEqual(result, {
      status: "paid",
      settlementRef: "circle_tx_0xdeadbeef",
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[1].method, "POST");
    // The signer actually got called with the fields we expect.
    assert.equal(captured.value?.valueMicros, 1_500_000n);
    assert.equal(captured.value?.to, MERCHANT_PAYTO);
  });
});

describe("executePathC — 202 pending polling", () => {
  it("polls Location until terminal then returns paid", async () => {
    const challenge = makeChallenge();
    let pollCount = 0;
    const stub: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "https://merchant.example/widget" && method === "GET") {
        return make402Response(challenge);
      }
      if (url === "https://merchant.example/widget" && method === "POST") {
        return new Response(null, {
          status: 202,
          headers: { Location: "https://merchant.example/settlement/abc" },
        });
      }
      // Polls: return 202 twice, then 200.
      if (url === "https://merchant.example/settlement/abc") {
        pollCount += 1;
        if (pollCount < 3) {
          return new Response(null, { status: 202 });
        }
        return new Response(JSON.stringify({ txHash: "0xsettled" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 500 });
    };

    const captured: { value?: SignTransferWithAuthorizationArgs } = {};
    const kit = makeKit(captured);

    // Bump the timeout window so the poll loop (2s × 3) finishes — but
    // we can skip the actual sleep by stubbing setTimeout. Node's test
    // runner respects long timeouts, and 6s is well within default.
    const result = await executePathC({
      resourceUrl: "https://merchant.example/widget",
      wallet: PAYER_WALLET,
      chain: EVM_CHAIN,
      kit,
      fetchImpl: stub,
    });
    assert.equal(result.status, "paid");
    if (result.status === "paid") {
      assert.equal(result.settlementRef, "0xsettled");
    }
    assert.equal(pollCount, 3);
  });
});

describe("executePathC — guards", () => {
  it("throws X402FetchError when the probe isn't a 402", async () => {
    const stub: typeof fetch = async () =>
      new Response("<html>hi</html>", { status: 200 });
    const captured: { value?: SignTransferWithAuthorizationArgs } = {};
    const kit = makeKit(captured);
    await assert.rejects(
      executePathC({
        resourceUrl: "https://merchant.example/widget",
        wallet: PAYER_WALLET,
        chain: EVM_CHAIN,
        kit,
        fetchImpl: stub,
      }),
      (err: unknown) => err instanceof X402FetchError && err.status === 200,
    );
  });

  it("refuses when the wallet kit lacks signTransferWithAuthorization (e.g. Solana pre-M6)", async () => {
    const stub: typeof fetch = async () => new Response("", { status: 402 });
    const solanaKit = {
      namespace: "solana",
    } as unknown as WalletKitAdapter;
    const result = await executePathC({
      resourceUrl: "https://merchant.example/widget",
      wallet: PAYER_WALLET,
      chain: EVM_CHAIN,
      kit: solanaKit,
      fetchImpl: stub,
    });
    assert.equal(result.status, "failed");
  });
});
