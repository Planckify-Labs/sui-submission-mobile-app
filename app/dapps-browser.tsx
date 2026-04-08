import React, { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Keyboard, StatusBar, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { type Hex } from "viem";
import SignMessageModal from "@/components/common/SignMessageModal";
import BrowserAddressBar from "@/components/dapps-browser/BrowserAddressBar";
import BrowserNavigationControls from "@/components/dapps-browser/BrowserNavigationControls";
import DAppsHub from "@/components/dapps-browser/DAppsHub";
import TransactionModal from "@/components/dapps-browser/TransactionModal";
import WalletSelectorModal from "@/components/wallet/WalletSelectorModal";
import { useNavigationReady } from "@/hooks/useNavigationReady";
import { useWallet } from "@/hooks/useWallet";
import {
  ethereumProvider,
  getEthereumProviderScript,
} from "@/services/ethereumProvider";
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
    setActiveWallet,
    getClientForActiveWallet,
    wallets,
    activeWalletIndex,
  } = useWallet();
  const webViewRef = useRef<WebView>(null);
  const addressBarRef = useRef<TextInput>(null);
  const [addressBarText, setAddressBarText] = useState("");
  const [showHub, setShowHub] = useState(true);
  const [browserState, setBrowserState] = useState<TBrowserState>({
    url: "",
    title: "Web3 Ecosystem Hub",
    canGoBack: false,
    canGoForward: false,
    loading: false,
    isSecure: true,
  });
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);
  const [pendingSignRequest, setPendingSignRequest] = useState<any>(null);
  const [showWalletSelection, setShowWalletSelection] = useState(false);
  const [pendingAccountRequest, setPendingAccountRequest] = useState<any>(null);
  const [pendingAccountRequests, setPendingAccountRequests] = useState<any[]>(
    [],
  );

  React.useEffect(() => {
    if (activeWallet) {
      ethereumProvider.setWallet(activeWallet);
    }
  }, [activeWallet]);

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
      const formattedUrl = formatUrl(url);
      setAddressBarText(formattedUrl);
      setShowHub(false);
      setBrowserState((prev) => ({
        ...prev,
        url: formattedUrl,
        loading: true,
      }));
      webViewRef.current?.stopLoading();
      webViewRef.current?.injectJavaScript(
        `window.location.href = '${formattedUrl}';`,
      );
      Keyboard.dismiss();
    },
    [formatUrl],
  );

  const handleAddressSubmit = () => {
    navigateToUrl(addressBarText);
  };

  const handleGoBack = () => {
    if (browserState.canGoBack) {
      webViewRef.current?.goBack();
    }
  };

  const handleGoForward = () => {
    if (browserState.canGoForward) {
      webViewRef.current?.goForward();
    }
  };

  const handleRefresh = () => {
    webViewRef.current?.reload();
  };

  const handleHome = () => {
    setShowHub(true);
    setAddressBarText("");
    setBrowserState((prev) => ({
      ...prev,
      url: "",
      title: "Web3 Ecosystem Hub",
      canGoBack: false,
      canGoForward: false,
      loading: false,
      isSecure: true,
    }));
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === "ethereum_request") {
        handleEthereumRequest(message);
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  };

  const handleEthereumRequest = async (message: any) => {
    const { id, method, params } = message;

    try {
      if (
        method === "eth_requestAccounts" ||
        method === "wallet_requestPermissions"
      ) {
        if (showWalletSelection) {
          setPendingAccountRequests((prev) => [...prev, { id }]);
          return;
        }

        setPendingAccountRequest({ id });
        setShowWalletSelection(true);
        return;
      }

      if (method === "eth_sendTransaction") {
        return new Promise((resolve, reject) => {
          setPendingTransaction(params[0]);

          (global as any)._pendingTransactionResolve = resolve;
          (global as any)._pendingTransactionReject = reject;
        });
      }

      if (method === "personal_sign" || method === "eth_sign") {
        return new Promise((resolve, reject) => {
          setPendingSignRequest({
            message: method === "personal_sign" ? params[0] : params[1],
            type: method,
          });

          (global as any)._pendingSignResolve = resolve;
          (global as any)._pendingSignReject = reject;
        });
      }

      if (method.includes("signTypedData")) {
        return new Promise((resolve, reject) => {
          setPendingSignRequest({
            message: params[0],
            type: method,
            typedData: params[1],
          });

          (global as any)._pendingSignResolve = resolve;
          (global as any)._pendingSignReject = reject;
        });
      }

      const result = await ethereumProvider.request({ method, params });

      const response = {
        id,
        result,
        error: null,
      };

      const responseMessage = JSON.stringify({
        type: "ethereum_response",
        ...response,
      });

      webViewRef.current?.postMessage(responseMessage);

      webViewRef.current?.injectJavaScript(`
        if (window._handleEthereumResponse) {
          window._handleEthereumResponse(${JSON.stringify(response)});
        }
        true; // Required for injectJavaScript
      `);
    } catch (error: any) {
      console.error("Ethereum request error:", error);
      const response = {
        id,
        result: null,
        error: {
          code: -32603,
          message: "Internal error",
        },
      };

      const responseMessage = JSON.stringify({
        type: "ethereum_response",
        ...response,
      });

      webViewRef.current?.postMessage(responseMessage);

      webViewRef.current?.injectJavaScript(`
        if (window._handleEthereumResponse) {
          window._handleEthereumResponse(${JSON.stringify(response)});
        }
        true; // Required for injectJavaScript
      `);
    }
  };

  const handleTransactionApprove = async () => {
    if (!activeWallet || !pendingTransaction) return;

    try {
      const walletClient = getClientForActiveWallet();
      if (!walletClient) {
        throw new Error("Unable to get wallet client");
      }

      const txParams: any = {
        to: pendingTransaction.to as `0x${string}`,
        value: pendingTransaction.value
          ? BigInt(pendingTransaction.value)
          : undefined,
        data: pendingTransaction.data as `0x${string}` | undefined,
        gas: pendingTransaction.gas
          ? BigInt(pendingTransaction.gas)
          : undefined,
      };

      if (
        pendingTransaction.maxFeePerGas &&
        pendingTransaction.maxPriorityFeePerGas
      ) {
        txParams.maxFeePerGas = BigInt(pendingTransaction.maxFeePerGas);
        txParams.maxPriorityFeePerGas = BigInt(
          pendingTransaction.maxPriorityFeePerGas,
        );
      } else if (pendingTransaction.gasPrice) {
        txParams.gasPrice = BigInt(pendingTransaction.gasPrice);
      }

      const hash = await walletClient.sendTransaction(txParams);

      (global as any)._pendingTransactionResolve?.(hash);

      setPendingTransaction(null);
    } catch (error: any) {
      throw error;
    }
  };

  const handleTransactionReject = () => {
    (global as any)._pendingTransactionReject?.(
      new Error("User rejected transaction"),
    );
    setPendingTransaction(null);
  };

  const handleSignApprove = async () => {
    if (!activeWallet || !pendingSignRequest) return;

    try {
      const account = getAccountForWallet(activeWallet);
      if (!account) {
        throw new Error("Unable to get account for wallet");
      }

      let signature: Hex;

      if (pendingSignRequest.type === "personal_sign") {
        signature = await account.signMessage({
          message: pendingSignRequest.message,
        });
      } else if (pendingSignRequest.type === "eth_sign") {
        signature = await account.signMessage({
          message: { raw: pendingSignRequest.message as `0x${string}` },
        });
      } else if (pendingSignRequest.type.includes("signTypedData")) {
        signature = await account.signTypedData({
          domain: pendingSignRequest.typedData.domain,
          types: pendingSignRequest.typedData.types,
          primaryType: pendingSignRequest.typedData.primaryType,
          message: pendingSignRequest.typedData.message,
        });
      } else {
        throw new Error("Unsupported signing method");
      }

      (global as any)._pendingSignResolve?.(signature);

      setPendingSignRequest(null);
    } catch (error: any) {
      throw error;
    }
  };

  const getDappDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const getDisplayMessage = (signRequest: any) => {
    if (!signRequest) return "";

    if (signRequest.type.includes("signTypedData") && signRequest.typedData) {
      try {
        const formatted =
          typeof signRequest.typedData === "string"
            ? JSON.parse(signRequest.typedData)
            : signRequest.typedData;
        return `Signing structured data from ${getDappDomain(browserState.url)}:\n\n${JSON.stringify(formatted, null, 2)}`;
      } catch {
        return `Signing structured data from ${getDappDomain(browserState.url)}`;
      }
    }

    let displayMessage = signRequest.message;
    if (displayMessage.startsWith("0x")) {
      try {
        const decoded = Buffer.from(displayMessage.slice(2), "hex").toString(
          "utf8",
        );
        displayMessage = decoded;
      } catch {}
    }

    return `${getDappDomain(browserState.url)} wants you to sign:\n\n${displayMessage}`;
  };

  const handleSignReject = () => {
    (global as any)._pendingSignReject?.(new Error("User rejected signing"));
    setPendingSignRequest(null);
  };

  // The provider script embeds a base64 logo and is ~600 lines — memoize so
  // it is only built once per wallet address change, not on every re-render.
  const injectedJavaScript = useMemo(
    () => `
    ${getEthereumProviderScript()}

    // Handle messages from React Native
    window.addEventListener('message', function(event) {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'ethereum_response') {
          window._handleEthereumResponse(data);
        } else if (data.type === 'ethereum_update') {
          window._updateEthereumProvider(data);
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Update provider with current wallet state
    window._updateEthereumProvider({
      selectedAddress: '${activeWallet?.address || null}',
      chainId: '0x1',
      networkVersion: '1'
    });

    true; // Required for injection
  `,
    [activeWallet?.address],
  );

  const [isAddressBarAutoFocus, setIsAddressBarAutoFocus] = useState(false);

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
          onSubmitEditing={handleAddressSubmit}
          addressBarRef={addressBarRef}
        />

        {showHub ? (
          <DAppsHub onNavigateToDapp={navigateToUrl} />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: browserState.url }}
            onMessage={handleMessage}
            injectedJavaScript={injectedJavaScript}
            onLoadStart={() => {
              setBrowserState((prev) => ({ ...prev, loading: true }));
            }}
            onLoadEnd={() => {
              setBrowserState((prev) => ({ ...prev, loading: false }));
            }}
            onNavigationStateChange={(navState) => {
              setBrowserState((prev) => ({
                ...prev,
                url: navState.url,
                title: navState.title,
                canGoBack: navState.canGoBack,
                canGoForward: navState.canGoForward,
                loading: navState.loading,
                isSecure: navState.url.startsWith("https://"),
              }));
              setAddressBarText(navState.url);
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            allowsBackForwardNavigationGestures={true}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
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
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onSearch={() => setIsAddressBarAutoFocus(true)}
            onRefresh={handleRefresh}
            onHome={handleHome}
          />
        )}
      </View>

      {pendingTransaction && activeWallet && (
        <TransactionModal
          visible={!!pendingTransaction}
          onClose={() => {
            setPendingTransaction(null);
          }}
          onApprove={handleTransactionApprove}
          onReject={handleTransactionReject}
          transaction={pendingTransaction}
          wallet={activeWallet}
          dappUrl={browserState.url}
        />
      )}

      {pendingSignRequest && activeWallet && (
        <SignMessageModal
          visible={!!pendingSignRequest}
          onClose={() => {
            handleSignReject();
          }}
          onConfirm={async () => {
            try {
              await handleSignApprove();
            } catch (error: any) {
              console.error("Signing failed:", error);
              handleSignReject();
            }
          }}
          message={getDisplayMessage(pendingSignRequest)}
          isDappRequest={true}
          dappDomain={getDappDomain(browserState.url)}
        />
      )}

      <WalletSelectorModal
        visible={showWalletSelection}
        wallets={wallets}
        activeWalletIndex={activeWalletIndex}
        isDappConnection={true}
        dappUrl={browserState.url}
        onClose={() => {
          setShowWalletSelection(false);
        }}
        onDeclineConnection={() => {
          const allRequests = [];
          if (pendingAccountRequest) {
            allRequests.push(pendingAccountRequest);
          }
          allRequests.push(...pendingAccountRequests);

          allRequests.forEach((request) => {
            const response = {
              id: request.id,
              result: null,
              error: {
                code: 4001,
                message: "User rejected the request",
              },
            };

            webViewRef.current?.postMessage(
              JSON.stringify({
                type: "ethereum_response",
                ...response,
              }),
            );
          });

          setPendingAccountRequest(null);
          setPendingAccountRequests([]);
        }}
        onSelectWallet={() => {}}
        onSelectWalletForDapp={(wallet, index) => {
          console.log("Wallet selected:", wallet.name, wallet.address);
          setActiveWallet(index);
          setShowWalletSelection(false);

          ethereumProvider.setWallet(wallet);

          const allRequests = [];
          if (pendingAccountRequest) {
            allRequests.push(pendingAccountRequest);
          }
          allRequests.push(...pendingAccountRequests);

          console.log(
            `Sending wallet selection response for ${allRequests.length} requests`,
          );

          allRequests.forEach((request) => {
            const response = {
              id: request.id,
              result: [wallet.address],
              error: null,
            };

            console.log("Response being sent:", response);

            const responseMessage = JSON.stringify({
              type: "ethereum_response",
              ...response,
            });

            webViewRef.current?.postMessage(responseMessage);

            webViewRef.current?.injectJavaScript(`
              if (window._handleEthereumResponse) {
                window._handleEthereumResponse(${JSON.stringify(response)});
              }
              true; // Required for injectJavaScript
            `);
          });

          webViewRef.current?.injectJavaScript(`
            if (window._updateEthereumProvider) {
              window._updateEthereumProvider({
                selectedAddress: "${wallet.address}",
                chainId: "${ethereumProvider.chainId}",
                networkVersion: "${ethereumProvider.networkVersion}"
              });
            }
            true; // Required for injectJavaScript
          `);

          setPendingAccountRequest(null);
          setPendingAccountRequests([]);
        }}
      />
    </SafeAreaView>
  );
}
