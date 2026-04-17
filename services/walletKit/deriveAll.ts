/**
 * `deriveWalletsFromMnemonic` — shared helper that loops over the given
 * namespaces, resolves each namespace's `WalletKitAdapter` via
 * `walletKitRegistry.get(ns)`, and asks the kit to derive a `TWallet`
 * from the same BIP-39 mnemonic. The resulting wallets all share
 * `seedPhrase` (enforced by each kit's `createWalletFromMnemonic`
 * implementation) and preserve input order, so callers that render
 * them (e.g. `bootstrap.ts`, Task 23 create-new, Task 24 multi-chain
 * import) get a stable `[EVM, Solana, …]` sequence.
 *
 * Per spec §14.3 / §14.6:
 *   - One mnemonic for N wallets — callers MUST NOT re-invoke this
 *     with a fresh mnemonic per namespace.
 *   - The caller is responsible for persistence; this helper never
 *     writes to storage.
 *
 * Rules (Task 04 + §14.3):
 *   - No `react` / `react-native` / `viem` imports — this module must
 *     load under the Node test harness.
 *   - Fail closed but allow partial success: if one kit throws
 *     (e.g. a future Sui kit rejects the derivation path), skip that
 *     namespace so EVM / Solana still land. The caller can inspect
 *     the returned array's length vs. the namespace list to detect
 *     partial derivations.
 *   - NEVER log the mnemonic.
 */

import type { TWallet } from "@/constants/types/walletTypes";
import type { Namespace } from "@/services/chains/types";
import { walletKitRegistry } from "./registry";

export async function deriveWalletsFromMnemonic(
  mnemonic: string,
  namespaces: Namespace[],
  nameFor?: (ns: Namespace) => string,
): Promise<TWallet[]> {
  const results: TWallet[] = [];
  for (const ns of namespaces) {
    const kit = walletKitRegistry.get(ns);
    const name = nameFor?.(ns);
    try {
      const wallet = await kit.createWalletFromMnemonic({
        mnemonic,
        name,
      });
      if (wallet) results.push(wallet);
    } catch {
      // Fail closed for this namespace but allow partial success so a
      // future misbehaving kit (e.g. Sui) doesn't block EVM + Solana.
      // Intentionally no logging — the input mnemonic must never reach
      // a console / crash-reporter sink.
    }
  }
  return results;
}
