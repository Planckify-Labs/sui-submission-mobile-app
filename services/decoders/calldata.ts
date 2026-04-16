import { decodeFunctionData, parseAbiItem } from "viem";

/**
 * Minimal local selector → signature map for the most common ERC-20 / NFT
 * / router functions. Intentionally small — ~20 entries covers the long tail
 * of volume. The asset can grow via a build step later.
 */
const SELECTOR_DB: Record<string, string[]> = {
  "0xa9059cbb": ["function transfer(address to, uint256 amount)"],
  "0x23b872dd": [
    "function transferFrom(address from, address to, uint256 amount)",
  ],
  "0x095ea7b3": ["function approve(address spender, uint256 amount)"],
  "0x42842e0e": [
    "function safeTransferFrom(address from, address to, uint256 tokenId)",
  ],
  "0xb88d4fde": [
    "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  ],
  "0xf242432a": [
    "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  ],
  "0x2eb2c2d6": [
    "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)",
  ],
  "0xa22cb465": ["function setApprovalForAll(address operator, bool approved)"],
  "0xac9650d8": ["function multicall(bytes[] data)"],
  "0x5ae401dc": ["function multicall(uint256 deadline, bytes[] data)"],
  "0x38ed1739": [
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  ],
  "0x18cbafe5": [
    "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  ],
  "0x7ff36ab5": [
    "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  ],
  "0x3593564c": [
    "function execute(bytes commands, bytes[] inputs, uint256 deadline)",
  ],
  "0xd0e30db0": ["function deposit()"],
  "0x2e1a7d4d": ["function withdraw(uint256 amount)"],
  "0x3a871cdd": [
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)",
  ],
};

export interface DecodedArg {
  name: string;
  type: string;
  value: unknown;
}

export interface DecodedCalldata {
  selector: `0x${string}`;
  signature: string | null;
  functionName?: string;
  args?: DecodedArg[];
  ambiguous?: boolean;
  raw: `0x${string}`;
}

export function decodeCalldata(
  data: `0x${string}` | undefined | null,
): DecodedCalldata | null {
  if (!data || data === "0x") return null;
  if (data.length < 10) {
    return { selector: data.slice(0, 10) as `0x${string}`, signature: null, raw: data };
  }
  const selector = data.slice(0, 10).toLowerCase() as `0x${string}`;
  const candidates = SELECTOR_DB[selector];
  if (!candidates || candidates.length === 0) {
    return { selector, signature: null, raw: data };
  }
  for (const sig of candidates) {
    try {
      const abi = [parseAbiItem(sig)] as any[];
      const decoded = decodeFunctionData({ abi, data });
      const abiFn = abi[0];
      const inputs = abiFn.inputs ?? [];
      const args: DecodedArg[] = (decoded.args as unknown[]).map(
        (value, i) => ({
          name: inputs[i]?.name ?? `arg${i}`,
          type: inputs[i]?.type ?? "unknown",
          value,
        }),
      );
      return {
        selector,
        signature: sig,
        functionName: decoded.functionName,
        args,
        ambiguous: candidates.length > 1,
        raw: data,
      };
    } catch {
      // try next candidate
    }
  }
  return { selector, signature: null, raw: data };
}
