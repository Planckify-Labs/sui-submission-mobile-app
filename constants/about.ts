/**
 * TWV-2026-065 — Publishable metadata for the About screen.
 *
 * Every value in this file is user-visible. Updates to the signing-cert
 * fingerprints MUST be reviewed by the security team — the whole point
 * of displaying them is to let users compare against the OS report, so
 * a drift here is a credibility incident.
 *
 * Companion docs:
 *   - docs/wallet-security-task/64_distribution_discipline_twv065_istaken_true.md
 *   - docs/distribution-discipline.md
 */

export type BuildProfile = "production" | "preview" | "development";

export interface SigningCertFingerprint {
  /** What the user would see in the Apple / Play stores. */
  label: string;
  /** Lowercase hex, colon-separated per OS convention. */
  sha256: string;
}

export interface AboutBuildMeta {
  iosBundleId: string;
  androidPackage: string;
  /**
   * Expected SHA-256 of the iOS app-signing certificate AND the Android
   * signing key. Users can open Settings → General → About (iOS) or the
   * Play Store listing to verify the fingerprint that the OS reports
   * matches what we publish here. Mismatch means the binary was not
   * signed by us.
   */
  signingCert: {
    ios: SigningCertFingerprint;
    android: SigningCertFingerprint;
  };
}

const PLACEHOLDER_SHA256 =
  "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:" +
  "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00";

/**
 * One entry per build profile. Dev/preview values are intentionally
 * different so a user can tell "official App Store build" apart from
 * a developer / internal preview.
 *
 * NOTE: the real fingerprints must be filled in by the security team
 * once the production signing pipeline lands. The `PLACEHOLDER_SHA256`
 * marker means "not yet populated" — the About screen surfaces that
 * status so we never ship a build claiming a bogus fingerprint.
 */
export const BUILD_META: Record<BuildProfile, AboutBuildMeta> = {
  production: {
    iosBundleId: "com.planckify.takumiwallet",
    androidPackage: "com.planckify.takumiwallet",
    signingCert: {
      ios: {
        label: "iOS Distribution (App Store)",
        sha256: PLACEHOLDER_SHA256,
      },
      android: {
        label: "Android Upload / Play App Signing",
        sha256: PLACEHOLDER_SHA256,
      },
    },
  },
  preview: {
    iosBundleId: "com.planckify.takumiwallet.preview",
    androidPackage: "com.planckify.takumiwallet.preview",
    signingCert: {
      ios: {
        label: "iOS Preview",
        sha256: PLACEHOLDER_SHA256,
      },
      android: {
        label: "Android Preview",
        sha256: PLACEHOLDER_SHA256,
      },
    },
  },
  development: {
    iosBundleId: "com.planckify.takumiwallet.dev",
    androidPackage: "com.planckify.takumiwallet.dev",
    signingCert: {
      ios: {
        label: "iOS Development",
        sha256: PLACEHOLDER_SHA256,
      },
      android: {
        label: "Android Development (debug keystore)",
        sha256: PLACEHOLDER_SHA256,
      },
    },
  },
};

export interface OfficialLinks {
  /** `null` when not yet available on that platform. */
  appStore: string | null;
  playStore: string;
  website: string;
  /** Verified social accounts keyed by platform. */
  socials: Record<string, string>;
}

/**
 * Single source of truth for official URLs. Support docs must reference
 * this file rather than inline URLs so the lookup stays canonical.
 *
 * NOTE: iOS App Store is `null` until Takumi ships on iOS — the About
 * screen renders "Coming soon" instead of a dead link. Flip to the
 * real slug when the App Store listing goes live.
 */
export const OFFICIAL_LINKS: OfficialLinks = {
  appStore: null,
  playStore:
    "https://play.google.com/store/apps/details?id=com.planckify.takumiwallet",
  website: "https://takumiaiwallet.xyz",
  socials: {
    X: "https://x.com/takumiwallet",
    Instagram: "https://www.instagram.com/takumi_wallet/",
    TikTok: "https://www.tiktok.com/@takumi_wallet",
  },
};

/**
 * Warning shown verbatim on the About screen. Users who land here
 * because they are checking "is this the real app" need to see this
 * copy above the fold.
 */
export const DISTRIBUTION_WARNING =
  "Never download a TakumiPay desktop or browser component from " +
  "search results, paid ads, or a link sent in chat. The only " +
  "official distribution channels are listed above. If a site claims " +
  "to host a Takumi installer, it is not us.";

/**
 * True when the SHA-256 placeholder is still in place for the given
 * profile. The About screen uses this to show a "not yet verified"
 * notice instead of a bogus fingerprint — better to surface the gap
 * than to claim a fingerprint that does not match reality.
 */
export function isPlaceholderFingerprint(sha256: string): boolean {
  return sha256 === PLACEHOLDER_SHA256;
}
