/**
 * Soft format heuristic for paste-first UX in `ImportPrivateKeySheet` (spec
 * §14.6). Returns `"eip155"` for 32-byte hex keys (optional `0x` prefix) or
 * `"solana"` for 87–88-char base58 (Phantom export format), else `null`.
 *
 * Advisory only — callers use this to *pre-highlight* a card; the user's
 * explicit pick is the only binding signal. A 64-hex-char string is
 * intentionally classified as EVM only — a Solana export rendered in hex
 * would be ambiguous, so the picker stays user-confirmed.
 */

import type { Namespace } from "@/services/chains/types";

export function inferNamespaceFromKey(input: string): Namespace | null {
  const s = input.trim();
  // EVM: 32-byte scalar, hex-encoded, optional `0x` prefix.
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return "eip155";
  // Solana: 87–88-char base58 of a 64-byte secret key (Phantom export).
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(s)) return "solana";
  return null;
}
