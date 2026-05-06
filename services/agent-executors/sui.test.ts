/**
 * Unit tests for the Sui agent-mode executors (Task 11).
 *
 * Spec reference: `docs/sui-chain-support-spec.md` §7, §4.1.
 *
 * Strategy: stub the `walletKitRegistry`, MMKV `storage`, and the
 * `@mysten/sui/jsonRpc` client at the module boundary so tests stay
 * pure (no network, no native modules). The executors themselves are
 * thin wrappers over the kit + the registry, so the assertions focus
 * on:
 *   - happy-path return shape (digest lives on `data.digest`, NOT
 *     `tx_hash` — the wire-schema invariant from spec §7).
 *   - kit dispatch arguments (so refactors of the kit signature
 *     surface here, not at runtime in production).
 *   - `mapUnknownError` mapping for each typed Sui error per §4.1.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — installed before importing the executors so the kit /
// storage references resolve to the stubs below.
// ---------------------------------------------------------------------------

const kitMock = {
  validateAddress: vi.fn((s: string) => typeof s === "string" && s.length > 0),
  getNativeBalance: vi.fn(),
  formatNativeAmount: vi.fn((raw: bigint) => `${Number(raw) / 1e9} SUI`),
  parseNativeAmount: vi.fn((human: string) =>
    BigInt(Math.round(parseFloat(human) * 1e9)),
  ),
  sendNativeTransfer: vi.fn(),
  sendTokenTransfer: vi.fn(),
};

const registryHas = vi.fn(() => true);
const registryGet = vi.fn(() => kitMock);

vi.mock("@/services/walletKit/registry", () => ({
  walletKitRegistry: {
    has: (ns: string) => registryHas(ns),
    get: (ns: string) => registryGet(ns),
  },
}));

const storageMock = {
  getString: vi.fn<(key: string) => string | undefined>(),
  set: vi.fn(),
};

vi.mock("@/lib/storage/mmkv", () => ({
  storage: storageMock,
}));

vi.mock("@/api/endpoints/tokens", () => ({
  tokenApi: {
    searchTokens: vi.fn(async () => []),
  },
}));

vi.mock("@mysten/sui/jsonRpc", () => ({
  SuiJsonRpcClient: class {
    async getAllBalances() {
      return [];
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports — must come AFTER vi.mock calls above. The executors close
// over the mocked walletKitRegistry / storage at import time.
// ---------------------------------------------------------------------------

import {
  getSuiBalance,
  getWalletSuiBalance,
  sendSui,
  sendSuiCoin,
} from "./sui";
import {
  type ExecutorContext,
  ExecutorErrorCode,
  mapUnknownError,
} from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUI_ADDR = "0x".padEnd(66, "a"); // 32-byte hex
const SUI_ADDR_RECIPIENT = "0x".padEnd(66, "b");
const SUI_NATIVE_COIN_TYPE = "0x2::sui::SUI";
const USDC_COIN_TYPE = "0xdee9::usdc::USDC";

const ACTIVE_CHAIN_RAW = JSON.stringify({
  namespace: "sui",
  network: "mainnet",
  rpcUrl: "https://fullnode.mainnet.sui.io:443",
  isTestnet: false,
});

function makeContext(
  overrides: Partial<ExecutorContext> = {},
): ExecutorContext {
  const wallet = {
    id: "w1",
    address: SUI_ADDR,
    namespace: "sui" as const,
    name: "Test",
    isActive: true,
  } as unknown as ExecutorContext["wallet"];

  return {
    wallet,
    account: null,
    blockchains: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: active_chain mmkv slot returns the Sui mainnet chain.
  storageMock.getString.mockImplementation((key) =>
    key === "active_chain" ? ACTIVE_CHAIN_RAW : undefined,
  );
  registryHas.mockReturnValue(true);
  registryGet.mockReturnValue(kitMock);
  kitMock.validateAddress.mockImplementation(
    (s: string) => typeof s === "string" && s.length > 0,
  );
  kitMock.formatNativeAmount.mockImplementation(
    (raw: bigint) => `${Number(raw) / 1e9} SUI`,
  );
  kitMock.parseNativeAmount.mockImplementation((human: string) =>
    BigInt(Math.round(parseFloat(human) * 1e9)),
  );
});

// ---------------------------------------------------------------------------
// get_wallet_sui_balance
// ---------------------------------------------------------------------------

describe("get_wallet_sui_balance", () => {
  it("returns the active wallet's SUI balance via the kit", async () => {
    kitMock.getNativeBalance.mockResolvedValue(1_500_000_000n); // 1.5 SUI

    const result = await getWalletSuiBalance({}, makeContext());

    expect(kitMock.getNativeBalance).toHaveBeenCalledWith(
      SUI_ADDR,
      expect.objectContaining({ namespace: "sui", network: "mainnet" }),
    );
    expect(result.status).toBe("success");
    expect(result.data).toMatchObject({
      address: SUI_ADDR,
      network: "mainnet",
      balance_mist: "1500000000",
      symbol: "SUI",
    });
    // Wire-schema invariant: NO tx_hash on a read.
    expect(result.tx_hash).toBeUndefined();
  });

  it("fails with WalletCannotExecute when no wallet is connected", async () => {
    const ctx = makeContext();
    (ctx as { wallet: unknown }).wallet = undefined;
    const result = await getWalletSuiBalance({}, ctx);
    expect(result.status).toBe("failed");
    expect(result.error).toBe(ExecutorErrorCode.WalletCannotExecute);
  });

  it("fails with UnsupportedChain when the active chain is not Sui", async () => {
    storageMock.getString.mockImplementation((key) =>
      key === "active_chain"
        ? JSON.stringify({ namespace: "solana", cluster: "mainnet-beta" })
        : undefined,
    );
    const result = await getWalletSuiBalance({}, makeContext());
    expect(result.status).toBe("failed");
    expect(result.error).toBe(ExecutorErrorCode.UnsupportedChain);
  });
});

// ---------------------------------------------------------------------------
// get_sui_balance — arg fallback
// ---------------------------------------------------------------------------

describe("get_sui_balance", () => {
  it("falls back to the active wallet when no address is provided", async () => {
    kitMock.getNativeBalance.mockResolvedValue(0n);
    const result = await getSuiBalance({}, makeContext());
    expect(result.status).toBe("success");
    expect(kitMock.getNativeBalance).toHaveBeenCalledWith(
      SUI_ADDR,
      expect.anything(),
    );
  });

  it("uses an explicit `address` argument when present", async () => {
    kitMock.getNativeBalance.mockResolvedValue(42n);
    const result = await getSuiBalance(
      { address: SUI_ADDR_RECIPIENT },
      makeContext(),
    );
    expect(result.status).toBe("success");
    expect(kitMock.getNativeBalance).toHaveBeenCalledWith(
      SUI_ADDR_RECIPIENT,
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// send_sui — digest lives on data.digest, NOT tx_hash
// ---------------------------------------------------------------------------

describe("send_sui", () => {
  it("returns the base58 digest on data.digest (NOT tx_hash)", async () => {
    const fakeDigest = "5K3RxYzSomeBase58Digest";
    kitMock.sendNativeTransfer.mockResolvedValue(fakeDigest);

    const result = await sendSui(
      { to: SUI_ADDR_RECIPIENT, amount_sui: "0.25" },
      makeContext(),
    );

    expect(kitMock.sendNativeTransfer).toHaveBeenCalledWith({
      wallet: expect.objectContaining({ address: SUI_ADDR }),
      to: SUI_ADDR_RECIPIENT,
      amount: 250_000_000n, // 0.25 SUI in MIST
      chain: expect.objectContaining({ namespace: "sui" }),
    });
    expect(result.status).toBe("success");
    expect(result.tx_confirmed).toBe(true);
    // Critical wire-schema invariant: the digest is base58, not 0x-hex,
    // so it MUST live on data.digest — never on tx_hash.
    expect(result.tx_hash).toBeUndefined();
    expect((result.data as { digest: string }).digest).toBe(fakeDigest);
    expect(result.data).toMatchObject({
      to: SUI_ADDR_RECIPIENT,
      network: "mainnet",
      amount_sui: "0.25",
    });
  });

  it("rejects an invalid amount with InvalidInput", async () => {
    const result = await sendSui(
      { to: SUI_ADDR_RECIPIENT, amount_sui: "0" },
      makeContext(),
    );
    expect(result.status).toBe("failed");
    expect(result.error).toBe(ExecutorErrorCode.InvalidInput);
    expect(kitMock.sendNativeTransfer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send_sui_coin — non-native dispatch via kit.sendTokenTransfer
// ---------------------------------------------------------------------------

describe("send_sui_coin", () => {
  it("dispatches through kit.sendTokenTransfer with coin_type as contractAddress", async () => {
    const fakeDigest = "BBQbase58Digest";
    kitMock.sendTokenTransfer.mockResolvedValue(fakeDigest);

    const result = await sendSuiCoin(
      {
        to: SUI_ADDR_RECIPIENT,
        coin_type: USDC_COIN_TYPE,
        token_amount: "1.5",
        token_decimals: 6,
      },
      makeContext(),
    );

    expect(kitMock.sendTokenTransfer).toHaveBeenCalledWith({
      wallet: expect.objectContaining({ address: SUI_ADDR }),
      to: SUI_ADDR_RECIPIENT,
      amount: 1_500_000n, // 1.5 * 10^6
      chain: expect.objectContaining({ namespace: "sui" }),
      contractAddress: USDC_COIN_TYPE,
      decimals: 6,
    });
    expect(result.status).toBe("success");
    expect(result.tx_confirmed).toBe(true);
    expect(result.tx_hash).toBeUndefined();
    expect((result.data as { digest: string }).digest).toBe(fakeDigest);
    expect(result.data).toMatchObject({
      to: SUI_ADDR_RECIPIENT,
      coin_type: USDC_COIN_TYPE,
      amount_raw: "1500000",
      token_amount: "1.5",
      decimals: 6,
    });
  });

  it("rejects malformed coin_type with InvalidInput", async () => {
    const result = await sendSuiCoin(
      {
        to: SUI_ADDR_RECIPIENT,
        coin_type: "not_a_move_type",
        token_amount: "1",
        token_decimals: 6,
      },
      makeContext(),
    );
    expect(result.status).toBe("failed");
    expect(result.error).toBe(ExecutorErrorCode.InvalidInput);
    expect(kitMock.sendTokenTransfer).not.toHaveBeenCalled();
  });

  it("accepts the native SUI coin_type without complaint (kit dispatches the right path)", async () => {
    kitMock.sendTokenTransfer.mockResolvedValue("digest");
    const result = await sendSuiCoin(
      {
        to: SUI_ADDR_RECIPIENT,
        coin_type: SUI_NATIVE_COIN_TYPE,
        token_amount: "1",
        token_decimals: 9,
      },
      makeContext(),
    );
    expect(result.status).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// mapUnknownError — typed Sui error mapping (spec §4.1)
// ---------------------------------------------------------------------------

describe("mapUnknownError — Sui typed errors", () => {
  function suiError(name: string, message = "boom"): Error {
    const e = new Error(message);
    e.name = name;
    return e;
  }

  it("maps SuiUnsupportedTokenKindError → not_implemented", () => {
    expect(mapUnknownError(suiError("SuiUnsupportedTokenKindError"))).toBe(
      ExecutorErrorCode.NotImplemented,
    );
  });

  it("maps SuiInsufficientCoinError → insufficient_funds", () => {
    expect(mapUnknownError(suiError("SuiInsufficientCoinError"))).toBe(
      ExecutorErrorCode.InsufficientFunds,
    );
  });

  it("maps SuiRegulatedCoinDeniedError → descriptive message (invalid_input fallback)", () => {
    const result = mapUnknownError(
      suiError(
        "SuiRegulatedCoinDeniedError",
        "Regulated coin transfer denied for 0x..::usdc::USDC",
      ),
    );
    expect(result).toContain("Regulated coin transfer denied");
  });

  it("maps SuiClosedLoopPolicyDeniedError → invalid_input", () => {
    expect(mapUnknownError(suiError("SuiClosedLoopPolicyDeniedError"))).toBe(
      ExecutorErrorCode.InvalidInput,
    );
  });

  it("maps SuiClosedLoopPolicyUnresolvedError → not_implemented", () => {
    expect(
      mapUnknownError(suiError("SuiClosedLoopPolicyUnresolvedError")),
    ).toBe(ExecutorErrorCode.NotImplemented);
  });
});
