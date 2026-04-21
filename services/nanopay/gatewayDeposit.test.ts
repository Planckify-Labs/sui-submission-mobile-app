/**
 * Unit tests for `services/nanopay/gatewayDeposit.ts` (spec §5.4, §5.5,
 * §6.2, milestone M4).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/nanopay/gatewayDeposit.test.ts
 *
 * Pure Node test bench — no keystore, no RN modules, no network. The
 * pure builder (`buildGatewayDepositUserOp`) is exercised directly;
 * the orchestrator (`depositAndRecordReceipt`) runs against a stubbed
 * `WalletKitAdapter` and a stub HTTP poster injected via
 * `args.postReceipt` so the production `@/constants/configs/ky`
 * helper (which pulls in expo-router) never loads.
 *
 * Coverage:
 *   - Builder encodes the `GatewayWallet.deposit(amount, to)` selector
 *     + argument pair, preserves the paymaster / usdc / bundler pass-
 *     through fields, and throws `PaymasterDepositNotSupportedError`
 *     on non-EVM chains.
 *   - Orchestrator presence-checks `walletKit.sendUserOpWithUsdcPaymaster`
 *     and throws on Solana-shaped adapters.
 *   - Orchestrator submits the UserOp via the adapter and POSTs the
 *     deposit receipt with the exact `{ txHash, chainId,
 *     useCirclePaymaster: true }` body §6.2 mandates.
 *   - `waitForUserOpTxHash` is honoured when supplied, otherwise the
 *     adapter's `userOpHash` flows through as `txHash`.
 *   - Backend 4xx → typed `DepositReceiptError` with `.status` pinned
 *     (lets the onboarding screen render `DEPOSIT_FAILED` copy).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Address, decodeFunctionData, type Hex, slice } from "viem";
import { base } from "viem/chains";

import type {
  ChainConfig,
  EvmChainConfig,
} from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import type {
  SendUserOpResult,
  SendUserOpWithUsdcPaymasterArgs,
  WalletKitAdapter,
} from "../walletKit/types.ts";
import {
  buildGatewayDepositUserOp,
  DEFAULT_PAYMASTER_APPROVE_MICROS,
  DepositReceiptError,
  type DepositReceiptRequest,
  type DepositReceiptResponse,
  depositAndRecordReceipt,
  depositReceiptEndpoint,
  GATEWAY_WALLET_DEPOSIT_ABI,
  PaymasterDepositNotSupportedError,
  type PostDepositReceipt,
} from "./gatewayDeposit.ts";

const EVM_CHAIN: EvmChainConfig = { namespace: "eip155", chain: base };
const SOLANA_CHAIN: ChainConfig = {
  namespace: "solana",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
};

const STUB_WALLET = { address: "0xpayer" } as unknown as TWallet;
const PAYER: Address = "0x1111111111111111111111111111111111111111";
const USDC_BASE: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMASTER_BASE: Address = "0x00000000000000fB866DaAA79352cC568a005D96";
const GATEWAY_WALLET: Address = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const BUNDLER_URL = "https://bundler.local/rpc";
const USDC_AMOUNT = 5_000_000n; // 5 USDC
const INTENT_ID = "pi_test_0001";

const MOCK_USER_OP_HASH: Hex =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const MOCK_TX_HASH: Hex =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

// ─── buildGatewayDepositUserOp — pure ─────────────────────────────────

describe("buildGatewayDepositUserOp", () => {
  it("encodes GatewayWallet.deposit(amount, payer) and preserves passthrough fields", () => {
    const args = buildGatewayDepositUserOp({
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
      payer: PAYER,
      usdcTokenAddress: USDC_BASE,
      usdcAmount: USDC_AMOUNT,
      gatewayWalletAddress: GATEWAY_WALLET,
      paymasterAddress: PAYMASTER_BASE,
      bundlerUrl: BUNDLER_URL,
    });

    // Selector + decoded args reflect `deposit(uint256,address)`.
    assert.equal(args.target, GATEWAY_WALLET, "target is the GatewayWallet");
    assert.equal(args.value, 0n, "deposit carries no native value");

    const selector = slice(args.callData, 0, 4);
    const decoded = decodeFunctionData({
      abi: GATEWAY_WALLET_DEPOSIT_ABI,
      data: args.callData,
    });
    assert.equal(decoded.functionName, "deposit");
    assert.equal(decoded.args[0], USDC_AMOUNT, "amount echoes input bigint");
    assert.equal(
      (decoded.args[1] as string).toLowerCase(),
      PAYER.toLowerCase(),
      "recipient is the payer itself (self-credit to Gateway ledger)",
    );
    // The `deposit(uint256,address)` selector is stable across deployments.
    assert.equal(selector.length, 10, "selector is 4 bytes hex");

    // Passthrough fields arrive at the adapter unchanged.
    assert.equal(args.paymasterAddress, PAYMASTER_BASE);
    assert.equal(args.usdcTokenAddress, USDC_BASE);
    assert.equal(args.bundlerUrl, BUNDLER_URL);
    assert.equal(
      args.paymasterApproveAmount,
      DEFAULT_PAYMASTER_APPROVE_MICROS,
      "default paymaster cap applied when caller omits it",
    );
  });

  it("honours a caller-supplied paymasterApproveAmount override", () => {
    const tightCap = 1_500_000n;
    const args = buildGatewayDepositUserOp({
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
      payer: PAYER,
      usdcTokenAddress: USDC_BASE,
      usdcAmount: USDC_AMOUNT,
      gatewayWalletAddress: GATEWAY_WALLET,
      paymasterAddress: PAYMASTER_BASE,
      bundlerUrl: BUNDLER_URL,
      paymasterApproveAmount: tightCap,
    });
    assert.equal(args.paymasterApproveAmount, tightCap);
  });

  it("throws PaymasterDepositNotSupportedError on a Solana chain", () => {
    assert.throws(
      () =>
        buildGatewayDepositUserOp({
          wallet: STUB_WALLET,
          chain: SOLANA_CHAIN,
          payer: PAYER,
          usdcTokenAddress: USDC_BASE,
          usdcAmount: USDC_AMOUNT,
          gatewayWalletAddress: GATEWAY_WALLET,
          paymasterAddress: PAYMASTER_BASE,
          bundlerUrl: BUNDLER_URL,
        }),
      (err: unknown) =>
        err instanceof PaymasterDepositNotSupportedError &&
        err.name === "PaymasterDepositNotSupportedError" &&
        err.namespace === "solana",
    );
  });

  it("rejects non-positive usdcAmount values", () => {
    assert.throws(
      () =>
        buildGatewayDepositUserOp({
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
          payer: PAYER,
          usdcTokenAddress: USDC_BASE,
          usdcAmount: 0n,
          gatewayWalletAddress: GATEWAY_WALLET,
          paymasterAddress: PAYMASTER_BASE,
          bundlerUrl: BUNDLER_URL,
        }),
      /usdcAmount must be > 0/,
    );
  });
});

// ─── depositAndRecordReceipt — orchestration ──────────────────────────

/**
 * Minimal WalletKit stub. `sendUserOpWithUsdcPaymaster` records the
 * argument bag and returns the configured `userOpHash` so the test
 * can assert on the full path without loading the real EVM kit (which
 * pulls in `expo-secure-store` / walletService dwell sites).
 */
interface KitCallRecord {
  called: boolean;
  args: SendUserOpWithUsdcPaymasterArgs | null;
}

function makeEvmKitStub(opts: { userOpHash?: Hex } = {}): {
  kit: WalletKitAdapter;
  record: KitCallRecord;
} {
  const record: KitCallRecord = { called: false, args: null };
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
    sendNativeTransfer: async () => "0x",
    estimateMaxTransferable: async () => 0n,
    formatNativeAmount: () => "",
    parseNativeAmount: () => 0n,
    truncateAddress: (a) => a,
    async sendUserOpWithUsdcPaymaster(
      args: SendUserOpWithUsdcPaymasterArgs,
    ): Promise<SendUserOpResult> {
      record.called = true;
      record.args = args;
      return { userOpHash: opts.userOpHash ?? MOCK_USER_OP_HASH };
    },
  };
  return { kit, record };
}

/** Solana-shaped stub — leaves `sendUserOpWithUsdcPaymaster` undefined. */
function makeSolanaKitStub(): WalletKitAdapter {
  return {
    namespace: "solana",
    validateAddress: () => true,
    validatePrivateKey: () => true,
    validateMnemonic: () => true,
    createWalletFromPrivateKey: async () => STUB_WALLET,
    createWalletFromMnemonic: async () => STUB_WALLET,
    generateMnemonic: () => "",
    getSignerForWallet: async () => null,
    getNativeBalance: async () => 0n,
    sendNativeTransfer: async () => "0x",
    estimateMaxTransferable: async () => 0n,
    formatNativeAmount: () => "",
    parseNativeAmount: () => 0n,
    truncateAddress: (a) => a,
    // NOTE: no `sendUserOpWithUsdcPaymaster` — matches the real Solana kit.
  };
}

interface PostRecord {
  called: boolean;
  intentId: string | null;
  body: DepositReceiptRequest | null;
}

function makePoster(
  response: DepositReceiptResponse | (() => Promise<DepositReceiptResponse>),
): { poster: PostDepositReceipt; record: PostRecord } {
  const record: PostRecord = { called: false, intentId: null, body: null };
  const poster: PostDepositReceipt = async ({ intentId, body }) => {
    record.called = true;
    record.intentId = intentId;
    record.body = body;
    return typeof response === "function" ? response() : response;
  };
  return { poster, record };
}

describe("depositAndRecordReceipt — chain-extension discipline", () => {
  it("throws PaymasterDepositNotSupportedError on a Solana kit (presence-of-method check)", async () => {
    const kit = makeSolanaKitStub();
    const { poster } = makePoster({
      depositId: "dep_x",
      status: "CONFIRMED",
    });
    await assert.rejects(
      () =>
        depositAndRecordReceipt({
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
          payer: PAYER,
          usdcTokenAddress: USDC_BASE,
          usdcAmount: USDC_AMOUNT,
          gatewayWalletAddress: GATEWAY_WALLET,
          paymasterAddress: PAYMASTER_BASE,
          bundlerUrl: BUNDLER_URL,
          intentId: INTENT_ID,
          walletKit: kit,
          postReceipt: poster,
        }),
      (err: unknown) =>
        err instanceof PaymasterDepositNotSupportedError &&
        err.namespace === "solana",
    );
  });
});

describe("depositAndRecordReceipt — happy path", () => {
  it("submits UserOp, POSTs receipt with correct body, returns depositId + txHash", async () => {
    const { kit, record: kitRecord } = makeEvmKitStub();
    const { poster, record: postRecord } = makePoster({
      depositId: "dep_abc123",
      status: "PENDING_ATTESTATION",
    });

    const result = await depositAndRecordReceipt({
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
      payer: PAYER,
      usdcTokenAddress: USDC_BASE,
      usdcAmount: USDC_AMOUNT,
      gatewayWalletAddress: GATEWAY_WALLET,
      paymasterAddress: PAYMASTER_BASE,
      bundlerUrl: BUNDLER_URL,
      intentId: INTENT_ID,
      walletKit: kit,
      postReceipt: poster,
    });

    // Adapter was invoked with the built UserOp args.
    assert.ok(kitRecord.called, "adapter.sendUserOpWithUsdcPaymaster invoked");
    const sent = kitRecord.args;
    assert.ok(sent, "adapter received args");
    assert.equal(sent.target, GATEWAY_WALLET);
    assert.equal(sent.paymasterAddress, PAYMASTER_BASE);
    assert.equal(sent.usdcTokenAddress, USDC_BASE);
    assert.equal(sent.bundlerUrl, BUNDLER_URL);
    assert.equal(sent.value, 0n);

    // Backend receipt POST body matches §6.2 DepositReceiptRequest.
    assert.ok(postRecord.called, "postReceipt was invoked");
    assert.equal(postRecord.intentId, INTENT_ID);
    assert.ok(postRecord.body);
    assert.equal(postRecord.body.chainId, base.id);
    assert.equal(postRecord.body.useCirclePaymaster, true);
    // Without `waitForUserOpTxHash`, the userOpHash flows through as txHash.
    assert.equal(postRecord.body.txHash, MOCK_USER_OP_HASH);

    // Return shape.
    assert.equal(result.txHash, MOCK_USER_OP_HASH);
    assert.equal(result.gatewayDepositId, "dep_abc123");
    assert.equal(result.status, "PENDING_ATTESTATION");
    assert.equal(result.usedCirclePaymaster, true);
  });

  it("uses waitForUserOpTxHash when supplied, POSTing the resolved tx hash", async () => {
    const { kit } = makeEvmKitStub();
    const { poster, record: postRecord } = makePoster({
      depositId: "dep_wait",
      status: "CONFIRMED",
    });

    const waitCalls: `0x${string}`[] = [];
    const result = await depositAndRecordReceipt({
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
      payer: PAYER,
      usdcTokenAddress: USDC_BASE,
      usdcAmount: USDC_AMOUNT,
      gatewayWalletAddress: GATEWAY_WALLET,
      paymasterAddress: PAYMASTER_BASE,
      bundlerUrl: BUNDLER_URL,
      intentId: INTENT_ID,
      walletKit: kit,
      postReceipt: poster,
      waitForUserOpTxHash: async (userOpHash) => {
        waitCalls.push(userOpHash);
        return MOCK_TX_HASH;
      },
    });

    assert.deepEqual(waitCalls, [MOCK_USER_OP_HASH]);
    assert.equal(postRecord.body?.txHash, MOCK_TX_HASH);
    assert.equal(result.txHash, MOCK_TX_HASH);
  });
});

// ─── depositAndRecordReceipt — error mapping ──────────────────────────

describe("depositAndRecordReceipt — backend failure", () => {
  it("wraps ky HTTPError as DepositReceiptError with pinned status", async () => {
    const { kit } = makeEvmKitStub();
    // The service uses `err instanceof HTTPError`, so we construct a
    // real ky HTTPError. ky's constructor wants `(Response, Request,
    // NormalizedOptions)` — only `.response.status` flows through to
    // our error mapping, so the request / options are minimal stubs.
    const kyModule = await import("ky");
    const response = new Response(JSON.stringify({ error: "bad" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
    const request = new Request("http://localhost/v1/pay/intents/x");
    const realErr = new kyModule.HTTPError(response, request, {} as never);

    const postReceipt: PostDepositReceipt = async () => {
      throw realErr;
    };

    await assert.rejects(
      () =>
        depositAndRecordReceipt({
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
          payer: PAYER,
          usdcTokenAddress: USDC_BASE,
          usdcAmount: USDC_AMOUNT,
          gatewayWalletAddress: GATEWAY_WALLET,
          paymasterAddress: PAYMASTER_BASE,
          bundlerUrl: BUNDLER_URL,
          intentId: INTENT_ID,
          walletKit: kit,
          postReceipt,
        }),
      (err: unknown) =>
        err instanceof DepositReceiptError &&
        err.status === 503 &&
        err.intentId === INTENT_ID,
    );
  });

  it("re-throws non-HTTPError transport failures unchanged", async () => {
    const { kit } = makeEvmKitStub();
    const boom = new Error("network down");
    const postReceipt: PostDepositReceipt = async () => {
      throw boom;
    };
    await assert.rejects(
      () =>
        depositAndRecordReceipt({
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
          payer: PAYER,
          usdcTokenAddress: USDC_BASE,
          usdcAmount: USDC_AMOUNT,
          gatewayWalletAddress: GATEWAY_WALLET,
          paymasterAddress: PAYMASTER_BASE,
          bundlerUrl: BUNDLER_URL,
          intentId: INTENT_ID,
          walletKit: kit,
          postReceipt,
        }),
      (err: unknown) => err === boom,
    );
  });

  it("throws explicit error when postReceipt is omitted", async () => {
    const { kit } = makeEvmKitStub();
    await assert.rejects(
      () =>
        depositAndRecordReceipt({
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
          payer: PAYER,
          usdcTokenAddress: USDC_BASE,
          usdcAmount: USDC_AMOUNT,
          gatewayWalletAddress: GATEWAY_WALLET,
          paymasterAddress: PAYMASTER_BASE,
          bundlerUrl: BUNDLER_URL,
          intentId: INTENT_ID,
          walletKit: kit,
        }),
      /postReceipt.*is required/,
    );
  });
});

describe("depositReceiptEndpoint", () => {
  it("percent-encodes the intent id", () => {
    assert.equal(
      depositReceiptEndpoint("pi_01/abc"),
      "v1/pay/intents/pi_01%2Fabc/deposit-receipt",
    );
  });
});
