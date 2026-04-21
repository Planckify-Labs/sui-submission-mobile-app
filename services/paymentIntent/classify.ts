/**
 * Pure classifier — see `docs/umkm-usdc-payout-spec.md` §4.1, §4.3.
 *
 * This module MUST stay pure: no React, no networking, no `fetch`, no
 * `expo-*` imports. It runs under a Node harness in tests. All payload
 * recognition happens via the `detectorRegistry`; this function only
 * drives the loop. Adding a new payload shape is `register(detector)` in
 * a boot file — never a new branch here (chain-extension discipline,
 * memory `feedback_chain_extension_discipline.md`).
 *
 * `classify()` is async because the TakumiPay JWS detector (task 05)
 * needs to `await jwtVerify()` against the bundled public key before it
 * can decide whether a payload belongs to it.
 *
 * Task 39 (Path C M5): an optional `ctx.source` threads through to the
 * detectors — today only the x402 detector consumes it to gate the
 * `https://` upgrade behind explicit paste intent. Callers without a
 * hint keep their pre-M5 behaviour with no code change.
 */

import { type DetectContext, runAll } from "./detectorRegistry.ts";
import type { PaymentIntent, RawScan } from "./types.ts";

export const classify = async (
  raw: RawScan,
  ctx?: DetectContext,
): Promise<PaymentIntent | null> => {
  return runAll(raw, ctx);
};
