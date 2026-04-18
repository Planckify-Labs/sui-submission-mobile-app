/**
 * Deprecated / disabled.
 *
 * The original intent was to offload BIP-32 / SLIP-10 derivation onto a
 * `react-native-worklets-core` worker thread. In practice the worklet
 * runtime doesn't inject Metro's `require` function, so any
 * `require("@scure/bip32")` etc. inside a worklet body throws
 * "Property 'require' doesn't exist" and we fall back to the main
 * thread on every call — net overhead for zero win.
 *
 * `react-native-quick-crypto` (installed in `pollyfills.ts`) already
 * gives us native JSI speed for every primitive that `@scure/bip32`,
 * `@solana/kit`, and `@solana/webcrypto-ed25519-polyfill` use under
 * the hood (HMAC-SHA-512, secp256k1, Ed25519, SHA-256, PBKDF2). With
 * those natively accelerated on the main thread, the total BIP-32 /
 * SLIP-10 derivation cost is low enough that threading complexity
 * isn't worth it.
 *
 * This file is kept as a stub + export shim so existing imports don't
 * break; the prewarm paths in `walletService.ts` now call the sync
 * functions directly.
 */

export async function warmCryptoWorker(): Promise<void> {
  // No-op. Retained for API compatibility with any caller that still
  // imports this symbol.
}
