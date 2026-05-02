/**
 * Screenshot / screen-recording prevention for sensitive screens —
 * TWV-2026-023 (SpyAgent-class Android malware and iOS ReplayKit).
 *
 * Two independent refcounts:
 *   - `preventCount` — drives `FLAG_SECURE` (Android) and
 *     `preventScreenCaptureAsync` (iOS, blanks captured frames). Bumped
 *     by every guarded screen, sensitive or otherwise (signature
 *     prompts included — the payload is still a private signing op).
 *   - `alertCount` — drives the iOS `addScreenshotListener` "Never
 *     screenshot this" popup. Bumped only by callers that pass
 *     `alertOnScreenshot: true`. Reserved for true plaintext-secret
 *     reveals (seed phrase, private key) so the alert never surprises
 *     the user on a sign-message card embedded in the agent UI.
 *
 * Every seed / private-key reveal MUST pass `alertOnScreenshot: true`.
 * Sign-message and other approval sheets call the hook with prevention
 * only — see the renderers in `components/dapps-browser/approvals/`.
 */

import * as ScreenCapture from "expo-screen-capture";
import { useEffect } from "react";
import { Alert, Platform } from "react-native";

let preventCount = 0;
let alertCount = 0;
let screenshotSub: ScreenCapture.Subscription | null = null;

const GUARD_KEY = "takumipay-sensitive-screen";

async function engagePrevent(): Promise<void> {
  if (preventCount === 1) {
    try {
      await ScreenCapture.preventScreenCaptureAsync(GUARD_KEY);
      if (Platform.OS === "ios") {
        try {
          await ScreenCapture.enableAppSwitcherProtectionAsync(0.8);
        } catch {
          // Older iOS — best-effort only.
        }
      }
    } catch (e) {
      if (__DEV__) console.warn("[screenshotGuard] engagePrevent failed", e);
    }
  }
}

async function releasePrevent(): Promise<void> {
  if (preventCount === 0) {
    try {
      await ScreenCapture.allowScreenCaptureAsync(GUARD_KEY);
      if (Platform.OS === "ios") {
        try {
          await ScreenCapture.disableAppSwitcherProtectionAsync();
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if (__DEV__) console.warn("[screenshotGuard] releasePrevent failed", e);
    }
  }
}

function engageAlert(): void {
  if (alertCount === 1 && Platform.OS === "ios" && screenshotSub === null) {
    screenshotSub = ScreenCapture.addScreenshotListener(() => {
      Alert.alert(
        "Never screenshot this",
        "Screenshots of your seed phrase or private key defeat " +
          "device encryption. Please delete the screenshot now.",
        [{ text: "OK" }],
      );
    });
  }
}

function releaseAlert(): void {
  if (alertCount === 0 && screenshotSub !== null) {
    screenshotSub.remove();
    screenshotSub = null;
  }
}

/** @internal — exposed for unit tests only. */
export function __resetGuardForTests(): void {
  preventCount = 0;
  alertCount = 0;
  screenshotSub = null;
}

/** @internal — exposed for unit tests only. */
export function __getActiveCountForTests(): number {
  return preventCount;
}

/** @internal — exposed for unit tests only. */
export function __getAlertCountForTests(): number {
  return alertCount;
}

type GuardOptions = {
  /**
   * Attach the iOS screenshot listener that surfaces the "Never
   * screenshot this" alert. Reserve for plaintext seed-phrase /
   * private-key reveals — the alert is jarring on screens that aren't
   * obviously displaying a key (e.g. a sign-message card inside the
   * agent UI).
   */
  alertOnScreenshot?: boolean;
};

/**
 * Prevent screenshots / recordings while the owning component is
 * mounted. Refcounted — outer guards stay active until inner guards
 * release. `active=false` disables the guard (useful for conditional
 * screens that only need protection during specific sub-steps).
 *
 * Pass `{ alertOnScreenshot: true }` ONLY on screens that render a
 * plaintext seed phrase or private key.
 */
export function useScreenshotGuard(
  active: boolean = true,
  options: GuardOptions = {},
): void {
  const alertOnScreenshot = options.alertOnScreenshot === true;
  useEffect(() => {
    if (!active) return;
    preventCount += 1;
    if (alertOnScreenshot) alertCount += 1;
    void engagePrevent();
    engageAlert();
    return () => {
      preventCount = Math.max(0, preventCount - 1);
      if (alertOnScreenshot) alertCount = Math.max(0, alertCount - 1);
      void releasePrevent();
      releaseAlert();
    };
  }, [active, alertOnScreenshot]);
}
