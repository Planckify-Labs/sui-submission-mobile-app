/**
 * Public surface for `services/paymentIntent`.
 *
 * Concrete detectors (walletAddress, walletUri, EMVCo, TakumiPay JWS,
 * x402) land in tasks 02–06 and register themselves via `register(...)`
 * in a boot file. The scan-to-pay router (task 07) consumes only
 * `classify()` from here.
 */

export { classify } from "./classify.ts";
export type { DetectContext, Detector } from "./detectorRegistry.ts";
export { register } from "./detectorRegistry.ts";
export {
  type NavParams,
  type SwitchToScannedTargetResult,
  switchToScannedTarget,
} from "./switchToScannedTarget.ts";
export type { PayChannel, PaymentIntent, RawScan } from "./types.ts";
