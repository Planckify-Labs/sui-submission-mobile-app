import type { TypedDataDefinition } from "viem";

const UNLIMITED_THRESHOLD = (1n << 256n) - (1n << 10n) - 1n;

export interface DecodedPermit {
  standard: "ERC2612";
  token: `0x${string}`;
  tokenName?: string;
  owner: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  deadline: bigint;
  nonce: bigint;
  isUnlimited: boolean;
}

export function tryDecodeErc2612(
  typedData: TypedDataDefinition | null | undefined,
): DecodedPermit | null {
  if (!typedData) return null;
  try {
    const { domain, types, primaryType, message } = typedData as any;
    if (primaryType !== "Permit") return null;
    const permitTypes = types?.Permit;
    if (!Array.isArray(permitTypes)) return null;
    const fieldNames = permitTypes.map((f: { name: string }) => f.name);
    for (const req of ["owner", "spender", "value", "nonce", "deadline"]) {
      if (!fieldNames.includes(req)) return null;
    }
    const amount = BigInt(message.value);
    return {
      standard: "ERC2612",
      token: (domain?.verifyingContract as `0x${string}`) ?? "0x",
      tokenName: domain?.name,
      owner: message.owner as `0x${string}`,
      spender: message.spender as `0x${string}`,
      amount,
      deadline: BigInt(message.deadline),
      nonce: BigInt(message.nonce),
      isUnlimited: amount >= UNLIMITED_THRESHOLD,
    };
  } catch {
    return null;
  }
}
