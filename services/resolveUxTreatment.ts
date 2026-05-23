/**
 * UX treatment resolver for the Takumi Agent.
 *
 * Translates the server's factual `capability` into the concrete UX
 * treatment the mobile app will apply for a tool invocation. This sits
 * at the exact boundary between "what the action does" (server) and
 * "how much friction to apply" (wallet + user).
 *
 * Spec: `AGENT_PROTOCOL.md` §5 "Mobile-Side: Wallet Approval Policy"
 *       and §6 "Combining Grant + ApprovalPolicy → UX Treatment".
 *
 * Paired with `permissionGrantStore.ts`: grants (task 11) override
 * policies, and this file is the single place where they combine.
 */

import {
  type PermissionGrantStore,
  resolveGrant,
  type ToolCapability,
} from "./permissionGrantStore.ts";
import {
  type DefiInfo,
  resolveDefiThreshold,
  resolveTransferThreshold,
  type TransferThresholds,
} from "./transferThresholdStore.ts";

/**
 * Optional transfer context passed to `resolveUXTreatment` when the
 * tool being dispatched is a value-moving transfer (`send_native_token`
 * or `transfer_erc20`). Populated by the dispatcher from the tool
 * payload — see `extractTransferInfo` there.
 *
 * The fields here are exactly what `resolveTransferThreshold` needs to
 * pick the right per-token override or default. Decoupled from the
 * tool input shape so this resolver doesn't have to know about every
 * future transfer-style tool's schema.
 */
export interface TransferInfo {
  chainId: number;
  /** Lowercased contract address, or `"native"` for the chain's native currency. */
  contractAddressOrNative: string;
  symbol?: string;
  isNative: boolean;
}

// --- Types ------------------------------------------------------------------

/**
 * The four possible UX treatments a tool invocation can receive.
 *
 * - `silent`:  execute immediately, show a small status label
 * - `preview`: summary card, auto-proceed after a short delay (task 13)
 * - `confirm`: hard stop, explicit user tap required (task 14)
 * - `blocked`: immediate rejection (e.g. watch-only wallet cannot write)
 */
export type UXTreatment = "silent" | "preview" | "confirm" | "blocked";

/**
 * A per-wallet approval policy. Drives UX treatment when no explicit
 * grant is active (or when the active grant is `once`).
 *
 * `tool_overrides` lets a policy pin a specific tool to a treatment
 * regardless of capability — e.g. always `confirm` on `approve_erc20`
 * even for hot wallets that would otherwise preview writes.
 *
 * `auto_approve_below_usd` lets a policy downgrade `confirm` to
 * `preview` for small-value writes; useful for autonomous agents that
 * should still stop and ask before moving serious money.
 */
export interface ApprovalPolicy {
  read: UXTreatment;
  simulate: UXTreatment;
  write: UXTreatment;
  defi_read: UXTreatment;
  defi_write: UXTreatment;
  tool_overrides?: Record<string, UXTreatment>;
  auto_approve_below_usd?: number;
}

/**
 * Lightweight wallet shape passed to `resolveUXTreatment()`.
 *
 * This is deliberately NOT the full `TWallet` type from
 * `constants/types/walletTypes.ts`: that type is the on-device
 * persistence model (name, seed phrase, balance, etc.) and does not
 * carry runtime concepts like the live grant store or approval policy.
 * Keeping a separate shape means callers can construct a
 * `ConnectedWallet` from any source (a signed-in account, a hardware
 * bridge, a watch-only address) without extending the storage model.
 */
export interface ConnectedWallet {
  address: `0x${string}`;
  approvalPolicy: ApprovalPolicy;
  grantStore: PermissionGrantStore;
  /**
   * Snapshot of the wallet's transfer auto-approve thresholds.
   *
   * Optional — when absent, the resolver falls back to the policy's
   * single `auto_approve_below_usd` value (the legacy single-threshold
   * behaviour). Present when the dispatcher reads from
   * `getTransferThresholdStore(wallet)` at session bootstrap.
   *
   * A snapshot rather than a live store reference because the resolver
   * is pure and we want every call from the dispatcher to use the
   * snapshot consistent with that tool_pending event.
   */
  transferThresholds?: TransferThresholds;
}

// --- Built-in policies ------------------------------------------------------

/**
 * Default for software hot wallets: reads are free, simulations show a
 * preview, writes require explicit confirmation. `approve_erc20` is
 * pinned to `confirm` because approvals are the most common attack
 * vector — we never want to silently raise an allowance.
 */
export const HOT_WALLET_POLICY: ApprovalPolicy = {
  read: "silent",
  simulate: "preview",
  write: "confirm",
  defi_read: "silent",
  defi_write: "confirm",
  tool_overrides: { approve_erc20: "confirm" },
};

/**
 * Hardware wallets already gate every write on the device itself, so
 * the mobile UI does not need to add extra friction beyond `confirm`.
 */
export const HARDWARE_WALLET_POLICY: ApprovalPolicy = {
  read: "silent",
  simulate: "preview",
  write: "confirm",
  defi_read: "silent",
  defi_write: "confirm",
};

/**
 * Watch-only wallets have no signing key; writes are impossible and
 * are rejected at the policy layer.
 */
export const WATCH_ONLY_POLICY: ApprovalPolicy = {
  read: "silent",
  simulate: "silent",
  write: "blocked",
  defi_read: "silent",
  defi_write: "blocked",
};

/**
 * Multisig wallets behave like hot wallets from the mobile's
 * perspective — the co-signer flow happens out-of-band.
 */
export const MULTISIG_POLICY: ApprovalPolicy = {
  read: "silent",
  simulate: "preview",
  write: "confirm",
  defi_read: "silent",
  defi_write: "confirm",
};

// --- Resolver ---------------------------------------------------------------

/**
 * Resolve the concrete UX treatment for a tool invocation.
 *
 * Priority:
 *   1. Active grant from the wallet's grant store takes precedence.
 *      - `always_ask` → hard `confirm` (user locked the tool down)
 *      - `permanent` | `session` | `timed` → `silent` (user pre-approved)
 *   2. Otherwise (`once` — the fall-through default), delegate to the
 *      wallet's `ApprovalPolicy`.
 *
 * The signature matches what task 09's dispatcher will call. The
 * dispatcher passes the wallet object (not the policy directly) so the
 * resolver has access to the grant store.
 */
export function resolveUXTreatment(
  capability: ToolCapability,
  toolName: string,
  wallet: ConnectedWallet,
  sessionId: string,
  amountUsd?: number,
  transferInfo?: TransferInfo,
  defiInfo?: DefiInfo,
): UXTreatment {
  const grant = resolveGrant(
    toolName,
    capability,
    wallet.address,
    sessionId,
    wallet.grantStore,
  );

  switch (grant.type) {
    case "always_ask":
      // Hard override: even a global permanent grant cannot loosen this.
      return "confirm";

    case "permanent":
    case "session":
    case "timed":
      // User has an active pre-approval that covers this call.
      return "silent";

    case "once":
      // No active grant — fall through to the wallet's policy.
      return resolveFromPolicy(
        wallet.approvalPolicy,
        capability,
        toolName,
        amountUsd,
        wallet.transferThresholds,
        transferInfo,
        defiInfo,
      );
  }
}

/**
 * Pure policy resolver. Extracted so tests can exercise the
 * tool-override / auto-approve-below-usd logic without constructing a
 * grant store.
 *
 * Order of precedence:
 *   1. `tool_overrides[toolName]` — absolute win if set.
 *   2. `policy[capability]` — the base treatment.
 *   3. Downgrade `confirm` → `preview` when:
 *      a. transfer thresholds are configured AND `transferInfo` is
 *         present — use `resolveTransferThreshold` to find the
 *         per-token override or per-kind default.
 *      b. otherwise fall back to the legacy single-threshold
 *         `auto_approve_below_usd` field on the policy.
 *
 * The transfer-threshold path takes priority over the legacy field
 * when both are configured. That gives users who upgrade the new
 * granular control without losing the old behaviour for non-transfer
 * tools.
 */
export function resolveFromPolicy(
  policy: ApprovalPolicy,
  capability: ToolCapability,
  toolName: string,
  amountUsd?: number,
  thresholds?: TransferThresholds,
  transferInfo?: TransferInfo,
  defiInfo?: DefiInfo,
): UXTreatment {
  const override = policy.tool_overrides?.[toolName];
  if (override) return override;

  const base = policy[capability];

  if (base !== "confirm" || amountUsd === undefined) {
    return base;
  }

  // Path A — granular per-token thresholds. Only consulted for transfer-style
  // tools where the dispatcher could extract the token info.
  if (thresholds && transferInfo) {
    const resolved = resolveTransferThreshold(
      thresholds,
      transferInfo.chainId,
      transferInfo.contractAddressOrNative,
      transferInfo.isNative,
    );
    if (resolved.threshold_usd > 0 && amountUsd < resolved.threshold_usd) {
      return "preview";
    }
    return base;
  }

  // Path A.2 — DeFi thresholds (Task 18).
  if (thresholds && defiInfo) {
    const resolved = resolveDefiThreshold(thresholds, defiInfo);
    if (resolved.threshold_usd > 0 && amountUsd < resolved.threshold_usd) {
      return "preview";
    }
    return base;
  }

  // Path B — legacy single-threshold fallback. Preserves existing
  // behaviour for tools that aren't transfers (or wallets that haven't
  // configured the granular thresholds yet).
  if (
    policy.auto_approve_below_usd !== undefined &&
    amountUsd < policy.auto_approve_below_usd
  ) {
    return "preview";
  }

  return base;
}
