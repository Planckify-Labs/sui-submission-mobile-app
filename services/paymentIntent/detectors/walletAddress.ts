/**
 * Wallet-address detector — see `docs/umkm-usdc-payout-spec.md` §4.3 #4
 * & #5, §4.2 `PayChannel.kind: "wallet"`.
 *
 * Matches raw addresses only (no URI scheme, no prefix). This is the
 * **lowest-priority** detector in the registry so anything carrying more
 * structure (TakumiPay JWS, x402, EMVCo QRIS, `ethereum:` / `solana:`
 * URIs) wins first. It preserves the behavior of
 * `app/scan-to-pay.tsx:29-62` so the task-07 refactor is a pure swap.
 *
 * Chain-extension discipline (memory
 * `feedback_chain_extension_discipline.md`): both EVM and Solana shapes
 * are tested **inside this file** — shared code elsewhere never branches
 * on namespace. Adding a new bare-address shape (e.g. SUI) is a new
 * detector file, not a new `if` here.
 *
 * Purity: no React, no network, no `viem.getAddress` normalization —
 * return the raw address as-is so the `/send` screen remains the single
 * authority on canonicalisation.
 */

import { type Detector, register } from "../detectorRegistry.ts";
import type { PaymentIntent, RawScan } from "../types.ts";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * Bitcoin-style base58 alphabet (no `0`, `O`, `I`, `l`). Solana
 * ed25519 public keys serialise to base58 with a canonical 32-byte
 * length, which yields 32-44 characters. We do not do full checksum
 * verification — that lives in `@solana/web3.js` at the /send screen.
 */
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_SET = new Set(BASE58_ALPHABET.split(""));

/**
 * Decode a base58 string to its byte length without allocating the
 * full buffer. We only need to know the decoded length is exactly 32
 * bytes for Solana pubkey validation. Returns `null` if the string
 * contains a non-base58 character.
 */
const base58DecodedLength = (input: string): number | null => {
  if (input.length === 0) return null;

  // Count leading '1's — each encodes a zero byte.
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros += 1;

  // Size the work buffer: log(58)/log(256) ≈ 0.733.
  const size = Math.floor(((input.length - zeros) * 733) / 1000) + 1;
  const buf = new Uint8Array(size);

  for (let i = zeros; i < input.length; i += 1) {
    const ch = input[i];
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) return null;

    let carry = digit;
    for (let j = size - 1; j >= 0; j -= 1) {
      carry += 58 * buf[j];
      buf[j] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) return null;
  }

  // Strip leading zeros from the work buffer.
  let leading = 0;
  while (leading < size && buf[leading] === 0) leading += 1;

  return zeros + (size - leading);
};

const isValidSolanaAddress = (raw: string): boolean => {
  // Solana pubkeys base58-encode to 32-44 chars. Early-reject outside
  // that window so we don't run the decoder on obvious non-matches.
  if (raw.length < 32 || raw.length > 44) return false;
  for (const ch of raw) {
    if (!BASE58_SET.has(ch)) return false;
  }
  return base58DecodedLength(raw) === 32;
};

export const walletAddressDetector: Detector = {
  name: "walletAddress",
  /**
   * Lowest M1 priority — see task 01 slot plan: TakumiPay JWS 10,
   * x402 20, QRIS 30, walletUri 40, walletAddress 50. Raising or
   * lowering this number without reviewing the other detectors risks
   * misclassifying a structured payload as a bare address.
   */
  priority: 50,
  detect: (raw: RawScan): PaymentIntent | null => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;

    if (EVM_ADDRESS.test(trimmed)) {
      return {
        source: "qr",
        channel: {
          kind: "wallet",
          namespace: "eip155",
          address: trimmed,
          target: undefined,
        },
        rawScan: raw,
      };
    }

    if (isValidSolanaAddress(trimmed)) {
      return {
        source: "qr",
        channel: {
          kind: "wallet",
          namespace: "solana",
          address: trimmed,
          target: undefined,
        },
        rawScan: raw,
      };
    }

    return null;
  },
};

register(walletAddressDetector);
