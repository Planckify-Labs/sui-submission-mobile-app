/**
 * `agentX402Client` — provider-neutral x402 challenge loop for the AI
 * agent (spec Phase 5 §4.1, §5.4, goal G3).
 *
 * The §4.1 loop in one place: **probe → parse → budget-gate → settle →
 * retry with proof**. SDK-free and chain-agnostic — it dispatches through
 * the resolved `WalletKitAdapter.settleX402Payment` capability (presence-
 * checked, never a namespace branch, SI-8) and contains no Venice / no
 * hardcoded resource hosts (SI-7). The parent permission context is the
 * passed-in `delegation`, kept swappable for the Phase 6 sub-agent seam
 * (N3).
 *
 * Error discipline (SI-6): every `failed.reason` is hand-written friendly
 * copy; raw bodies / statuses go to `__DEV__` logs only.
 */

import type { ChainConfig } from "../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../constants/types/walletTypes.ts";
import type { DelegationStruct, WalletKitAdapter } from "../walletKit/types.ts";
import { parseX402Erc7710Challenge } from "./parseX402Erc7710Challenge.ts";

export interface RunAgentX402FetchArgs {
  /** Protected resource URL the agent wants. */
  url: string;
  /** HTTP method for the resource (default GET). */
  method?: string;
  /** Resolved EVM wallet kit (must expose `settleX402Payment`). */
  kit: WalletKitAdapter;
  /** Paying wallet bound to the agent session (SI-4). */
  wallet: TWallet;
  chain: ChainConfig;
  /** Persisted, already-signed user→agent allowance (the budget). */
  delegation: DelegationStruct;
  /** Remaining spendable atoms (budget gate — local ledger, §6.2). */
  remainingBudgetAtoms: bigint;
  /** Called once a settlement lands so the caller can advance its ledger. */
  onSettled?: (spentAtoms: bigint) => void | Promise<void>;
  /** Injected for testability. Defaults to the platform `fetch`. */
  fetchImpl?: typeof fetch;
}

export type RunAgentX402FetchResult =
  | {
      status: "ok";
      /** `true` when an x402 payment was settled to obtain the resource. */
      paid: boolean;
      /** Parsed resource payload (JSON when available, else raw text). */
      data: unknown;
      /** Atoms spent (present when `paid`). */
      amountAtoms?: bigint;
      rail?: "facilitator" | "relayer";
      txHash?: string;
    }
  | {
      status: "over_budget";
      requestedAtoms: bigint;
      remainingBudgetAtoms: bigint;
    }
  | { status: "failed"; reason: string };

/** `__DEV__`-guarded raw logger — never reaches production users (SI-6). */
function logX402Debug(label: string, detail: unknown): void {
  const dev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  if (dev) {
    console.warn(`[agentX402Client] ${label}`, detail);
  }
}

/** Read a response body as JSON, falling back to text. Never throws. */
async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

/**
 * Run the full agent x402 handshake end-to-end. Returns the resource
 * payload plus a settlement summary the agent can narrate.
 */
export async function runAgentX402Fetch(
  args: RunAgentX402FetchArgs,
): Promise<RunAgentX402FetchResult> {
  const {
    url,
    kit,
    wallet,
    chain,
    delegation,
    remainingBudgetAtoms,
    onSettled,
  } = args;
  const method = args.method ?? "GET";
  const doFetch = args.fetchImpl ?? fetch;

  // Step 1 — probe.
  logX402Debug("probe →", { url, method });
  let probe: Response;
  try {
    probe = await doFetch(url, { method });
    logX402Debug("probe ←", { url, status: probe.status });
  } catch (err) {
    logX402Debug("probe transport error", {
      url,
      method,
      name: (err as Error)?.name,
      message: (err as Error)?.message,
    });
    return {
      status: "failed",
      reason: "We couldn't reach that resource. Please try again.",
    };
  }

  // Freely-available resource — no payment needed.
  if (probe.status === 200) {
    return { status: "ok", paid: false, data: await readBody(probe) };
  }
  if (probe.status !== 402) {
    logX402Debug("unexpected probe status", probe.status);
    return {
      status: "failed",
      reason: "That resource isn't available right now. Please try again.",
    };
  }

  // Step 2 — parse the challenge (no caching; settlement primitives are
  // single-use upstream).
  const challenge = await parseX402Erc7710Challenge(probe, url);
  if (!challenge) {
    return {
      status: "failed",
      reason:
        "This resource asked for a payment method the agent can't use yet.",
    };
  }

  // Capability gate (§6.1) — presence-check, no namespace branch (SI-8).
  if (typeof kit.settleX402Payment !== "function") {
    return {
      status: "failed",
      reason:
        "This resource needs an EVM spending delegation. Switch to an EVM wallet to let the agent pay it.",
    };
  }

  // Step 3 — budget gate (§6.2). The on-chain caveat is the hard ceiling;
  // this local gate only decides silent-vs-prompt.
  let requestedAtoms: bigint;
  try {
    requestedAtoms = BigInt(challenge.maxAmountRequired);
  } catch {
    logX402Debug("unparseable maxAmountRequired", challenge.maxAmountRequired);
    return {
      status: "failed",
      reason: "This resource sent an invalid price. Please try again.",
    };
  }
  if (requestedAtoms > remainingBudgetAtoms) {
    return {
      status: "over_budget",
      requestedAtoms,
      remainingBudgetAtoms,
    };
  }

  // Step 4 — settle through the kit (rail selection + fee bound live in
  // the kit, SI-2 / SI-3).
  const settlement = await kit.settleX402Payment({
    wallet,
    chain,
    challenge,
    delegation,
    remainingBudgetAtoms,
  });

  if (settlement.status === "over_budget") {
    return {
      status: "over_budget",
      requestedAtoms: settlement.requestedAtoms,
      remainingBudgetAtoms: settlement.remainingBudgetAtoms,
    };
  }
  if (settlement.status === "failed") {
    return { status: "failed", reason: settlement.reason };
  }

  // Advance the caller's ledger before the retry so a crash mid-retry
  // can't double-spend the local budget.
  try {
    await onSettled?.(settlement.spentAtoms);
  } catch (err) {
    logX402Debug("onSettled callback threw", err);
  }

  // Step 5 — retry with the `X-PAYMENT` proof. The header name has varied
  // across x402 drafts; emit both so a seller reading either still sees it.
  let retry: Response;
  try {
    retry = await doFetch(url, {
      method,
      headers: {
        "X-PAYMENT": settlement.proof,
        "x402-payment": settlement.proof,
      },
    });
  } catch (err) {
    logX402Debug("retry transport error", err);
    return {
      status: "failed",
      reason:
        "The payment went through but we couldn't fetch the resource. Please try again.",
    };
  }

  if (retry.status !== 200) {
    logX402Debug("retry non-200", retry.status);
    return {
      status: "failed",
      reason:
        "The payment went through but the resource didn't accept it. Please try again.",
    };
  }

  return {
    status: "ok",
    paid: true,
    data: await readBody(retry),
    amountAtoms: settlement.spentAtoms,
    rail: settlement.rail,
    txHash: settlement.txHash,
  };
}
