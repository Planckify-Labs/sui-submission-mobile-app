import { createSolanaRpc } from "@solana/kit";
import type { WebView } from "react-native-webview";
import { evmRenderers } from "@/components/dapps-browser/approvals/renderers";
import { createEvmAdapter } from "@/services/chains/evm/EvmAdapter";
import { ChainAdapterRegistry } from "@/services/chains/registry";
import { createSolanaAdapter } from "@/services/chains/solana/SolanaAdapter";
import { installSolanaSigner } from "@/services/chains/solana/signer";
import type { AdapterContext } from "@/services/chains/types";
import { PermissionStore } from "@/services/permissions/store";
import { initDappBridge } from "./DappBridge";
import { bridgeEventBus } from "./events";
import { InspectorRegistry } from "./inspector";
import { HeuristicInspector } from "./inspectors/HeuristicInspector";
import { HttpsInspector } from "./inspectors/HttpsInspector";
import { pendingIntentsStore } from "./pendingIntents";
import { registerRenderer } from "./renderers";
import { ConsoleSink } from "./sinks/ConsoleSink";

interface BootOpts {
  getContext: () => AdapterContext;
  getWebView: () => WebView | null;
  resolveEvmChain: Parameters<typeof createEvmAdapter>[0]["resolveChainConfig"];
  onSwitchChain?: Parameters<typeof createEvmAdapter>[0]["onSwitchChain"];
  onWatchAsset?: Parameters<typeof createEvmAdapter>[0]["onWatchAsset"];
  onShowCallsStatus?: Parameters<
    typeof createEvmAdapter
  >[0]["onShowCallsStatus"];
}

let booted = false;

/**
 * One-shot boot — registers adapters, inspectors, renderers, and the
 * DappBridge. Safe to call more than once: the guard short-circuits repeat
 * calls, but re-binds the per-screen getters.
 */
export function bootBridge(opts: BootOpts) {
  const bridge = initDappBridge({
    getContext: opts.getContext,
    getWebView: opts.getWebView,
  });

  if (booted) return bridge;
  booted = true;

  InspectorRegistry.register(HttpsInspector);
  InspectorRegistry.register(HeuristicInspector);

  bridgeEventBus.subscribe(ConsoleSink);

  for (const r of evmRenderers) registerRenderer(r);

  const evmAdapter = createEvmAdapter({
    resolveChainConfig: opts.resolveEvmChain,
    onSwitchChain: opts.onSwitchChain,
    onWatchAsset: opts.onWatchAsset,
    onShowCallsStatus: opts.onShowCallsStatus,
  });
  ChainAdapterRegistry.register(evmAdapter);

  // Solana is zero-config until a wallet with namespace "solana" exists;
  // registering lets dApps see the Wallet Standard announcement.
  const solanaAdapter = createSolanaAdapter();
  ChainAdapterRegistry.register(solanaAdapter);

  // Task 17 (spec §7.8) — wire the SolanaAdapter scaffold's
  // `registerSolanaSigner` to the first-party `SolanaWalletKit`. The kit
  // is resolved once inside `installSolanaSigner`; this install must
  // happen AFTER `createSolanaAdapter()` so the signer slot exists, and
  // AFTER `bootWalletKits()` (called at app boot in `app/_layout.tsx`) so
  // the kit registry is populated.
  //
  // `getRpcForCluster` uses Solana's public endpoints. The UI-facing
  // per-user rpcUrl is sourced from the backend `/blockchains` feed
  // (see `ChainSelector` / `buildChainConfigFromBlockchain`) and threads
  // into the kit's `sendNativeTransfer` via `activeChain`. The bridge
  // signer runs in a non-React context and services a dApp-supplied
  // cluster hint — public defaults are the correct fallback there.
  // `rpcSubs` is omitted: public RPCs rate-limit WS subscriptions;
  // private subscription URLs are future work.
  // Defensive: `installSolanaSigner` resolves
  // `walletKitRegistry.get("solana")` at install time and throws if the
  // Solana kit isn't registered yet (possible during Fast Refresh when
  // the registry module is re-evaluated but `bootWalletKits` hasn't
  // re-run, or during a cold boot where kit registration races with the
  // first dapps-browser mount). Swallow that failure so the screen
  // doesn't force-close — the EVM bridge path still works, and the
  // Solana signer re-installs on the next bootBridge call.
  try {
    installSolanaSigner({
      getWalletByAddress: (addr) =>
        opts.getContext().wallets.find((w) => w.address === addr),
      getRpcForCluster: (cluster) => {
        const url =
          cluster === "devnet"
            ? "https://api.devnet.solana.com"
            : "https://api.mainnet-beta.solana.com";
        return { rpc: createSolanaRpc(url) };
      },
    });
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[bridge] installSolanaSigner failed; Solana dApp signing disabled for this session:",
        err instanceof Error ? err.message : String(err),
      );
    }
    // Reset the module-level `booted` flag so a later mount (once the
    // Solana kit is registered) can retry install.
    booted = false;
  }

  void PermissionStore.hydrate();
  void pendingIntentsStore.hydrate();

  return bridge;
}
