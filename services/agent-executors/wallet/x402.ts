/**
 * `x402_fetch` — agent-initiated x402 micropayment executor
 * (spec Phase 5 §5.5, goal G5).
 *
 * Lets the Kimi K2.6 agent loop fetch a protected resource that answers
 * `402 Payment Required` with an ERC-7710 challenge and settle it
 * silently from the user's pre-signed agent allowance — within the budget
 * the user already authorized on-chain (§6).
 *
 * Capability resolution is presence-based (§6.1): resolve the active EVM
 * `walletKit`, check `typeof walletKit.settleX402Payment === "function"`,
 * and require a stored `delegation` grant. Absent either (Solana / Sui
 * active, or no allowance), the executor returns a friendly result asking
 * the user to grant an allowance first — no crash, no namespace branch
 * (SI-8). All settlement / fee enforcement lives behind the kit + the
 * `services/x402` orchestrator; this executor only wires inputs.
 *
 * Error discipline (CLAUDE.md user-facing-errors / SI-6): `ToolResult.error`
 * is always a curated code and `data.message` is hand-written friendly
 * copy — never a raw body / status. Raw detail is `__DEV__`-logged.
 */

import { buildChainConfigFromBlockchain } from "@/hooks/useWallet.helpers";
import {
  formatTokenAmount,
  parseTokenAmount,
} from "@/services/agentDelegationMapping";
import { PermissionGrantStore } from "@/services/permissionGrantStore";
import { walletKitRegistry } from "@/services/walletKit/registry";
import { runAgentX402Fetch, X402SpendLedger } from "@/services/x402";
import {
  type MobileToolExecutor,
  optionalString,
  requireString,
  resolveChainId,
  safeExecute,
} from "../types";

/** USDC is 6-decimal everywhere we settle x402 today. */
const USDC_DECIMALS = 6;

function usdcLabel(atoms: bigint): string {
  return `${formatTokenAmount(atoms, USDC_DECIMALS)} USDC`;
}

/**
 * `x402_fetch` — input `{ url, method?, maxSpendUsdc? }`; output (sanitized)
 * the resource body plus `{ paid, amount_usdc?, rail?, tx_hash? }`.
 */
export const x402Fetch: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    const url = requireString(input, "url");
    const method = optionalString(input, "method");
    const maxSpendUsdc =
      typeof input.maxSpendUsdc === "number"
        ? input.maxSpendUsdc
        : optionalString(input, "maxSpendUsdc");

    if (__DEV__) {
      console.warn("[x402_fetch] ENTER", {
        rawUrl: input.url, // what the LLM actually passed (catch http→https swaps)
        url,
        scheme: typeof url === "string" ? url.split(":")[0] : undefined,
        method: method ?? "GET",
        maxSpendUsdc,
        chainIdInput: input.chain_id,
        activeChainId: context.activeChainId,
        walletAddress: context.wallet?.address,
      });
    }

    // 1. Resolve the active EVM kit + chain. Non-EVM active → friendly.
    if (!walletKitRegistry.has("eip155")) {
      return {
        status: "success" as const,
        data: {
          paid: false,
          message:
            "This resource needs an EVM spending delegation. Switch to an EVM wallet to let the agent pay it.",
        },
      };
    }
    const kit = walletKitRegistry.get("eip155");

    const chainId = resolveChainId(input, context);
    const blockchain = context.blockchains.find(
      (b) => b.chainId === chainId && b.isEVM,
    );
    if (!blockchain) {
      return {
        status: "success" as const,
        data: {
          paid: false,
          message:
            "This resource needs an EVM spending delegation. Switch to an EVM wallet to let the agent pay it.",
        },
      };
    }
    const chain = buildChainConfigFromBlockchain(blockchain);

    // 2. Load the paying wallet's signed allowance (the budget). The
    //    delegation grant is bound to the agent session's wallet — never
    //    a home-screen fallback (SI-4).
    const walletAddress = context.wallet.address as `0x${string}`;
    const store = new PermissionGrantStore(walletAddress);
    await store.whenLoaded();
    const grant = store
      .list(walletAddress)
      .find(
        (g) =>
          g.scope.kind === "delegation" &&
          !!g.delegation &&
          !!g.delegationMeta &&
          g.delegationMeta.chainId === chainId,
      );

    if (!grant?.delegation || !grant.delegationMeta) {
      return {
        status: "success" as const,
        data: {
          paid: false,
          needs_allowance: true,
          chain_id: chainId,
          // Actionable copy: tells the user exactly where to grant the
          // allowance. Upgrading to a smart account is NOT enough on its
          // own — the agent spends a signed ERC-7710 allowance, which is
          // a separate one-time grant on this same network (§3.2, §4.4).
          message:
            "To pay for this automatically I need a USDC spending delegation. " +
            "Open Wallet → Agent permissions and authorize a USDC spending delegation " +
            "on this network (the chain you're currently on), then ask me again. " +
            "A smart-account upgrade alone doesn't grant the delegation.",
        },
      };
    }

    // 3. Compute the remaining local budget (drives silent-vs-prompt).
    const capAtoms = (() => {
      try {
        return BigInt(grant.delegationMeta.maxAmount);
      } catch {
        return 0n;
      }
    })();
    const ledger = new X402SpendLedger(walletAddress, grant.delegation.salt);
    await ledger.whenLoaded();
    let remaining = ledger.remaining(capAtoms);

    // Optional per-call ceiling from the agent (`maxSpendUsdc`), applied
    // on top of the on-chain allowance — never widens it.
    if (maxSpendUsdc !== undefined) {
      const capFromInput = parseTokenAmount(
        String(maxSpendUsdc),
        USDC_DECIMALS,
      );
      if (capFromInput > 0n && capFromInput < remaining) {
        remaining = capFromInput;
      }
    }

    // 4. Run the §4.1 loop: probe → parse → gate → settle → retry.
    if (__DEV__) {
      console.warn("[x402_fetch] settling", {
        url,
        chainId,
        token: grant.delegationMeta.tokenSymbol,
        remaining: remaining.toString(),
      });
    }
    const result = await runAgentX402Fetch({
      url,
      method,
      kit,
      wallet: context.wallet,
      chain,
      delegation: grant.delegation,
      remainingBudgetAtoms: remaining,
      onSettled: (spentAtoms) => ledger.record(spentAtoms),
    });

    if (__DEV__) {
      console.warn("[x402_fetch] result", {
        status: result.status,
        ...(result.status === "ok"
          ? {
              paid: result.paid,
              amountAtoms: result.amountAtoms?.toString(),
              rail: result.rail,
              txHash: result.txHash,
            }
          : {}),
        ...(result.status === "failed" ? { reason: result.reason } : {}),
        ...(result.status === "over_budget"
          ? {
              requested: result.requestedAtoms.toString(),
              remaining: result.remainingBudgetAtoms.toString(),
            }
          : {}),
      });
    }

    if (result.status === "over_budget") {
      return {
        status: "success" as const,
        data: {
          paid: false,
          over_budget: true,
          requested_usdc: usdcLabel(result.requestedAtoms),
          remaining_usdc: usdcLabel(result.remainingBudgetAtoms),
          message: `This resource costs ${usdcLabel(result.requestedAtoms)} — over your remaining ${usdcLabel(result.remainingBudgetAtoms)} agent budget. Top up the allowance to continue.`,
        },
      };
    }

    if (result.status === "failed") {
      return {
        status: "success" as const,
        data: { paid: false, message: result.reason },
      };
    }

    return {
      status: "success" as const,
      ...(result.txHash ? { tx_hash: result.txHash as `0x${string}` } : {}),
      data: {
        paid: result.paid,
        // The chain the payment actually settled on — lets the receipt
        // card link the tx hash to the right block explorer (the agent
        // often omits `chain_id` from its input).
        chain_id: chainId,
        ...(result.paid && result.amountAtoms !== undefined
          ? { amount_usdc: usdcLabel(result.amountAtoms) }
          : {}),
        ...(result.rail ? { rail: result.rail } : {}),
        ...(result.txHash ? { tx_hash: result.txHash } : {}),
        resource: result.data,
      },
    };
  });

export const X402_EXECUTORS: Record<string, MobileToolExecutor> = {
  x402_fetch: x402Fetch,
};
