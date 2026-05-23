/**
 * Lido adapter — submit (stake ETH → stETH), request withdrawal,
 * claim matured withdrawal, optional wstETH wrap.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.2.
 *
 * Coordinates resolve to `LIDO.mainnet` / `LIDO.holesky` constants
 * with a `chain.smartContracts` override (lets ops swap addresses on
 * staging).
 *
 * Withdrawal flow on Lido is a two-step:
 *   1. `requestWithdrawals(amounts, owner)` on the WithdrawalQueue ERC-721
 *      → mints an NFT representing the queued amount.
 *   2. After the request is finalized (~1–5 days; Lido reports
 *      `isFinalized`), call `claimWithdrawals(requestIds, hints)` to
 *      receive ETH.
 *
 * `buildWithdraw` builds step 1; `buildClaim` builds step 2. MAX uses
 * the user's full stETH balance.
 */

import { type Address, encodeFunctionData, erc20Abi, type Hex } from "viem";
import { getPublicClient } from "@/utils/clients";
import { LIDO } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type {
  BuildDepositArgs,
  BuildWithdrawArgs,
  DefiPosition,
  DefiProtocolAdapter,
  UnsignedCall,
} from "../types";

const LIDO_STETH_IDENTIFIER = "lido_steth";
const LIDO_WITHDRAWAL_QUEUE_IDENTIFIER = "lido_withdrawal_queue";
const LIDO_WSTETH_IDENTIFIER = "lido_wsteth";

const STETH_ABI = [
  {
    name: "submit",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "_referral", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const WITHDRAWAL_QUEUE_ABI = [
  {
    name: "requestWithdrawals",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amounts", type: "uint256[]" },
      { name: "_owner", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getWithdrawalRequests",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getWithdrawalStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_requestIds", type: "uint256[]" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "amountOfStETH", type: "uint256" },
          { name: "amountOfShares", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "timestamp", type: "uint256" },
          { name: "isFinalized", type: "bool" },
          { name: "isClaimed", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "findCheckpointHints",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_requestIds", type: "uint256[]" },
      { name: "_firstIndex", type: "uint256" },
      { name: "_lastIndex", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getLastCheckpointIndex",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimWithdrawals",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_requestIds", type: "uint256[]" },
      { name: "_hints", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    name: "MIN_STETH_WITHDRAWAL_AMOUNT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MAX_STETH_WITHDRAWAL_AMOUNT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const WSTETH_ABI = [
  {
    name: "wrap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_stETHAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "unwrap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_wstETHAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getStETHByWstETH",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_wstETHAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface LidoDeployment {
  chainId: number;
  steth: Hex;
  wsteth: Hex;
  withdrawalQueue: Hex;
}

function resolveSteth(
  chain: { smartContracts?: { name: string; address: string }[] } | undefined,
  deployment: LidoDeployment,
): Address {
  const o = chain?.smartContracts?.find(
    (s) => s.name === LIDO_STETH_IDENTIFIER,
  )?.address;
  if (o && /^0x[0-9a-fA-F]{40}$/.test(o)) return o as Address;
  return deployment.steth;
}
function resolveQueue(
  chain: { smartContracts?: { name: string; address: string }[] } | undefined,
  deployment: LidoDeployment,
): Address {
  const o = chain?.smartContracts?.find(
    (s) => s.name === LIDO_WITHDRAWAL_QUEUE_IDENTIFIER,
  )?.address;
  if (o && /^0x[0-9a-fA-F]{40}$/.test(o)) return o as Address;
  return deployment.withdrawalQueue;
}
function resolveWsteth(
  chain: { smartContracts?: { name: string; address: string }[] } | undefined,
  deployment: LidoDeployment,
): Address {
  const o = chain?.smartContracts?.find(
    (s) => s.name === LIDO_WSTETH_IDENTIFIER,
  )?.address;
  if (o && /^0x[0-9a-fA-F]{40}$/.test(o)) return o as Address;
  return deployment.wsteth;
}

function buildLidoAdapter(
  slug: string,
  deployment: LidoDeployment,
  displayName: string,
): DefiProtocolAdapter {
  return {
    slug,
    namespace: "eip155",
    kind: "liquid_staking",
    chainId: deployment.chainId,
    displayName,
    staticSafetyScore: 87,

    async buildDeposit({ chain, amount }) {
      const steth = resolveSteth(chain, deployment);
      return {
        kind: "evm-call",
        to: steth,
        data: encodeFunctionData({
          abi: STETH_ABI,
          functionName: "submit",
          args: ["0x0000000000000000000000000000000000000000" as Address],
        }),
        value: amount,
      } satisfies UnsignedCall;
    },

    async buildWithdraw({ wallet, chain, amount }) {
      const steth = resolveSteth(chain, deployment);
      const queue = resolveQueue(chain, deployment);
      let resolvedAmount: bigint;
      if (amount === "MAX") {
        // Read full stETH balance and request withdrawal of the
        // entire amount. NOTE: stETH can rebase between read and
        // tx — Lido tolerates that (the queue locks in the balance
        // at execution time).
        const client = getPublicClient(getViemChain(deployment.chainId));
        resolvedAmount = await client.readContract({
          address: steth,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet.address as Address],
        });
        if (resolvedAmount === 0n) {
          throw new DefiError(
            "position_not_found",
            "no stETH balance to withdraw",
          );
        }
      } else {
        resolvedAmount = amount;
      }
      return {
        kind: "evm-call",
        to: queue,
        data: encodeFunctionData({
          abi: WITHDRAWAL_QUEUE_ABI,
          functionName: "requestWithdrawals",
          args: [[resolvedAmount], wallet.address as Address],
        }),
        needsApproval: {
          token: steth,
          spender: queue,
          amount: resolvedAmount,
        },
      } satisfies UnsignedCall;
    },

    async buildClaim({ wallet, chain }) {
      const queue = resolveQueue(chain, deployment);
      const client = getPublicClient(getViemChain(deployment.chainId));
      const requestIds = (await client.readContract({
        address: queue,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: "getWithdrawalRequests",
        args: [wallet.address as Address],
      })) as readonly bigint[];

      if (!requestIds || requestIds.length === 0) {
        throw new DefiError(
          "no_claimable_balance",
          "no withdrawal requests for wallet",
        );
      }

      const statuses = (await client.readContract({
        address: queue,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: "getWithdrawalStatus",
        args: [[...requestIds]],
      })) as readonly {
        amountOfStETH: bigint;
        amountOfShares: bigint;
        owner: Address;
        timestamp: bigint;
        isFinalized: boolean;
        isClaimed: boolean;
      }[];

      const readyIds = requestIds.filter(
        (_, i) => statuses[i].isFinalized && !statuses[i].isClaimed,
      );
      if (readyIds.length === 0) {
        // Distinguish "still waiting" from "nothing claimable at all".
        const stillWaiting = statuses.some(
          (s) => !s.isFinalized && !s.isClaimed,
        );
        if (stillWaiting)
          throw new DefiError(
            "cooldown_in_progress",
            "withdrawals not finalized yet",
          );
        throw new DefiError(
          "no_claimable_balance",
          "no matured withdrawals to claim",
        );
      }

      const lastCheckpoint = (await client.readContract({
        address: queue,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: "getLastCheckpointIndex",
      })) as bigint;

      const hints = (await client.readContract({
        address: queue,
        abi: WITHDRAWAL_QUEUE_ABI,
        functionName: "findCheckpointHints",
        args: [[...readyIds], 1n, lastCheckpoint],
      })) as readonly bigint[];

      return {
        kind: "evm-call",
        to: queue,
        data: encodeFunctionData({
          abi: WITHDRAWAL_QUEUE_ABI,
          functionName: "claimWithdrawals",
          args: [[...readyIds], [...hints]],
        }),
      } satisfies UnsignedCall;
    },

    async buildWrap({ chain, amount }) {
      const wsteth = resolveWsteth(chain, deployment);
      const steth = resolveSteth(chain, deployment);
      return {
        kind: "evm-call",
        to: wsteth,
        data: encodeFunctionData({
          abi: WSTETH_ABI,
          functionName: "wrap",
          args: [amount],
        }),
        needsApproval: {
          token: steth,
          spender: wsteth,
          amount,
        },
      } satisfies UnsignedCall;
    },

    async readPosition(walletAddress: string): Promise<DefiPosition | null> {
      // Sum stETH (held directly) + wstETH (wrapped form) converted back
      // to stETH-equivalent. Users who wrap to wstETH separately would
      // otherwise show zero — Lido's spec treats both as the same
      // restaking position, so we mirror that here.
      try {
        const client = getPublicClient(getViemChain(deployment.chainId));
        const [stethBalance, wstethBalance] = await Promise.all([
          client.readContract({
            address: deployment.steth,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress as Address],
          }),
          client.readContract({
            address: deployment.wsteth,
            abi: WSTETH_ABI,
            functionName: "balanceOf",
            args: [walletAddress as Address],
          }),
        ]);

        let wstethAsStEth = 0n;
        if (wstethBalance > 0n) {
          wstethAsStEth = await client.readContract({
            address: deployment.wsteth,
            abi: WSTETH_ABI,
            functionName: "getStETHByWstETH",
            args: [wstethBalance],
          });
        }
        const total = stethBalance + wstethAsStEth;
        if (total === 0n) return null;
        return {
          protocolSlug: slug,
          namespace: "eip155",
          chainId: deployment.chainId,
          assetSymbol: "stETH",
          amountAtDeposit: 0n,
          amountAtDepositUsd: 0,
          currentAmount: total,
          currentAmountUsd: 0,
          pnlUsd: 0,
        };
      } catch {
        return null;
      }
    },
  };
}

function getViemChain(chainId: number): import("viem").Chain {
  // Lazy import to avoid a circular chunk; viem ships mainnet + holesky.
  // We intentionally only support the chains we have constants for.
  const chains = require("viem/chains") as typeof import("viem/chains");
  switch (chainId) {
    case 1:
      return chains.mainnet;
    case 17000:
      return chains.holesky;
    default:
      throw new DefiError("unsupported_chain", `lido: chainId ${chainId}`);
  }
}

export const LidoMainnetAdapter = buildLidoAdapter(
  "lido-mainnet",
  LIDO.mainnet,
  "Lido (Ethereum)",
);
export const LidoHoleskyAdapter = buildLidoAdapter(
  "lido-holesky",
  LIDO.holesky,
  "Lido (Holesky)",
);
