/**
 * Barrel re-export for payment-intent detectors.
 *
 * Importing this file is the boot step that registers every detector
 * with the shared registry (each detector module calls `register(...)`
 * as a module-load side effect — see `walletAddress.ts`). The router
 * in task 07 imports this barrel once, then calls `classify()`.
 *
 * Subsequent detector tasks append their exports here (wallet URI,
 * EMVCo QRIS, TakumiPay JWS, x402) — never branch on namespace in a
 * shared file (memory `feedback_chain_extension_discipline.md`).
 */

export { qrisDetector } from "./qris.ts";
export { takumipayJwsDetector } from "./takumipayJws.ts";
export { walletAddressDetector } from "./walletAddress.ts";
export { walletUriDetector } from "./walletUri.ts";
export { x402Detector } from "./x402.ts";
