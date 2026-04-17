/**
 * Unit tests for `computeNextSelection` — the pure selection reducer
 * extracted from `NamespacePicker.tsx` so we can cover the selection logic
 * without a React Native render harness (see computeNextSelection.ts
 * header).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *     components/wallet/create/computeNextSelection.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Namespace } from "@/services/chains/types";
import { computeNextSelection } from "./computeNextSelection.ts";

describe("computeNextSelection — mode: 'single'", () => {
  it("replaces an empty selection with the tapped namespace", () => {
    const next = computeNextSelection([], "eip155", "single");
    assert.deepEqual(next, ["eip155"]);
  });

  it("replaces a different single selection with the tapped namespace", () => {
    const prev: Namespace[] = ["eip155"];
    const next = computeNextSelection(prev, "solana", "single");
    assert.deepEqual(next, ["solana"]);
  });

  it("keeps a single selection when tapping the same namespace (radio-card semantics)", () => {
    const prev: Namespace[] = ["solana"];
    const next = computeNextSelection(prev, "solana", "single");
    assert.deepEqual(next, ["solana"]);
  });

  it("allows deselect when the caller opts in via allowDeselect", () => {
    const prev: Namespace[] = ["solana"];
    const next = computeNextSelection(prev, "solana", "single", {
      allowDeselect: true,
    });
    assert.deepEqual(next, []);
  });
});

describe("computeNextSelection — mode: 'multi'", () => {
  it("adds the tapped namespace to an empty selection", () => {
    const next = computeNextSelection([], "eip155", "multi");
    assert.deepEqual(next, ["eip155"]);
  });

  it("appends a new namespace while preserving order of existing entries", () => {
    const prev: Namespace[] = ["eip155"];
    const next = computeNextSelection(prev, "solana", "multi");
    assert.deepEqual(next, ["eip155", "solana"]);
  });

  it("removes a namespace already present (toggle off)", () => {
    const prev: Namespace[] = ["eip155", "solana"];
    const next = computeNextSelection(prev, "eip155", "multi");
    assert.deepEqual(next, ["solana"]);
  });

  it("removing the only selected namespace leaves an empty array", () => {
    const prev: Namespace[] = ["solana"];
    const next = computeNextSelection(prev, "solana", "multi");
    assert.deepEqual(next, []);
  });

  it("preserves order across a remove-then-add cycle", () => {
    // start with both, remove eip155, add it back at the end
    const prev: Namespace[] = ["eip155", "solana"];
    const afterRemove = computeNextSelection(prev, "eip155", "multi");
    const afterAdd = computeNextSelection(afterRemove, "eip155", "multi");
    assert.deepEqual(afterAdd, ["solana", "eip155"]);
  });
});
