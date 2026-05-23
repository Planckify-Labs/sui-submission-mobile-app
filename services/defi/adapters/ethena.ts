/**
 * Ethena sUSDe adapter — ERC-4626 deposit, 7-day cooldown withdraw,
 * `unstake(receiver)` claim.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.10.
 *
 * The adapter maps the protocol's two-step exit to the standard
 * `buildWithdraw` (→ start cooldown via `cooldownShares`) +
 * `buildClaim` (→ `unstake(receiver)` after the 7-day timer
 * matures). This keeps shared executor code identical to Lido /
 * EigenLayer queued flows.
 */

import { type Address, encodeFunctionData } from "viem";
import { mainnet } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { ETHENA } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type { DefiPosition, DefiProtocolAdapter, UnsignedCall } from "../types";

const SUSDE_ABI = [
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
    name: "cooldownAssets",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "cooldownShares",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "unstake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [],
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
    name: "cooldowns",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [
      { name: "cooldownEnd", type: "uint104" },
      { name: "underlyingAmount", type: "uint152" },
    ],
  },
] as const;

export const EthenaEthereumAdapter: DefiProtocolAdapter = {
  slug: "ethena-ethereum",
  namespace: "eip155",
  kind: "delta_neutral",
  chainId: ETHENA.mainnet.chainId,
  displayName: "Ethena sUSDe (Ethereum)",
  staticSafetyScore: 52,

  async buildDeposit({ wallet, asset, amount }) {
    if (asset.symbol !== "USDe" && asset.symbol !== "USDE") {
      throw new DefiError("unsupported_asset", "ethena requires USDe");
    }
    return {
      kind: "evm-call",
      to: ETHENA.mainnet.sUSDe,
      data: encodeFunctionData({
        abi: SUSDE_ABI,
        functionName: "deposit",
        args: [amount, wallet.address as Address],
      }),
      needsApproval: {
        token: ETHENA.mainnet.USDe,
        spender: ETHENA.mainnet.sUSDe,
        amount,
      },
    } satisfies UnsignedCall;
  },

  async buildWithdraw({ wallet, amount }) {
    // Start the 7-day cooldown. Uses `cooldownShares(shares)` because
    // we know shares directly (MAX path reads balance; specific
    // amount is treated as shares).
    const client = getPublicClient(mainnet);
    let shares: bigint;
    if (amount === "MAX") {
      shares = await client.readContract({
        address: ETHENA.mainnet.sUSDe,
        abi: SUSDE_ABI,
        functionName: "balanceOf",
        args: [wallet.address as Address],
      });
      if (shares === 0n)
        throw new DefiError("position_not_found", "ethena: no shares");
    } else {
      shares = amount;
    }
    return {
      kind: "evm-call",
      to: ETHENA.mainnet.sUSDe,
      data: encodeFunctionData({
        abi: SUSDE_ABI,
        functionName: "cooldownShares",
        args: [shares],
      }),
    } satisfies UnsignedCall;
  },

  async buildClaim({ wallet }) {
    const client = getPublicClient(mainnet);
    const [cooldownEnd, underlyingAmount] = await client.readContract({
      address: ETHENA.mainnet.sUSDe,
      abi: SUSDE_ABI,
      functionName: "cooldowns",
      args: [wallet.address as Address],
    });
    if (underlyingAmount === 0n) {
      throw new DefiError(
        "cooldown_not_started",
        "ethena: nothing in cooldown",
      );
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < cooldownEnd) {
      throw new DefiError(
        "cooldown_in_progress",
        "ethena: cooldown not finished",
      );
    }
    return {
      kind: "evm-call",
      to: ETHENA.mainnet.sUSDe,
      data: encodeFunctionData({
        abi: SUSDE_ABI,
        functionName: "unstake",
        args: [wallet.address as Address],
      }),
    } satisfies UnsignedCall;
  },

  async readPosition(walletAddress: string): Promise<DefiPosition | null> {
    try {
      const client = getPublicClient(mainnet);
      const shares = await client.readContract({
        address: ETHENA.mainnet.sUSDe,
        abi: SUSDE_ABI,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      });
      if (shares === 0n) return null;
      const assets = await client.readContract({
        address: ETHENA.mainnet.sUSDe,
        abi: SUSDE_ABI,
        functionName: "convertToAssets",
        args: [shares],
      });
      return {
        protocolSlug: "ethena-ethereum",
        namespace: "eip155",
        chainId: 1,
        assetSymbol: "sUSDe",
        amountAtDeposit: 0n,
        amountAtDepositUsd: 0,
        currentAmount: assets,
        currentAmountUsd: Number(assets) / 1e18, // USDe ≈ $1
        pnlUsd: 0,
      };
    } catch {
      return null;
    }
  },
};
