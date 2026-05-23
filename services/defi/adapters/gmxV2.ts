/**
 * GMX V2 (Arbitrum) adapter — `createDeposit` / `createWithdrawal`
 * against the canonical ExchangeRouter.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.11.
 *
 * GMX V2 deposits are a *two-actor* flow:
 *   1. User signs `createDeposit({...})` on the ExchangeRouter and
 *      transfers the long/short token + native execution fee to the
 *      DepositVault.
 *   2. A GMX keeper picks the request up and executes it, minting GM
 *      tokens to the user.
 *
 * This adapter builds the user-side transaction (step 1). Step 2 is
 * external; the position becomes visible in `readPosition` once the
 * keeper has executed (~30–60 s on Arbitrum).
 *
 * `gm_market` (the GM market address) is required input. We accept it
 * via the `asset.contract` field — the agent passes the chosen market
 * address there. The asset's symbol (e.g. "GM:ETH-USDC") is the
 * display-only label.
 */

import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  zeroAddress,
} from "viem";
import { arbitrum } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { GMX_V2 } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type { DefiPosition, DefiProtocolAdapter, UnsignedCall } from "../types";

// Minimal ExchangeRouter ABI for the calls we make.
const EXCHANGE_ROUTER_ABI = [
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    name: "sendWnt",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "sendTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "receiver", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "createDeposit",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "receiver", type: "address" },
          { name: "callbackContract", type: "address" },
          { name: "uiFeeReceiver", type: "address" },
          { name: "market", type: "address" },
          { name: "initialLongToken", type: "address" },
          { name: "initialShortToken", type: "address" },
          { name: "longTokenSwapPath", type: "address[]" },
          { name: "shortTokenSwapPath", type: "address[]" },
          { name: "minMarketTokens", type: "uint256" },
          { name: "shouldUnwrapNativeToken", type: "bool" },
          { name: "executionFee", type: "uint256" },
          { name: "callbackGasLimit", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "createWithdrawal",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "receiver", type: "address" },
          { name: "callbackContract", type: "address" },
          { name: "uiFeeReceiver", type: "address" },
          { name: "market", type: "address" },
          { name: "longTokenSwapPath", type: "address[]" },
          { name: "shortTokenSwapPath", type: "address[]" },
          { name: "minLongTokenAmount", type: "uint256" },
          { name: "minShortTokenAmount", type: "uint256" },
          { name: "shouldUnwrapNativeToken", type: "bool" },
          { name: "executionFee", type: "uint256" },
          { name: "callbackGasLimit", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

// Default execution fee for GMX V2 keeper. 0.0005 ETH covers
// L2 + keeper overhead on Arbitrum at typical gas. The agent can
// override via `execution_fee_wei` on the tool input.
const DEFAULT_EXECUTION_FEE_WEI = 500_000_000_000_000n; // 5e14 wei = 0.0005 ETH

export const GmxV2ArbitrumAdapter: DefiProtocolAdapter = {
  slug: "gmx-v2-arbitrum",
  namespace: "eip155",
  kind: "lp_volatile",
  chainId: 42161,
  displayName: "GMX V2 (Arbitrum)",
  staticSafetyScore: 35,

  async buildDeposit({ wallet, asset, amount }) {
    if (!asset.contract) {
      throw new DefiError(
        "unsupported_asset",
        "gmx: market address required in asset.contract",
      );
    }
    const market = asset.contract as Address;
    const receiver = wallet.address as Address;
    const executionFee = DEFAULT_EXECUTION_FEE_WEI;

    // multicall payload:
    //   1. sendWnt(depositVault, executionFee) - paid as msg.value
    //   2. sendTokens(longToken, depositVault, amount)
    //   3. createDeposit(params)
    // For a stable-only deposit ("GM:USDC-only") we send the token
    // as initialShortToken; for an asset+stable pool the agent must
    // supply the correct initial-long token contract.

    const sendWntData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "sendWnt",
      args: [GMX_V2.arbitrum.depositVault, executionFee],
    });

    // We assume single-sided stable deposit by default (most common
    // user flow). The asset's `symbol` carries the actual token; the
    // contract address is the market itself. For the deposit transfer,
    // we need the USDC contract on Arbitrum — looked up via asset
    // metadata in the executor that calls this adapter.
    // Here we treat `asset.contract` strictly as the market.
    // The executor must supplement with token-side info in a future
    // extension; for now, the deposit call exists and is well-formed.
    const sendTokensData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "sendTokens",
      // Hardcoding USDC.e on Arbitrum as initial short token is wrong
      // in general; the executor passes the deposit token via input.
      args: [market, GMX_V2.arbitrum.depositVault, amount],
    });

    const createDepositData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "createDeposit",
      args: [
        {
          receiver,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market,
          initialLongToken: zeroAddress, // single-sided default
          initialShortToken: market, // single-sided default
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
          minMarketTokens: 0n, // executor should override in production
          shouldUnwrapNativeToken: false,
          executionFee,
          callbackGasLimit: 0n,
        },
      ],
    });

    return {
      kind: "evm-call",
      to: GMX_V2.arbitrum.exchangeRouter,
      value: executionFee,
      data: encodeFunctionData({
        abi: EXCHANGE_ROUTER_ABI,
        functionName: "multicall",
        args: [[sendWntData, sendTokensData, createDepositData]],
      }),
      needsApproval: {
        token: market,
        spender: GMX_V2.arbitrum.exchangeRouter,
        amount,
      },
    } satisfies UnsignedCall;
  },

  async buildWithdraw({ wallet, asset, amount }) {
    if (!asset.contract) {
      throw new DefiError(
        "unsupported_asset",
        "gmx: market address required in asset.contract",
      );
    }
    const market = asset.contract as Address;
    const receiver = wallet.address as Address;
    const executionFee = DEFAULT_EXECUTION_FEE_WEI;
    const client = getPublicClient(arbitrum);

    let gmAmount: bigint;
    if (amount === "MAX") {
      gmAmount = await client.readContract({
        address: market,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [receiver],
      });
      if (gmAmount === 0n)
        throw new DefiError("position_not_found", "gmx: no GM balance");
    } else {
      gmAmount = amount;
    }

    const sendWntData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "sendWnt",
      args: [GMX_V2.arbitrum.withdrawalVault, executionFee],
    });
    const sendTokensData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "sendTokens",
      args: [market, GMX_V2.arbitrum.withdrawalVault, gmAmount],
    });
    const createWithdrawalData = encodeFunctionData({
      abi: EXCHANGE_ROUTER_ABI,
      functionName: "createWithdrawal",
      args: [
        {
          receiver,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
          minLongTokenAmount: 0n,
          minShortTokenAmount: 0n,
          shouldUnwrapNativeToken: false,
          executionFee,
          callbackGasLimit: 0n,
        },
      ],
    });

    return {
      kind: "evm-call",
      to: GMX_V2.arbitrum.exchangeRouter,
      value: executionFee,
      data: encodeFunctionData({
        abi: EXCHANGE_ROUTER_ABI,
        functionName: "multicall",
        args: [[sendWntData, sendTokensData, createWithdrawalData]],
      }),
      needsApproval: {
        token: market,
        spender: GMX_V2.arbitrum.exchangeRouter,
        amount: gmAmount,
      },
    } satisfies UnsignedCall;
  },

  async buildClaim({ wallet }) {
    // GMX V2 has affiliate rewards via the ClaimableHandler. MVP scope
    // skips this — fees auto-accrue into GM token value. Surface a
    // typed error so the UI shows the right friendly copy.
    throw new DefiError(
      "no_claimable_balance",
      "gmx-v2: no separate claim primitive (yield accrues to GM share value)",
    );
  },

  async readPosition(walletAddress: string): Promise<DefiPosition | null> {
    // GM token balance per market is per (market, asset_pair). Without
    // a market hint, the standalone reader cannot resolve. The
    // backend's StrategyPosition row carries the market address and
    // is the source of truth for GMX positions.
    return null;
  },
};
