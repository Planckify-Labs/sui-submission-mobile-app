import { Transaction } from "@mysten/sui/transactions";
import { describe, expect, it } from "vitest";
import { appendIntentReceipt } from "./appendIntentReceipt";

describe("appendIntentReceipt", () => {
  it("is a no-op when no package id is configured (default-off testnet path)", () => {
    const tx = new Transaction();
    const before = tx.getData().commands.length;
    appendIntentReceipt(tx, { descriptor: "swap 5 SUI->USDC" });
    expect(tx.getData().commands.length).toBe(before);
  });

  it("appends one MoveCall to <pkg>::intent_receipt::record when configured", () => {
    const tx = new Transaction();
    const before = tx.getData().commands.length;
    appendIntentReceipt(tx, {
      packageId: "0x123",
      descriptor: "swap 5 SUI->USDC",
    });
    const commands = tx.getData().commands;
    expect(commands.length).toBe(before + 1);
    const last = commands[commands.length - 1];
    expect(last.MoveCall?.module).toBe("intent_receipt");
    expect(last.MoveCall?.function).toBe("record");
    // descriptor (pure) + clock (object) are the two PTB arguments; ctx is
    // supplied by the runtime, not here.
    expect(last.MoveCall?.arguments?.length).toBe(2);
  });

  it("bounds a pathological descriptor (can't abort the swap via the Move cap)", () => {
    const tx = new Transaction();
    expect(() =>
      appendIntentReceipt(tx, {
        packageId: "0x123",
        descriptor: `swap ${"9".repeat(10_000)} SUI->USDC`,
      }),
    ).not.toThrow();
    const commands = tx.getData().commands;
    const last = commands[commands.length - 1];
    expect(last.MoveCall?.function).toBe("record");
    expect(last.MoveCall?.arguments?.length).toBe(2);
  });
});
