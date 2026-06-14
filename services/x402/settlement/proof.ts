/**
 * `settlement/proof` — the Mode-A `X-PAYMENT` proof envelope.
 *
 * A buyer-broadcast rail (relayer / direct) proves payment with an
 * on-chain **tx hash**; the seller verifies it on retry. This base64
 * envelope carries that hash. Mirrors `encodeX402Envelope` in
 * `services/nanopay/pathCRawX402.ts` (ASCII-only header value).
 *
 * Mode-B (server-settled) rails do NOT use this — their proof is the
 * signed `X-PAYMENT` payload the SDK produces, returned verbatim.
 *
 * SDK-free / chain-agnostic so it can live in the rail-neutral settlement
 * layer and be `node:test`-ed.
 */

import type { X402Erc7710Challenge } from "../../walletKit/types.ts";

export function encodeProofEnvelope(args: {
  challenge: X402Erc7710Challenge;
  rail: "facilitator" | "relayer" | "direct";
  txHash?: string;
}): string {
  const payload = {
    x402Version: 1,
    scheme: args.challenge.scheme,
    network: args.challenge.network,
    rail: args.rail,
    ...(args.txHash ? { txHash: args.txHash } : {}),
  };
  const json = JSON.stringify(payload);
  return globalThis.btoa
    ? globalThis.btoa(json)
    : (
        globalThis as unknown as {
          Buffer: { from(input: string): { toString(enc: string): string } };
        }
      ).Buffer.from(json).toString("base64");
}
