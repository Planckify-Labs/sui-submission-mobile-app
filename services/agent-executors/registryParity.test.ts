import { describe, expect, it } from "vitest";
// @ts-expect-error relative import outside project root
import { TOOL_REGISTRY } from "../../../agent-api/src/tools/registry";
import { EXPECTED_MOBILE_TOOLS } from "./index";

describe("Registry Parity", () => {
  it("should match EXPECTED_MOBILE_TOOLS with server registry mobile executors", () => {
    const serverMobileTools = Object.values(TOOL_REGISTRY)
      .filter((t: any) => t.executor === "mobile")
      .map((t: any) => t.name)
      .sort();

    const expectedTools = [...EXPECTED_MOBILE_TOOLS].sort();

    expect(serverMobileTools).toEqual(expectedTools);
  });
});
