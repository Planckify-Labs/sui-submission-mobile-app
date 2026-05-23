/**
 * Yearn V3 adapter — fully ERC-4626 compliant vaults.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.8.
 *
 * Coordinates from `YEARN_V3.vaults.*`. The Yearn-ERC4626-Router can
 * batch multi-step flows but we use the direct vault call path for
 * single-step deposit/withdraw — simpler approval surface, identical
 * outcome.
 *
 * Yearn V3 vaults accrue yield by share-appreciation (no rebasing, no
 * claim primitive) → `buildClaim?` is intentionally absent.
 */

import { type Address, encodeFunctionData } from "viem";
import { mainnet } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { YEARN_V3 } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type { DefiPosition, DefiProtocolAdapter, UnsignedCall } from "../types";

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
      { name: "maxLoss", type: "uint256" },
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
      { name: "maxLoss", type: "uint256" },
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
] as const;

// 1 basis point default — Yearn v3 vaults pass-through the maxLoss
// parameter to ensure the user accepts up to N bps slippage on
// withdraw. 1 bp (0.01%) is tight enough for stables.
const DEFAULT_MAX_LOSS_BPS = 1n;

type YearnSlug = keyof typeof YEARN_V3.vaults;
type YearnVault = (typeof YEARN_V3.vaults)[YearnSlug];

function buildYearnAdapter(
  slug: YearnSlug,
  vault: YearnVault,
  displayName: string,
): DefiProtocolAdapter {
  return {
    slug,
    namespace: "eip155",
    kind: "yield_vault",
    chainId: vault.chainId,
    displayName,
    staticSafetyScore: 76,

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
      const client = getPublicClient(mainnet);
      if (amount === "MAX") {
        const shares = await client.readContract({
          address: vault.vault,
          abi: ERC4626_ABI,
          functionName: "balanceOf",
          args: [wallet.address as Address],
        });
        if (shares === 0n)
          throw new DefiError("position_not_found", `${slug}: no shares`);
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
              DEFAULT_MAX_LOSS_BPS,
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
          args: [
            amount,
            wallet.address as Address,
            wallet.address as Address,
            DEFAULT_MAX_LOSS_BPS,
          ],
        }),
      } satisfies UnsignedCall;
    },

    async readPosition(walletAddress: string): Promise<DefiPosition | null> {
      try {
        const client = getPublicClient(mainnet);
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
          currentAmountUsd: 0,
          pnlUsd: 0,
        };
      } catch {
        return null;
      }
    },
  };
}

export const YearnV3UsdcEthereumAdapter = buildYearnAdapter(
  "yearn-v3-usdc-eth",
  YEARN_V3.vaults["yearn-v3-usdc-eth"],
  "Yearn V3 USDC (Ethereum)",
);

// Legacy slug retained so backend opportunities citing `yearn-v3-ethereum`
// resolve to the USDC vault. New code should use the explicit slug.
export const YearnV3EthereumAdapter: DefiProtocolAdapter = {
  ...YearnV3UsdcEthereumAdapter,
  slug: "yearn-v3-ethereum",
  displayName: "Yearn V3 (Ethereum)",
};
