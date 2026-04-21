/**
 * x402 resource-URL detector — see `docs/umkm-usdc-payout-spec.md`
 * §4.3 #2, §4.2 `PayChannel.kind: "x402"`, milestones M1 / M5 (Path C).
 *
 * M1 scope: match the `x402://…` URI scheme only.
 *
 * Task 39 (Path C M5) extends the detector with an OPTIONAL `source`
 * hint threaded through `Detector.detect(raw, ctx?)`. When the caller
 * marks the payload as `source: "paste"`, we ALSO accept plain
 * `https://…` URLs and wrap them as an x402 channel — a user who
 * explicitly pastes a merchant URL has consented to let us probe it.
 *
 * Security rule (§4.3 #2): an HTTPS URL arriving from a **camera scan**
 * must NEVER be silently resolved. Auto-probing a scanned URL turns the
 * scanner into a tracking / phishing oracle — attackers print QR codes
 * that point at attacker-controlled servers, then observe the fetch to
 * de-anonymize the scanner. Paste is explicit user intent; scan is not.
 * Default (`source` omitted) remains `"scan"`-strict: the detector still
 * rejects `https://` when no hint is supplied. Existing callers that
 * don't thread a hint keep their previous behaviour byte-for-byte.
 *
 * Chain-extension discipline (memory
 * `feedback_chain_extension_discipline.md`): this detector only knows
 * URL parsing. It does NOT branch on chain / namespace — the network
 * the payment settles on is chosen by the x402 resource's 402 response
 * (per §5.3) at execution time, not at detection time.
 *
 * Purity: no fetch, no expo, no react. `detect` is sync — the network
 * round-trip to the merchant's 402 challenge is Path C's job
 * (`services/nanopay/pathCRawX402.ts`), not the detector's.
 */

import {
  type DetectContext,
  type Detector,
  register,
} from "../detectorRegistry.ts";
import type { PaymentIntent, RawScan } from "../types.ts";

const X402_SCHEME = "x402:";
const HTTPS_SCHEME = "https:";

/**
 * Normalise a URL string via the WHATWG `URL` parser when the protocol
 * is in `allowedSchemes`. Returns `null` otherwise.
 *
 * We read `url.href` so round-tripping through the parser does the
 * usual normalisations (lower-casing host, collapsing default ports,
 * percent-encoding path segments) without us hand-rolling them.
 */
const parseUrl = (
  raw: string,
  allowedSchemes: ReadonlyArray<string>,
): string | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!allowedSchemes.includes(url.protocol)) return null;
  return url.href;
};

export const x402Detector: Detector = {
  name: "x402",
  /**
   * M1 slot plan (see task 01): TakumiPay JWS 10, **x402 20**,
   * QRIS 30, walletUri 40, walletAddress 50. x402 sits above QRIS
   * because the `x402://` scheme is unambiguous — once we see it
   * there is no reason to keep probing the structured detectors.
   */
  priority: 20,
  detect: (raw: RawScan, ctx?: DetectContext): PaymentIntent | null => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;

    // Always honour `x402://…` (scheme is unambiguous regardless of source).
    const x402Url = parseUrl(trimmed, [X402_SCHEME]);
    if (x402Url !== null) {
      return {
        source: ctx?.source === "paste" ? "paste" : "qr",
        channel: { kind: "x402", resourceUrl: x402Url },
        rawScan: raw,
      };
    }

    // Task 39 / Path C M5: accept `https://…` only when the caller has
    // marked the payload as an explicit paste. See module docstring for
    // the security rationale — NEVER loosen this guard for `"scan"`.
    if (ctx?.source === "paste") {
      const httpsUrl = parseUrl(trimmed, [HTTPS_SCHEME]);
      if (httpsUrl !== null) {
        return {
          source: "paste",
          channel: { kind: "x402", resourceUrl: httpsUrl },
          rawScan: raw,
        };
      }
    }

    return null;
  },
};

register(x402Detector);
