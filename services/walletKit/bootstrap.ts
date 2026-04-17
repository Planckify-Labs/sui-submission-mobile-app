/**
 * `bootstrapFirstLoginWallets` — auto-mint one `TWallet` per registered
 * kit from a single BIP-39 mnemonic.
 *
 * Per spec §14.3 / §14.6 / F7:
 *   - Called by the login success-path (Task 18) when
 *     `loadWalletsFromStorage()` returns zero wallets, BEFORE
 *     `router.replace("/")` resolves so home has something to render.
 *   - One mnemonic for N wallets. Every returned wallet shares the
 *     same `seedPhrase`. Future §10 `derivationGroupId` linkage (F7)
 *     is not introduced here.
 *   - CSPRNG-only — the mnemonic comes from `generateWalletMnemonic`
 *     (TWV-2026-002). This module does not generate its own entropy.
 *   - Namespace list is pulled from the registry so Sui / Bitcoin kits
 *     register→auto-mint automatically once they land (§14.3 last
 *     bullet). No hard-coded namespaces.
 *   - Idempotent caller contract: this function returns wallets; the
 *     caller (Task 18) decides when / whether to persist via
 *     `walletService.saveWalletsToStorage`.
 *   - No mnemonic display / logging — the auto-mint mnemonic is only
 *     revealed via the settings-flow verify-words step (Task 26 /
 *     future).
 */

import { generateWalletMnemonic } from "@/services/walletService";
import type { Namespace } from "@/services/chains/types";
import type { TWallet } from "@/constants/types/walletTypes";
import { deriveWalletsFromMnemonic } from "./deriveAll";
import { walletKitRegistry } from "./registry";

/**
 * Default name applied to each auto-minted wallet. Keeps the UI stable
 * across namespaces ("Main Wallet · ETH" / "Main Wallet · SOL"). Future
 * namespaces fall back to an uppercase namespace tag until they're
 * added explicitly.
 */
export function defaultWalletNameFor(ns: Namespace): string {
  const label =
    ns === "eip155" ? "ETH" : ns === "solana" ? "SOL" : ns.toUpperCase();
  return `Main Wallet · ${label}`;
}

export async function bootstrapFirstLoginWallets(): Promise<TWallet[]> {
  const mnemonic = generateWalletMnemonic(128);
  const namespaces = walletKitRegistry.getAll().map((k) => k.namespace);
  return deriveWalletsFromMnemonic(mnemonic, namespaces, defaultWalletNameFor);
}
