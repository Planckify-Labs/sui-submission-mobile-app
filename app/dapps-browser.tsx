import React, { useCallback, useMemo, useRef, useState } from "react";
import { Keyboard, StatusBar, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import BrowserAddressBar from "@/components/dapps-browser/BrowserAddressBar";
import BrowserNavigationControls from "@/components/dapps-browser/BrowserNavigationControls";
import DAppsHub from "@/components/dapps-browser/DAppsHub";
import { useNavigationReady } from "@/hooks/useNavigationReady";
import { useWallet } from "@/hooks/useWallet";
import { ApprovalHost } from "@/services/bridge/ApprovalHost";
import { bootBridge } from "@/services/bridge/boot";
import { ChainAdapterRegistry } from "@/services/chains/registry";
import type { AdapterContext } from "@/services/chains/types";
import { getAccountForWallet } from "@/services/walletService";

interface TBrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  isSecure: boolean;
}

export default function DappsBrowser() {
  const ready = useNavigationReady();
  const {
    activeWallet,
    wallets,
    setActiveWallet,
    activeChain,
    changeActiveChain,
  } = useWallet();
  const webViewRef = useRef<WebView>(null);
  const addressBarRef = useRef<TextInput>(null);
  const [addressBarText, setAddressBarText] = useState("");
  const [showHub, setShowHub] = useState(true);
  const [isAddressBarAutoFocus, setIsAddressBarAutoFocus] = useState(false);
  const [browserState, setBrowserState] = useState<TBrowserState>({
    url: "",
    title: "Web3 Ecosystem Hub",
    canGoBack: false,
    canGoForward: false,
    loading: false,
    isSecure: true,
  });

  const ctxRef = useRef<AdapterContext>({
    activeWallet: null,
    wallets: [],
    setActiveWallet: () => {},
    getAccount: getAccountForWallet,
  });
  ctxRef.current = {
    activeWallet: activeWallet && activeWallet.address ? activeWallet : null,
    wallets,
    setActiveWallet,
    getAccount: getAccountForWallet,
  };

  const bridge = useMemo(
    () =>
      bootBridge({
        getContext: () => ctxRef.current,
        getWebView: () => webViewRef.current,
        resolveEvmChain: (ctx) => ({
          chain: activeChain.chain,
          rpcUrl:
            activeChain.chain.rpcUrls?.default?.http?.[0] ??
            activeChain.chain.rpcUrls?.public?.http?.[0] ??
            "",
        }),
        onSwitchChain: async (chainId) => {
          await changeActiveChain(chainId);
        },
      }),
    // Re-binding fires on wallet/chain change so the bridge always has a live
    // context reference; the inner state guards against double-boot.
    [activeChain, changeActiveChain],
  );

  const formatUrl = useCallback((input: string): string => {
    const trimmed = input.trim();
    if (!trimmed.includes(".") || trimmed.includes(" ")) {
      return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }, []);

  const navigateToUrl = useCallback(
    (url: string) => {
      const formatted = formatUrl(url);
      setAddressBarText(formatted);
      setShowHub(false);
      setBrowserState((prev) => ({ ...prev, url: formatted, loading: true }));
      webViewRef.current?.stopLoading();
      webViewRef.current?.injectJavaScript(
        `window.location.href = '${formatted}';`,
      );
      Keyboard.dismiss();
    },
    [formatUrl],
  );

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;

      // Diagnostic channel — injected script pipes state back here so we
      // can see it in Metro logs without needing remote WebView devtools.
      const type = (parsed as { type?: string }).type;
      if (type === "takumi_diagnostic") {
        console.log("[takumi-diagnostic]", parsed);
        return;
      }
      if (type === "takumi_console") {
        const c = parsed as {
          level?: "log" | "warn" | "error";
          args?: unknown[];
        };
        const args = c.args ?? [];
        if (c.level === "error") console.error("[webview]", ...args);
        else if (c.level === "warn") console.warn("[webview]", ...args);
        else console.log("[webview]", ...args);
        return;
      }

      // Attach the current URL as origin; the dApp doesn't set this itself.
      (parsed as Record<string, unknown>).origin = {
        url: browserState.url,
        title: browserState.title,
      };
      void bridge.dispatch(parsed);
    },
    [bridge, browserState.title, browserState.url],
  );

  const injectedJavaScript = useMemo(() => {
    const adapters = ChainAdapterRegistry.list();
    if (adapters.length === 0) return "true;";
    return `${adapters.map((a) => a.getInjectedScript(ctxRef.current)).join("\n")}\ntrue;`;
    // Rebuild when the active wallet/chain changes so the injected state
    // matches what the new adapter context sees.
  }, [activeWallet?.address, activeChain?.chain?.id]);

  const handleNavigate = useCallback(
    (navState: {
      url: string;
      title?: string;
      canGoBack: boolean;
      canGoForward: boolean;
      loading: boolean;
    }) => {
      setBrowserState((prev) => ({
        ...prev,
        url: navState.url,
        title: navState.title ?? prev.title,
        canGoBack: navState.canGoBack,
        canGoForward: navState.canGoForward,
        loading: navState.loading,
        isSecure: navState.url.startsWith("https://"),
      }));
      setAddressBarText(navState.url);
      bridge.onNavigate(navState.url, navState.title);
    },
    [bridge],
  );

  React.useEffect(() => {
    if (isAddressBarAutoFocus && addressBarRef.current) {
      addressBarRef.current.focus();
      setIsAddressBarAutoFocus(false);
    }
  }, [isAddressBarAutoFocus]);

  if (!ready) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#f5f6f9" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f6f9" />
      <View className="flex-1">
        <BrowserAddressBar
          addressBarText={addressBarText}
          onChangeText={setAddressBarText}
          onSubmitEditing={() => navigateToUrl(addressBarText)}
          addressBarRef={addressBarRef}
        />
        {showHub ? (
          <DAppsHub onNavigateToDapp={navigateToUrl} />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: browserState.url }}
            onMessage={handleMessage}
            // UA suffix so dApps that fall back to user-agent sniffing (or
            // want to branch on "in-app wallet browser") can detect us by
            // matching /TakumiWallet/.
            applicationNameForUserAgent="TakumiWallet/1.0"
            // Inject BEFORE the page's own scripts run. `injectedJavaScript`
            // fires after load, which is too late for EIP-6963 — dApps have
            // already dispatched `eip6963:requestProvider` during startup
            // and decided nobody answered. Running pre-load guarantees our
            // `window.ethereum` and 6963 listener are in place when the
            // dApp's bundle wakes up.
            injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
            injectedJavaScriptForMainFrameOnly={false}
            // Also replay on every DOM load — SPAs with client-side routing
            // don't re-inject the pre-content script between route changes,
            // and our provider script is idempotent (guarded by
            // `window.__takumi_evm_installed`).
            injectedJavaScript={injectedJavaScript}
            onLoadStart={() =>
              setBrowserState((p) => ({ ...p, loading: true }))
            }
            onLoadEnd={() => {
              setBrowserState((p) => ({ ...p, loading: false }));
              // Active re-injection of the full provider + announce +
              // diagnostic bundle. `injectedJavaScriptBeforeContentLoaded`
              // is racy on Android (evaluateJavascript inside
              // onPageStarted); this guarantees every page load gets a
              // deterministic injection from the RN side. The provider
              // script's `__takumi_evm_installed` guard makes it safe to
              // re-run against an already-installed page.
              webViewRef.current?.injectJavaScript(
                `${injectedJavaScript}\ntrue;`,
              );
            }}
            onNavigationStateChange={handleNavigate}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            scalesPageToFit
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsBackForwardNavigationGestures
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            androidLayerType="hardware"
            setSupportMultipleWindows={false}
            cacheEnabled
            cacheMode="LOAD_DEFAULT"
            className="flex-1"
          />
        )}
        {!showHub && (
          <BrowserNavigationControls
            browserState={browserState}
            onGoBack={() =>
              browserState.canGoBack && webViewRef.current?.goBack()
            }
            onGoForward={() =>
              browserState.canGoForward && webViewRef.current?.goForward()
            }
            onSearch={() => setIsAddressBarAutoFocus(true)}
            onRefresh={() => webViewRef.current?.reload()}
            onHome={() => {
              setShowHub(true);
              setAddressBarText("");
              setBrowserState({
                url: "",
                title: "Web3 Ecosystem Hub",
                canGoBack: false,
                canGoForward: false,
                loading: false,
                isSecure: true,
              });
            }}
          />
        )}
      </View>
      <ApprovalHost />
    </SafeAreaView>
  );
}
