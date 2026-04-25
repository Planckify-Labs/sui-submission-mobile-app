/**
 * Unit tests for `services/nanopay/pathSelector.ts` (spec §5.6,
 * milestone M5).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/nanopay/pathSelector.test.ts
 *
 * Pure Node test bench — no keystore, no RN modules, no RPC. The
 * selector is a pure function over `{ intent, walletKit, chainConfig }`
 * so every branch is covered by hand-rolled stubs.
 *
 * Chain-extension discipline (memory
 * `feedback_chain_extension_discipline.md`): every dispatch assertion
 * here mirrors a presence-of-method check — EVM stubs ship
 * `signTransferWithAuthorization`; Solana stubs ship
 * `signX402SvmPayment`; the "gasless" stub ships both EIP-3009 and
 * `sendUserOpWithUsdcPaymaster`. Tests deliberately do NOT use
 * `namespace === "X"` to pick branches — that would undermine the
 * invariant the production selector upholds.
 *
 * Coverage:
 *   - EVM adapter + paymaster + deposit done → "gasless".
 *   - EVM adapter + paymaster but intent still requires deposit → "B-EVM".
 *   - EVM adapter + no paymaster → "B-EVM".
 *   - Solana adapter (x402 SVM signer only) → "B-SVM".
 *   - Arc chain (`nativeCurrency.symbol === "USDC"`) → "A".
 *   - x402-channel intent short-circuits to "C" regardless of adapter.
 *   - Adapter with no signing methods → throws `NoSuitablePayPathError`.
 *   - `executePath` delegates to the matching orchestrator and rejects
 *     for a missing key.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineChain } from "viem";
import { base, mainnet } from "viem/chains";

import type {
  EvmChainConfig,
  SolanaChainConfig,
} from "../../constants/configs/chainConfig.ts";
import type {
  SendUserOpResult,
  SendUserOpWithUsdcPaymasterArgs,
  SignTransferWithAuthorizationArgs,
  SignX402SvmPaymentArgs,
  WalletKitAdapter,
} from "../walletKit/types.ts";
import {
  executePath,
  NoSuitablePayPathError,
  type PayPath,
  selectPayPath,
} from "./pathSelector.ts";
import type { PaymentIntentResponse } from "./types.ts";

/** ── fixtures ───────────────────────────────────────────────────────── */

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const ARC_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  chain: ARC_TESTNET,
  isTestnet: true,
};

/** Mainnet stub for non-USDC-native EVM (ETH as native). */
const ETH_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  chain: mainnet,
};

/** Base stub — paymaster-eligible chain (ETH native, so non-Arc). */
const BASE_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  chain: base,
};

/** Solana devnet stub — has no `nativeCurrency` object at all. */
const SOL_CHAIN: SolanaChainConfig = {
  namespace: "solana",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
};

/**
 * Build a `PaymentIntentResponse` skeleton with optional `channel` +
 * `gasless` fields the selector reads off the duck-typed view. We
 * cast-through `unknown` so the tests stay independent of unrelated
 * fields on the canonical shape.
 */
function makeIntent(overrides: {
  id?: string;
  channelKind?: "merchant" | "x402";
  requiresDeposit?: boolean;
}): PaymentIntentResponse {
  const base = {
    id: overrides.id ?? "intent_test_1",
    status: "pending",
    nanopayUsdcAmountMicros: "1500000",
    nanopayUsdcSourceChainId: 5042002,
    nanopayUsdcTreasuryAddress: "0x2222222222222222222222222222222222222222",
    nanopay: null,
    expiresAt: Date.now() + 60_000,
    channel:
      overrides.channelKind !== undefined
        ? { kind: overrides.channelKind }
        : undefined,
    gasless:
      overrides.requiresDeposit !== undefined
        ? { requiresDeposit: overrides.requiresDeposit }
        : undefined,
  };
  return base as unknown as PaymentIntentResponse;
}

/**
 * Minimal `WalletKitAdapter` stub. Real adapters supply every method
 * on the interface; tests only need the fields the selector reads.
 * Spread-merge with per-test overrides so each test decorates exactly
 * the capability it's exercising.
 */
function makeKitStub(
  overrides: Partial<WalletKitAdapter> & {
    namespace: WalletKitAdapter["namespace"];
  },
): WalletKitAdapter {
  const base: WalletKitAdapter = {
    namespace: overrides.namespace,
    validateAddress: () => false,
    validatePrivateKey: () => false,
    validateMnemonic: () => false,
    createWalletFromPrivateKey: async () => {
      throw new Error("stub");
    },
    createWalletFromMnemonic: async () => {
      throw new Error("stub");
    },
    generateMnemonic: () => "",
    getSignerForWallet: async () => null,
    getNativeBalance: async () => 0n,
    sendNativeTransfer: async () => "0x",
    estimateMaxTransferable: async () => 0n,
    formatNativeAmount: () => "",
    parseNativeAmount: () => 0n,
    truncateAddress: (a) => a,
  };
  return { ...base, ...overrides };
}

const STUB_SIG_EIP3009 = async (
  _args: SignTransferWithAuthorizationArgs,
): Promise<`0x${string}`> => "0x00";

const STUB_USEROP = async (
  _args: SendUserOpWithUsdcPaymasterArgs,
): Promise<SendUserOpResult> => ({ userOpHash: "0x00" });

const STUB_SVM_SIGN = async (_args: SignX402SvmPaymentArgs): Promise<string> =>
  "base64-signed-tx";

/** ── selectPayPath ──────────────────────────────────────────────────── */

describe("selectPayPath", () => {
  it("returns 'gasless' when EVM adapter + paymaster + deposit done", () => {
    const kit = makeKitStub({
      namespace: "eip155",
      signTransferWithAuthorization: STUB_SIG_EIP3009,
      sendUserOpWithUsdcPaymaster: STUB_USEROP,
    });
    const path = selectPayPath({
      intent: makeIntent({ requiresDeposit: false }),
      walletKit: kit,
      chainConfig: BASE_CHAIN,
    });
    assert.equal(path, "gasless");
  });

  it("returns 'B-EVM' when EVM adapter + paymaster but deposit still required", () => {
    const kit = makeKitStub({
      namespace: "eip155",
      signTransferWithAuthorization: STUB_SIG_EIP3009,
      sendUserOpWithUsdcPaymaster: STUB_USEROP,
    });
    const path = selectPayPath({
      intent: makeIntent({ requiresDeposit: true }),
      walletKit: kit,
      chainConfig: BASE_CHAIN,
    });
    assert.equal(path, "B-EVM");
  });

  it("returns 'B-EVM' when EVM adapter exposes no paymaster method", () => {
    const kit = makeKitStub({
      namespace: "eip155",
      signTransferWithAuthorization: STUB_SIG_EIP3009,
    });
    const path = selectPayPath({
      intent: makeIntent({ requiresDeposit: false }),
      walletKit: kit,
      chainConfig: ETH_CHAIN,
    });
    assert.equal(path, "B-EVM");
  });

  it("returns 'B-SVM' for a Solana adapter with only the x402 SVM signer", () => {
    const kit = makeKitStub({
      namespace: "solana",
      signX402SvmPayment: STUB_SVM_SIGN,
    });
    const path = selectPayPath({
      intent: makeIntent({}),
      walletKit: kit,
      chainConfig: SOL_CHAIN,
    });
    assert.equal(path, "B-SVM");
  });

  it("returns 'A' whenever the chain's native currency is USDC (Arc)", () => {
    const kit = makeKitStub({
      namespace: "eip155",
      // Arc eligibility is purely chain-driven — even a fully-capable
      // EVM adapter falls through to Path A so we don't waste a sign +
      // submit round-trip on a chain that doesn't need Nanopayments.
      signTransferWithAuthorization: STUB_SIG_EIP3009,
      sendUserOpWithUsdcPaymaster: STUB_USEROP,
    });
    const path = selectPayPath({
      intent: makeIntent({ requiresDeposit: false }),
      walletKit: kit,
      chainConfig: ARC_CHAIN,
    });
    assert.equal(path, "A");
  });

  it("returns 'C' for a standalone x402 channel regardless of adapter / chain", () => {
    const kit = makeKitStub({
      namespace: "eip155",
      signTransferWithAuthorization: STUB_SIG_EIP3009,
    });
    const path = selectPayPath({
      intent: makeIntent({ channelKind: "x402" }),
      walletKit: kit,
      chainConfig: BASE_CHAIN,
    });
    assert.equal(path, "C");
  });

  it("short-circuits to 'C' even when the chain is Arc", () => {
    // x402-channel branch runs BEFORE the Arc check — the merchant's
    // 402 response dictates chain/asset, not the active chain.
    const kit = makeKitStub({
      namespace: "eip155",
      signTransferWithAuthorization: STUB_SIG_EIP3009,
    });
    const path = selectPayPath({
      intent: makeIntent({ channelKind: "x402" }),
      walletKit: kit,
      chainConfig: ARC_CHAIN,
    });
    assert.equal(path, "C");
  });

  it("throws NoSuitablePayPathError for an adapter with no signing methods", () => {
    const kit = makeKitStub({ namespace: "eip155" });
    assert.throws(
      () =>
        selectPayPath({
          intent: makeIntent({}),
          walletKit: kit,
          chainConfig: ETH_CHAIN,
        }),
      (err: unknown) =>
        err instanceof NoSuitablePayPathError &&
        err.name === "NoSuitablePayPathError" &&
        err.intentId === "intent_test_1",
    );
  });

  it("prefers B-EVM over B-SVM when adapter happens to expose both", () => {
    // Defensive: we don't expect a real adapter to ship both methods
    // (kits are per-namespace), but if a future composite adapter does,
    // the EIP-3009 branch has priority because the intent already names
    // an EVM source chain by that point.
    const kit = makeKitStub({
      namespace: "eip155",
      signTransferWithAuthorization: STUB_SIG_EIP3009,
      signX402SvmPayment: STUB_SVM_SIGN,
    });
    const path = selectPayPath({
      intent: makeIntent({}),
      walletKit: kit,
      chainConfig: ETH_CHAIN,
    });
    assert.equal(path, "B-EVM");
  });
});

/** ── executePath ────────────────────────────────────────────────────── */

describe("executePath", () => {
  it("invokes the orchestrator matching the given path", async () => {
    const calls: PayPath[] = [];
    const makeFn = (p: PayPath) => async () => {
      calls.push(p);
      return p;
    };
    const result = await executePath("gasless", {
      A: makeFn("A"),
      "B-EVM": makeFn("B-EVM"),
      "B-SVM": makeFn("B-SVM"),
      C: makeFn("C"),
      gasless: makeFn("gasless"),
    });
    assert.equal(result, "gasless");
    assert.deepEqual(calls, ["gasless"]);
  });

  it("rejects when the orchestrator for the path is missing", async () => {
    await assert.rejects(
      () =>
        executePath("C", {
          A: async () => "A",
          "B-EVM": async () => "B-EVM",
          "B-SVM": async () => "B-SVM",
          // C omitted to simulate a consumer that didn't wire every branch.
          C: undefined as unknown as () => Promise<string>,
          gasless: async () => "gasless",
        }),
      /orchestrator for path="C" is not a function/,
    );
  });
});

/** ── discipline check ───────────────────────────────────────────────── */

describe("pathSelector chain-extension discipline", () => {
  it("has zero namespace string-compares in the source file", async () => {
    // Guardrail for memory `feedback_chain_extension_discipline.md`: a
    // refactor that sneaks in `namespace === "eip155"` / `"solana"`
    // should trip CI here, not at code review.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = await fs.readFile(
      path.join(here, "pathSelector.ts"),
      "utf8",
    );
    // Strip block + line comments so doc prose mentioning
    // `namespace === "X"` (as commentary) doesn't false-positive.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    const patterns = [
      /namespace\s*===\s*["']eip155["']/,
      /namespace\s*===\s*["']solana["']/,
    ];
    for (const pattern of patterns) {
      assert.equal(
        pattern.test(code),
        false,
        `pathSelector.ts must not branch on namespace (matched ${pattern})`,
      );
    }
  });
});
