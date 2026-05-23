/**
 * Morpho Vault adapter — standard ERC-4626 deposit/withdraw/redeem,
 * with the V2 maxDeposit/maxMint/maxWithdraw/maxRedeem === 0 quirk
 * papered over (we compute capacity from `totalAssets` + on-chain
 * heuristics).
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.4.
 *
 * One slug per (vault, chain). Coordinates come from the
 * `MORPHO_VAULTS` constant table in `services/defi/constants/addresses.ts`.
 * Adding a new vault is one entry there + one register call in
 * `bootstrap.ts`.
 */

import { type Address, encodeFunctionData, erc20Abi, type Hex } from "viem";
import { base, mainnet } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { MORPHO_VAULTS } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type {
  BuildDepositArgs,
  BuildWithdrawArgs,
  DefiPosition,
  DefiProtocolAdapter,
  UnsignedCall,
} from "../types";

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
    name: "totalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxDeposit",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type MorphoSlug = keyof typeof MORPHO_VAULTS;
type MorphoVault = (typeof MORPHO_VAULTS)[MorphoSlug];

function getViemChain(chainId: number): import("viem").Chain {
  switch (chainId) {
    case 1:
      return mainnet;
    case 8453:
      return base;
    default:
      throw new DefiError("unsupported_chain", `morpho: chainId ${chainId}`);
  }
}

function buildMorphoAdapter(
  slug: MorphoSlug,
  vault: MorphoVault,
  displayName: string,
): DefiProtocolAdapter {
  return {
    slug,
    namespace: "eip155",
    kind: "yield_vault",
    chainId: vault.chainId,
    displayName,
    staticSafetyScore: 88,

    async buildDeposit({ wallet, asset, amount }) {
      if (
        asset.contract &&
        asset.contract.toLowerCase() !== vault.assetContract.toLowerCase()
      ) {
        throw new DefiError(
          "unsupported_asset",
          `${slug}: asset must be ${vault.asset}`,
        );
      }
      // V2 quirk: maxDeposit returns 0 always. We read totalAssets and
      // apply a sanity cap (server's curated vault list is the gate for
      // really tight caps; this just blocks pathological deposits).
      const client = getPublicClient(getViemChain(vault.chainId));
      try {
        const totalAssets = await client.readContract({
          address: vault.vault,
          abi: ERC4626_ABI,
          functionName: "totalAssets",
        });
        if (totalAssets > 0n && amount > totalAssets * 2n) {
          throw new DefiError(
            "above_max_deposit",
            `${slug}: amount exceeds vault sanity cap`,
          );
        }
      } catch (err) {
        if (err instanceof DefiError) throw err;
        // Network blip — proceed; the on-chain call will revert if truly bad.
      }
      return {
        kind: "evm-call",
        to: vault.vault,
        data: encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: "deposit",
          args: [amount, wallet.address as Address],
        }),
        needsApproval: {
          token: vault.assetContract,
          spender: vault.vault,
          amount,
        },
      } satisfies UnsignedCall;
    },

    async buildWithdraw({ wallet, amount }) {
      const client = getPublicClient(getViemChain(vault.chainId));
      if (amount === "MAX") {
        // Read share balance, redeem the full amount. `redeem` takes
        // shares; `withdraw` takes assets. Using redeem avoids any
        // rounding-loss left in the vault.
        const shares = await client.readContract({
          address: vault.vault,
          abi: ERC4626_ABI,
          functionName: "balanceOf",
          args: [wallet.address as Address],
        });
        if (shares === 0n) {
          throw new DefiError(
            "position_not_found",
            `${slug}: no shares to withdraw`,
          );
        }
        return {
          kind: "evm-call",
          to: vault.vault,
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
        to: vault.vault,
        data: encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: "withdraw",
          args: [amount, wallet.address as Address, wallet.address as Address],
        }),
      } satisfies UnsignedCall;
    },

    async readPosition(walletAddress: string): Promise<DefiPosition | null> {
      try {
        const client = getPublicClient(getViemChain(vault.chainId));
        const shares = await client.readContract({
          address: vault.vault,
          abi: ERC4626_ABI,
          functionName: "balanceOf",
          args: [walletAddress as Address],
        });
        if (shares === 0n) return null;
        const assets = await client.readContract({
          address: vault.vault,
          abi: ERC4626_ABI,
          functionName: "convertToAssets",
          args: [shares],
        });
        return {
          protocolSlug: slug,
          namespace: "eip155",
          chainId: vault.chainId,
          assetSymbol: vault.asset,
          amountAtDeposit: 0n,
          amountAtDepositUsd: 0,
          currentAmount: assets,
          currentAmountUsd: 0, // priced upstream
          pnlUsd: 0,
        };
      } catch {
        return null;
      }
    },
  };
}

export const MorphoSteakhouseUsdcEthAdapter = buildMorphoAdapter(
  "morpho-steakhouse-usdc-eth",
  MORPHO_VAULTS["morpho-steakhouse-usdc-eth"],
  "Morpho · Steakhouse USDC (Ethereum)",
);
export const MorphoFlagshipUsdcBaseAdapter = buildMorphoAdapter(
  "morpho-flagship-usdc-base",
  MORPHO_VAULTS["morpho-flagship-usdc-base"],
  "Morpho · Flagship USDC (Base)",
);

// Legacy slug retained so backend opportunities that still cite
// `morpho-vault` resolve to the Steakhouse vault. New code should use
// the explicit slugs.
export const MorphoVaultAdapter: DefiProtocolAdapter = {
  ...MorphoSteakhouseUsdcEthAdapter,
  slug: "morpho-vault",
  displayName: "Morpho Vault (Ethereum)",
};
