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
  // the kit registry is populated. `getRpcForCluster` omits `rpcSubs` —
  // public RPCs rate-limit WS subscriptions; private RPCs via
  // `EXPO_PUBLIC_SOLANA_*_RPC_SUBSCRIPTIONS` are future work.
  installSolanaSigner({
    getWalletByAddress: (addr) =>
      opts.getContext().wallets.find((w) => w.address === addr),
    getRpcForCluster: (cluster) => {
      const mainnet =
        process.env.EXPO_PUBLIC_SOLANA_MAINNET_RPC ??
        "https://api.mainnet-beta.solana.com";
      const devnet =
        process.env.EXPO_PUBLIC_SOLANA_DEVNET_RPC ??
        "https://api.devnet.solana.com";
      return {
        rpc: createSolanaRpc(cluster === "devnet" ? devnet : mainnet),
      };
    },
  });

  void PermissionStore.hydrate();
  void pendingIntentsStore.hydrate();

  return bridge;
}
