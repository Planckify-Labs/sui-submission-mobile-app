import type { Address, Hash, Hex } from "viem";

export interface BundlerConfig {
  chainId: number;
  url: string;
  entryPoint: Address;
}

export interface UserOperation {
  sender: Address;
  nonce: Hex;
  initCode: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

/**
 * Compile-time default bundler set. Swap via env in a follow-up — Phase 1c
 * open question 2. Keys are chainIds.
 */
export const DEFAULT_BUNDLER_CONFIG: Record<number, BundlerConfig> = {
  // Base Sepolia — example; override via env at build time.
  84532: {
    chainId: 84532,
    url: "https://api.pimlico.io/v2/base-sepolia/rpc",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
  // Base mainnet
  8453: {
    chainId: 8453,
    url: "https://api.pimlico.io/v2/base/rpc",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
  // Optimism
  10: {
    chainId: 10,
    url: "https://api.pimlico.io/v2/optimism/rpc",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
  // Arbitrum
  42161: {
    chainId: 42161,
    url: "https://api.pimlico.io/v2/arbitrum/rpc",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
};

export function getBundlerConfig(chainId: number): BundlerConfig | null {
  return DEFAULT_BUNDLER_CONFIG[chainId] ?? null;
}

async function rpc<T>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `bundler ${method} failed: ${json.error.message ?? "unknown"}`,
    );
  }
  return json.result as T;
}

export const Bundler = {
  async estimateUserOpGas(
    config: BundlerConfig,
    userOp: UserOperation,
  ): Promise<{
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
  }> {
    return rpc(config.url, "eth_estimateUserOperationGas", [
      userOp,
      config.entryPoint,
    ]);
  },

  async sendUserOp(
    config: BundlerConfig,
    userOp: UserOperation,
  ): Promise<Hash> {
    return rpc(config.url, "eth_sendUserOperation", [
      userOp,
      config.entryPoint,
    ]);
  },

  async getUserOpReceipt(
    config: BundlerConfig,
    userOpHash: Hash,
  ): Promise<{
    userOpHash: Hash;
    transactionHash: Hash;
    success: boolean;
    logs?: unknown[];
  } | null> {
    return rpc(config.url, "eth_getUserOperationReceipt", [userOpHash]);
  },

  async waitForUserOpReceipt(
    config: BundlerConfig,
    userOpHash: Hash,
    timeoutMs = 60_000,
  ): Promise<{
    userOpHash: Hash;
    transactionHash: Hash;
    success: boolean;
  }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const receipt = await this.getUserOpReceipt(config, userOpHash);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`userOp ${userOpHash} not mined within ${timeoutMs}ms`);
  },
};
