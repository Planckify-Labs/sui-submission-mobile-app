import {
  type Hash,
  type Hex,
  hashMessage,
  type PublicClient,
  recoverAddress,
} from "viem";

export interface VerifyParams {
  address: `0x${string}`;
  hash: Hash;
  signature: Hex;
  publicClient: PublicClient;
}

const ERC1271_MAGIC = "0x1626ba7e";
const EIP6492_SUFFIX =
  "6492649264926492649264926492649264926492649264926492649264926492"; // last 32 bytes

function hasEip6492Suffix(sig: Hex): boolean {
  if (sig.length < 2 + 64) return false;
  return sig.slice(-64).toLowerCase() === EIP6492_SUFFIX;
}

/**
 * Tries ECDSA recover first; falls back to ERC-1271 `isValidSignature`;
 * falls back to EIP-6492 counterfactual deploy-and-verify. Never throws —
 * returns false on any failure and logs in dev.
 */
export async function verifySignature(params: VerifyParams): Promise<{
  valid: boolean;
  scheme: "ecdsa" | "erc1271" | "eip6492" | null;
}> {
  const { address, hash, signature, publicClient } = params;

  // 1. Try raw ECDSA recover
  try {
    const recovered = await recoverAddress({ hash, signature });
    if (recovered.toLowerCase() === address.toLowerCase()) {
      return { valid: true, scheme: "ecdsa" };
    }
  } catch {
    // continue
  }

  // 2. ERC-1271 on deployed contract
  try {
    const code = await publicClient.getCode({ address });
    if (code && code !== "0x") {
      const res = await publicClient.call({
        to: address,
        data: buildIsValidSignatureCall(hash, signature),
      });
      const returned = res.data?.slice(0, 10).toLowerCase();
      if (returned === ERC1271_MAGIC) {
        return { valid: true, scheme: "erc1271" };
      }
    }
  } catch {
    // continue
  }

  // 3. EIP-6492 (counterfactual — deploy-then-verify via state overrides)
  if (hasEip6492Suffix(signature)) {
    try {
      // viem's verifyMessage handles 6492 wrapping automatically when the
      // address is a smart account; we surface the same semantics here.
      const ok = await publicClient.verifyMessage({
        address,
        message: { raw: hash },
        signature,
      });
      if (ok) return { valid: true, scheme: "eip6492" };
    } catch {
      // fall through
    }
  }

  return { valid: false, scheme: null };
}

function buildIsValidSignatureCall(hash: Hash, signature: Hex): Hex {
  // selector 0x1626ba7e + hash (32 bytes) + offset (32 bytes = 0x40) +
  // length (32 bytes) + signature data padded.
  const sigBytes = signature.startsWith("0x") ? signature.slice(2) : signature;
  const sigLen = sigBytes.length / 2;
  const offset =
    "0000000000000000000000000000000000000000000000000000000000000040";
  const length = sigLen.toString(16).padStart(64, "0");
  const padLen = (Math.ceil(sigLen / 32) * 32 - sigLen) * 2;
  const sigPadded = sigBytes + "0".repeat(padLen);
  const cleanHash = hash.startsWith("0x") ? hash.slice(2) : hash;
  return `0x1626ba7e${cleanHash}${offset}${length}${sigPadded}` as Hex;
}

/**
 * Convenience wrapper — verifies that `signature` was produced by `address`
 * for the given UTF-8 personal-sign message. Used by SIWE + backend auth.
 */
export async function verifyMessage(
  publicClient: PublicClient,
  address: `0x${string}`,
  message: string,
  signature: Hex,
): Promise<{
  valid: boolean;
  scheme: "ecdsa" | "erc1271" | "eip6492" | null;
}> {
  const hash = hashMessage(message);
  return verifySignature({ address, hash, signature, publicClient });
}
