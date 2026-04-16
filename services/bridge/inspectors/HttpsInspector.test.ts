/**
 * Unit test for `HttpsInspector` — the trivial Phase 1a built-in that proves
 * the pipeline works end-to-end.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/bridge/inspectors/HttpsInspector.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApprovalIntent } from "../approval.ts";
import { HttpsInspector } from "./HttpsInspector.ts";

function mkIntent(url: string): ApprovalIntent {
  return {
    id: "id",
    namespace: "eip155",
    kind: "connect",
    origin: { url },
    wallet: null,
    payload: {},
    annotations: [],
    createdAt: 0,
  };
}

describe("HttpsInspector", () => {
  it("annotates info for http:// origins", async () => {
    const r = await HttpsInspector.inspect(
      mkIntent("http://insecure.test"),
      [],
      new AbortController().signal,
    );
    assert.equal(r.annotations.length, 1);
    assert.equal(r.annotations[0]?.code, "origin.insecure");
    assert.equal(r.annotations[0]?.severity, "info");
    assert.equal(r.verdict, "allow");
  });

  it("says nothing for https:// origins", async () => {
    const r = await HttpsInspector.inspect(
      mkIntent("https://secure.test"),
      [],
      new AbortController().signal,
    );
    assert.equal(r.annotations.length, 0);
    assert.equal(r.verdict, "allow");
  });

  it("says nothing for empty origin (no URL yet)", async () => {
    const r = await HttpsInspector.inspect(
      mkIntent(""),
      [],
      new AbortController().signal,
    );
    assert.equal(r.annotations.length, 0);
  });

  it("metadata is spec-compliant (auto mode, priority 0)", () => {
    assert.equal(HttpsInspector.mode, "auto");
    assert.equal(HttpsInspector.priority, 0);
    assert.equal(HttpsInspector.name, "https");
  });
});
