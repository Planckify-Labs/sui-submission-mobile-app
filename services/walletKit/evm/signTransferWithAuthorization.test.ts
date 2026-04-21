/**
 * Unit tests for `signTransferWithAuthorization` (spec §5.5, M2).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/walletKit/evm/signTransferWithAuthorization.test.ts
 *
 * Pure Node test bench — uses `viem.generatePrivateKey` +
 * `privateKeyToAccount` for a throwaway signer so the suite never
 * touches `expo-secure-store` or `walletService`. The only imports
 * from our code are the pure signer module and its types.
 *
 * Coverage:
 *   - Round-trip: sign → `verifyTypedData` with the same payload
 *     recovers the signer address (load-bearing correctness proof).
 *   - `validBefore` guard: throws
 *     `AuthorizationValidityTooShortError` when below now + 3 days.
 *   - Signature shape: 65 bytes (132 hex chars + `0x`).
 *   - Typed-data parity: `buildTransferWithAuthorizationTypedData`
 *     emits the exact domain + types the signer hashes.
 *   - Namespace guard: Solana chain throws pre-sign (no keystore
 *     reach).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import type {
  ChainConfig,
  EvmChainConfig,
} from "../../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../../constants/types/walletTypes.ts";
import {
  AuthorizationValidityTooShortError,
  GATEWAY_VALID_BEFORE_MIN_SECONDS,
  type SignTransferWithAuthorizationArgs,
} from "../types.ts";
import {
  assertValidBeforeWindow,
  buildTransferWithAuthorizationTypedData,
  hashTransferWithAuthorization,
  signTransferWithAuthorization,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./signTransferWithAuthorization.ts";

const EVM_CHAIN: EvmChainConfig = {
  namespace: "eip155",
  chain: mainnet,
};

const SOLANA_CHAIN: ChainConfig = {
  namespace: "solana",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
};

const GATEWAY_WALLET: `0x${string}` =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const USDC_MAINNET: `0x${string}` =
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const MERCHANT_TREASURY: `0x${string}` =
  "0x1111111111111111111111111111111111111111";
const NONCE_FIXTURE: `0x${string}` =
  "0xabababababababababababababababababababababababababababababababab";

/**
 * Builds a valid fixture. `from` is overridden per-test to match the
 * throwaway signer; the rest of the payload is Circle-Gateway-shaped.
 */
function makeArgs(
  overrides: Partial<SignTransferWithAuthorizationArgs> &
    Pick<SignTransferWithAuthorizationArgs, "wallet" | "from">,
): SignTransferWithAuthorizationArgs {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    chain: EVM_CHAIN,
    gatewayWallet: GATEWAY_WALLET,
    domainName: "GatewayWalletBatched",
    domainVersion: "1",
    usdc: USDC_MAINNET,
    to: MERCHANT_TREASURY,
    valueMicros: 1_500_000n, // 1.50 USDC
    validAfter: 0,
    validBefore: nowSeconds + GATEWAY_VALID_BEFORE_MIN_SECONDS + 60,
    nonce: NONCE_FIXTURE,
    ...overrides,
  };
}

/** The adapter's `wallet` field isn't touched by the pure signer — we
 * pass the viem account directly — so an opaque stub is enough to
 * satisfy the type. */
const STUB_WALLET = { address: "0x0" } as unknown as TWallet;

describe("buildTransferWithAuthorizationTypedData", () => {
  it("binds the EIP-712 domain to the Gateway contract, not USDC", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const args = makeArgs({ wallet: STUB_WALLET, from: account.address });
    const typed = buildTransferWithAuthorizationTypedData(args);

    assert.equal(typed.domain.verifyingContract, GATEWAY_WALLET);
    assert.notEqual(
      typed.domain.verifyingContract,
      USDC_MAINNET,
      "domain MUST NOT be USDC — signing against USDC passes verify but fails settle",
    );
    assert.equal(typed.domain.chainId, mainnet.id);
    assert.equal(typed.domain.name, "GatewayWalletBatched");
    assert.equal(typed.domain.version, "1");
    assert.equal(typed.primaryType, "TransferWithAuthorization");
    assert.equal(typed.types, TRANSFER_WITH_AUTHORIZATION_TYPES);
  });

  it("carries the USDC asset address as an EIP-712 message field", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const args = makeArgs({ wallet: STUB_WALLET, from: account.address });
    const typed = buildTransferWithAuthorizationTypedData(args);
    assert.equal(typed.message.usdc, USDC_MAINNET);
    assert.equal(typed.message.value, args.valueMicros);
    assert.equal(typed.message.validAfter, BigInt(args.validAfter));
    assert.equal(typed.message.validBefore, BigInt(args.validBefore));
    assert.equal(typed.message.nonce, NONCE_FIXTURE);
  });

  it("throws on non-EVM chains (Solana signs via signX402SvmPayment)", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const args = makeArgs({
      wallet: STUB_WALLET,
      from: account.address,
      chain: SOLANA_CHAIN,
    });
    assert.throws(
      () => buildTransferWithAuthorizationTypedData(args),
      /expected eip155 chain/,
    );
  });
});

describe("assertValidBeforeWindow", () => {
  it("passes when validBefore ≥ now + 3 days", () => {
    const now = 1_700_000_000;
    assertValidBeforeWindow(now + GATEWAY_VALID_BEFORE_MIN_SECONDS, now);
    assertValidBeforeWindow(now + GATEWAY_VALID_BEFORE_MIN_SECONDS + 1, now);
  });

  it("throws AuthorizationValidityTooShortError when under the window", () => {
    const now = 1_700_000_000;
    const validBefore = now + GATEWAY_VALID_BEFORE_MIN_SECONDS - 1;
    try {
      assertValidBeforeWindow(validBefore, now);
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof AuthorizationValidityTooShortError);
      assert.equal(err.name, "AuthorizationValidityTooShortError");
      assert.equal(err.validBefore, validBefore);
      assert.equal(
        err.minimumValidBefore,
        now + GATEWAY_VALID_BEFORE_MIN_SECONDS,
      );
    }
  });
});

describe("signTransferWithAuthorization (round-trip)", () => {
  it("produces a 65-byte signature that verifyTypedData recovers", async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const args = makeArgs({ wallet: STUB_WALLET, from: account.address });

    const signature = await signTransferWithAuthorization(account, args);

    // 65-byte signature -> 0x + 130 hex chars.
    assert.ok(signature.startsWith("0x"), "signature is 0x-prefixed");
    assert.equal(signature.length, 132, "signature is 65 bytes (130 hex)");

    const typed = buildTransferWithAuthorizationTypedData(args);
    const valid = await verifyTypedData({
      address: account.address,
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: typed.message,
      signature,
    });
    assert.equal(valid, true, "round-trip verifyTypedData recovers signer");
  });

  it("different private key → verify fails", async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const imposter = privateKeyToAccount(generatePrivateKey());
    const args = makeArgs({ wallet: STUB_WALLET, from: signer.address });

    const signature = await signTransferWithAuthorization(signer, args);
    const typed = buildTransferWithAuthorizationTypedData(args);
    const valid = await verifyTypedData({
      address: imposter.address,
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: typed.message,
      signature,
    });
    assert.equal(valid, false, "imposter address must NOT verify");
  });

  it("rejects pre-sign when validBefore is below the Gateway minimum", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nowSeconds = Math.floor(Date.now() / 1000);
    const args = makeArgs({
      wallet: STUB_WALLET,
      from: account.address,
      // 1 second short of the 3-day floor.
      validBefore: nowSeconds + GATEWAY_VALID_BEFORE_MIN_SECONDS - 1,
    });

    await assert.rejects(
      () => signTransferWithAuthorization(account, args),
      (err: unknown) =>
        err instanceof AuthorizationValidityTooShortError &&
        err.name === "AuthorizationValidityTooShortError",
    );
  });

  it("hashTransferWithAuthorization matches the signed digest shape", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const args = makeArgs({ wallet: STUB_WALLET, from: account.address });
    const digest = hashTransferWithAuthorization(args);
    assert.ok(digest.startsWith("0x"));
    assert.equal(digest.length, 66, "keccak256 digest is 32 bytes (64 hex)");
  });
});
