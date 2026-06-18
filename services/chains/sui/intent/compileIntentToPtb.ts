/**
 * NL→PTB compiler (spec §4) — a thin dispatcher over the EXISTING DeFi
 * port + swap layer (§1.2.1), not a new registry:
 *
 *   supply / withdraw → getDefiAdapter("scallop-sui").build*  (services/defi)
 *   swap              → getSuiSwapRoute(...)                   (services/swap/sui)
 *
 * The LLM emits a symbol/human-amount `Intent`; the compiler resolves
 * symbols → coinTypes from the token registry (SI-2), builds the PTB via
 * the registry adapter / swap selector, decodes it for the preview, and
 * returns a `CompiledIntent`. The guardian (§5) then runs over the result.
 *
 * Dependencies (swap router, adapter registry, Scallop meta read) are
 * injectable so the compiler is unit-testable without hitting a live SDK.
 */

import { parseUnits } from "viem";
import type { TToken } from "@/api/types/token";
import type { SuiChainConfig } from "@/constants/configs/chainConfig";
import {
  buildScallopZapSupply,
  readScallopSupplyMeta,
} from "@/services/defi/adapters/scallopSui";
import { DefiError } from "@/services/defi/errors/defiErrors";
import { listDefiAdaptersForChain } from "@/services/defi/registry";
import { getSuiSwapRoute } from "@/services/swap/sui/suiSwapRouter";
import { appendDeepbookSwap } from "@/services/swap/sui/venues/deepbookSwap";
import { decodeSuiPtb } from "./decodeSuiPtb";
import type { Intent } from "./intentSchema";
import type { CompileContext, CompiledIntent } from "./intentTypes";

export type { CompileContext, CompiledIntent } from "./intentTypes";

/** Canonical Move type for native SUI (mirrors `wallet/sui.ts`). */
const SUI_NATIVE_COIN_TYPE = "0x2::sui::SUI";
/** Native SUI decimals — a protocol constant (1 SUI = 10⁹ MIST), not a
 *  token-registry value. Used only for the native row / native fallback. */
const SUI_NATIVE_DECIMALS = 9;
const SCALLOP_SLUG = "scallop-sui";

export interface CompileDeps {
  getSwapRoute: typeof getSuiSwapRoute;
  listAdaptersForChain: typeof listDefiAdaptersForChain;
  readSupplyMeta: typeof readScallopSupplyMeta;
  /** Atomic swap→supply composer (mainnet-only Scallop) — §4.7. */
  buildZapSupply: typeof buildScallopZapSupply;
  /** The DEX swap leg appended into the zap's shared tx — §4.7. */
  appendSwapInto: typeof appendDeepbookSwap;
}

const DEFAULT_DEPS: CompileDeps = {
  getSwapRoute: getSuiSwapRoute,
  listAdaptersForChain: listDefiAdaptersForChain,
  readSupplyMeta: readScallopSupplyMeta,
  buildZapSupply: buildScallopZapSupply,
  appendSwapInto: appendDeepbookSwap,
};

interface ResolvedToken {
  coinType: string;
  decimals: number;
}

/** Resolve an app symbol → Move coinType + decimals from the token registry. */
function resolveToken(tokens: TToken[], symbol: string): ResolvedToken {
  const match = tokens.find(
    (t) => (t.symbol ?? "").toLowerCase() === symbol.toLowerCase(),
  );
  if (match) {
    if (match.isNativeCurrency || !match.contractAddress) {
      return {
        coinType: SUI_NATIVE_COIN_TYPE,
        decimals: match.decimals ?? SUI_NATIVE_DECIMALS,
      };
    }
    return { coinType: match.contractAddress, decimals: match.decimals };
  }
  if (symbol.toUpperCase() === "SUI") {
    return { coinType: SUI_NATIVE_COIN_TYPE, decimals: SUI_NATIVE_DECIMALS };
  }
  throw new DefiError("unsupported_asset", `unknown asset ${symbol}`);
}

function parseAmount(human: string, decimals: number): bigint {
  try {
    const raw = parseUnits(human, decimals);
    if (raw <= 0n) throw new Error("non-positive");
    return raw;
  } catch {
    throw new DefiError("unsupported_asset", `invalid amount ${human}`);
  }
}

export async function compileIntentToPtb(
  intent: Intent,
  ctx: CompileContext,
  deps: CompileDeps = DEFAULT_DEPS,
): Promise<CompiledIntent> {
  if (intent.action === "swap") {
    return compileSwap(intent, ctx, deps);
  }
  if (intent.action === "swap_and_supply") {
    return compileSwapAndSupply(intent, ctx, deps);
  }
  return compileScallop(intent, ctx, deps);
}

async function compileSwap(
  intent: Extract<Intent, { action: "swap" }>,
  ctx: CompileContext,
  deps: CompileDeps,
): Promise<CompiledIntent> {
  // Only the INPUT coin is resolved from the registry: you must hold what
  // you're swapping from, so it's always a registry row (SUI is native).
  // The OUTPUT coin is venue-authoritative — the DEX defines its pool's
  // coins (coinType + decimals), so we must NOT require the user to hold it
  // or to have a registry row for it (that was the testnet-USDC bug), and we
  // never hardcode its decimals. We pass the symbol; the venue resolves it.
  const from = resolveToken(ctx.tokens, intent.fromAsset);
  const amountRaw = parseAmount(intent.amount.human, from.decimals);

  const route = await deps.getSwapRoute({
    wallet: ctx.wallet,
    chain: ctx.chain,
    fromSymbol: intent.fromAsset,
    toSymbol: intent.toAsset,
    fromCoinType: from.coinType,
    fromDecimals: from.decimals,
    amountHuman: intent.amount.human,
    amountRaw,
    maxSlippageBps: intent.maxSlippageBps,
  });

  return {
    ptbBase64: route.ptbBase64,
    decoded: decodeSuiPtb(route.ptbBase64),
    summary: `Swap ${intent.amount.human} ${intent.fromAsset} to ${intent.toAsset}`,
    expectedOut: route.expectedOut,
    priceImpact: route.priceImpact,
    poolObjectId: route.poolObjectId,
    inputCoinType: from.coinType,
    inputAmountRaw: amountRaw,
    // Venue-authoritative output coin — the effect-mismatch check (§5.2)
    // verifies the dry-run actually credits THIS coin to the sender.
    outputCoinType: route.toCoinType,
  };
}

async function compileSwapAndSupply(
  intent: Extract<Intent, { action: "swap_and_supply" }>,
  ctx: CompileContext,
  deps: CompileDeps,
): Promise<CompiledIntent> {
  // Mainnet-only: the supply leg is Scallop. Gate via the registry exactly
  // like compileScallop — on testnet the adapter isn't registered, so a zap
  // returns `not_on_this_network` and the agent offers a plain swap instead.
  const adapter = deps
    .listAdaptersForChain("sui", ctx.chain.network)
    .find((a) => a.slug === SCALLOP_SLUG);
  if (!adapter) {
    throw new DefiError("unsupported_chain", "supply_mainnet_only");
  }

  // Resolve the INPUT coin (held by the user); the output/supply coin is
  // venue-authoritative (the DEX defines it), same as a plain swap.
  const from = resolveToken(ctx.tokens, intent.fromAsset);
  const amountRaw = parseAmount(intent.amount.human, from.decimals);

  // Compose both legs into ONE atomic PTB: the swap leg appends to Scallop's
  // shared tx and its output coin feeds the deposit (§4.7).
  const result = await deps.buildZapSupply({
    wallet: ctx.wallet,
    chain: ctx.chain as SuiChainConfig,
    supplyAssetSymbol: intent.toAsset,
    appendSwap: (tx) =>
      deps.appendSwapInto(tx, {
        wallet: ctx.wallet,
        chain: ctx.chain as SuiChainConfig,
        fromSymbol: intent.fromAsset,
        toSymbol: intent.toAsset,
        fromCoinType: from.coinType,
        fromDecimals: from.decimals,
        amountHuman: intent.amount.human,
        amountRaw,
        maxSlippageBps: intent.maxSlippageBps,
      }),
  });

  const meta = await deps.readSupplyMeta(intent.toAsset, ctx.wallet.address);

  return {
    ptbBase64: result.ptbBase64,
    decoded: decodeSuiPtb(result.ptbBase64),
    summary: `Swap ${intent.amount.human} ${intent.fromAsset} to ${intent.toAsset}, then supply to Scallop${
      meta.apy ? `, earning ~${meta.apy}% APY` : ""
    }`,
    apy: meta.apy,
    expectedOut: result.expectedOut,
    priceImpact: result.priceImpact,
    poolObjectId: result.poolObjectId,
    inputCoinType: from.coinType,
    inputAmountRaw: amountRaw,
    outputCoinType: result.toCoinType,
  };
}

async function compileScallop(
  intent: Extract<Intent, { action: "supply" | "withdraw" }>,
  ctx: CompileContext,
  deps: CompileDeps,
): Promise<CompiledIntent> {
  // Network gate is free: the Scallop adapter is chainId "mainnet", so on
  // testnet `listDefiAdaptersForChain("sui","testnet")` is empty (§4.6).
  const adapter = deps
    .listAdaptersForChain("sui", ctx.chain.network)
    .find((a) => a.slug === SCALLOP_SLUG);
  if (!adapter) {
    throw new DefiError("unsupported_chain", "supply_mainnet_only");
  }

  const asset = resolveToken(ctx.tokens, intent.asset);
  const assetArg = {
    symbol: intent.asset,
    contract: asset.coinType,
    decimals: asset.decimals,
  };

  let call: Awaited<ReturnType<typeof adapter.buildDeposit>>;
  let inputAmountRaw: bigint | undefined;
  if (intent.action === "supply") {
    inputAmountRaw = parseAmount(intent.amount.human, asset.decimals);
    call = await adapter.buildDeposit({
      wallet: ctx.wallet,
      chain: ctx.chain as SuiChainConfig,
      asset: assetArg,
      amount: inputAmountRaw,
    });
  } else {
    const amount =
      intent.amount?.human !== undefined
        ? parseAmount(intent.amount.human, asset.decimals)
        : ("MAX" as const);
    if (typeof amount === "bigint") inputAmountRaw = amount;
    call = await adapter.buildWithdraw({
      wallet: ctx.wallet,
      chain: ctx.chain as SuiChainConfig,
      asset: assetArg,
      amount,
    });
  }

  if (call.kind !== "sui-ptb") {
    throw new DefiError("unsupported_chain", "scallop: non-sui-ptb call");
  }

  const meta =
    intent.action === "supply"
      ? await deps.readSupplyMeta(intent.asset, ctx.wallet.address)
      : {};

  const summary =
    intent.action === "supply"
      ? `Supply ${intent.amount.human} ${intent.asset} to Scallop${
          meta.apy ? `, earning ~${meta.apy}% APY` : ""
        }`
      : `Withdraw ${intent.amount?.human ?? "all"} ${intent.asset} from Scallop`;

  return {
    ptbBase64: call.transactionBlockBase64,
    decoded: decodeSuiPtb(call.transactionBlockBase64),
    summary,
    apy: meta.apy,
    inputCoinType: meta.inputCoinType ?? asset.coinType,
    inputAmountRaw,
  };
}
