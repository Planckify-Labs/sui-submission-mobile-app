/**
 * `services/push/index.ts` — FCM / APNs push client for PAID_OUT receipts.
 *
 * Spec: `docs/umkm-usdc-payout-spec.md` §6.3 (webhook → push), §8.3
 * (deep-link contract), §8.5 (linking config). Task 32.
 *
 * Shape:
 *   - `registerForPushNotifications()` — idempotent; requests permission,
 *     obtains the Expo push token, POSTs it to `v1/users/me/push-token`.
 *     If the backend endpoint isn't implemented yet (404), we log and
 *     bail — this task ships the client half; the server half is
 *     orthogonal (task 50 / backend team).
 *   - `usePushNotificationHandler()` — installs two global listeners:
 *       1. foreground receive: if `data.intentId` is present, invalidate
 *          the intent query so the polling screen refreshes instantly
 *          instead of waiting for the 3 s interval.
 *       2. tap (background / killed): if `data.intentId` is present,
 *          deep-link to the receipt screen per §8.5 #1.
 *
 * Three-role separation (memory `feedback_role_separation.md`): the
 * wallet never signs for pushes. The server sends; we receive and
 * refresh. Do not log `data.signature | data.nonce | data.amount` —
 * the spec forbids routing sensitive fields through push payloads.
 *
 * Graceful degradation: every step here fails-closed with a log. Missing
 * permissions, missing backend endpoint, missing Android channel — the
 * app keeps working, the user just doesn't see the push banner.
 *
 * Chain-extension discipline (memory `feedback_chain_extension_discipline.md`):
 * the deep-link is namespace-agnostic. `intentId` is all the receipt
 * needs — the intent carries its own chain discriminator.
 */

import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { HTTPError } from "ky";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "@/constants/configs/ky";
import { usePaymentIntentInvalidator } from "@/hooks/usePaymentIntentInvalidator";

/**
 * Android 8+ requires every notification to belong to a channel — the
 * OS silently drops notifications that reference a missing channel. We
 * register this at boot (idempotent; safe to call on every cold start)
 * so the server's FCM payload with `channelId: "payouts"` lands.
 */
const ANDROID_PAYOUT_CHANNEL_ID = "payouts";

/**
 * Register the Android notification channel for payout receipts. No-op
 * on iOS (iOS has no channel concept — category/thread IDs are APNs-side).
 */
export async function registerAndroidPayoutChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_PAYOUT_CHANNEL_ID, {
      name: "Payout receipts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#c71c4b",
      description:
        "Notifications when a merchant receives IDR for your payment.",
    });
  } catch (err) {
    console.warn("[push] failed to register Android payout channel:", err);
  }
}

/**
 * Idempotent guard: we only attempt permission + token registration
 * once per app session. The Expo notifications API is itself idempotent,
 * but re-POSTing the token on every screen mount would spam the
 * backend and the logs.
 */
let didRegisterThisSession = false;

/**
 * Request push permission, obtain an Expo push token, and POST it to
 * the backend. Idempotent — safe to call on every app mount.
 *
 * Returns the Expo push token on success, `null` on any failure path
 * (permissions denied, simulator, backend unreachable, endpoint not
 * implemented). Callers should not treat the return value as a gate —
 * this function logs its own failures and the app must keep working.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (didRegisterThisSession) return null;
  didRegisterThisSession = true;

  // Register the channel first — FCM drops messages referencing a
  // missing channel, so this must happen before the first server push.
  await registerAndroidPayoutChannel();

  // Push tokens only work in builds that have the native module linked
  // (dev-client or standalone). Bail cleanly on Expo Go — simulators
  // will naturally throw at `getExpoPushTokenAsync` below and fall
  // into the catch. One log line on a dev box is fine; we don't need
  // to hard-detect "this is a simulator".
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    console.log("[push] skipping registration in Expo Go");
    return null;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") {
      console.log("[push] permission not granted:", status);
      return null;
    }

    // `getExpoPushTokenAsync` pairs the device with Expo's push relay
    // for dev / preview builds. Production EAS builds with APNs/FCM
    // certs in place still work — Expo forwards to the native service.
    const tokenRes = await Notifications.getExpoPushTokenAsync();
    const token = tokenRes.data;
    if (!token) {
      console.warn("[push] getExpoPushTokenAsync returned empty");
      return null;
    }

    await postPushToken(token);
    return token;
  } catch (err) {
    console.warn("[push] registerForPushNotifications threw:", err);
    return null;
  }
}

/**
 * POST the Expo push token to the backend. Graceful-degradation: a 404
 * (endpoint not deployed yet) or network failure logs and returns.
 * Matches §6.3's "register once per device; server dedupes by token".
 */
async function postPushToken(token: string): Promise<void> {
  try {
    await api
      .post("v1/users/me/push-token", {
        json: {
          token,
          platform: Platform.OS,
          // Client reports its own delivery channel name so the server
          // can route `channelId` in the FCM payload without hard-
          // coding the enum.
          androidChannelId:
            Platform.OS === "android" ? ANDROID_PAYOUT_CHANNEL_ID : undefined,
        },
      })
      .json();
    console.log("[push] token registered with backend");
  } catch (err) {
    // `ky` throws `HTTPError` on non-2xx; our ky wrapper also throws
    // `ApiHttpError` with a `.response.status`. Treat 404 as "backend
    // not ready" so QA and the user don't see a crash.
    const status =
      err instanceof HTTPError
        ? err.response.status
        : (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      console.log(
        "[push] backend /v1/users/me/push-token not deployed yet — skipping",
      );
      return;
    }
    console.warn("[push] failed to register token with backend:", err);
  }
}

/** Shape of the `data` payload we expect from server-sent PAID_OUT pushes. */
interface PayoutPushData {
  intentId?: string;
  // Display fields (safe to show in banner / log); the server never
  // includes signature / nonce / Circle internals per §6.3.
  merchantDisplayName?: string;
  fiatAmountMinor?: number;
  fiatCurrency?: string;
}

function readPayoutData(
  notification: Notifications.Notification,
): PayoutPushData | null {
  const raw = notification.request.content.data;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.intentId !== "string" || data.intentId.length === 0) {
    return null;
  }
  return {
    intentId: data.intentId,
    merchantDisplayName:
      typeof data.merchantDisplayName === "string"
        ? data.merchantDisplayName
        : undefined,
    fiatAmountMinor:
      typeof data.fiatAmountMinor === "number"
        ? data.fiatAmountMinor
        : undefined,
    fiatCurrency:
      typeof data.fiatCurrency === "string" ? data.fiatCurrency : undefined,
  };
}

/**
 * Install foreground receive + tap handlers. Must be mounted once at
 * the top of the component tree (app/_layout.tsx) — listeners are
 * global, adding them per-screen would fire the invalidator N times.
 */
export function usePushNotificationHandler(): void {
  const invalidateIntent = usePaymentIntentInvalidator();

  useEffect(() => {
    // Foreground receive — the OS banner still shows (per
    // `initNotificationHandlers` in `services/notifications/handlers.ts`,
    // which sets `shouldShowBanner: true`). We additionally invalidate
    // the intent query so any open receipt screen refreshes instantly
    // without waiting for the 3 s poll interval.
    const receiveSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = readPayoutData(notification);
        if (!data?.intentId) return;
        invalidateIntent(data.intentId);
      },
    );

    // Tap (background / killed) — navigate to the receipt deep link.
    // Expo Router typed-routes doesn't always know about
    // `/pay-merchant/receipt` during early builds, so we cast via
    // `as never` the same way `app/pay-merchant.tsx` does for
    // `/pay-merchant`.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = readPayoutData(response.notification);
        if (!data?.intentId) return;
        try {
          router.push({
            pathname: "/pay-merchant/receipt" as never,
            params: { intentId: data.intentId },
          });
        } catch (err) {
          // Fall back to the base /pay-merchant screen if the receipt
          // nested route isn't registered yet — it still renders the
          // PaidCard from the M2 path when intent.status is terminal.
          console.warn(
            "[push] receipt route not available, falling back:",
            err,
          );
          try {
            router.push({
              pathname: "/pay-merchant" as never,
              params: { intentId: data.intentId },
            });
          } catch (fallbackErr) {
            console.warn("[push] fallback deep-link also failed:", fallbackErr);
          }
        }
      },
    );

    return () => {
      receiveSub.remove();
      responseSub.remove();
    };
  }, [invalidateIntent]);
}
