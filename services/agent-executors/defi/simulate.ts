/**
 * DeFi simulate executor — runs `estimate_gas` against an adapter's
 * built UnsignedCall without submitting. Returns gas + slippage +
 * safety summary as a small JSON object for the LLM to consume.
 *
 * Spec: docs/defi-strategies-spec.md §11 (`defi_simulate_deposit`).
 */

import { type Address, formatUnits } from "viem";
import { strategiesApi } from "@/api/endpoints/strategies";
import { buildChainConfigFromBlockchain } from "@/hooks/useWallet.helpers";
import {
  classifyDefiError,
  DefiError,
} from "@/services/defi/errors/defiErrors";
import { getDefiAdapter, listDefiAdapters } from "@/services/defi/registry";
import { resolveChainClients } from "../chainRouter";
import {
  ExecutorError,
  ExecutorErrorCode,
  type MobileToolExecutor,
  requireBigInt,
  requireString,
  resolveChainId,
  safeExecute,
} from "../types";

function decimalsForSymbol(symbol: string): number {
  switch (symbol.toUpperCase()) {
    case "USDC":
    case "USDT":
    case "USDC.E":
      return 6;
    case "WBTC":
      return 8;
    default:
      return 18;
  }
}

export const simulateDeposit: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    try {
      const chainId = resolveChainId(input, context);
      const protocolSlug = requireString(input, "protocol_slug");
      const assetSymbol = requireString(input, "asset_symbol");
      const amountRaw = requireBigInt(input, "amount_raw");
      const assetContract = input.asset_contract as string | undefined;

      if (__DEV__) {
        console.warn("[defi/simulate] ENTER", {
          chainId,
          protocolSlug,
          assetSymbol,
          assetContract,
          amountRaw: amountRaw.toString(),
          expectedApy: input.expected_apy,
          walletAddress: context.wallet.address,
        });
      }

      const adapter = getDefiAdapter(protocolSlug);
      if (!adapter) {
        if (__DEV__) {
          console.warn("[defi/simulate] protocol_not_found", {
            protocolSlug,
            registered: listDefiAdapters().map((a) => a.slug),
          });
        }
        throw new DefiError("protocol_not_found", protocolSlug);
      }

      const blockchain = context.blockchains.find((b) => b.chainId === chainId);
      if (!blockchain) {
        if (__DEV__) {
          console.warn(
            "[defi/simulate] unsupported_chain — no blockchain row in context",
            {
              chainId,
              available: context.blockchains.map((b) => b.chainId),
            },
          );
        }
        throw new DefiError("unsupported_chain", `chainId=${chainId}`);
      }
      const chainConfig = buildChainConfigFromBlockchain(blockchain);
      const decimals = decimalsForSymbol(assetSymbol);

      let unsignedCall;
      try {
        unsignedCall = await adapter.buildDeposit({
          wallet: context.wallet,
          chain: chainConfig,
          asset: { symbol: assetSymbol, contract: assetContract, decimals },
          amount: amountRaw,
        });
      } catch (buildErr) {
        if (__DEV__) {
          console.error("[defi/simulate] adapter.buildDeposit threw", {
            protocolSlug,
            assetSymbol,
            assetContract,
            error: buildErr,
          });
        }
        throw buildErr;
      }

      if (__DEV__) {
        console.warn("[defi/simulate] unsignedCall built", {
          kind: unsignedCall.kind,
          to: (unsignedCall as { to?: string }).to,
          dataLen: (unsignedCall as { data?: string }).data?.length,
          needsApproval:
            unsignedCall.kind === "evm-call" && unsignedCall.needsApproval
              ? {
                  token: unsignedCall.needsApproval.token,
                  spender: unsignedCall.needsApproval.spender,
                  amount: unsignedCall.needsApproval.amount.toString(),
                }
              : false,
        });
      }

      if (unsignedCall.kind !== "evm-call") {
        return {
          status: "success",
          data: {
            protocol_slug: protocolSlug,
            chain_id: chainId,
            kind: unsignedCall.kind,
            estimated_gas: null,
            note: "non-EVM simulation not supported in v1",
          },
        };
      }

      const { publicClient } = resolveChainClients(chainId, context);
      let estimatedGas: bigint | null = null;
      try {
        estimatedGas = await publicClient.estimateGas({
          account: context.wallet.address as Address,
          to: unsignedCall.to,
          data: unsignedCall.data,
          value: unsignedCall.value ?? 0n,
        });
        if (__DEV__) {
          console.warn("[defi/simulate] estimateGas OK", {
            estimatedGas: estimatedGas.toString(),
          });
        }
      } catch (err) {
        // estimate failed — typically because of an approval gap. Still
        // useful to report what we tried.
        if (__DEV__) {
          console.warn(
            "[defi/simulate] estimateGas failed (often approval gap)",
            {
              to: unsignedCall.to,
              needsApproval: !!unsignedCall.needsApproval,
              error: err,
            },
          );
        }
      }

      // Try to compare expected APY against the backend cache and
      // return drift if any.
      let apyDriftPct: number | null = null;
      try {
        const expected =
          typeof input.expected_apy === "number" ? input.expected_apy : null;
        if (expected !== null) {
          const cached = await strategiesApi
            .getOpportunity(protocolSlug)
            .catch((err) => {
              if (__DEV__) {
                console.warn("[defi/simulate] getOpportunity rejected", {
                  protocolSlug,
                  error: err,
                });
              }
              return null;
            });
          if (cached) {
            const apy = parseFloat(cached.apy);
            if (Number.isFinite(apy) && apy > 0) {
              apyDriftPct = Math.abs((apy - expected) / apy) * 100;
            }
          }
        }
      } catch (driftErr) {
        if (__DEV__) {
          console.warn("[defi/simulate] APY drift check failed (best-effort)", {
            error: driftErr,
          });
        }
      }

      return {
        status: "success",
        data: {
          protocol_slug: protocolSlug,
          chain_id: chainId,
          estimated_gas: estimatedGas !== null ? estimatedGas.toString() : null,
          needs_approval: !!unsignedCall.needsApproval,
          apy_drift_pct: apyDriftPct,
          safety_score: adapter.staticSafetyScore ?? null,
        },
      };
    } catch (err) {
      const code = classifyDefiError(err);
      if (__DEV__) {
        console.warn("[defi/simulate] EXIT failed", { code, error: err });
      }
      throw new ExecutorError(ExecutorErrorCode.InvalidInput, code);
    }
  });
