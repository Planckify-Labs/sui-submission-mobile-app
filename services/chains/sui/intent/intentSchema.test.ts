import { describe, expect, it } from "vitest";
import { IntentSchema, parseIntent } from "./intentSchema";

describe("intentSchema", () => {
  it("accepts a swap intent and defaults slippage to 50 bps", () => {
    const parsed = parseIntent({
      action: "swap",
      fromAsset: "SUI",
      toAsset: "USDC",
      amount: { human: "5" },
    });
    expect(parsed).not.toBeNull();
    if (parsed?.action !== "swap") throw new Error("expected swap");
    expect(parsed.maxSlippageBps).toBe(50);
    expect(parsed.amount.human).toBe("5");
  });

  it("accepts an explicit slippage within bounds", () => {
    const parsed = parseIntent({
      action: "swap",
      fromAsset: "SUI",
      toAsset: "USDC",
      amount: { human: "5" },
      maxSlippageBps: 100,
    });
    if (parsed?.action !== "swap") throw new Error("expected swap");
    expect(parsed.maxSlippageBps).toBe(100);
  });

  it("accepts a swap_and_supply (zap) intent and defaults slippage", () => {
    const parsed = parseIntent({
      action: "swap_and_supply",
      fromAsset: "SUI",
      toAsset: "USDC",
      amount: { human: "5" },
    });
    if (parsed?.action !== "swap_and_supply") {
      throw new Error("expected swap_and_supply");
    }
    expect(parsed.maxSlippageBps).toBe(50);
    expect(parsed.toAsset).toBe("USDC");
  });

  it("accepts a supply intent (scallop venue)", () => {
    const parsed = parseIntent({
      action: "supply",
      venue: "scallop",
      asset: "USDC",
      amount: { human: "100" },
    });
    expect(parsed?.action).toBe("supply");
  });

  it("accepts a withdraw intent with no amount (= withdraw all)", () => {
    const parsed = parseIntent({
      action: "withdraw",
      venue: "scallop",
      asset: "USDC",
    });
    if (parsed?.action !== "withdraw") throw new Error("expected withdraw");
    expect(parsed.amount).toBeUndefined();
  });

  it("rejects an unknown action", () => {
    expect(parseIntent({ action: "borrow", asset: "USDC" })).toBeNull();
  });

  it("accepts any non-empty venue (validation moves to the compiler)", () => {
    // The schema is venue-agnostic — an unknown/typo'd venue is rejected at
    // compile time (registry resolution), not parse time, so adding a
    // lending protocol never needs an enum edit here.
    const parsed = parseIntent({
      action: "supply",
      venue: "some-future-lender",
      asset: "USDC",
      amount: { human: "1" },
    });
    expect(parsed?.action).toBe("supply");
  });

  it("rejects an empty venue", () => {
    expect(
      parseIntent({
        action: "supply",
        venue: "",
        asset: "USDC",
        amount: { human: "1" },
      }),
    ).toBeNull();
  });

  it("rejects a swap missing the amount", () => {
    expect(
      parseIntent({ action: "swap", fromAsset: "SUI", toAsset: "USDC" }),
    ).toBeNull();
  });

  it("rejects slippage above the cap", () => {
    const res = IntentSchema.safeParse({
      action: "swap",
      fromAsset: "SUI",
      toAsset: "USDC",
      amount: { human: "5" },
      maxSlippageBps: 6000,
    });
    expect(res.success).toBe(false);
  });
});
