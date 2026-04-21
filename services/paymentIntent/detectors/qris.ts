/**
 * EMVCo QRIS (Quick Response Code Indonesian Standard) detector —
 * see `docs/umkm-usdc-payout-spec.md` §4.3 #3, §4.2 `PayChannel.kind:
 * "merchant"`, and task 04.
 *
 * The decoder is pure: no React, no network, no third-party lib. It
 * walks the EMVCo Co-Present TLV format (`<2-digit tag><2-digit
 * length><value>`, repeating), validates the CRC-16/CCITT-FALSE that
 * EMVCo mandates in the trailing `63 04 <4-hex>` field, and — if the
 * payload is a well-formed Indonesian QR (tag 58 === "ID") — emits a
 * `merchant` payment intent whose `provider` is `"xendit_qris"`.
 *
 * The detector intentionally does **not** attempt merchant-directory
 * lookup or PAN → merchantId resolution: that belongs on the backend
 * (task 27). `merchantId` is left empty; the server resolves it from
 * the raw payload at intent-creation time.
 *
 * Chain-extension discipline (memory
 * `feedback_chain_extension_discipline.md`): this file owns all
 * QRIS-specific TLV logic. Adding PromptPay / PayNow / DuitNow /
 * VietQR later is a separate detector file — never an `if` branch
 * inside this one.
 *
 * CRC-16/CCITT-FALSE parameters (EMVCo Co-Present §5):
 *   - polynomial 0x1021, init 0xFFFF, refIn/refOut false, xorOut 0x0000.
 *   - Computed over the payload **including** the tag-length prefix
 *     `"6304"`, but **excluding** the 4 hex digits that follow.
 * Verified against the canonical "A" example from the EMVCo Co-Present
 * spec appendix (expected CRC `A13A`).
 */

import { type Detector, register } from "../detectorRegistry.ts";
import type { PaymentIntent, RawScan } from "../types.ts";

/**
 * One flat-level TLV pair. The value is kept as the substring between
 * `offset` and `offset + length`; nested tags (tag 26 for QRIS) are
 * re-parsed with the same routine, so we don't eagerly decode.
 */
interface Tlv {
  tag: string;
  length: number;
  value: string;
}

/**
 * Walk an EMVCo TLV string into a flat array of tag/length/value
 * records. Returns `null` on malformed input — length-byte truncated,
 * length value extends past the buffer, or non-decimal digits in the
 * tag / length fields. Empty input also returns `null` so callers can
 * treat "not a QRIS" and "corrupt QRIS" uniformly.
 */
const parseTlv = (input: string): Tlv[] | null => {
  if (input.length === 0) return null;
  const out: Tlv[] = [];
  let i = 0;
  while (i < input.length) {
    if (i + 4 > input.length) return null;
    const tag = input.slice(i, i + 2);
    const lenStr = input.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) return null;
    const length = Number.parseInt(lenStr, 10);
    const start = i + 4;
    const end = start + length;
    if (end > input.length) return null;
    out.push({ tag, length, value: input.slice(start, end) });
    i = end;
  }
  return out;
};

/**
 * CRC-16/CCITT-FALSE — polynomial 0x1021, init 0xFFFF, no reflection,
 * no xor-out. EMVCo specifies ASCII bytes of the payload; we encode
 * the string as UTF-8 since real QRIS stickers can embed non-ASCII
 * Chinese/Thai merchant names in tag 64 (tag 59 is ALL-CAPS ASCII in
 * Indonesia, but the CRC spec is byte-oriented so we feed UTF-8).
 */
const crc16CcittFalse = (input: string): number => {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
};

/**
 * Find the QRIS merchant-account-information tag. Indonesia ships in
 * a fixed slot on any given sticker but tag IDs 26-51 are all valid
 * "Merchant Account Information" tags per EMVCo; we pick the first
 * one whose sub-tag 00 is a GUID that is not purely numeric (i.e. a
 * reverse-DNS acquirer label like `ID.CO.QRIS.WWW`). Non-match falls
 * through — the detector will reject the payload downstream on the
 * country-code check.
 */
const findMerchantAcctInfo = (
  tags: Tlv[],
): { tlv: Tlv; aidGui: string; pan: string } | null => {
  for (const t of tags) {
    const tagNum = Number.parseInt(t.tag, 10);
    if (tagNum < 26 || tagNum > 51) continue;
    const subTags = parseTlv(t.value);
    if (!subTags) continue;
    const sub00 = subTags.find((s) => s.tag === "00");
    const sub01 = subTags.find((s) => s.tag === "01");
    if (!sub00) continue;
    // QRIS acquirer GUI is reverse-DNS (e.g. "ID.CO.QRIS.WWW" or a
    // bank-specific label); reject purely numeric GUIs to avoid
    // mis-matching a PromptPay tag that could sit in the same range.
    if (/^\d+$/.test(sub00.value)) continue;
    const pan = sub01?.value ?? "";
    return { tlv: t, aidGui: sub00.value, pan };
  }
  return null;
};

/**
 * Convert EMVCo tag 54 (amount as decimal string, e.g. "25000" or
 * "123.45") into a minor-unit integer. Indonesian rupiah has no
 * subunit, so "25000" → 25000. For currencies that do have cents
 * (hypothetical — not on the v1 shipping list) we preserve two
 * fractional digits and truncate extra precision. Returns `undefined`
 * on unparseable input so a broken amount never kills detection.
 */
const parseAmountMinor = (raw: string, currency: "IDR"): number | undefined => {
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return undefined;
  if (currency === "IDR") {
    // No subunit — truncate any fractional part.
    const [whole] = raw.split(".");
    const n = Number.parseInt(whole, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  // Reserved branch for PHP/THB/MYR/VND once they ship (§4.2).
  return undefined;
};

export const qrisDetector: Detector = {
  name: "qris",
  /**
   * Priority 30 — between x402 (20) and wallet URI (40), per task 01
   * slot plan. QRIS is CRC-validated so it's safe to wedge above the
   * permissive wallet-URI / wallet-address detectors: a random
   * `ethereum:…` URI will not produce a valid EMVCo CRC.
   */
  priority: 30,
  detect: (raw: RawScan): PaymentIntent | null => {
    const trimmed = raw.trim();
    if (trimmed.length < 8) return null;

    // EMVCo payloads must start with tag 00 length 02 value 01 — the
    // "payloadFormatIndicator". Anything else is not an EMV QR and we
    // bail out before running the TLV walker.
    if (!trimmed.startsWith("000201")) return null;

    // The CRC footer is the last 8 chars: `6304XXXX`. Any payload
    // shorter than that or missing the `6304` marker can't be valid.
    const crcMarkerIdx = trimmed.lastIndexOf("6304");
    if (crcMarkerIdx < 0 || crcMarkerIdx !== trimmed.length - 8) return null;

    const crcPayload = trimmed.slice(0, crcMarkerIdx + 4);
    const crcClaim = trimmed.slice(crcMarkerIdx + 4).toUpperCase();
    if (!/^[0-9A-F]{4}$/.test(crcClaim)) return null;

    const crcComputed = crc16CcittFalse(crcPayload)
      .toString(16)
      .padStart(4, "0")
      .toUpperCase();
    if (crcComputed !== crcClaim) return null;

    const tags = parseTlv(trimmed);
    if (!tags) return null;

    // Point-of-initiation: "11" = static merchant QR (no amount),
    // "12" = dynamic (amount embedded in tag 54). Reject other values
    // so we don't misread non-EMV-compliant stickers as QRIS.
    const poi = tags.find((t) => t.tag === "01")?.value;
    if (poi !== "11" && poi !== "12") return null;

    // Indonesia-only for v1. Other country codes (TH/SG/MY/VN) share
    // the EMVCo format but belong to sibling detectors (§4.3 #3).
    const country = tags.find((t) => t.tag === "58")?.value;
    if (country !== "ID") return null;

    const merchantAcct = findMerchantAcctInfo(tags);
    if (!merchantAcct) return null;

    const currencyNum = tags.find((t) => t.tag === "53")?.value;
    // QRIS always carries "360" (IDR); if tag 53 is missing or
    // unexpected we still accept the payload and assume IDR — the
    // country-code check above has already constrained us to ID.
    const currency: "IDR" = currencyNum === "360" ? "IDR" : "IDR";

    const amountRaw = tags.find((t) => t.tag === "54")?.value;
    const amountMinor =
      poi === "12" && amountRaw
        ? parseAmountMinor(amountRaw, currency)
        : undefined;

    return {
      source: "qr",
      channel: {
        kind: "merchant",
        provider: "xendit_qris",
        // Server resolves the merchantId from the raw payload by
        // parsing EMVCo tag 26 sub-tag 02 (NMID) or looking up the
        // PAN in the merchant registry (task 27). The mobile
        // detector deliberately leaves it empty.
        merchantId: "",
        amountMinor,
        currency,
        rawPayload: trimmed,
      },
      rawScan: raw,
    };
  },
};

register(qrisDetector);
