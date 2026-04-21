/**
 * Unit tests for `services/nanopay/pathADirectArc.ts` (spec §5.1,
 * milestone M5).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/nanopay/pathADirectArc.test.ts
 *
 * Pure Node test bench — no keystore, no RN modules, no live RPC. The
 * orchestrator (`executePathA`) runs against a stubbed `WalletKitAdapter`
 * whose `sendNativeTransfer` records the call + returns a canned tx hash.
 * `watchArcPayoutEvent` runs against a stub `publicClient` whose
 * `waitForTransactionReceipt` resolves with a fake receipt.
 *
 * Coverage:
 *   - Path A builds a native-value tx on Arc with the correct
 *     `{ to, amount }` and returns `{ txHash, chainId }`.
 *   - A non-USDC-native chain (e.g. mainnet Ethereum) throws
 *     `PathANotOnArcError` — the guard is `nativeCurrency.symbol`,
 *     not a chainId allowlist.
 *   - `executePathA` rejects non-positive USDC amounts.
 *   - `watchArcPayoutEvent` resolves `"confirmed"` on success and
 *     throws on `status: "reverted"`.
 *   - `postOnChainReceipt` swallows a 404 and surfaces other non-2xx
 *     as a typed `OnChainReceiptError`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { defineChain } from "viem";
import { mainnet } from "viem/chains";

import type {
  ChainConfig,
  EvmChainConfig,
} from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import type {
  NativeTransferArgs,
  WalletKitAdapter,
} from "../walletKit/types.ts";
import {
  executePathA,
  OnChainReceiptError,
  type OnChainReceiptRequest,
  type OnChainReceiptResponse,
  onChainReceiptEndpoint,
  PathANotOnArcError,
  type PostOnChainReceipt,
  postOnChainReceipt,
  watchArcPayoutEvent,
} from "./pathADirectArc.ts";

/** Matches `constants/configs/chainConfig.ts`'s `arcTestnet` shape. */
const ARC_TESTNET = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const ARC_CHAIN: EvmChainConfig = { namespace: "eip155", chain: ARC_TESTNET };
const ETH_CHAIN: EvmChainConfig = { namespace: "eip155", chain: mainnet };
const SOLANA_CHAIN: ChainConfig = {
  namespace: "solana",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
};

const STUB_WALLET = { address: "0xpayer" } as unknown as TWallet;
const PAYER: Address = "0x1111111111111111111111111111111111111111";
const MERCHANT_TREASURY: Address = "0x2222222222222222222222222222222222222222";
const INTENT_ID = "pi_patha_0001";
const USDC_AMOUNT = 5_000_000n; // 5 USDC in micros

const MOCK_TX_HASH: Hex =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// ─── WalletKit stubs ──────────────────────────────────────────────────

interface NativeTransferRecord {
  called: boolean;
  args: NativeTransferArgs | null;
}

function makeEvmKitStub(opts: { txHash?: Hex } = {}): {
  kit: WalletKitAdapter;
  record: NativeTransferRecord;
} {
  const record: NativeTransferRecord = { called: false, args: null };
  const kit: WalletKitAdapter = {
    namespace: "eip155",
    validateAddress: () => true,
    validatePrivateKey: () => true,
    validateMnemonic: () => true,
    createWalletFromPrivateKey: async () => STUB_WALLET,
    createWalletFromMnemonic: async () => STUB_WALLET,
    generateMnemonic: () => "",
    getSignerForWallet: async () => null,
    getNativeBalance: async () => 0n,
    async sendNativeTransfer(args: NativeTransferArgs): Promise<string> {
      record.called = true;
      record.args = args;
      return opts.txHash ?? MOCK_TX_HASH;
    },
    estimateMaxTransferable: async () => 0n,
    formatNativeAmount: () => "",
    parseNativeAmount: () => 0n,
    truncateAddress: (a) => a,
  };
  return { kit, record };
}

// ─── executePathA ─────────────────────────────────────────────────────

describe("executePathA — happy path on Arc", () => {
  it("builds a native transfer on Arc and returns { txHash, chainId }", async () => {
    const { kit, record } = makeEvmKitStub();

    const result = await executePathA({
      payer: PAYER,
      merchantAddress: MERCHANT_TREASURY,
      usdcAmount: USDC_AMOUNT,
      chain: ARC_CHAIN,
      wallet: STUB_WALLET,
      walletKit: kit,
    });

    assert.ok(record.called, "kit.sendNativeTransfer was invoked");
    assert.ok(record.args, "adapter received args");
    assert.equal(
      record.args.to,
      MERCHANT_TREASURY,
      "native-transfer `to` is the merchant treasury",
    );
    assert.equal(
      record.args.amount,
      USDC_AMOUNT,
      "native-transfer `amount` IS the USDC micros value (USDC=gas on Arc)",
    );
    assert.equal(
      record.args.chain.namespace,
      "eip155",
      "chain forwarded to kit is the EVM chain config",
    );

    assert.equal(result.txHash, MOCK_TX_HASH);
    assert.equal(
      result.chainId,
      ARC_TESTNET.id,
      "returned chainId is Arc Testnet viem chainId",
    );
  });
});

// ─── executePathA — chain guards ──────────────────────────────────────

describe("executePathA — Arc-only guard", () => {
  it("throws PathANotOnArcError on Ethereum mainnet (native symbol = ETH)", async () => {
    const { kit } = makeEvmKitStub();
    await assert.rejects(
      () =>
        executePathA({
          payer: PAYER,
          merchantAddress: MERCHANT_TREASURY,
          usdcAmount: USDC_AMOUNT,
          chain: ETH_CHAIN,
          wallet: STUB_WALLET,
          walletKit: kit,
        }),
      (err: unknown) =>
        err instanceof PathANotOnArcError &&
        err.name === "PathANotOnArcError" &&
        err.chainId === mainnet.id &&
        err.nativeSymbol === "ETH",
    );
  });

  it("throws PathANotOnArcError on a Solana chain config", async () => {
    const { kit } = makeEvmKitStub();
    await assert.rejects(
      () =>
        executePathA({
          payer: PAYER,
          merchantAddress: MERCHANT_TREASURY,
          usdcAmount: USDC_AMOUNT,
          chain: SOLANA_CHAIN,
          wallet: STUB_WALLET,
          walletKit: kit,
        }),
      (err: unknown) => err instanceof PathANotOnArcError,
    );
  });

  it("rejects a non-positive usdcAmount", async () => {
    const { kit } = makeEvmKitStub();
    await assert.rejects(
      () =>
        executePathA({
          payer: PAYER,
          merchantAddress: MERCHANT_TREASURY,
          usdcAmount: 0n,
          chain: ARC_CHAIN,
          wallet: STUB_WALLET,
          walletKit: kit,
        }),
      /usdcAmount must be > 0/,
    );
  });
});

// ─── watchArcPayoutEvent ──────────────────────────────────────────────

describe("watchArcPayoutEvent", () => {
  it("resolves with `status: 'confirmed'` on a successful receipt", async () => {
    const stub = {
      waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({
        status: "success",
        blockNumber: 42n,
        transactionHash: hash,
      }),
    };
    const result = await watchArcPayoutEvent({
      chain: ARC_CHAIN,
      txHash: MOCK_TX_HASH,
      publicClient: stub as never,
    });
    assert.equal(result.status, "confirmed");
    assert.equal(result.txHash, MOCK_TX_HASH);
    assert.equal(result.chainId, ARC_TESTNET.id);
    assert.equal(result.blockNumber, 42n);
  });

  it("throws when the receipt status is `reverted`", async () => {
    const stub = {
      waitForTransactionReceipt: async () => ({
        status: "reverted",
        blockNumber: 42n,
      }),
    };
    await assert.rejects(
      () =>
        watchArcPayoutEvent({
          chain: ARC_CHAIN,
          txHash: MOCK_TX_HASH,
          publicClient: stub as never,
        }),
      /confirmed with status=reverted/,
    );
  });

  it("enforces the Arc-only guard", async () => {
    await assert.rejects(
      () =>
        watchArcPayoutEvent({
          chain: ETH_CHAIN,
          txHash: MOCK_TX_HASH,
          publicClient: {
            waitForTransactionReceipt: async () => ({ status: "success" }),
          } as never,
        }),
      (err: unknown) => err instanceof PathANotOnArcError,
    );
  });
});

// ─── postOnChainReceipt — soft-link behaviour ─────────────────────────

describe("postOnChainReceipt", () => {
  it("POSTs the correct body shape and returns the backend response", async () => {
    let captured: { intentId: string; body: OnChainReceiptRequest } | null =
      null;
    const poster: PostOnChainReceipt = async ({ intentId, body }) => {
      captured = { intentId, body };
      const response: OnChainReceiptResponse = {
        id: intentId,
        status: "SETTLED",
      };
      return response;
    };

    const result = await postOnChainReceipt({
      intentId: INTENT_ID,
      txHash: MOCK_TX_HASH,
      chainId: ARC_TESTNET.id,
      poster,
    });

    assert.ok(captured, "poster was invoked");
    const payload = captured as {
      intentId: string;
      body: OnChainReceiptRequest;
    };
    assert.equal(payload.intentId, INTENT_ID);
    assert.equal(payload.body.txHash, MOCK_TX_HASH);
    assert.equal(payload.body.chainId, ARC_TESTNET.id);
    assert.equal(payload.body.path, "A");
    assert.deepEqual(result, { id: INTENT_ID, status: "SETTLED" });
  });

  it("swallows a ky HTTPError 404 (endpoint not live yet) and returns null", async () => {
    const kyModule = await import("ky");
    const response = new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
    const request = new Request("http://localhost/on-chain-receipt");
    const realErr = new kyModule.HTTPError(response, request, {} as never);

    const poster: PostOnChainReceipt = async () => {
      throw realErr;
    };

    const result = await postOnChainReceipt({
      intentId: INTENT_ID,
      txHash: MOCK_TX_HASH,
      chainId: ARC_TESTNET.id,
      poster,
    });
    assert.equal(result, null);
  });

  it("wraps non-404 HTTPError as OnChainReceiptError with pinned status", async () => {
    const kyModule = await import("ky");
    const response = new Response(JSON.stringify({ error: "boom" }), {
      status: 503,
    });
    const request = new Request("http://localhost/on-chain-receipt");
    const realErr = new kyModule.HTTPError(response, request, {} as never);

    const poster: PostOnChainReceipt = async () => {
      throw realErr;
    };

    await assert.rejects(
      () =>
        postOnChainReceipt({
          intentId: INTENT_ID,
          txHash: MOCK_TX_HASH,
          chainId: ARC_TESTNET.id,
          poster,
        }),
      (err: unknown) =>
        err instanceof OnChainReceiptError &&
        err.status === 503 &&
        err.intentId === INTENT_ID,
    );
  });
});

describe("onChainReceiptEndpoint", () => {
  it("percent-encodes the intent id", () => {
    assert.equal(
      onChainReceiptEndpoint("pi_01/abc"),
      "v1/pay/intents/pi_01%2Fabc/on-chain-receipt",
    );
  });
});
