/**
 * `bootWalletKits` — idempotent registration of all first-party
 * `WalletKitAdapter` implementations into `walletKitRegistry`.
 *
 * Per spec §4.5 / §6.1 / §6.2:
 *   - Called once at process boot from `app/_layout.tsx`, AFTER
 *     `pollyfills.ts` is imported and BEFORE any wallet-touching screen
 *     mounts. Screen dispatch (Tasks 14–16) and the dApp-bridge signer
 *     (Task 17) both assume a populated registry.
 *   - Insertion order is EVM-first — Task 21's `NamespacePicker` relies
 *     on that stable order.
 *   - No conditional registration: every kit available in the codebase
 *     registers unconditionally. Which wallet rows a user has is
 *     orthogonal to which kits the registry knows about.
 */

import { createEvmWalletKit } from "./evm/EvmWalletKit";
import { createSolanaWalletKit } from "./solana/SolanaWalletKit";
import { walletKitRegistry } from "./registry";

let booted = false;

export function bootWalletKits(): void {
  if (booted) return;
  walletKitRegistry.register(createEvmWalletKit());
  // Solana registers here.
  walletKitRegistry.register(createSolanaWalletKit());
  booted = true;
}

/**
 * Test-only reset hook. Not part of the public boot contract — kept off
 * the default export so product code cannot re-boot mid-process.
 */
export function __resetWalletKitBootForTests(): void {
  booted = false;
}
