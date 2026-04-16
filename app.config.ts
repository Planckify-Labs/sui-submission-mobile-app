import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const getBundleId = () => {
  if (IS_DEV) return "com.planckify.takumiwallet.dev";
  if (IS_PREVIEW) return "com.planckify.takumiwallet.preview";
  return "com.planckify.takumiwallet";
};

const getAppName = () => {
  if (IS_DEV) return "Takumi Wallet (Dev)";
  if (IS_PREVIEW) return "Takumi Wallet (Preview)";
  return "Takumi Wallet";
};

const getScheme = () => {
  if (IS_DEV) return "takumiwallet-dev";
  if (IS_PREVIEW) return "takumiwallet-preview";
  return "takumiwallet";
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: getAppName(),
  slug: "takumiwallet",
  version: "2.0.0",
  orientation: "portrait",
  icon: "./assets/images/takumipay-logo.png",
  scheme: getScheme(),
  userInterfaceStyle: "automatic",
  jsEngine: "hermes",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    jsEngine: "hermes",
    bundleIdentifier: getBundleId(),
    icon: {
      light: "./assets/icons/light.png",
      dark: "./assets/icons/dark.png",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#f5f6f9",
    },
    jsEngine: "hermes",
    edgeToEdgeEnabled: true,
    package: getBundleId(),
    permissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
    ],
  },
  web: {
    bundler: "metro",
    output: "server",
    favicon: "./assets/images/takumipay-no-bg.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-camera",
      {
        image: "./assets/images/takumipay-logo.png",
        imageWidth: 100,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#f5f6f9",
        image: "./assets/images/splash-icon-light.png",
        dark: {
          image: "./assets/images/splash-icon-dark.png",
          backgroundColor: "#000000",
        },
        light: {
          image: "./assets/images/splash-icon-light.png",
          backgroundColor: "#f5f6f9",
        },
        imageWidth: 150,
      },
    ],
    "expo-secure-store",
    [
      "expo-web-browser",
      {
        experimentalLauncherActivity: true,
      },
    ],
    "expo-font",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme:
          "com.googleusercontent.apps.744419386674-851aigcjotu3nakge5l3drbk9dpij9ah",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true,
  },
  owner: "cstralpt",
  extra: {
    router: {},
    eas: {
      projectId: "b9724893-72a7-440c-98a9-950ff3537f30",
    },
  },
});
