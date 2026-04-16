import type { Address, Hex } from "viem";
import type { UserOperation } from "./bundler";

export interface PaymasterConfig {
  chainId: number;
  url: string;
  entryPoint: Address;
}

export const DEFAULT_PAYMASTER_CONFIG: Record<number, PaymasterConfig> = {
  84532: {
    chainId: 84532,
    url: "https://api.pimlico.io/v2/base-sepolia/rpc",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
  8453: {
    chainId: 8453,
    url: "https://api.pimlico.io/v2/base/rpc",
    entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
};

export function getPaymasterConfig(chainId: number): PaymasterConfig | null {
  return DEFAULT_PAYMASTER_CONFIG[chainId] ?? null;
}

async function rpc<T>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `paymaster ${method} failed: ${json.error.message ?? "unknown"}`,
    );
  }
  return json.result as T;
}

export interface PaymasterContext {
  /** 'sponsored' | {token: erc20 address} */
  sponsored?: boolean;
  token?: Address;
}

export const Paymaster = {
  async getStubData(
    config: PaymasterConfig,
    userOp: UserOperation,
    chainIdHex: Hex,
    context: PaymasterContext,
  ): Promise<{ paymasterAndData: Hex }> {
    return rpc(config.url, "pm_getPaymasterStubData", [
      userOp,
      config.entryPoint,
      chainIdHex,
      context,
    ]);
  },

  async getData(
    config: PaymasterConfig,
    userOp: UserOperation,
    chainIdHex: Hex,
    context: PaymasterContext,
  ): Promise<{ paymasterAndData: Hex }> {
    return rpc(config.url, "pm_getPaymasterData", [
      userOp,
      config.entryPoint,
      chainIdHex,
      context,
    ]);
  },
};
