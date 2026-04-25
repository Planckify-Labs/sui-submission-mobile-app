/**
 * Unit tests for `buildAuthorizationFromIntent` (spec §5.5, §6.2, M2).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/nanopay/buildAuthorization.test.ts
 *
 * Pure tests — no network, no keystore, no wallet. The module under
 * test is itself pure; these tests assert it reshapes every field
 * verbatim from the intent without inventing temporal drift or fresh
 * nonces (memory `feedback_role_separation.md`).
 *
 * Coverage:
 *   - Golden-path: intent → correctly shaped `SignArgs` (domain, nonce,
 *     usdc, valueMicros, validity window, chain — all echo the intent).
 *   - Missing `domain.name` / `version` / `verifyingContract` →
 *     `MissingNanopayDomainError`.
 *   - Missing `nanopay` block → `MissingNanopayPayloadError`.
 *   - `validBefore ≤ now + 3 days` → `AuthorizationValidityTooShortError`
 *     (delegated to the signer guard; tested here at the build layer).
 *   - Caller `chain.id` mismatch vs `intent.sourceChainId` →
 *     `SourceChainMismatchError`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mainnet, sepolia } from "viem/chains";

import type { EvmChainConfig } from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import { AuthorizationValidityTooShortError } from "../walletKit/types.ts";
import {
  buildAuthorizationFromIntent,
  MissingNanopayDomainError,
  MissingNanopayPayloadError,
  SourceChainMismatchError,
} from "./buildAuthorization.ts";
import type { NanopayPayload, PaymentIntentResponse } from "./types.ts";

const EVM_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  chain: mainnet,
};
const WRONG_EVM_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  chain: sepolia,
};

const STUB_WALLET = { address: "0xABCDEF" } as unknown as TWallet;

const GATEWAY_WALLET: `0x${string}` =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const USDC: `0x${string}` = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const FROM: `0x${string}` = "0x1111111111111111111111111111111111111111";
const TO: `0x${string}` = "0x2222222222222222222222222222222222222222";
const NONCE: `0x${string}` =
  "0xabababababababababababababababababababababababababababababababab";

const MIN_WINDOW = 259_200; // 3 days in seconds.

function makeNanopayPayload(
  overrides: Partial<NanopayPayload> = {},
): NanopayPayload {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    usdc: USDC,
    sourceChainId: mainnet.id,
    domain: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: GATEWAY_WALLET,
    },
    from: FROM,
    to: TO,
    value: "1500000",
    validAfter: 0,
    validBefore: nowSeconds + MIN_WINDOW + 120,
    nonce: NONCE,
    ...overrides,
  };
}

function makeIntent(
  overrides: Partial<PaymentIntentResponse> = {},
  nanopayOverrides: Partial<NanopayPayload> = {},
): PaymentIntentResponse {
  return {
    id: "pi_test_0001",
    status: "pending",
    nanopayUsdcAmountMicros: "1500000",
    nanopayUsdcSourceChainId: mainnet.id,
    nanopayUsdcTreasuryAddress: GATEWAY_WALLET,
    nanopay: makeNanopayPayload(nanopayOverrides),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("buildAuthorizationFromIntent — golden path", () => {
  it("reshapes every field verbatim from intent.nanopay", () => {
    const intent = makeIntent();
    const args = buildAuthorizationFromIntent(intent, {
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
    });

    // Wallet + chain pass through from the caller (three-role separation).
    assert.equal(args.wallet, STUB_WALLET);
    assert.equal(args.chain, EVM_CHAIN);

    // Domain echoes the server's values exactly — we never invent these.
    const payload = intent.nanopay;
    if (!payload) throw new Error("fixture broken: nanopay missing");
    assert.equal(args.gatewayWallet, payload.domain.verifyingContract);
    assert.equal(args.domainName, payload.domain.name);
    assert.equal(args.domainVersion, payload.domain.version);

    // Asset + parties echo.
    assert.equal(args.usdc, payload.usdc);
    assert.equal(args.from, payload.from);
    assert.equal(args.to, payload.to);

    // Temporal fields echo — NO `Date.now()` drift in the builder.
    assert.equal(args.validAfter, payload.validAfter);
    assert.equal(args.validBefore, payload.validBefore);

    // Nonce passes through byte-for-byte; 32-byte random.
    assert.equal(args.nonce, payload.nonce);
    assert.equal(args.nonce.length, 66, "nonce is 32 bytes (64 hex + 0x)");

    // Value converts decimal string → bigint micros.
    assert.equal(typeof args.valueMicros, "bigint");
    assert.equal(args.valueMicros, 1_500_000n);
  });

  it("preserves a large value that exceeds Number.MAX_SAFE_INTEGER", () => {
    // Paranoia coverage: if the server ever hands us a whale-tier amount,
    // decimal-string → BigInt must not silently truncate.
    const huge = "99999999999999999999";
    const intent = makeIntent({}, { value: huge });
    const args = buildAuthorizationFromIntent(intent, {
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
    });
    assert.equal(args.valueMicros, BigInt(huge));
  });
});

describe("buildAuthorizationFromIntent — domain validation", () => {
  it("throws MissingNanopayDomainError when `name` is empty", () => {
    const intent = makeIntent(
      {},
      { domain: { name: "", version: "1", verifyingContract: GATEWAY_WALLET } },
    );
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
        }),
      (err: unknown) =>
        err instanceof MissingNanopayDomainError &&
        err.name === "MissingNanopayDomainError",
    );
  });

  it("throws MissingNanopayDomainError when `version` is empty", () => {
    const intent = makeIntent(
      {},
      {
        domain: {
          name: "GatewayWalletBatched",
          version: "",
          verifyingContract: GATEWAY_WALLET,
        },
      },
    );
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
        }),
      (err: unknown) => err instanceof MissingNanopayDomainError,
    );
  });

  it("throws MissingNanopayDomainError when `verifyingContract` is absent", () => {
    // Simulate a backend that sent `domain` but forgot `verifyingContract`.
    const brokenDomain = {
      name: "GatewayWalletBatched",
      version: "1",
    } as unknown as NanopayPayload["domain"];
    const intent = makeIntent({}, { domain: brokenDomain });
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
        }),
      (err: unknown) => err instanceof MissingNanopayDomainError,
    );
  });

  it("throws MissingNanopayPayloadError when intent.nanopay is null", () => {
    const intent = makeIntent({ nanopay: null });
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
        }),
      (err: unknown) =>
        err instanceof MissingNanopayPayloadError &&
        err.name === "MissingNanopayPayloadError",
    );
  });
});

describe("buildAuthorizationFromIntent — validBefore window", () => {
  it("throws AuthorizationValidityTooShortError when validBefore ≤ now + 3 days", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const intent = makeIntent({}, { validBefore: nowSeconds + MIN_WINDOW - 1 });
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: EVM_CHAIN,
        }),
      (err: unknown) =>
        err instanceof AuthorizationValidityTooShortError &&
        err.name === "AuthorizationValidityTooShortError",
    );
  });

  it("passes when validBefore is exactly at the floor", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const intent = makeIntent({}, { validBefore: nowSeconds + MIN_WINDOW });
    const args = buildAuthorizationFromIntent(intent, {
      wallet: STUB_WALLET,
      chain: EVM_CHAIN,
    });
    assert.equal(args.validBefore, nowSeconds + MIN_WINDOW);
  });
});

describe("buildAuthorizationFromIntent — chain identity", () => {
  it("throws SourceChainMismatchError when caller's chain.id disagrees with intent.sourceChainId", () => {
    const intent = makeIntent({}, { sourceChainId: mainnet.id });
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: WRONG_EVM_CHAIN,
        }),
      (err: unknown) =>
        err instanceof SourceChainMismatchError &&
        err.expectedChainId === mainnet.id &&
        err.actualChainId === sepolia.id,
    );
  });

  it("rejects non-EVM chains — a future Solana variant uses its own builder", () => {
    // Cast is intentional; the function MUST reject at runtime so a
    // future SVM caller can't accidentally reuse this EVM-only shape.
    const solanaChain = {
      namespace: "solana",
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",
    } as unknown as EvmChainConfig;
    const intent = makeIntent();
    assert.throws(
      () =>
        buildAuthorizationFromIntent(intent, {
          wallet: STUB_WALLET,
          chain: solanaChain,
        }),
      /expected eip155 chain/,
    );
  });
});
