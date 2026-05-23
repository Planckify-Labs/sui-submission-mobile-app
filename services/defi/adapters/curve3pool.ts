/**
 * Curve 3pool adapter — add_liquidity (1-sided), remove_liquidity_one_coin.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.3.
 *
 * Coordinates resolve to `CURVE_3POOL.mainnet` constants with optional
 * `chain.smartContracts` override. Curve 3pool accepts DAI, USDC, USDT;
 * we reject other symbols with `unsupported_asset`.
 *
 * MAX support: `buildWithdraw` with `amount === "MAX"` reads the LP token
 * balance (`balanceOf`) and uses that as the burn amount.
 *
 * readPosition: returns the LP balance × `get_virtual_price` (priced
 * upstream). LP value ≈ underlying value because 3pool is a stable pool.
 */

import { type Address, encodeFunctionData, erc20Abi, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { getPublicClient } from "@/utils/clients";
import { CURVE_3POOL } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type {
  BuildDepositArgs,
  BuildWithdrawArgs,
  DefiPosition,
  DefiProtocolAdapter,
  UnsignedCall,
} from "../types";

const CURVE_3POOL_IDENTIFIER = "curve_3pool";
const CURVE_3POOL_LP_IDENTIFIER = "curve_3pool_lp";

const CURVE_3POOL_ABI = [
  {
    name: "add_liquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amounts", type: "uint256[3]" },
      { name: "min_mint_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "remove_liquidity_one_coin",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_token_amount", type: "uint256" },
      { name: "i", type: "int128" },
      { name: "min_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "calc_token_amount",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amounts", type: "uint256[3]" },
      { name: "is_deposit", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "calc_withdraw_one_coin",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_token_amount", type: "uint256" },
      { name: "i", type: "int128" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "get_virtual_price",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Slippage tolerance in basis points — applied to the `calc_*` quote
// before submission. 50 bps = 0.5%. Tight enough for 3pool stables but
// loose enough not to revert under modest pool imbalance.
const SLIPPAGE_BPS = 50n;
const BPS_DENOM = 10000n;

type CurveCoinSymbol = keyof typeof CURVE_3POOL.mainnet.coins;
function isCurveCoinSymbol(s: string): s is CurveCoinSymbol {
  return s === "DAI" || s === "USDC" || s === "USDT";
}

function resolvePool(
  chain: { smartContracts?: { name: string; address: string }[] } | undefined,
): Address {
  const o = chain?.smartContracts?.find(
    (s) => s.name === CURVE_3POOL_IDENTIFIER,
  )?.address;
  if (o && /^0x[0-9a-fA-F]{40}$/.test(o)) return o as Address;
  return CURVE_3POOL.mainnet.pool;
}
function resolveLp(
  chain: { smartContracts?: { name: string; address: string }[] } | undefined,
): Address {
  const o = chain?.smartContracts?.find(
    (s) => s.name === CURVE_3POOL_LP_IDENTIFIER,
  )?.address;
  if (o && /^0x[0-9a-fA-F]{40}$/.test(o)) return o as Address;
  return CURVE_3POOL.mainnet.lpToken;
}

export const Curve3poolAdapter: DefiProtocolAdapter = {
  slug: "curve-3pool",
  namespace: "eip155",
  kind: "lp_stable",
  chainId: 1,
  displayName: "Curve 3pool",
  staticSafetyScore: 82,

  async buildDeposit({ chain, asset, amount }) {
    if (!isCurveCoinSymbol(asset.symbol)) {
      throw new DefiError("unsupported_asset", `curve-3pool: ${asset.symbol}`);
    }
    if (!asset.contract) {
      throw new DefiError(
        "unsupported_asset",
        "curve-3pool requires ERC-20 asset",
      );
    }
    const coin = CURVE_3POOL.mainnet.coins[asset.symbol];
    // Verify caller passed the right token contract for the symbol.
    if (asset.contract.toLowerCase() !== coin.contract.toLowerCase()) {
      throw new DefiError(
        "unsupported_asset",
        `curve-3pool: contract mismatch for ${asset.symbol}`,
      );
    }
    const pool = resolvePool(chain);
    const amounts = [0n, 0n, 0n] as [bigint, bigint, bigint];
    amounts[coin.index] = amount;

    // Compute min_mint_amount with slippage tolerance via calc_token_amount.
    const client = getPublicClient(mainnet);
    let minMint = 0n;
    try {
      const expectedLp = await client.readContract({
        address: pool,
        abi: CURVE_3POOL_ABI,
        functionName: "calc_token_amount",
        args: [amounts, true],
      });
      minMint = (expectedLp * (BPS_DENOM - SLIPPAGE_BPS)) / BPS_DENOM;
    } catch {
      // Network blip — fail closed by requiring at least 99% of input
      // (still wrong magnitude but blocks total loss).
      const scale = 10n ** BigInt(18 - coin.decimals);
      minMint = (amount * scale * 99n) / 100n;
    }

    return {
      kind: "evm-call",
      to: pool,
      data: encodeFunctionData({
        abi: CURVE_3POOL_ABI,
        functionName: "add_liquidity",
        args: [amounts, minMint],
      }),
      needsApproval: {
        token: coin.contract,
        spender: pool,
        amount,
      },
    } satisfies UnsignedCall;
  },

  async buildWithdraw({ wallet, chain, asset, amount }) {
    if (!isCurveCoinSymbol(asset.symbol)) {
      throw new DefiError("unsupported_asset", `curve-3pool: ${asset.symbol}`);
    }
    const coin = CURVE_3POOL.mainnet.coins[asset.symbol];
    const pool = resolvePool(chain);
    const lp = resolveLp(chain);
    const client = getPublicClient(mainnet);

    let lpAmount: bigint;
    if (amount === "MAX") {
      lpAmount = await client.readContract({
        address: lp,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.address as Address],
      });
      if (lpAmount === 0n)
        throw new DefiError("position_not_found", "no LP balance");
    } else {
      lpAmount = amount;
    }

    let minAmount = 0n;
    try {
      const expected = await client.readContract({
        address: pool,
        abi: CURVE_3POOL_ABI,
        functionName: "calc_withdraw_one_coin",
        args: [lpAmount, BigInt(coin.index) as unknown as bigint],
      });
      minAmount = (expected * (BPS_DENOM - SLIPPAGE_BPS)) / BPS_DENOM;
    } catch {
      minAmount = 0n; // user-confirmed flow; preview should highlight.
    }

    return {
      kind: "evm-call",
      to: pool,
      data: encodeFunctionData({
        abi: CURVE_3POOL_ABI,
        functionName: "remove_liquidity_one_coin",
        args: [lpAmount, BigInt(coin.index) as unknown as bigint, minAmount],
      }),
    } satisfies UnsignedCall;
  },

  async readPosition(walletAddress: string): Promise<DefiPosition | null> {
    try {
      const client = getPublicClient(mainnet);
      const lpBalance = await client.readContract({
        address: CURVE_3POOL.mainnet.lpToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      });
      if (lpBalance === 0n) return null;
      // Compute USD-equivalent from virtual price (18 decimals).
      const virtualPrice = await client.readContract({
        address: CURVE_3POOL.mainnet.pool,
        abi: CURVE_3POOL_ABI,
        functionName: "get_virtual_price",
      });
      // Underlying-value in 18-decimal units: balance * virtualPrice / 1e18.
      const underlyingValue = (lpBalance * virtualPrice) / 10n ** 18n;
      return {
        protocolSlug: "curve-3pool",
        namespace: "eip155",
        chainId: 1,
        assetSymbol: "3CRV",
        amountAtDeposit: 0n,
        amountAtDepositUsd: 0,
        currentAmount: lpBalance,
        currentAmountUsd: Number(underlyingValue) / 1e18, // stable pool ≈ USD
        pnlUsd: 0,
      };
    } catch {
      return null;
    }
  },
};
