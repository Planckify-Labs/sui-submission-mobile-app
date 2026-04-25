import { PublicKey } from "@solana/web3.js";
import { describe, it, expect } from "vitest";
import { buildDepositPointsInstruction } from "../buildDepositPoints";
import { computeRefIdHash } from "@/services/chains/solana/takumiPay/refIdHash";
import { TAKUMI_PAY_PROGRAM_ID } from "@/services/chains/solana/takumiPay";

const programId = TAKUMI_PAY_PROGRAM_ID;
const payer = PublicKey.unique();
const tokenMint = PublicKey.unique();

describe("buildDepositPointsInstruction", () => {
  it("returns 3 instructions: approve + program + revoke", () => {
    const instructions = buildDepositPointsInstruction({
      payer,
      programId,
      tokenMint,
      refId: "deposit-ref-001",
      amount: 1_000_000n,
      pointDepositCounter: 0n,
    });
    expect(instructions.length).toBe(3);
  });

  it("program instruction targets TakumiPay program", () => {
    const instructions = buildDepositPointsInstruction({
      payer,
      programId,
      tokenMint,
      refId: "deposit-ref-002",
      amount: 500_000n,
      pointDepositCounter: 5n,
    });
    expect(instructions[1].programId.equals(programId)).toBe(true);
  });

  it("refIdHash in instruction data matches computeRefIdHash", () => {
    const refId = "test-deposit-ref";
    const expectedHash = computeRefIdHash(refId);
    const instructions = buildDepositPointsInstruction({
      payer,
      programId,
      tokenMint,
      refId,
      amount: 100n,
      pointDepositCounter: 0n,
    });
    // The instruction data contains the refIdHash at a known offset
    // (after discriminator 8 + refId string len prefix 4 + refId bytes)
    const data = instructions[1].data;
    const refIdBytes = new TextEncoder().encode(refId);
    const hashOffset = 8 + 4 + refIdBytes.length;
    const actualHash = data.subarray(hashOffset, hashOffset + 32);
    expect(Buffer.from(actualHash).equals(Buffer.from(expectedHash))).toBe(true);
  });

  it("payer is signer and writable", () => {
    const instructions = buildDepositPointsInstruction({
      payer,
      programId,
      tokenMint,
      refId: "ref",
      amount: 100n,
      pointDepositCounter: 0n,
    });
    const programIx = instructions[1];
    const payerKey = programIx.keys.find((k) => k.pubkey.equals(payer));
    expect(payerKey).toBeDefined();
    expect(payerKey!.isSigner).toBe(true);
    expect(payerKey!.isWritable).toBe(true);
  });

  it("includes token-related accounts", () => {
    const instructions = buildDepositPointsInstruction({
      payer,
      programId,
      tokenMint,
      refId: "ref",
      amount: 100n,
      pointDepositCounter: 0n,
    });
    const programIx = instructions[1];
    const hasTokenMint = programIx.keys.some((k) => k.pubkey.equals(tokenMint));
    expect(hasTokenMint).toBe(true);
  });

  it("different refIds produce different instruction data", () => {
    const ix1 = buildDepositPointsInstruction({
      payer, programId, tokenMint, refId: "ref-a", amount: 100n, pointDepositCounter: 0n,
    });
    const ix2 = buildDepositPointsInstruction({
      payer, programId, tokenMint, refId: "ref-b", amount: 100n, pointDepositCounter: 0n,
    });
    expect(ix1[1].data.equals(ix2[1].data)).toBe(false);
  });
});
