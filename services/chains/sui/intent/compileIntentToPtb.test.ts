import { describe, expect, it } from "vitest";
import type { TToken } from "@/api/types/token";
import type { SuiChainConfig } from "@/constants/configs/chainConfig";
import type { TWallet } from "@/constants/types/walletTypes";
import type { DefiProtocolAdapter, UnsignedCall } from "@/services/defi/types";
import type { SuiSwapRouteParams } from "@/services/swap/sui/types";
import {
  type CompileContext,
  type CompileDeps,
  compileIntentToPtb,
} from "./compileIntentToPtb";
import type { Intent } from "./intentSchema";

const USDC_COIN_TYPE = "0xUSDC::usdc::USDC";

function ctxOn(network: "testnet" | "mainnet"): CompileContext {
  return {
    wallet: { address: "0xabc", namespace: "sui" } as unknown as TWallet,
    chain: {
      namespace: "sui",
      network,
      rpcUrl: "http://localhost",
    } as unknown as SuiChainConfig,
    tokens: [
      {
        symbol: "USDC",
        contractAddress: USDC_COIN_TYPE,
        decimals: 6,
        isNativeCurrency: false,
      },
    ] as unknown as TToken[],
  };
}

function deps(over: Partial<CompileDeps>): CompileDeps {
  return {
    getSwapRoute: async (p: SuiSwapRouteParams) => ({
      venue: "deepbook",
      ptbBase64: "AAA=",
      expectedOut: 9_200_000n,
      priceImpact: 0.032,
      fromCoinType: p.fromCoinType,
      toCoinType: p.toCoinType ?? "",
    }),
    listAdaptersForChain: () => [],
    appendSwapInto: async () => null,
    ...over,
  };
}

describe("compileIntentToPtb — swap", () => {
  it("resolves the INPUT from the registry and passes the output symbol", async () => {
    let captured: SuiSwapRouteParams | null = null;
    const d = deps({
      getSwapRoute: async (p) => {
        captured = p;
        return {
          venue: "deepbook",
          ptbBase64: "AAA=",
          expectedOut: 9_200_000n,
          priceImpact: 0.032,
          fromCoinType: p.fromCoinType,
          toCoinType: p.toCoinType ?? "",
        };
      },
    });
    const intent: Intent = {
      action: "swap",
      fromAsset: "SUI",
      toAsset: "USDC",
      amount: { human: "5" },
      maxSlippageBps: 50,
    };
    const compiled = await compileIntentToPtb(intent, ctxOn("testnet"), d);

    expect(compiled.summary).toBe("Swap 5 SUI to USDC");
    expect(compiled.expectedOut).toBe(9_200_000n);
    expect(compiled.priceImpact).toBe(0.032);
    expect(compiled.inputCoinType).toBe("0x2::sui::SUI");
    expect(compiled.inputAmountRaw).toBe(5_000_000_000n);
    // Input resolved from the registry; output is left to the venue (no
    // toCoinType/toDecimals passed — the DEX is authoritative for it).
    expect(captured?.fromCoinType).toBe("0x2::sui::SUI");
    expect(captured?.toSymbol).toBe("USDC");
    expect(captured?.toCoinType).toBeUndefined();
    expect(captured?.toDecimals).toBeUndefined();
  });

  it("compiles a swap to an asset with NO registry row (testnet USDC)", async () => {
    // Root-cause regression: the output coin is venue-authoritative, so a
    // swap into an asset the user doesn't hold and the registry doesn't list
    // (USDC on Sui testnet) MUST compile — not throw unsupported_asset.
    // Seeding USDC is not required; the DEX defines its pool's coins.
    let captured: SuiSwapRouteParams | null = null;
    const d = deps({
      getSwapRoute: async (p) => {
        captured = p;
        return {
          venue: "deepbook",
          ptbBase64: "AAA=",
          expectedOut: 92_000n,
          priceImpact: 0.01,
          fromCoinType: p.fromCoinType,
          toCoinType: p.toCoinType ?? "",
        };
      },
    });
    const ctx: CompileContext = {
      ...ctxOn("testnet"),
      tokens: [] as unknown as TToken[], // registry has no USDC row
    };
    const intent: Intent = {
      action: "swap",
      fromAsset: "SUI",
      toAsset: "USDC",
      amount: { human: "0.1" },
      maxSlippageBps: 50,
    };
    const compiled = await compileIntentToPtb(intent, ctx, d);

    expect(compiled.summary).toBe("Swap 0.1 SUI to USDC");
    expect(compiled.inputCoinType).toBe("0x2::sui::SUI"); // native, registry-free
    expect(compiled.inputAmountRaw).toBe(100_000_000n); // 0.1 SUI @ 9dp
    expect(captured?.toSymbol).toBe("USDC");
  });
});

describe("compileIntentToPtb — swap_and_supply (atomic zap)", () => {
  const zap: Intent = {
    action: "swap_and_supply",
    fromAsset: "SUI",
    toAsset: "USDC",
    amount: { human: "5" },
    maxSlippageBps: 50,
  };

  it("yields not_on_this_network on testnet (Scallop is mainnet-only)", async () => {
    await expect(
      compileIntentToPtb(zap, ctxOn("testnet"), deps({})),
    ).rejects.toMatchObject({ code: "unsupported_chain" });
  });

  it("composes the swap + supply into one PTB on mainnet", async () => {
    let zapArgs: { supplyAssetSymbol: string } | null = null;
    // The zap composer + supply meta are now OPTIONAL ADAPTER capabilities
    // (presence-checked by the compiler), not injected deps — a new venue
    // docks them on its adapter.
    const scallop = {
      slug: "scallop-sui",
      namespace: "sui",
      chainId: "mainnet",
      displayName: "Scallop",
      externalSlugs: ["scallop-lend", "scallop"],
      readSupplyMeta: async () => ({ apy: "5.20" }),
      buildZapSupply: async (a: { supplyAssetSymbol: string }) => {
        zapArgs = { supplyAssetSymbol: a.supplyAssetSymbol };
        return {
          ptbBase64: "AAA=",
          expectedOut: 9_000_000n,
          priceImpact: 0.012,
          toCoinType: USDC_COIN_TYPE,
        };
      },
    } as unknown as DefiProtocolAdapter;

    const compiled = await compileIntentToPtb(zap, ctxOn("mainnet"), {
      ...deps({}),
      listAdaptersForChain: () => [scallop],
    });

    expect(zapArgs?.supplyAssetSymbol).toBe("USDC");
    expect(compiled.summary).toBe(
      "Swap 5 SUI to USDC, then supply to Scallop, earning ~5.20% APY",
    );
    expect(compiled.inputCoinType).toBe("0x2::sui::SUI");
    expect(compiled.inputAmountRaw).toBe(5_000_000_000n);
    expect(compiled.outputCoinType).toBe(USDC_COIN_TYPE);
    expect(compiled.priceImpact).toBe(0.012);
    expect(compiled.apy).toBe("5.20");
  });
});

describe("compileIntentToPtb — supply", () => {
  it("yields not_on_this_network on testnet (no Scallop adapter)", async () => {
    const intent: Intent = {
      action: "supply",
      venue: "scallop",
      asset: "USDC",
      amount: { human: "100" },
    };
    await expect(
      compileIntentToPtb(intent, ctxOn("testnet"), deps({})),
    ).rejects.toMatchObject({ code: "unsupported_chain" });
  });

  it("resolves the venue by alias on mainnet and surfaces APY", async () => {
    const scallop = {
      slug: "scallop-sui",
      namespace: "sui",
      kind: "stablecoin_lending",
      chainId: "mainnet",
      displayName: "Scallop",
      externalSlugs: ["scallop-lend", "scallop"],
      buildDeposit: async (): Promise<UnsignedCall> => ({
        kind: "sui-ptb",
        transactionBlockBase64: "BBB=",
      }),
      buildWithdraw: async (): Promise<UnsignedCall> => ({
        kind: "sui-ptb",
        transactionBlockBase64: "CCC=",
      }),
      readPosition: async () => null,
      readSupplyMeta: async () => ({
        apy: "5.20",
        inputCoinType: USDC_COIN_TYPE,
      }),
    } as unknown as DefiProtocolAdapter;

    // Venue named with the DeFiLlama catalog slug ("scallop-lend"), not the
    // canonical adapter slug — the registry resolves it via externalSlugs.
    const intent: Intent = {
      action: "supply",
      venue: "scallop-lend",
      asset: "USDC",
      amount: { human: "100" },
    };
    const compiled = await compileIntentToPtb(intent, ctxOn("mainnet"), {
      ...deps({}),
      listAdaptersForChain: () => [scallop],
    });

    expect(compiled.ptbBase64).toBe("BBB=");
    expect(compiled.apy).toBe("5.20");
    expect(compiled.summary).toBe(
      "Supply 100 USDC to Scallop, earning ~5.20% APY",
    );
    expect(compiled.inputCoinType).toBe(USDC_COIN_TYPE);
    expect(compiled.inputAmountRaw).toBe(100_000_000n);
  });
});
