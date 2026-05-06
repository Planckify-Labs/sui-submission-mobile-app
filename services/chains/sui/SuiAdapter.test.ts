/**
 * SuiAdapter — source-level dispatch invariants (Tasks 04, 06, 07).
 *
 * Spec reference: `docs/sui-dapp-bridge-spec.md` §4.1, §4.2, §11.
 *
 * Behavioural runtime tests for the dispatch table need TS path-alias
 * resolution + the React-Native + WebView shims, which plain `node --test`
 * can't provide. Following the same pattern as `boot.test.ts`, we lock
 * the load-bearing shape with grep-style assertions over the source so:
 *
 *   - The dispatch arms can't silently lose a method (e.g. someone
 *     deletes `case "sui:reportTransactionEffects":` and the adapter
 *     starts answering `-32601` to a Wallet-Standard contract method).
 *   - The legacy aliases keep rewriting to the current method name.
 *   - The cross-namespace-trust gate (TWV-2026-YYY) stays in place.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/chains/sui/SuiAdapter.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = readFileSync(new URL("./SuiAdapter.ts", import.meta.url), "utf-8");

describe("SuiAdapter — dispatch table (§4.1)", () => {
  for (const method of [
    "standard:connect",
    "standard:disconnect",
    "sui:signPersonalMessage",
    "sui:signTransaction",
    "sui:signAndExecuteTransaction",
    "sui:signIn",
    "sui:reportTransactionEffects",
    "takumi:switchNetwork",
  ]) {
    it(`dispatches \`${method}\``, () => {
      assert.match(
        src,
        new RegExp(`case\\s*"${method.replace(/[:.]/g, "\\$&")}"`),
        `dispatch arm for ${method} is missing`,
      );
    });
  }

  it("falls through to -32601 on unknown method", () => {
    assert.match(src, /default:[\s\S]*?-32601/);
  });
});

describe("SuiAdapter — legacy alias rewrites (§4.1)", () => {
  it("sui:signTransactionBlock rewrites to sui:signTransaction", () => {
    // The adapter's switch arm runs after the rewrite, so we assert the
    // rewrite block exists with both method names.
    assert.match(
      src,
      /method\s*===\s*"sui:signTransactionBlock"[\s\S]{0,300}sui:signTransaction/,
    );
  });

  it("sui:signAndExecuteTransactionBlock rewrites to sui:signAndExecuteTransaction", () => {
    assert.match(
      src,
      /method\s*===\s*"sui:signAndExecuteTransactionBlock"[\s\S]{0,300}sui:signAndExecuteTransaction/,
    );
  });

  it("legacy alias warning is one-per-session (dedupe Set)", () => {
    assert.match(src, /warnedLegacy[\s\S]{0,200}new\s+Set/);
    assert.match(src, /warnedLegacy\.has[\s\S]{0,200}warnedLegacy\.add/);
  });
});

describe("SuiAdapter — cross-namespace trust (§11 / TWV-2026-YYY)", () => {
  it('`pickSuiWalletForOrigin` filters grants by `chainId.startsWith("sui:")`', () => {
    // The cross-namespace-trust failure mode is a reviewer folding the
    // predicate so EVM grants surface for Sui queries. Assert the
    // sui:-only filter stays in place.
    assert.match(src, /chainId\.startsWith\(\s*"sui:"\s*\)/);
  });

  it("silent connect rejects with 4100 when no Sui grant exists", () => {
    assert.match(src, /isGranted[\s\S]{0,200}rpcError\(\s*4100/);
  });
});

describe("SuiAdapter — connect default network is `mainnet`", () => {
  // Solana carryover trap — the wrong literal would silently pin every
  // connect to mainnet-beta-shaped state.
  it("default network resolves to `mainnet`", () => {
    assert.match(src, /return\s+"mainnet"\s*;/);
  });
});

describe("SuiAdapter — executeApproval security gates", () => {
  it("rejects with code 4001 on user reject (§4.4)", () => {
    assert.match(src, /codedError\(\s*4001/);
  });

  it('throws -32603 "no Sui signer registered" before signer install', () => {
    assert.match(src, /codedError\(\s*-32603\s*,\s*"no Sui signer registered"/);
  });

  it("registerSuiSigner is the single registration seam", () => {
    assert.match(src, /export\s+function\s+registerSuiSigner/);
  });
});

describe("SuiAdapter — TWV-2026-YYY citation in source comment", () => {
  it("file references the design note", () => {
    assert.match(src, /TWV-2026-YYY|66_sui_dapp_bridge_design_note\.md/);
  });
});
