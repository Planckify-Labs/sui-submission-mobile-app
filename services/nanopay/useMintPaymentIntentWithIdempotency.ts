/**
 * `useMintPaymentIntentWithIdempotency` — thin wrapper over
 * `useCreateIntent` (task 17) that owns the client-side idempotency
 * key the agent-mode integration slot (task 46) relies on.
 *
 * Spec: §8.5 #3 (agent retries of scan-to-pay must not double-create
 * intents; server dedupes on `(userId, merchantId, amountMinor,
 * currency)` within 30 s, and the client also sends a stable
 * `Idempotency-Key` header for the same ask so a retry on a different
 * tuple is still collapsed server-side).
 *
 * Session-scoped state lives in the shared TanStack query cache via
 * `useRQGlobalState` (memory `feedback_avoid_props_drilling`). A
 * **fresh** UUID is minted when the `(merchantQrOrPan, amountIdr)` ask
 * changes; when the same ask re-enters (agent "try again" or the user
 * prompting the same merchant twice), the prior key is **reused** so
 * the backend returns the same `pi_…` id.
 *
 * Three-role separation (memory `feedback_role_separation.md`): this
 * module shapes a request and relays the server's response. It does
 * NOT sign, approve, or submit — the wallet still owns execution via
 * `/pay-merchant?intentId=…`.
 */

import { useCallback } from "react";
import { api } from "@/constants/configs/ky";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import type { CreateIntentRequest, PaymentIntentResponse } from "./types";

/** Query key for the session-scoped idempotency cache. One entry at a time. */
export const MINT_INTENT_IDEMPOTENCY_KEY = [
  "agent",
  "mint-intent-idempotency",
] as const;

/**
 * The cached idempotency record. `askHash` is a cheap structural hash
 * of the last ask so a repeat prompt reuses the UUID. `intentId` is
 * populated once the first mint succeeds — an SSE retry that lands
 * here post-success doesn't re-POST at all, it returns the cached
 * intent id to the agent directly.
 */
export interface MintIntentIdempotencyCache {
  askHash: string | null;
  idempotencyKey: string | null;
  intentId: string | null;
}

const EMPTY_CACHE: MintIntentIdempotencyCache = {
  askHash: null,
  idempotencyKey: null,
  intentId: null,
};

/** Deterministic hash of the ask — same input → same string. */
function hashAsk(merchantQrOrPan: string, amountIdr: number): string {
  return `${merchantQrOrPan.trim()}::${Math.floor(amountIdr)}`;
}

/**
 * UUID v4 via `crypto.randomUUID()` — `react-native-get-random-values`
 * polyfills the Web Crypto API at app boot (`pollyfills.ts`), so this
 * resolves to `expo-crypto.randomUUID` under the hood on device.
 * Falls back to a timestamp/random hybrid only for the vanishingly
 * small window between module load and polyfill registration.
 */
function freshIdempotencyKey(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  return `pi-idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function postMintWithIdempotency(
  body: CreateIntentRequest,
  idempotencyKey: string,
): Promise<PaymentIntentResponse> {
  return api
    .post("v1/pay/intents", {
      json: body,
      headers: { "Idempotency-Key": idempotencyKey },
    })
    .json<PaymentIntentResponse>();
}

export interface MintArgs {
  merchantQrOrPan: string;
  amountIdr: number;
}

export interface MintResult {
  intentId: string;
  reused: boolean;
}

/**
 * Hook surface:
 *
 *   const { mint, reset, snapshot } = useMintPaymentIntentWithIdempotency();
 *   const { intentId, reused } = await mint({
 *     merchantQrOrPan: "0002010102...",
 *     amountIdr: 15000,
 *   });
 *
 * `reset()` is wired to the chat screen's "new conversation" handler so
 * idempotency doesn't leak across sessions.
 */
export function useMintPaymentIntentWithIdempotency() {
  const { data: cacheMaybe, setNewData: setCache } =
    useRQGlobalState<MintIntentIdempotencyCache>({
      queryKey: MINT_INTENT_IDEMPOTENCY_KEY,
      initialData: EMPTY_CACHE,
    });

  const mint = useCallback(
    async ({ merchantQrOrPan, amountIdr }: MintArgs): Promise<MintResult> => {
      if (!merchantQrOrPan.trim()) {
        throw new Error("mintPaymentIntent: merchantQrOrPan is required");
      }
      if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
        throw new Error("mintPaymentIntent: amountIdr must be > 0");
      }

      // `useRQGlobalState`'s generic widens to `T | undefined`; we always
      // seed with `EMPTY_CACHE` so this narrow is safe. Pull a concrete
      // reference here so the rest of the callback stays terse.
      const cache = cacheMaybe ?? EMPTY_CACHE;
      const askHash = hashAsk(merchantQrOrPan, amountIdr);
      const sameAsk = cache.askHash === askHash;

      // Same ask + we already have a successful intent → reuse, skip the
      // network round-trip entirely. The server's own dedupe window is
      // 30 s, but the mobile cache is session-scoped so the agent can
      // reuse even after the window closes.
      if (sameAsk && cache.intentId) {
        return { intentId: cache.intentId, reused: true };
      }

      // Fresh ask → fresh key. Retry of the same ask → reuse prior key
      // (server collapses on the header even if the 30 s tuple window
      // has rolled).
      const idempotencyKey = sameAsk
        ? (cache.idempotencyKey ?? freshIdempotencyKey())
        : freshIdempotencyKey();

      // Stash the key BEFORE the POST so an in-flight abort (user kills
      // the app mid-call) still lets the next attempt reuse the same
      // key on retry.
      setCache({ askHash, idempotencyKey, intentId: null });

      const body: CreateIntentRequest = {
        scannedPayload: merchantQrOrPan,
        fiatAmountMinor: Math.floor(amountIdr),
        currency: "IDR",
      };

      const intent = await postMintWithIdempotency(body, idempotencyKey);

      setCache({ askHash, idempotencyKey, intentId: intent.id });
      return { intentId: intent.id, reused: false };
    },
    [cacheMaybe, setCache],
  );

  const reset = useCallback(() => {
    setCache(EMPTY_CACHE);
  }, [setCache]);

  return { mint, reset, snapshot: cacheMaybe ?? EMPTY_CACHE };
}
