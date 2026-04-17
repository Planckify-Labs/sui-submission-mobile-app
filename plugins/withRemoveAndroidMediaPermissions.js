// TWV-PLAY-2026 — strip photo/video permissions merged in transitively
// by `expo-screen-capture` (which declares `READ_MEDIA_IMAGES` for the
// Android screenshot-detection listener). The wallet uses
// `preventScreenCaptureAsync` (FLAG_SECURE, no permission required) on
// both platforms and `addScreenshotListener` on iOS only — see
// `services/security/screenshotGuard.ts` — so the Android READ_MEDIA_*
// declarations are dead weight and fail Google Play's photo-and-video
// permissions policy review.
//
// This plugin injects `tools:node="remove"` markers during prebuild so
// the manifest merger drops the permissions from the final AAB.

const { withAndroidManifest } = require("expo/config-plugins");

const TOOLS_NS_URI = "http://schemas.android.com/tools";

const PERMISSIONS_TO_REMOVE = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
];

module.exports = function withRemoveAndroidMediaPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = TOOLS_NS_URI;
    }

    manifest["uses-permission"] = manifest["uses-permission"] || [];

    for (const name of PERMISSIONS_TO_REMOVE) {
      const already = manifest["uses-permission"].find(
        (p) =>
          p?.$?.["android:name"] === name && p?.$?.["tools:node"] === "remove",
      );
      if (already) continue;
      manifest["uses-permission"].push({
        $: {
          "android:name": name,
          "tools:node": "remove",
        },
      });
    }

    return cfg;
  });
};
