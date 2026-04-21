// Rotate via EAS OTA — same channel as `EIP7702_ALLOWLIST` (see spec §4.4 final paragraph).
import type { JWK } from "jose";

const raw = process.env.EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK;
if (!raw) {
  throw new Error("EXPO_PUBLIC_TAKUMIPAY_QR_PUBKEY_JWK not set");
}

export const publicKeyJwk: JWK = JSON.parse(raw);
