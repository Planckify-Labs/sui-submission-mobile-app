/**
 * Maple Finance — syrupUSDC adapter.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.7.
 *
 * Maple's syrupUSDC product is shipped on Ethereum mainnet as an
 * ERC-4626-compatible "Pool Manager" — the user deposits USDC and
 * receives syrupUSDC pool shares that appreciate against USDC via
 * accrued fixed-rate lending income (RWA-backed).
 *
 * Address resolves through `chain.smartContracts[name="maple_syrup_usdc"]`
 * for deposit/withdraw (lets ops hot-swap the pool without a binary
 * release; seeded by `api/src/scripts/prisma/seed.ts`). `readPosition`
 * doesn't get a `chain` arg, so it falls back to the `MAPLE_VAULTS`
 * constant table below.
 *
 * Maple discontinued the Solana product in 2023; only EVM
 * deployments are supported here.
 */

import { type Address, encodeFunctionData } from "viem";
import { base, mainnet } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { DefiError } from "../errors/defiErrors";
import type { DefiPosition, DefiProtocolAdapter, UnsignedCall } from "../types";

const MAPLE_VAULT_IDENTIFIER = "maple_syrup_usdc";

/**
 * Canonical syrupUSDC pool addresses (Maple V2 ERC-4626).
 *
 * `buildDeposit` / `buildWithdraw` still resolve through the DB
 * (`chain.smartContracts[name="maple_syrup_usdc"]`) so ops can hot-swap
 * the pool without a binary release. `readPosition` doesn't receive a
 * `chain` arg, so we keep a parallel constant table here — entries
 * missing from this map cause `readPosition` to return null and the
 * agent executor falls back to the DB row.
 *
 * Source: maple.finance / syrup.fi pool address book. Verify against
 * the protocol docs before adding a new chain.
 */
const MAPLE_VAULTS: Record<number, Address | undefined> = {
  // Ethereum mainnet — syrupUSDC pool.
  // https://etherscan.io/token/0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b
  1: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b",
  // Base — syrupUSDC pool (Syrup-labeled on BaseScan).
  // https://basescan.org/address/0x660975730059246a68521a3e2fbd4740173100f5
  8453: "0x660975730059246a68521A3e2FbD4740173100F5",
};

const ERC4626_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "asset",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

function getViemChain(chainId: number): import("viem").Chain {
  if (chainId === 1) return mainnet;
  if (chainId === 8453) return base;
  throw new DefiError("unsupported_chain", `maple: chainId ${chainId}`);
}

function resolveVault(
  chain: { smartContracts?: { name: string; address: string }[] } | undefined,
): Address {
  const o = chain?.smartContracts?.find(
    (s) => s.name === MAPLE_VAULT_IDENTIFIER,
  )?.address;
  if (!o || !/^0x[0-9a-fA-F]{40}$/.test(o)) {
    throw new DefiError(
      "protocol_not_found",
      "maple: vault address not seeded for this chain (chain.smartContracts.maple_syrup_usdc missing)",
    );
  }
  return o as Address;
}

function buildMapleAdapter(
  slug: string,
  chainId: number,
  displayName: string,
): DefiProtocolAdapter {
  return {
    slug,
    namespace: "eip155",
    kind: "rwa_yield",
    chainId,
    displayName,
    staticSafetyScore: 72,

    async buildDeposit({ wallet, chain, asset, amount }) {
      const vault = resolveVault(chain);
      if (asset.symbol !== "USDC") {
        throw new DefiError(
          "unsupported_asset",
          "maple syrupUSDC requires USDC",
        );
      }
      if (!asset.contract) {
        throw new DefiError(
          "unsupported_asset",
          "maple requires USDC contract address",
        );
      }
      return {
        kind: "evm-call",
        to: vault,
        data: encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: "deposit",
          args: [amount, wallet.address as Address],
        }),
        needsApproval: {
          token: asset.contract as Address,
          spender: vault,
          amount,
        },
      } satisfies UnsignedCall;
    },

    async buildWithdraw({ wallet, chain, amount }) {
      const vault = resolveVault(chain);
      const client = getPublicClient(getViemChain(chainId));
      if (amount === "MAX") {
        const shares = await client.readContract({
          address: vault,
          abi: ERC4626_ABI,
          functionName: "balanceOf",
          args: [wallet.address as Address],
        });
        if (shares === 0n)
          throw new DefiError("position_not_found", `${slug}: no shares`);
        return {
          kind: "evm-call",
          to: vault,
          data: encodeFunctionData({
            abi: ERC4626_ABI,
            functionName: "redeem",
            args: [
              shares,
              wallet.address as Address,
              wallet.address as Address,
            ],
          }),
        } satisfies UnsignedCall;
      }
      return {
        kind: "evm-call",
        to: vault,
        data: encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: "withdraw",
          args: [amount, wallet.address as Address, wallet.address as Address],
        }),
      } satisfies UnsignedCall;
    },

    async readPosition(walletAddress: string): Promise<DefiPosition | null> {
      const vault = MAPLE_VAULTS[chainId];
      if (!vault) return null;
      try {
        const client = getPublicClient(getViemChain(chainId));
        const shares = await client.readContract({
          address: vault,
          abi: ERC4626_ABI,
          functionName: "balanceOf",
          args: [walletAddress as Address],
        });
        if (shares === 0n) return null;
        const assets = await client.readContract({
          address: vault,
          abi: ERC4626_ABI,
          functionName: "convertToAssets",
          args: [shares],
        });
        return {
          protocolSlug: slug,
          namespace: "eip155",
          chainId,
          assetSymbol: "USDC",
          amountAtDeposit: 0n,
          amountAtDepositUsd: 0,
          currentAmount: assets,
          currentAmountUsd: 0,
          pnlUsd: 0,
        };
      } catch {
        return null;
      }
    },
  };
}

export const MapleSyrupUsdcEthereumAdapter = buildMapleAdapter(
  "maple-syrupusdc-eth",
  1,
  "Maple syrupUSDC (Ethereum)",
);
export const MapleSyrupUsdcBaseAdapter = buildMapleAdapter(
  "maple-syrupusdc-base",
  8453,
  "Maple syrupUSDC (Base)",
);
