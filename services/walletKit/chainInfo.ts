/**
 * Chain-agnostic accessors for `ChainConfig` — single source of truth
 * for "what's this chain's identifier / human-readable label?".
 *
 * Why this exists:
 *   Before these helpers, every screen did
 *   `activeChain.namespace === "eip155" ? activeChain.chain.id : undefined`
 *   (and the equivalent for `.chain.name`). Each of those was an N=1
 *   assumption — when Solana was added, every site silently defaulted to
 *   `undefined` for Solana and only some were audited to add a second
 *   branch. Adding Sui or Bitcoin would repeat the same dance.
 *
 *   With this module, callers ask the kit for its own chain identifier.
 *   New chains register a kit with `getChainId` / `formatChainLabel` hooks
 *   and every site that uses these helpers is correct automatically — no
 *   shared-code edits required.
 *
 * Contract:
 *   - Both helpers are safe to call on any `ChainConfig`. If the kit for
 *     the chain's namespace isn't registered (should not happen in a
 *     booted app; can happen mid-Fast-Refresh), they return a predictable
 *     fallback (`null` / `chain.namespace` string) rather than throwing.
 *   - `getEvmChainId` is a thin convenience for the (currently common)
 *     case of "I need the number that viem wants". It returns `undefined`
 *     for non-EVM chains, matching the previous inline pattern exactly.
 */

import type { ChainConfig } from "@/constants/configs/chainConfig";
import { walletKitRegistry } from "./registry";

/**
 * Returns the chain's native identifier, or `null` if the registered kit
 * doesn't expose one (or no kit is registered for the namespace).
 */
export function getChainId(chain: ChainConfig): number | string | null {
  if (!walletKitRegistry.has(chain.namespace)) return null;
  const kit = walletKitRegistry.get(chain.namespace);
  return kit.getChainId?.(chain) ?? null;
}

/**
 * EVM-typed convenience — returns the viem `chain.id` number, or
 * `undefined` for anything non-EVM. Direct drop-in for call sites doing
 * `activeChain.namespace === "eip155" ? activeChain.chain.id : undefined`.
 */
export function getEvmChainId(chain: ChainConfig): number | undefined {
  const id = getChainId(chain);
  return typeof id === "number" ? id : undefined;
}

/**
 * Human-readable chain label (e.g. `"Ethereum Mainnet"`, `"Solana Mainnet"`).
 * Falls back to the kit's `displayName`, then the raw namespace string.
 */
export function formatChainLabel(chain: ChainConfig): string {
  if (!walletKitRegistry.has(chain.namespace)) return chain.namespace;
  const kit = walletKitRegistry.get(chain.namespace);
  return kit.formatChainLabel?.(chain) ?? kit.displayName ?? chain.namespace;
}

/**
 * Native currency ticker for `chain` — `"ETH"`, `"SOL"`, `"MATIC"`, etc.
 * Returns `null` when the registered kit doesn't expose one. Used by
 * shared surfaces (agent wallet-context builder) that need the symbol
 * without switching on namespace themselves.
 */
export function getNativeSymbol(chain: ChainConfig): string | null {
  if (!walletKitRegistry.has(chain.namespace)) return null;
  const kit = walletKitRegistry.get(chain.namespace);
  return kit.nativeSymbol?.(chain) ?? null;
}

/**
 * Sign-in protocol chain name for a wallet namespace. `eip155` → "Ethereum"
 * (SIWE / EIP-4361), `solana` → "Solana" (SIWS). Used to keep sign-in CTAs
 * ("Sign In With Ethereum" / "Sign in with Solana…") aligned to the active
 * wallet's chain family without screens hard-coding the EVM branch.
 *
 * When `namespace` is missing or unknown, returns "Wallet" — the screen
 * stays readable instead of rendering "Sign in with undefined".
 */
export function getChainFamilyLabel(namespace: string | undefined): string {
  if (!namespace) return "Wallet";
  try {
    const kit = walletKitRegistry.get(namespace as never);
    return kit.displayName ?? capitalize(namespace);
  } catch {
    return capitalize(namespace);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
