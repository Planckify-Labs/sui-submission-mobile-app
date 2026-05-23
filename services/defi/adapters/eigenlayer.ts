/**
 * EigenLayer adapter — restaking via `StrategyManager.depositIntoStrategy`,
 * queued withdrawals via `DelegationManager.queueWithdrawals`, and
 * claim via `completeQueuedWithdrawals`.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.9.
 *
 * Two-step withdrawal (queue → wait `minWithdrawalDelayBlocks` →
 * complete) maps to `buildWithdraw` (queue) + `buildClaim` (complete).
 *
 * MVP scope: stETH-strategy only. Adding cbETH/rETH is one extra row
 * in the `EIGENLAYER.<chain>.*Strategy` constants.
 */

import { type Address, encodeFunctionData, erc20Abi } from "viem";
import { holesky, mainnet } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { EIGENLAYER, LIDO } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type { DefiPosition, DefiProtocolAdapter, UnsignedCall } from "../types";

const STRATEGY_MANAGER_ABI = [
  {
    name: "depositIntoStrategy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "strategy", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "stakerStrategyShares",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "strategy", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

const STRATEGY_ABI = [
  {
    name: "sharesToUnderlyingView",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// DelegationManager.queueWithdrawals takes an array of QueuedWithdrawalParams.
// We expose buildWithdraw to queue a single stETH-strategy withdrawal.
const DELEGATION_MANAGER_ABI = [
  {
    name: "queueWithdrawals",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "queuedWithdrawalParams",
        type: "tuple[]",
        components: [
          { name: "strategies", type: "address[]" },
          { name: "shares", type: "uint256[]" },
          { name: "withdrawer", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    name: "completeQueuedWithdrawals",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "withdrawals",
        type: "tuple[]",
        components: [
          { name: "staker", type: "address" },
          { name: "delegatedTo", type: "address" },
          { name: "withdrawer", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "startBlock", type: "uint32" },
          { name: "strategies", type: "address[]" },
          { name: "shares", type: "uint256[]" },
        ],
      },
      { name: "tokens", type: "address[][]" },
      { name: "middlewareTimesIndexes", type: "uint256[]" },
      { name: "receiveAsTokens", type: "bool[]" },
    ],
    outputs: [],
  },
  {
    name: "delegatedTo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "cumulativeWithdrawalsQueued",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface EigenDeployment {
  chainId: number;
  strategyManager: Address;
  delegationManager: Address;
  stEthStrategy: Address;
  minWithdrawalDelayBlocks: number;
}

function getViemChain(chainId: number): import("viem").Chain {
  if (chainId === 1) return mainnet;
  if (chainId === 17000) return holesky;
  throw new DefiError("unsupported_chain", `eigenlayer: chainId ${chainId}`);
}

function getStethAddress(chainId: number): Address {
  if (chainId === 1) return LIDO.mainnet.steth;
  if (chainId === 17000) return LIDO.holesky.steth;
  throw new DefiError("unsupported_chain", `eigenlayer: chainId ${chainId}`);
}

function buildEigenAdapter(
  slug: string,
  deployment: EigenDeployment,
  displayName: string,
): DefiProtocolAdapter {
  return {
    slug,
    namespace: "eip155",
    kind: "restaking",
    chainId: deployment.chainId,
    displayName,
    staticSafetyScore: 65,

    async buildDeposit({ asset, amount }) {
      // MVP: stETH-strategy only. Asset must be stETH (matches what
      // Lido's adapter outputs as a stake receipt).
      if (asset.symbol !== "stETH" && asset.symbol !== "STETH") {
        throw new DefiError(
          "unsupported_asset",
          `${slug}: only stETH restaking supported`,
        );
      }
      const stethAddress = getStethAddress(deployment.chainId);
      return {
        kind: "evm-call",
        to: deployment.strategyManager,
        data: encodeFunctionData({
          abi: STRATEGY_MANAGER_ABI,
          functionName: "depositIntoStrategy",
          args: [deployment.stEthStrategy, stethAddress, amount],
        }),
        needsApproval: {
          token: stethAddress,
          spender: deployment.strategyManager,
          amount,
        },
      } satisfies UnsignedCall;
    },

    async buildWithdraw({ wallet, amount }) {
      // Step 1 of 2: queue the withdrawal. The user must come back
      // after `minWithdrawalDelayBlocks` and call `buildClaim`.
      const client = getPublicClient(getViemChain(deployment.chainId));
      let shares: bigint;
      if (amount === "MAX") {
        shares = await client.readContract({
          address: deployment.strategyManager,
          abi: STRATEGY_MANAGER_ABI,
          functionName: "stakerStrategyShares",
          args: [wallet.address as Address, deployment.stEthStrategy],
        });
        if (shares === 0n)
          throw new DefiError("position_not_found", `${slug}: no shares`);
      } else {
        shares = amount;
      }
      return {
        kind: "evm-call",
        to: deployment.delegationManager,
        data: encodeFunctionData({
          abi: DELEGATION_MANAGER_ABI,
          functionName: "queueWithdrawals",
          args: [
            [
              {
                strategies: [deployment.stEthStrategy],
                shares: [shares],
                withdrawer: wallet.address as Address,
              },
            ],
          ],
        }),
      } satisfies UnsignedCall;
    },

    async buildClaim({ wallet }) {
      // EigenLayer requires the user to supply the exact Withdrawal
      // tuple they queued — derived from the on-chain
      // `WithdrawalQueued` event. Mobile cannot reliably reconstruct
      // that event subscription, so we throw a typed error directing
      // the user to the backend-driven claim flow (StrategyPosition
      // event-log is the canonical source).
      throw new DefiError(
        "cooldown_in_progress",
        `${slug}: claim must be initiated from the position card (queue-state required)`,
      );
    },

    async readPosition(walletAddress: string): Promise<DefiPosition | null> {
      try {
        const client = getPublicClient(getViemChain(deployment.chainId));
        const shares = await client.readContract({
          address: deployment.strategyManager,
          abi: STRATEGY_MANAGER_ABI,
          functionName: "stakerStrategyShares",
          args: [walletAddress as Address, deployment.stEthStrategy],
        });
        if (shares === 0n) return null;
        const underlying = await client.readContract({
          address: deployment.stEthStrategy,
          abi: STRATEGY_ABI,
          functionName: "sharesToUnderlyingView",
          args: [shares],
        });
        return {
          protocolSlug: slug,
          namespace: "eip155",
          chainId: deployment.chainId,
          assetSymbol: "stETH",
          amountAtDeposit: 0n,
          amountAtDepositUsd: 0,
          currentAmount: underlying,
          currentAmountUsd: 0,
          pnlUsd: 0,
        };
      } catch {
        return null;
      }
    },
  };
}

export const EigenLayerEthereumAdapter = buildEigenAdapter(
  "eigenlayer-ethereum",
  EIGENLAYER.mainnet,
  "EigenLayer (Ethereum · stETH)",
);
export const EigenLayerHoleskyAdapter = buildEigenAdapter(
  "eigenlayer-holesky",
  EIGENLAYER.holesky,
  "EigenLayer (Holesky · stETH)",
);
