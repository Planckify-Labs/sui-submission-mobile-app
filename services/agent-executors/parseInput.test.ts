/**
 * Unit tests for `parseToolInput` — the standard zod guard. Asserts it
 * returns typed data on success and throws the curated, field-derived
 * `invalid_<path>` reason (never raw zod text) on failure.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseToolInput } from "./parseInput";
import { ExecutorError } from "./types";

const schema = z.object({
  intent_id: z.string().min(1),
  amount: z.object({ human: z.string().min(1) }).optional(),
});

describe("parseToolInput", () => {
  it("returns typed data for valid input", () => {
    const out = parseToolInput(schema, { intent_id: "abc" });
    expect(out.intent_id).toBe("abc");
  });

  it("throws ExecutorError(invalid_input) on failure", () => {
    expect(() => parseToolInput(schema, {})).toThrow(ExecutorError);
    try {
      parseToolInput(schema, {});
    } catch (err) {
      expect(err).toBeInstanceOf(ExecutorError);
      expect((err as ExecutorError).code).toBe("invalid_input");
    }
  });

  it("derives a curated reason from the offending field path", () => {
    // top-level field
    try {
      parseToolInput(schema, { intent_id: "" });
    } catch (err) {
      expect((err as ExecutorError).message).toBe("invalid_intent_id");
    }
    // nested field path -> joined with "_"
    try {
      parseToolInput(schema, { intent_id: "ok", amount: { human: "" } });
    } catch (err) {
      expect((err as ExecutorError).message).toBe("invalid_amount_human");
    }
  });

  it("never leaks the raw zod issue message", () => {
    try {
      parseToolInput(schema, { intent_id: 123 });
    } catch (err) {
      const msg = (err as ExecutorError).message;
      expect(msg).toMatch(/^invalid_/);
      expect(msg).not.toMatch(/expected|string|received/i);
    }
  });
});
