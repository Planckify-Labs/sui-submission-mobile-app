import { sha256 } from "@noble/hashes/sha256";

export function computeRefIdHash(refId: string): Uint8Array {
  return sha256(new TextEncoder().encode(refId));
}
