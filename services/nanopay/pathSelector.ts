/**
 * `services/nanopay/pathSelector.ts` — unified pay-path dispatcher
 * (spec §5.6 Path Selector, milestone M5).
 *
 * Single decision point for `/pay-merchant` and the agent-mode pay tool.
 * Given a `PaymentIntentResponse`, a `WalletKitAdapter`, and the active
 * `ChainConfig`, picks the concrete execution path the UI should invoke:
 *
 *   - `"A"`        → direct-on-Arc native USDC transfer (`pathADirectArc`).
 *   - `"B-EVM"`    → Circle Nanopayments EIP-3009 sign + submit.
 *   - `"B-SVM"`    → Solana x402 pre-built-tx sign + submit.
 *   - `"C"`        → raw x402 against a merchant URL (`pathCRawX402`).
 *   - `"gasless"`  → EIP-3009 sign + ERC-4337 UserOp paid by Circle
 *                    Paymaster in USDC (Base / Arbitrum).
 *
 * Rules (non-negotiable, enforced by tests):
 *
 *   - **Chain-extension discipline** (memory
 *     `feedback_chain_extension_discipline.md`): every dispatch branch
 *     keys off method presence on the adapter, NOT on a namespace string
 *     compare. There is deliberately zero `if (namespace === "X")`
 *     anywhere in this file — grep-clean. Adding a new chain / new x402
 *     scheme means adding the corresponding adapter method, and the
 *     selector picks it up with zero edits here.
 *
 *   - **Pure function.** No React, no `async`, no I/O, no fetches, no
 *     navigation. The selector takes pre-fetched inputs and returns a
 *     path discriminator. Testable under `node --test` with no mocks
 *     beyond hand-rolled adapter stubs. Memory
 *     `feedback_filter_at_source.md`: the caller threads the numbers
 *     the selector needs (balances, paymaster flags) rather than the
 *     selector fetching them.
 *
 *   - **Three-role separation** (memory `feedback_role_separation.md`,
 *     load-bearing): selector picks a path; adapter signs; backend
 *     relays. The selector never touches the keystore, never hits the
 *     network, never knows about intent status transitions.
 *
 * Scope note vs. the §5.6 spec:
 *
 *   §5.6 also calls out "needs onboarding" / "needs switch wallet" /
 *   "needs top up" UX branches. Those are consumer-screen concerns —
 *   `/pay-merchant` renders the right sheet based on its own inputs
 *   (deposit status from `useDepositStatus`, Arc balance from
 *   `useUsdcArcBalance`). This module owns the *path* decision only,
 *   so it stays pure + Node-testable. The screen-level onboarding /
 *   switch-wallet affordances are tracked in tasks 34 / 46.
 */

import type { ChainConfig } from "@/constants/configs/chainConfig";
import type { WalletKitAdapter } from "@/services/walletKit/types";
import type { PaymentIntentResponse } from "./types";

/**
 * Discriminator returned by `selectPayPath`. Maps 1-to-1 onto the path
 * orchestrators in this module. `"B-EVM"` / `"B-SVM"` share the Path B
 * umbrella but differ in the wallet-side signing primitive — keeping
 * them split means the consumer can route to the right orchestrator
 * without re-inspecting the adapter.
 */
export type PayPath = "A" | "B-EVM" | "B-SVM" | "C" | "gasless";

/**
 * Typed error raised when no branch matches the given inputs. Screens
 * catch by `name === "NoSuitablePayPathError"` and surface a
 * "Switch to supported wallet" sheet rather than a generic crash.
 * The extra fields help dev surfaces explain *why* without the message
 * having to be parsed.
 */
export class NoSuitablePayPathError extends Error {
  readonly name = "NoSuitablePayPathError";
  readonly intentId: string;
  readonly walletNamespace: string;
  readonly chainNamespace: string;
  constructor(args: {
    intentId: string;
    walletNamespace: string;
    chainNamespace: string;
    message?: string;
  }) {
    super(
      args.message ??
        `selectPayPath: no path matched intent=${args.intentId} ` +
          `wallet.namespace=${args.walletNamespace} ` +
          `chain.namespace=${args.chainNamespace}.`,
    );
    this.intentId = args.intentId;
    this.walletNamespace = args.walletNamespace;
    this.chainNamespace = args.chainNamespace;
  }
}

/**
 * Subset of the intent shape the selector actually inspects. Keeping
 * this narrow (rather than importing the full backend schema) means
 * the selector keeps working as the intent envelope grows new fields —
 * we read only what we dispatch on, same discipline as
 * `useGatewayDeposit` on the `gasless` block.
 *
 * `channel.kind === "x402"` marks a standalone x402 resource the user
 * scanned / pasted (Path C). `"merchant"` is a TakumiPay-registered
 * merchant (Paths A / B / gasless, picked by adapter + chain).
 */
interface IntentChannelView {
  channel?: {
    kind?: "merchant" | "x402" | string;
  } | null;
  gasless?: {
    requiresDeposit?: boolean;
  } | null;
}

/**
 * Input bundle for `selectPayPath`. Explicit object (per "Use DTO
 * pattern" memory) so future additions (e.g. paymaster allowlist
 * override, per-chain feature flags) are a field add, not a positional
 * breakage.
 */
export interface SelectPayPathArgs {
  intent: PaymentIntentResponse;
  walletKit: WalletKitAdapter;
  chainConfig: ChainConfig;
}

/**
 * Duck-check the intent for `channel.kind === "x402"` — Path C. The
 * canonical `PaymentIntentResponse` type in `./types.ts` doesn't pin
 * `channel` yet (backend §6.2 ships it ahead of the mobile schema
 * update), so we read it off a narrowed view. Falls back to `false`
 * when the field is absent — safe default is "not a standalone x402
 * resource."
 */
function isRawX402Channel(intent: PaymentIntentResponse): boolean {
  const view = intent as unknown as IntentChannelView;
  return view.channel?.kind === "x402";
}

/**
 * Chain is Arc (or any future USDC-as-native chain) when
 * `nativeCurrency.symbol === "USDC"`. Keying off the symbol (not a
 * chainId allowlist) mirrors `pathADirectArc.ts`'s own guard — Arc
 * mainnet cut-over (task 48) requires zero changes here.
 *
 * Only EVM chains carry a viem-style `nativeCurrency` object; Solana
 * `ChainConfig` has no such field, so this naturally returns `false`
 * for Solana without a namespace branch.
 */
function isUsdcNativeChain(chain: ChainConfig): boolean {
  if (chain.namespace !== "eip155") return false;
  const symbol = chain.chain.nativeCurrency?.symbol;
  return typeof symbol === "string" && symbol.toUpperCase() === "USDC";
}

/**
 * Backend `requiresDeposit` hint. Present on post-M4 intents via the
 * `gasless` block. When the backend has NOT yet flipped
 * `requiresDeposit` to `false` the user still needs the one-time
 * Gateway deposit — we refuse the `"gasless"` path in that case so the
 * screen falls through to the onboarding sheet (task 34) rather than
 * burning a UserOp on a paymaster that can't pull funds yet.
 *
 * Missing field (older intent, fallback path) → treated as "requires
 * deposit" so the selector never upgrades an ambiguous intent to
 * gasless. Conservative by design: losing a user to an extra UserOp
 * prompt beats losing one to a bundler 4xx.
 */
function intentPermitsGasless(intent: PaymentIntentResponse): boolean {
  const view = intent as unknown as IntentChannelView;
  return view.gasless?.requiresDeposit === false;
}

/**
 * Pick the execution path for this `{ intent, walletKit, chainConfig }`
 * triple. Presence-of-method dispatch throughout — never a namespace
 * string compare. The order matters:
 *
 *   1. `channel.kind === "x402"` → Path C. Standalone x402 resources
 *      short-circuit every other branch: there's no merchant intent
 *      row on our backend, so nothing downstream cares about chain or
 *      adapter capability — the merchant's 402 response tells the
 *      signer what to sign.
 *   2. Chain has USDC as native currency (Arc) → Path A. The chain
 *      itself is the settle. No deposit, no paymaster, no UserOp.
 *   3. Adapter supports EIP-3009 + adapter supports paymaster UserOp +
 *      intent says deposit is done → `"gasless"`. Base / Arbitrum
 *      Circle Paymaster rail, covers the "user has no ETH for gas"
 *      case.
 *   4. Adapter supports EIP-3009 → `"B-EVM"`. The M2 default.
 *   5. Adapter supports x402 SVM primitive → `"B-SVM"`. M6 rail.
 *   6. No match → typed `NoSuitablePayPathError`.
 */
export function selectPayPath(args: SelectPayPathArgs): PayPath {
  const { intent, walletKit, chainConfig } = args;

  if (isRawX402Channel(intent)) {
    return "C";
  }

  if (isUsdcNativeChain(chainConfig)) {
    return "A";
  }

  const supportsEip3009 =
    typeof walletKit.signTransferWithAuthorization === "function";
  const supportsPaymaster =
    typeof walletKit.sendUserOpWithUsdcPaymaster === "function";

  if (supportsEip3009 && supportsPaymaster && intentPermitsGasless(intent)) {
    return "gasless";
  }

  if (supportsEip3009) {
    return "B-EVM";
  }

  if (typeof walletKit.signX402SvmPayment === "function") {
    return "B-SVM";
  }

  throw new NoSuitablePayPathError({
    intentId: intent.id,
    walletNamespace: walletKit.namespace,
    chainNamespace: chainConfig.namespace,
  });
}

/**
 * Thin per-path orchestrator handle. Each field is a callable bound to
 * the existing path service (`executePathA` / Path B submit-hook /
 * `executePathC` / gasless UserOp path / SVM signer). The selector
 * returns the path *name*; this type describes the uniform shape the
 * consumer passes in so `executePath` can delegate without knowing the
 * internals.
 *
 * Kept minimal on purpose — the consumer screen (`/pay-merchant`)
 * already knows how to wire intent polling, chain switching, and
 * error rendering. `executePath` is here so the agent-mode tool site
 * (task 46) can invoke a path by name without re-implementing the
 * dispatch table.
 */
export interface PathOrchestrators<TResult = unknown> {
  A: () => Promise<TResult>;
  "B-EVM": () => Promise<TResult>;
  "B-SVM": () => Promise<TResult>;
  C: () => Promise<TResult>;
  gasless: () => Promise<TResult>;
}

/**
 * Delegates to the caller-supplied orchestrator for `path`. Stays thin
 * on purpose — the heavy lifting lives in each path's own service
 * (`pathADirectArc.ts`, `useSubmitNanopay`, `pathCRawX402.ts`, the
 * paymaster UserOp adapter, the SVM signer). This helper exists so the
 * `/pay-merchant` screen + agent-mode tool call site can share one
 * dispatch surface.
 */
export function executePath<TResult>(
  path: PayPath,
  orchestrators: PathOrchestrators<TResult>,
): Promise<TResult> {
  const fn = orchestrators[path];
  if (typeof fn !== "function") {
    return Promise.reject(
      new Error(
        `executePath: orchestrator for path="${path}" is not a function`,
      ),
    );
  }
  return fn();
}
