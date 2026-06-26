/**
 * Schema parity: the LLM-facing JSON Schema (server) ↔ the executor's zod
 * guard (mobile) for the Sui Intent tools.
 *
 * The server and the device live in separate repos, so "single source of
 * truth" can't be one imported module. Instead THIS test is the contract: it
 * imports the server's `inputSchema` (what the model is told it may send) and
 * the mobile zod schemas (what the executor actually accepts) and asserts they
 * describe the same shape. If someone adds an action / field / bound to one
 * side only — the exact drift that lets the LLM emit a call the executor then
 * rejects as `invalid_input` — this test fails.
 *
 * Mirrors the cross-repo import pattern already used by `registryParity.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  IntentAction,
  IntentExecuteInputSchema,
  IntentSchema,
} from "@/services/chains/sui/intent/intentSchema";
// @ts-expect-error relative import outside project root (sibling repo)
import { TOOL_REGISTRY } from "../../../../agent-api/src/tools/registry";

type JsonProp = {
  type?: string;
  enum?: Array<string | number>;
  minimum?: number;
  properties?: Record<string, JsonProp>;
  required?: string[];
};
type JsonSchema = {
  properties?: Record<string, JsonProp>;
  required?: string[];
};

const previewSchema = (
  TOOL_REGISTRY as Record<string, { inputSchema?: JsonSchema }>
).defi_intent_preview?.inputSchema;
const executeSchema = (
  TOOL_REGISTRY as Record<string, { inputSchema?: JsonSchema }>
).defi_intent_execute?.inputSchema;

/** Union of every property key the executor's zod actually reads. */
function executorFields(): Set<string> {
  const json = z.toJSONSchema(IntentSchema) as {
    anyOf?: Array<{ properties?: Record<string, unknown> }>;
    oneOf?: Array<{ properties?: Record<string, unknown> }>;
  };
  const branches = json.anyOf ?? json.oneOf ?? [];
  const fields = new Set<string>();
  for (const branch of branches) {
    for (const key of Object.keys(branch.properties ?? {})) fields.add(key);
  }
  return fields;
}

describe("Sui Intent schema parity (server JSON Schema ↔ mobile zod)", () => {
  it("exposes a concrete inputSchema for both intent tools", () => {
    expect(previewSchema).toBeDefined();
    expect(executeSchema).toBeDefined();
  });

  it("preview action enum matches the executor's IntentAction (no drift)", () => {
    const serverActions = previewSchema?.properties?.action?.enum ?? [];
    expect([...serverActions].sort()).toEqual([...IntentAction.options].sort());
  });

  it("preview describes exactly the fields the executor reads", () => {
    const serverFields = new Set(Object.keys(previewSchema?.properties ?? {}));
    expect(serverFields).toEqual(executorFields());
  });

  it("amount carries a required `human` field on both sides", () => {
    const amount = previewSchema?.properties?.amount;
    expect(amount?.properties?.human?.type).toBe("string");
    expect(amount?.required).toContain("human");
  });

  it("maxSlippageBps lower bound matches the executor's zod min(1)", () => {
    expect(previewSchema?.properties?.maxSlippageBps?.minimum).toBe(1);
  });

  it("execute requires `intent_id`, matching IntentExecuteInputSchema", () => {
    expect(executeSchema?.required).toContain("intent_id");
    expect(executeSchema?.properties?.intent_id?.type).toBe("string");
    // The mobile guard rejects a missing / empty intent_id.
    expect(IntentExecuteInputSchema.safeParse({}).success).toBe(false);
    expect(IntentExecuteInputSchema.safeParse({ intent_id: "x" }).success).toBe(
      true,
    );
  });
});
