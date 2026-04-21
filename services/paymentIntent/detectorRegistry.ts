/**
 * Detector registry — see `docs/umkm-usdc-payout-spec.md` §4.5.
 *
 * Adding a new country's QR (e.g. Lao KHQR) or a new wallet-URI scheme is
 * `register(detector)` in the detector's boot file — **no changes** to the
 * scan screen, the router, or `classify.ts`. This is the chain-extension
 * discipline called out in memory
 * `feedback_chain_extension_discipline.md`: shared code stays
 * chain-agnostic, per-chain rules live on the adapter / detector.
 *
 * Priority is numeric — lower runs first. `register()` sorts on insert
 * so boot order does not matter.
 *
 * Task 39 (Path C M5) introduced `DetectContext.source` so individual
 * detectors can tell a scanned payload from an explicitly-pasted one
 * without the shared registry branching on it. Only the x402 detector
 * consumes it today — every other detector ignores it and keeps the
 * same pre-M5 behaviour byte-for-byte.
 */

import type { PaymentIntent, RawScan } from "./types.ts";

/**
 * Optional hint carried through the classifier so security-sensitive
 * detectors (today: x402's `https://` upgrade) can distinguish an
 * unsolicited camera scan from an explicit paste / deep-link. Defaults
 * to `"scan"` when omitted so every existing call site keeps its
 * existing behaviour with no code change required.
 */
export interface DetectContext {
  source?: "scan" | "paste";
}

export interface Detector {
  name: string;
  /** Lower runs first. */
  priority: number;
  /**
   * May be sync or async. Async is required so the TakumiPay JWS detector
   * (task 05) can `await jwtVerify()` against the bundled public key.
   *
   * `ctx` is optional so detector implementations written before task 39
   * don't have to change — callers without a source hint continue to
   * pass nothing. x402's `https://` upgrade is the only consumer.
   */
  detect(
    raw: RawScan,
    ctx?: DetectContext,
  ): Promise<PaymentIntent | null> | PaymentIntent | null;
}

const detectors: Detector[] = [];

export const register = (d: Detector): void => {
  detectors.push(d);
  detectors.sort((a, b) => a.priority - b.priority);
};

export const runAll = async (
  raw: RawScan,
  ctx?: DetectContext,
): Promise<PaymentIntent | null> => {
  for (const d of detectors) {
    const hit = await d.detect(raw, ctx);
    if (hit) return hit;
  }
  return null;
};

/**
 * Test-only helper. Resets the module-private registry so tests do not
 * leak state across files. **Do not call from production code.** Exported
 * with a double-underscore prefix to make misuse obvious in grep.
 */
export const __resetForTest = (): void => {
  detectors.length = 0;
};
