import { describe, expect, it } from "vitest";
import type { SuiSimulationSummary } from "@/services/chains/sui/payloads";
import type { Intent } from "../intentSchema";
import type { CompileContext, CompiledIntent } from "../intentTypes";
import { createEffectMismatchCheck } from "./checks/effectMismatchCheck";
import { createHighSlippageCheck } from "./checks/highSlippageCheck";
import { createOverConcentrationCheck } from "./checks/overConcentrationCheck";
import { createStaleOracleCheck } from "./checks/staleOracleCheck";
import type { RiskCheck, RiskCheckArgs } from "./riskCheck";
import { runGuardian } from "./riskCheckRegistry";

const ctx = {
  wallet: { address: "0xabc", namespace: "sui" },
  chain: { namespace: "sui", network: "testnet", rpcUrl: "http://localhost" },
  tokens: [],
} as unknown as CompileContext;

const swap: Intent = {
  action: "swap",
  fromAsset: "SUI",
  toAsset: "USDC",
  amount: { human: "5" },
  maxSlippageBps: 50,
};

function compiled(over: Partial<CompiledIntent>): CompiledIntent {
  return { ptbBase64: "AAA=", decoded: [], summary: "s", ...over };
}

function args(intent: Intent, c: CompiledIntent): RiskCheckArgs {
  return { intent, compiled: c, dryRun: null, ctx };
}

describe("highSlippageCheck", () => {
  const check = createHighSlippageCheck();

  it("passes below the 2% warn band", async () => {
    const f = await check.run(args(swap, compiled({ priceImpact: 0.01 })));
    expect(f).toBeNull();
  });

  it("warns between 2% and 10%", async () => {
    const f = await check.run(args(swap, compiled({ priceImpact: 0.032 })));
    expect(f?.severity).toBe("warn");
    expect(f?.code).toBe("slippage.high");
    // conservative: rounded UP toward flagging
    expect(f?.detail).toContain("3.2");
  });

  it("blocks at/above 10%", async () => {
    const f = await check.run(args(swap, compiled({ priceImpact: 0.12 })));
    expect(f?.severity).toBe("block");
  });

  it("ignores non-swap intents", async () => {
    const supply: Intent = {
      action: "supply",
      venue: "scallop",
      asset: "USDC",
      amount: { human: "100" },
    };
    const f = await check.run(args(supply, compiled({ priceImpact: 0.5 })));
    expect(f).toBeNull();
  });
});

describe("staleOracleCheck", () => {
  it("warns when the pool is older than the swap window", async () => {
    const check = createStaleOracleCheck(async () => Date.now() - 5 * 60_000);
    const f = await check.run(args(swap, compiled({ poolObjectId: "0xpool" })));
    expect(f?.severity).toBe("warn");
    expect(f?.code).toBe("oracle.stale");
  });

  it("passes when the pool updated recently", async () => {
    const check = createStaleOracleCheck(async () => Date.now() - 5_000);
    const f = await check.run(args(swap, compiled({ poolObjectId: "0xpool" })));
    expect(f).toBeNull();
  });

  it("passes (no false-block) when freshness is unavailable", async () => {
    const check = createStaleOracleCheck(async () => null);
    const f = await check.run(args(swap, compiled({ poolObjectId: "0xpool" })));
    expect(f).toBeNull();
  });

  it("passes when there is no pool object id", async () => {
    const check = createStaleOracleCheck(async () => 0);
    const f = await check.run(args(swap, compiled({})));
    expect(f).toBeNull();
  });
});

describe("overConcentrationCheck", () => {
  it("blocks when the action consumes ~90%+ of holdings", async () => {
    const check = createOverConcentrationCheck(async () => 1000n);
    const f = await check.run(
      args(
        swap,
        compiled({ inputCoinType: "0x2::sui::SUI", inputAmountRaw: 950n }),
      ),
    );
    expect(f?.severity).toBe("block");
    expect(f?.code).toBe("concentration.high");
  });

  it("warns between the warn and block ceilings", async () => {
    const check = createOverConcentrationCheck(async () => 1000n);
    const f = await check.run(
      args(
        swap,
        compiled({ inputCoinType: "0x2::sui::SUI", inputAmountRaw: 750n }),
      ),
    );
    expect(f?.severity).toBe("warn");
  });

  it("passes below the warn ceiling", async () => {
    const check = createOverConcentrationCheck(async () => 1000n);
    const f = await check.run(
      args(
        swap,
        compiled({ inputCoinType: "0x2::sui::SUI", inputAmountRaw: 500n }),
      ),
    );
    expect(f).toBeNull();
  });

  it("never flags a withdraw (it lowers concentration)", async () => {
    const check = createOverConcentrationCheck(async () => 1000n);
    const withdraw: Intent = {
      action: "withdraw",
      venue: "scallop",
      asset: "USDC",
    };
    const f = await check.run(
      args(
        withdraw,
        compiled({ inputCoinType: "0x2::sui::SUI", inputAmountRaw: 950n }),
      ),
    );
    expect(f).toBeNull();
  });
});

describe("effectMismatchCheck", () => {
  const check = createEffectMismatchCheck();
  const SUI = "0x2::sui::SUI";
  const USDC =
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
  const OTHER = "0xfeed::other::OTHER";

  function dryRun(
    changes: Array<{ owner: string; coinType: string; amount: bigint }>,
    status = "success",
  ): SuiSimulationSummary {
    return {
      status,
      gasUsed: {
        computation: 0n,
        storage: 0n,
        storageRebate: 0n,
        nonRefundableStorageFee: 0n,
      },
      balanceChanges: changes,
      objectChanges: [],
      warnings: [],
    };
  }

  function effArgs(
    c: CompiledIntent,
    sim: SuiSimulationSummary | null,
    intent: Intent = swap,
  ): RiskCheckArgs {
    return { intent, compiled: c, dryRun: sim, ctx };
  }

  const swapCompiled = compiled({ inputCoinType: SUI, outputCoinType: USDC });

  it("passes a clean swap (input out, output credited to sender)", async () => {
    const f = await check.run(
      effArgs(
        swapCompiled,
        dryRun([
          { owner: "0xabc", coinType: SUI, amount: -5_000_000_000n },
          { owner: "0xabc", coinType: USDC, amount: 9_000_000n },
        ]),
      ),
    );
    expect(f).toBeNull();
  });

  it("blocks when the output coin is NOT credited to the sender", async () => {
    const f = await check.run(
      effArgs(
        swapCompiled,
        dryRun([{ owner: "0xabc", coinType: SUI, amount: -5_000_000_000n }]),
      ),
    );
    expect(f?.severity).toBe("block");
    expect(f?.code).toBe("effect.mismatch");
  });

  it("blocks when an unexpected (non-input, non-SUI) coin leaves the sender", async () => {
    const f = await check.run(
      effArgs(
        swapCompiled,
        dryRun([
          { owner: "0xabc", coinType: SUI, amount: -5_000_000_000n },
          { owner: "0xabc", coinType: USDC, amount: 9_000_000n },
          { owner: "0xabc", coinType: OTHER, amount: -100n },
        ]),
      ),
    );
    expect(f?.severity).toBe("block");
  });

  it("allows a net-negative SUI when SUI is the OUTPUT (gas confounds it)", async () => {
    const usdcToSui: Intent = {
      action: "swap",
      fromAsset: "USDC",
      toAsset: "SUI",
      amount: { human: "10" },
      maxSlippageBps: 50,
    };
    const c = compiled({ inputCoinType: USDC, outputCoinType: SUI });
    const f = await check.run(
      effArgs(
        c,
        dryRun([
          { owner: "0xabc", coinType: USDC, amount: -10_000_000n },
          { owner: "0xabc", coinType: SUI, amount: -1_000n },
        ]),
        usdcToSui,
      ),
    );
    expect(f).toBeNull();
  });

  it("does not false-block on a null / reverting dry-run (executor's gate)", async () => {
    expect(await check.run(effArgs(swapCompiled, null))).toBeNull();
    expect(
      await check.run(
        effArgs(
          swapCompiled,
          dryRun([{ owner: "0xabc", coinType: OTHER, amount: -1n }], "failure"),
        ),
      ),
    ).toBeNull();
  });

  it("ignores non-swap intents (supply/withdraw have a richer effect shape)", async () => {
    const supply: Intent = {
      action: "supply",
      venue: "scallop",
      asset: "USDC",
      amount: { human: "100" },
    };
    const f = await check.run(
      effArgs(
        compiled({ inputCoinType: USDC, outputCoinType: USDC }),
        dryRun([{ owner: "0xabc", coinType: OTHER, amount: -1n }]),
        supply,
      ),
    );
    expect(f).toBeNull();
  });
});

describe("runGuardian", () => {
  it("collects non-null flags from registered checks", async () => {
    const stub: RiskCheck = {
      code: "slippage.high",
      run: async () => ({
        code: "slippage.high",
        severity: "warn",
        title: "t",
        detail: "d",
      }),
    };
    const passing: RiskCheck = { code: "oracle.stale", run: async () => null };
    const flags = await runGuardian(args(swap, compiled({})), [stub, passing]);
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("slippage.high");
  });

  it("skips a check that throws (never crashes the preview)", async () => {
    const boom: RiskCheck = {
      code: "concentration.high",
      run: async () => {
        throw new Error("rpc down");
      },
    };
    const flags = await runGuardian(args(swap, compiled({})), [boom]);
    expect(flags).toEqual([]);
  });
});
