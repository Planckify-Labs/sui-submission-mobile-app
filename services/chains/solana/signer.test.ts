/**
 * Smoke test for `services/chains/solana/signer.ts`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/chains/solana/signer.test.ts
 *
 * Scope is intentionally narrow: exercising the full signer happy path
 * requires a populated `walletKitRegistry`, a `SolanaAdapter` mounted into
 * `ChainAdapterRegistry`, and a decodable transaction fixture — all of
 * which are covered by higher-level tests (Task 17 acceptance §9.3 step
 * 12 — devnet dApp round-trip; `SolanaAdapter.test.ts` extension per
 * spec §9.1). Here we just guard the module's public surface against
 * accidental breaks (rename / signature change / import cycle).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { installSolanaSigner } from "./signer.ts";

describe("installSolanaSigner", () => {
  it("exports a function with arity 1", () => {
    assert.equal(typeof installSolanaSigner, "function");
    // `installSolanaSigner(deps)` — one positional arg.
    assert.equal(installSolanaSigner.length, 1);
  });

  it("throws when the kit registry has no solana entry (boot-order guard)", () => {
    // The registry is a singleton. In a Node harness without
    // `bootWalletKits()` running, `walletKitRegistry.get("solana")` must
    // throw. This is the loud-fail safeguard from the registry spec
    // (§4.5 — "throw on missing kit to surface boot-order bugs"). If this
    // ever becomes a silent `null`, the bridge signer would install a
    // half-broken handler and the regression would only surface in the
    // WebView.
    assert.throws(
      () =>
        installSolanaSigner({
          getWalletByAddress: () => undefined,
          getRpcForCluster: () => {
            throw new Error("unreachable — kit lookup must fail first");
          },
        }),
      /WalletKit not registered for namespace: solana/,
    );
  });
});
