/**
 * Unit tests for `signX402SvmPayment` (spec §5.2.1, §5.5, M6).
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        services/walletKit/solana/signX402SvmPayment.test.ts
 *
 * Pure Node test bench — uses `@solana/kit.generateKeyPairSigner()` for
 * throwaway fee-payer + user signers so the suite never touches
 * `expo-secure-store`, `walletService`, or the kit registry. The only
 * imports from our code are the pure signer module, the codec, and the
 * types.
 *
 * Coverage (per task §Acceptance):
 *   - Signature attaches to the correct slot (user's address).
 *   - Fee-payer signature placeholder is left `null` — the facilitator
 *     fills that slot at settle time (§5.2.1 Path B-SVM flow step 4).
 *   - Instruction array is untouched — `messageBytes` stays byte-equal
 *     pre- and post-sign. Rewriting would invalidate the scheme.
 *   - Round-trip: `partiallySignTransaction` verifies against the
 *     user's public key via the same ed25519 primitive on the wire.
 *   - `assertSolanaSigner` throws `SvmSignerUnavailableError` when the
 *     lookup returns `null` (keystore-miss path the kit wrapper relies
 *     on).
 *
 * The kit-level "cluster mismatch / wrong namespace" path lives in
 * `SolanaWalletKit.test.ts` — it needs the walletService resolver hook
 * and would pull the kit's transitive dwell-site imports into this
 * otherwise-pure test bench. Keeping the two suites separated mirrors
 * the EVM split (`signTransferWithAuthorization.test.ts` stays pure;
 * the kit-level guard lives in `EvmWalletKit.test.ts`).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, KeyPairSigner } from "@solana/kit";
import {
  appendTransactionMessageInstruction,
  address as asAddress,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  verifySignature,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

import {
  base64ToBytes,
  base64ToTransaction,
  transactionToBase64,
} from "../../chains/solana/codec.ts";
import { SvmSignerUnavailableError } from "../types.ts";
import {
  assertSolanaSigner,
  signX402SvmPaymentWithSigner,
} from "./signX402SvmPayment.ts";

/**
 * A fixed-but-arbitrary blockhash string. The signer doesn't care what
 * the blockhash resolves to — we only need `messageBytes` to round-trip
 * through the codec unchanged. Using a known constant keeps the tests
 * deterministic across runs.
 */
const FIXTURE_BLOCKHASH = blockhash(
  "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1z",
);
const FIXTURE_LAST_VALID_BLOCK_HEIGHT = 1_000_000n;

/**
 * Builds a base64-encoded versioned Solana transaction shaped like what
 * the SVM x402 facilitator would hand the wallet (spec §5.2.1):
 *
 *   - `feePayer` is the facilitator's address — signature slot starts
 *     as `null` (the facilitator hasn't signed yet in this test's
 *     model; the mobile-side semantics are equivalent — we only care
 *     that the slot is untouched by the wallet's signing call).
 *   - A transfer instruction where the *user* is the source (so the
 *     user is a required signer). This stands in for the real
 *     `TransferChecked` — whose byte layout is different but whose
 *     signer-set semantics are identical from the signer's
 *     perspective. We don't exercise the TransferChecked codec here;
 *     that's covered by `@solana-program/token`'s own tests.
 *
 * The returned tx therefore has two `null` signature slots on
 * compilation, matching the "partially signed versioned transaction"
 * wire format before the facilitator adds its own signature.
 */
function buildUnsignedSvmX402TxBase64(args: {
  feePayer: Address;
  userSigner: KeyPairSigner;
}): string {
  const transferDest = asAddress(
    // Any valid base58 Solana address. This stands in for the
    // merchant's ATA in the real TransferChecked.
    "11111111111111111111111111111112",
  );

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(args.feePayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: FIXTURE_BLOCKHASH,
          lastValidBlockHeight: FIXTURE_LAST_VALID_BLOCK_HEIGHT,
        },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({
          source: args.userSigner,
          destination: transferDest,
          amount: 1_000_000n,
        }),
        m,
      ),
  );

  const tx = compileTransaction(message);
  return transactionToBase64(tx);
}

describe("signX402SvmPaymentWithSigner — attaches user signature", () => {
  it("signs the user slot without mutating messageBytes", async () => {
    const feePayer = await generateKeyPairSigner();
    const userSigner = await generateKeyPairSigner();

    const unsignedBase64 = buildUnsignedSvmX402TxBase64({
      feePayer: feePayer.address,
      userSigner,
    });
    const unsignedTx = base64ToTransaction(unsignedBase64);

    // Pre-sign invariants: both slots are null, user + feePayer are
    // present in the signatures map.
    assert.equal(
      unsignedTx.signatures[feePayer.address],
      null,
      "fee-payer slot starts as null placeholder",
    );
    assert.equal(
      unsignedTx.signatures[userSigner.address],
      null,
      "user slot starts as null placeholder",
    );

    const signedBase64 = await signX402SvmPaymentWithSigner(
      userSigner,
      unsignedBase64,
    );
    const signedTx = base64ToTransaction(signedBase64);

    // messageBytes MUST be byte-equal — rewriting instructions
    // invalidates the facilitator's scheme (spec §5.2.1).
    assert.deepEqual(
      Uint8Array.from(signedTx.messageBytes),
      Uint8Array.from(unsignedTx.messageBytes),
      "messageBytes untouched — no instruction mutation",
    );

    // User signature is attached.
    const userSigBytes = signedTx.signatures[userSigner.address];
    assert.ok(
      userSigBytes instanceof Uint8Array,
      "user slot now carries a signature",
    );
    assert.equal(userSigBytes.length, 64, "ed25519 signatures are 64 bytes");

    // Fee-payer slot still null — the facilitator signs it later.
    assert.equal(
      signedTx.signatures[feePayer.address],
      null,
      "fee-payer slot stays null (facilitator fills it at settle time)",
    );
  });

  it("produces a signature that verifies against the user's public key", async () => {
    const feePayer = await generateKeyPairSigner();
    const userSigner = await generateKeyPairSigner();

    const unsignedBase64 = buildUnsignedSvmX402TxBase64({
      feePayer: feePayer.address,
      userSigner,
    });
    const signedBase64 = await signX402SvmPaymentWithSigner(
      userSigner,
      unsignedBase64,
    );
    const signedTx = base64ToTransaction(signedBase64);

    const userSigBytes = signedTx.signatures[userSigner.address];
    assert.ok(userSigBytes instanceof Uint8Array);

    // Round-trip correctness: ed25519 verify over the exact
    // messageBytes the signer emitted.
    const ok = await verifySignature(
      userSigner.keyPair.publicKey,
      userSigBytes,
      signedTx.messageBytes,
    );
    assert.equal(ok, true, "user's signature verifies against messageBytes");
  });

  it("returns a base64 blob that decodes to the same signatures map shape", async () => {
    const feePayer = await generateKeyPairSigner();
    const userSigner = await generateKeyPairSigner();

    const unsignedBase64 = buildUnsignedSvmX402TxBase64({
      feePayer: feePayer.address,
      userSigner,
    });
    const signedBase64 = await signX402SvmPaymentWithSigner(
      userSigner,
      unsignedBase64,
    );

    // Decodable as raw bytes (not corrupted at the wire layer).
    const wireBytes = base64ToBytes(signedBase64);
    assert.ok(wireBytes.length > 0, "signed wire bytes non-empty");

    // And decodable back into a kit Transaction.
    const signedTx = base64ToTransaction(signedBase64);
    const signerAddrs = Object.keys(signedTx.signatures);
    assert.equal(
      signerAddrs.length,
      2,
      "two required signers: fee-payer + user",
    );
    assert.ok(
      signerAddrs.includes(feePayer.address),
      "fee-payer present in signatures map",
    );
    assert.ok(
      signerAddrs.includes(userSigner.address),
      "user present in signatures map",
    );
  });

  it("is idempotent — signing twice yields the same signature bytes", async () => {
    const feePayer = await generateKeyPairSigner();
    const userSigner = await generateKeyPairSigner();

    const unsignedBase64 = buildUnsignedSvmX402TxBase64({
      feePayer: feePayer.address,
      userSigner,
    });

    const firstSignedBase64 = await signX402SvmPaymentWithSigner(
      userSigner,
      unsignedBase64,
    );
    const secondSignedBase64 = await signX402SvmPaymentWithSigner(
      userSigner,
      firstSignedBase64,
    );

    const firstTx = base64ToTransaction(firstSignedBase64);
    const secondTx = base64ToTransaction(secondSignedBase64);

    // ed25519 signatures are deterministic — re-signing the same
    // messageBytes produces the same 64 bytes.
    assert.deepEqual(
      Uint8Array.from(firstTx.signatures[userSigner.address] as Uint8Array),
      Uint8Array.from(secondTx.signatures[userSigner.address] as Uint8Array),
      "re-signing is deterministic",
    );
  });
});

describe("assertSolanaSigner", () => {
  it("throws SvmSignerUnavailableError when signer is null", () => {
    try {
      assertSolanaSigner(null, "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof SvmSignerUnavailableError);
      assert.equal(err.name, "SvmSignerUnavailableError");
      assert.equal(
        err.walletAddress,
        "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
      );
    }
  });

  it("is a no-op when the signer is present", async () => {
    const signer = await generateKeyPairSigner();
    // If this throws, the test fails — narrow type-guard semantics.
    assertSolanaSigner(signer, signer.address);
  });
});
