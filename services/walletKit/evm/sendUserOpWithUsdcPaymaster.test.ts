/**
 * Unit tests for `sendUserOpWithUsdcPaymaster` (spec §5.4, §5.5, §12 Q6, M4).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/walletKit/evm/sendUserOpWithUsdcPaymaster.test.ts
 *
 * Pure Node test bench. Uses `viem.generatePrivateKey` +
 * `privateKeyToAccount` for a throwaway signer so the suite never
 * touches `expo-secure-store` or `walletService`. Both the source-chain
 * public RPC and the ERC-4337 bundler are mocked via `custom({ request })`
 * transports — the test asserts on the captured RPC calls rather than
 * reaching any real bundler.
 *
 * Coverage:
 *   - `buildPaymasterCalls` emits the (approve, target) pair in the
 *     exact order Circle Paymaster expects (approve must land before
 *     the target call inside the UserOp batch).
 *   - Namespace guard: Solana chain throws pre-RPC (no bundler reach).
 *   - End-to-end: UserOp reaches `eth_sendUserOperation` with
 *     `paymaster = paymasterAddress`, `sender = EOA address`, and the
 *     EIP-7702 `authorization` field (undeployed delegation → attached).
 *   - Round-trip: function returns the bundler's `userOpHash`
 *     byte-identical.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Chain,
  createPublicClient,
  custom,
  decodeFunctionData,
  type PublicClient,
  slice,
} from "viem";
import {
  type BundlerClient,
  createBundlerClient,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import type {
  ChainConfig,
  EvmChainConfig,
} from "../../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../../constants/types/walletTypes.ts";
import type { SendUserOpWithUsdcPaymasterArgs } from "../types.ts";
import {
  buildPaymasterCalls,
  sendUserOpWithUsdcPaymaster,
} from "./sendUserOpWithUsdcPaymaster.ts";

const EVM_CHAIN: EvmChainConfig = { namespace: "eip155", chain: base };
const SOLANA_CHAIN: ChainConfig = {
  namespace: "solana",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
};

const USDC_BASE: `0x${string}` = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMASTER_BASE: `0x${string}` =
  "0x00000000000000fB866DaAA79352cC568a005D96";
const GATEWAY_WALLET: `0x${string}` =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
// Arbitrary deposit calldata for testing — real value comes from task 36.
const DEPOSIT_CALLDATA: `0x${string}` = "0xdeadbeef";
const STUB_WALLET = { address: "0x0" } as unknown as TWallet;
const BUNDLER_URL = "http://bundler.local/rpc";
const MOCK_USER_OP_HASH: `0x${string}` =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

function makeArgs(
  overrides: Partial<SendUserOpWithUsdcPaymasterArgs> = {},
): SendUserOpWithUsdcPaymasterArgs {
  return {
    wallet: STUB_WALLET,
    chain: EVM_CHAIN,
    target: GATEWAY_WALLET,
    callData: DEPOSIT_CALLDATA,
    value: 0n,
    paymasterAddress: PAYMASTER_BASE,
    usdcTokenAddress: USDC_BASE,
    paymasterApproveAmount: 10_000_000n, // 10 USDC cap for gas.
    bundlerUrl: BUNDLER_URL,
    ...overrides,
  };
}

/**
 * Bundler + public RPC mock. Captures the final `eth_sendUserOperation`
 * payload so the test can assert on UserOp shape without touching a
 * real bundler. Also fakes the source-chain RPC just enough to let
 * viem's `prepareUserOperation` fill gas / nonce / authorization.
 */
interface MockRpcState {
  sentUserOp: Record<string, unknown> | null;
  sentEntryPoint: string | null;
  getCodeCalls: number;
}

function createMockClients(chain: Chain): {
  publicClient: PublicClient;
  bundlerClient: BundlerClient;
  state: MockRpcState;
} {
  const state: MockRpcState = {
    sentUserOp: null,
    sentEntryPoint: null,
    getCodeCalls: 0,
  };

  const publicRequest = async ({
    method,
    params,
  }: {
    method: string;
    params?: unknown;
  }) => {
    switch (method) {
      case "eth_chainId":
        return `0x${chain.id.toString(16)}`;
      case "eth_getCode":
        // Undeployed EOA: no delegation prefix. Forces viem to attach
        // an EIP-7702 `authorization` to the UserOp.
        state.getCodeCalls += 1;
        return "0x";
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_call":
        // EntryPoint.getNonce(...) — returns uint256(0).
        return `0x${"0".repeat(64)}`;
      case "eth_feeHistory":
        return {
          oldestBlock: "0x1",
          baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
          gasUsedRatio: [0.5],
          reward: [["0x3b9aca00"]],
        };
      case "eth_gasPrice":
        return "0x3b9aca00";
      case "eth_getBlockByNumber":
        return {
          baseFeePerGas: "0x3b9aca00",
          number: "0x1",
          timestamp: "0x1",
        };
      case "eth_maxPriorityFeePerGas":
        return "0x3b9aca00";
      default:
        throw new Error(`mock publicClient: unhandled method ${method}`);
    }
  };

  const bundlerRequest = async ({
    method,
    params,
  }: {
    method: string;
    params?: unknown;
  }) => {
    switch (method) {
      case "eth_chainId":
        return `0x${chain.id.toString(16)}`;
      case "eth_supportedEntryPoints":
        return ["0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108"];
      case "eth_estimateUserOperationGas":
        return {
          preVerificationGas: "0x10000",
          verificationGasLimit: "0x20000",
          callGasLimit: "0x30000",
          paymasterVerificationGasLimit: "0x4000",
          paymasterPostOpGasLimit: "0x2000",
        };
      case "eth_sendUserOperation": {
        const rpcParams = params as [Record<string, unknown>, string];
        state.sentUserOp = rpcParams[0];
        state.sentEntryPoint = rpcParams[1];
        return MOCK_USER_OP_HASH;
      }
      default:
        // Fall back to public RPC handlers for chain meta calls.
        return publicRequest({ method, params });
    }
  };

  const publicClient = createPublicClient({
    chain,
    transport: custom({ request: publicRequest }),
  }) as unknown as PublicClient;

  const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: custom({ request: bundlerRequest }),
  }) as unknown as BundlerClient;

  return { publicClient, bundlerClient, state };
}

describe("buildPaymasterCalls", () => {
  it("emits [approve(paymaster), target(callData)] in order", () => {
    const calls = buildPaymasterCalls({
      target: GATEWAY_WALLET,
      callData: DEPOSIT_CALLDATA,
      value: 0n,
      paymasterAddress: PAYMASTER_BASE,
      usdcTokenAddress: USDC_BASE,
      paymasterApproveAmount: 10_000_000n,
    });

    assert.equal(calls.length, 2, "exactly two calls: approve, target");

    // Call 0: USDC.approve(paymaster, amount)
    assert.equal(calls[0].to, USDC_BASE, "approve targets USDC contract");
    assert.equal(calls[0].value, 0n, "approve carries no native value");
    const approveSelector = slice(calls[0].data, 0, 4);
    assert.equal(
      approveSelector,
      "0x095ea7b3",
      "selector is `approve(address,uint256)`",
    );
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ] as const,
      data: calls[0].data,
    });
    assert.equal(decoded.functionName, "approve");
    assert.equal(
      (decoded.args[0] as string).toLowerCase(),
      PAYMASTER_BASE.toLowerCase(),
      "spender is Circle Paymaster",
    );
    assert.equal(
      decoded.args[1],
      10_000_000n,
      "approve amount is bounded (not uint256.max)",
    );

    // Call 1: target(callData, value)
    assert.equal(calls[1].to, GATEWAY_WALLET);
    assert.equal(calls[1].data, DEPOSIT_CALLDATA);
    assert.equal(calls[1].value, 0n);
  });

  it("propagates non-zero call value through to the target call", () => {
    const calls = buildPaymasterCalls({
      target: GATEWAY_WALLET,
      callData: DEPOSIT_CALLDATA,
      value: 42n,
      paymasterAddress: PAYMASTER_BASE,
      usdcTokenAddress: USDC_BASE,
      paymasterApproveAmount: 1n,
    });
    assert.equal(calls[0].value, 0n, "approve stays at zero value");
    assert.equal(calls[1].value, 42n, "target carries the caller's value");
  });
});

describe("sendUserOpWithUsdcPaymaster — namespace guard", () => {
  it("throws when handed a Solana chain (presence-of-method dispatch)", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    await assert.rejects(
      () =>
        sendUserOpWithUsdcPaymaster(account, makeArgs({ chain: SOLANA_CHAIN })),
      /expected eip155 chain/,
    );
  });
});

describe("sendUserOpWithUsdcPaymaster — bundler round-trip", () => {
  it("submits UserOp with paymaster + EIP-7702 authorization and returns userOpHash", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const { publicClient, bundlerClient, state } = createMockClients(base);

    const result = await sendUserOpWithUsdcPaymaster(account, makeArgs(), {
      publicClient,
      bundlerClient,
    });

    assert.equal(
      result.userOpHash,
      MOCK_USER_OP_HASH,
      "bundler response surfaces as userOpHash",
    );

    const sent = state.sentUserOp;
    assert.ok(sent, "eth_sendUserOperation was invoked");

    // `sender` is the EOA address (Simple7702 uses the EOA as sender).
    assert.equal(
      (sent.sender as string).toLowerCase(),
      account.address.toLowerCase(),
      "UserOp sender is the EOA address",
    );

    // Paymaster address is pinned to the caller-provided value.
    assert.equal(
      (sent.paymaster as string).toLowerCase(),
      PAYMASTER_BASE.toLowerCase(),
      "paymaster field is the Circle Paymaster address",
    );

    // EIP-7702 authorization attached (undeployed EOA delegation path).
    assert.ok(
      sent.authorizationList || sent.eip7702Auth || sent.authorization,
      "EIP-7702 authorization is present for undeployed EOA",
    );

    // Signature populated (stub or real — `0x`-prefixed hex).
    assert.ok(
      typeof sent.signature === "string" &&
        (sent.signature as string).startsWith("0x"),
      "signature is a 0x-prefixed hex blob",
    );

    // `eth_getCode` was called at least once — viem checks delegation
    // status to decide whether to include the authorization.
    assert.ok(
      state.getCodeCalls >= 1,
      "delegation status is probed via eth_getCode",
    );
  });

  it("different EOA → different UserOp sender (no signer leakage)", async () => {
    const accountA = privateKeyToAccount(generatePrivateKey());
    const accountB = privateKeyToAccount(generatePrivateKey());

    const mockA = createMockClients(base);
    const mockB = createMockClients(base);

    await sendUserOpWithUsdcPaymaster(accountA, makeArgs(), {
      publicClient: mockA.publicClient,
      bundlerClient: mockA.bundlerClient,
    });
    await sendUserOpWithUsdcPaymaster(accountB, makeArgs(), {
      publicClient: mockB.publicClient,
      bundlerClient: mockB.bundlerClient,
    });

    assert.notEqual(
      (mockA.state.sentUserOp?.sender as string).toLowerCase(),
      (mockB.state.sentUserOp?.sender as string).toLowerCase(),
      "senders scope to their own signer",
    );
  });
});
