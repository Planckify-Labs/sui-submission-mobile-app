import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Keyboard, StatusBar, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

// TWV-2026-015 — generate a per-session nonce from the OS CSPRNG via
// the polyfill installed in `pollyfills.ts`. 16 random bytes → 32 hex
// chars; uniqueness across navigations is what matters.
function generateSessionNonce(): string {
  const buf = new Uint8Array(16);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Known third-party log spam that some dApps ship (Datadog RUM double-
// init, pino history restore, Amplitude telemetry retries, etc.) —
// not signals from our bridge, forwarded through the WebView console
// bridge.
//
// We substring-match across ALL joined args (not just args[0]) because
// these libraries often call `console.error("LibName:", "actual message", {extra})`
// — the matchable text is in args[1] or later, not always at index 0.
//
// `CONTEXT_NOISE_PATTERNS` handles pino-style structured log objects
// like `{context: "core/history", level: 50, ...}` where the message
// may be absent (a "follow-up" entry with only context+level+time).
const WEBVIEW_NOISE_PATTERNS: readonly string[] = [
  "DD_RUM is already initialized",
  "Restore will override",
  "WalletConnect Core is already initialized",
  "Amplitude Logger",
  "Failed to fetch remote configuration",
  "Failed to fetch (cca-lite.coinbase.com)",
  "Datadog Browser SDK",
];

const CONTEXT_NOISE_PREFIXES: readonly string[] = ["core/history", "core/rum"];

function serialiseArg(a: unknown): string {
  if (typeof a === "string") return a;
  if (a === null || a === undefined) return "";
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function isWebviewThirdPartyNoise(args: readonly unknown[]): boolean {
  if (args.length === 0) return false;
  const joined = args.map(serialiseArg).join(" ");
  for (const p of WEBVIEW_NOISE_PATTERNS) {
    if (joined.includes(p)) return true;
  }
  // Structured log objects without a msg field — match by context.
  for (const a of args) {
    if (a && typeof a === "object" && !Array.isArray(a)) {
      const ctx = (a as { context?: unknown }).context;
      if (typeof ctx === "string") {
        for (const prefix of CONTEXT_NOISE_PREFIXES) {
          if (ctx.startsWith(prefix)) return true;
        }
      }
    }
  }
  return false;
}

import { mainnet } from "viem/chains";
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
  const { activeWallet, wallets, activeChain, changeActiveChain } = useWallet();
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

  // TWV-2026-015 — per-session nonce. Rotated on every top-frame nav
  // (see `handleNavigate` below). Stamped into the injected provider's
  // closure scope so sub-frame postMessage forgery is rejected by the
  // bridge.
  const [sessionNonce, setSessionNonce] = useState<string>(() =>
    generateSessionNonce(),
  );

  const ctxRef = useRef<AdapterContext>({
    activeWallet: null,
    wallets: [],
    getAccount: getAccountForWallet,
    sessionNonce,
  });
  ctxRef.current = {
    activeWallet: activeWallet && activeWallet.address ? activeWallet : null,
    wallets,
    getAccount: getAccountForWallet,
    sessionNonce,
  };

  const bridge = useMemo(
    () =>
      bootBridge({
        getContext: () => ctxRef.current,
        getWebView: () => webViewRef.current,
        // TODO(task-17): route chain resolution through the kit adapter
        // registry so the Solana bridge signer can mount alongside EVM.
        resolveEvmChain: (ctx) => {
          // Route by REQUEST namespace, not by global UI active chain.
          // The bridge has already routed an EIP-155 request to us; our
          // job is to serve it with a sensible EVM chain. When the UI
          // happens to have a Solana chain active (user flipped into
          // a Solana wallet earlier), we fall back to mainnet — the
          // dApp can `wallet_switchEthereumChain` after connect if it
          // wants a different chain. Returning `null` here forced every
          // EVM `eth_requestAccounts` to fail with 4901 "Chain not
          // connected", even though the user has perfectly good EVM
          // wallets in `ctx.wallets`.
          void ctx;
          if (activeChain.namespace === "eip155") {
            return {
              chain: activeChain.chain,
              rpcUrl:
                activeChain.chain.rpcUrls?.default?.http?.[0] ??
                activeChain.chain.rpcUrls?.public?.http?.[0] ??
                "",
            };
          }
          return {
            chain: mainnet,
            rpcUrl: mainnet.rpcUrls?.default?.http?.[0] ?? "",
          };
        },
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
        // Downgrade known-noisy third-party spam (NOT bridge signal) to
        // log-level. Each pattern below is a library shipped by dApps we
        // don't control, re-initialised by their own code when their
        // app boots or re-boots. They're not actionable from our side.
        //
        // If a pattern here ever hides a real issue, delete the entry —
        // the full message still reaches Metro, just at the right level.
        if (c.level === "error" && isWebviewThirdPartyNoise(args)) {
          console.log("[webview:noise]", ...args);
          return;
        }
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
    // TWV-2026-064 — neutralise the JS fullscreen API BEFORE any dApp
    // script runs. Without this a hostile dApp can `requestFullscreen`
    // and paint a pixel-perfect signer-prompt spoof over the whole
    // screen. Signer UI is rendered as a native RN modal above the
    // WebView (`ApprovalHost`), so a dApp should never need fullscreen
    // anyway. Return a rejected promise so polyfills behave.
    const disableFullscreen = `
      (function() {
        try {
          var reject = function() {
            return Promise.reject(new Error("fullscreen disabled by wallet"));
          };
          var proto = Element && Element.prototype;
          if (proto) {
            proto.requestFullscreen = reject;
            proto.webkitRequestFullscreen = reject;
            proto.mozRequestFullScreen = reject;
            proto.msRequestFullscreen = reject;
          }
          Object.defineProperty(document, "fullscreenEnabled", { get: function(){ return false; } });
          Object.defineProperty(document, "webkitFullscreenEnabled", { get: function(){ return false; } });
        } catch (e) {}
      })();
    `;
    if (adapters.length === 0) return `${disableFullscreen}\ntrue;`;
    return `${disableFullscreen}\n${adapters.map((a) => a.getInjectedScript(ctxRef.current)).join("\n")}\ntrue;`;
    // TWV-2026-015 — `sessionNonce` in the dep list so a fresh nonce
    // (rotated by `handleNavigate`) actually re-renders the script and
    // gets re-injected on the next nav.
  }, [
    activeWallet?.address,
    // TODO(task-17): include non-EVM chain discriminants here too.
    activeChain.namespace === "eip155"
      ? activeChain.chain.id
      : activeChain.cluster,
    sessionNonce,
  ]);

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
      // TWV-2026-015 — rotate the session nonce on every top-frame nav.
      const nextNonce = generateSessionNonce();
      setSessionNonce(nextNonce);
      bridge.setSessionNonce(nextNonce);
    },
    [bridge],
  );

  React.useEffect(() => {
    if (isAddressBarAutoFocus && addressBarRef.current) {
      addressBarRef.current.focus();
      setIsAddressBarAutoFocus(false);
    }
  }, [isAddressBarAutoFocus]);

  // TWV-2026-015 — seed the bridge with the initial nonce on mount so
  // the first page load (before any nav callback fires) is gated too.
  useEffect(() => {
    bridge.setSessionNonce(sessionNonce);
  }, [bridge, sessionNonce]);

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
            // matching /TakumiPay/.
            applicationNameForUserAgent="TakumiPay/1.0"
            // Inject BEFORE the page's own scripts run. `injectedJavaScript`
            // fires after load, which is too late for EIP-6963 — dApps have
            // already dispatched `eip6963:requestProvider` during startup
            // and decided nobody answered. Running pre-load guarantees our
            // `window.ethereum` and 6963 listener are in place when the
            // dApp's bundle wakes up.
            injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
            // TWV-2026-013 — never install the EIP-1193 provider into
            // cross-origin iframes. CVE-2020-6506-class universal-XSS
            // makes any sub-frame an attacker-controlled JS context;
            // restricting injection to the top frame keeps the provider
            // out of their reach.
            injectedJavaScriptForMainFrameOnly={true}
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
            // TWV-2026-064 — video stays inline; dApps cannot take over
            // the full screen to paint a fake signer prompt. The JS
            // fullscreen API is also neutralised (see injection above).
            allowsFullscreenVideo={false}
            mediaPlaybackRequiresUserAction={false}
            allowsBackForwardNavigationGestures
            // TWV-2026-013 — only https. http and file schemes are
            // banned wholesale; mixed content is never loaded.
            originWhitelist={["https://*"]}
            mixedContentMode="never"
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
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
