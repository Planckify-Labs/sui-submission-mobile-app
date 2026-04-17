/**
 * `installSolanaSigner` — wires the DApp-bridge's `SolanaAdapter` scaffold
 * to the first-party `SolanaWalletKit` so in-WebView Solana dApps (Wallet
 * Standard / Phantom-compatible) can `signMessage`, `signTransaction`, and
 * `signAndSendTransaction` through the same key dwell site the mobile UI
 * uses.
 *
 * Spec reference: `docs/solana-chain-support-spec.md` §3.2, §7.8, §8.
 * Task: `docs/solana-chain-support-task/17_install_solana_signer_in_bridge_istaken_true.md`.
 *
 * Rules (non-negotiable):
 *   - Single kit source of truth. `walletKitRegistry.get("solana")` is
 *     resolved ONCE at install time — never per-request. The bridge path
 *     and mobile UI path must reference the same kit instance so cache
 *     invalidation (TWV-2026-070) and lock/logout wipe stay in sync.
 *   - No private material logged. On error, only a bounded `__DEV__`
 *     breadcrumb is emitted; `message`, `txBase64`, signer internals and
 *     exception payloads are never surfaced.
 *   - No WebSocket dependency in the default path. Public RPCs rate-limit
 *     `logsSubscribe`/`signatureSubscribe`, so when `rpcSubs` is absent we
 *     submit via `rpc.sendTransaction(wire).send()` and rely on the dApp
 *     to poll.
 *   - EVM bridge flow is additive. Disabling this install restores the
 *     previous scaffold behaviour (`SolanaAdapter.executeApproval` throws
 *     `-32603 "No Solana signer registered"` — covered by task 17's
 *     regression acceptance).
 *
 * Deviation from spec §7.8:
 *   - `registerSolanaSigner` in `SolanaAdapter.ts` expects
 *     `signMessage(address, message: string)` (the method receives the raw
 *     string that came from the dApp over `postMessage`), not the
 *     `string | Uint8Array` union implied by the spec snippet. We encode
 *     via `TextEncoder` inside this file.
 *   - `signTransaction` / `signAndSendTransaction` signatures match the
 *     adapter shape: `(address, txBase64, cluster?) => string`. Return
 *     values are plain strings (base58 signature / base64 tx), matching
 *     the Wallet Standard wire format.
 */

import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  signTransaction as kitSignTransaction,
} from "@solana/kit";
import type {
  Base64EncodedWireTransaction,
  FullySignedTransaction,
  KeyPairSigner,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from "@solana/kit";

import type { TWallet } from "@/constants/types/walletTypes";
import {
  registerSolanaSigner,
  type SolanaSignerFns,
} from "@/services/chains/solana/SolanaAdapter";
import {
  base64ToTransaction,
  bytesToBase58,
  transactionToBase64,
} from "@/services/chains/solana/codec";
import { walletKitRegistry } from "@/services/walletKit/registry";

/**
 * Cluster discriminator the bridge hands us. The adapter currently types
 * the incoming value as `string` (from the dApp's `opts.cluster`) — we
 * narrow to the two clusters the mobile app supports in v2.3.0 and default
 * mainnet-beta for any other value (mirroring `SolanaAdapter.handleRequest`).
 */
export type SolanaBridgeCluster = "mainnet-beta" | "devnet";

/**
 * RPC bundle returned by `getRpcForCluster`. `rpcSubs` is optional — when
 * omitted, the signer falls back to the WS-free `sendTransaction` path
 * (see spec §7.8, public-RPC-friendly note).
 */
export interface SolanaBridgeRpc {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubs?: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

export interface InstallSolanaSignerDeps {
  getWalletByAddress: (addr: string) => TWallet | undefined;
  getRpcForCluster: (cluster: SolanaBridgeCluster) => SolanaBridgeRpc;
}

/**
 * Wires the kit-backed Solana signer into `SolanaAdapter`. Idempotent at the
 * registration seam (`registerSolanaSigner` overwrites), but the intent is
 * to call this exactly once after `createSolanaAdapter()` in
 * `services/bridge/boot.ts`.
 */
export function installSolanaSigner(deps: InstallSolanaSignerDeps): void {
  // Resolve the kit ONCE. Per-request resolution would (a) pay the map
  // lookup cost on every bridge RPC and (b) widen the window during which
  // a boot-order bug could surface mid-session. Throwing here on missing
  // kit is correct: bootWalletKits() must have run before bootBridge().
  const kit = walletKitRegistry.get("solana");

  const handlers: SolanaSignerFns = {
    signMessage: async (address: string, message: string): Promise<string> => {
      try {
        const wallet = deps.getWalletByAddress(address);
        if (!wallet) throw new Error("Unknown wallet");
        const signer = (await kit.getSignerForWallet(
          wallet,
        )) as KeyPairSigner | null;
        if (!signer) throw new Error("No Solana signer");

        // The adapter hands us a UTF-8 string (dApps over
        // `window.solana.signMessage` typically send `Uint8Array` but the
        // Wallet Standard wire serialisation stringifies it; we re-encode
        // as UTF-8 here, matching Phantom's reference behaviour).
        const bytes = new TextEncoder().encode(message);
        const [sigDict] = await signer.signMessages([
          { content: bytes, signatures: {} },
        ]);
        const sigBytes = sigDict[signer.address] ?? new Uint8Array();
        return bytesToBase58(sigBytes);
      } catch (err) {
        if (__DEV__) console.error("[Solana bridge signer] signMessage failed");
        throw err;
      }
    },

    signTransaction: async (
      address: string,
      txBase64: string,
    ): Promise<string> => {
      try {
        const wallet = deps.getWalletByAddress(address);
        if (!wallet) throw new Error("Unknown wallet");
        const signer = (await kit.getSignerForWallet(
          wallet,
        )) as KeyPairSigner | null;
        if (!signer) throw new Error("No Solana signer");

        const tx = base64ToTransaction(txBase64);
        // `KeyPairSigner.signTransactions` returns only a `SignatureDictionary`
        // (partial-signer semantics) — it doesn't mutate the transaction. To
        // produce a fully-signed wire payload we round-trip through
        // `signTransaction([keyPair], tx)` from @solana/kit, which merges the
        // signature back into `tx.signatures` and asserts completeness. The
        // KeyPairSigner's `.keyPair` is the same non-extractable pair created
        // in the walletService dwell site (TWV-2026-070).
        const signed = await kitSignTransaction([signer.keyPair], tx);
        return transactionToBase64(signed);
      } catch (err) {
        if (__DEV__)
          console.error("[Solana bridge signer] signTransaction failed");
        throw err;
      }
    },

    signAndSendTransaction: async (
      address: string,
      txBase64: string,
      cluster: string,
    ): Promise<string> => {
      try {
        const wallet = deps.getWalletByAddress(address);
        if (!wallet) throw new Error("Unknown wallet");
        const signer = (await kit.getSignerForWallet(
          wallet,
        )) as KeyPairSigner | null;
        if (!signer) throw new Error("No Solana signer");

        const narrowed: SolanaBridgeCluster =
          cluster === "devnet" ? "devnet" : "mainnet-beta";
        const { rpc, rpcSubs } = deps.getRpcForCluster(narrowed);

        const tx = base64ToTransaction(txBase64);
        // See `signTransaction` above for why we use `kitSignTransaction`
        // rather than the `KeyPairSigner.signTransactions` return value.
        const signed: FullySignedTransaction = await kitSignTransaction(
          [signer.keyPair],
          tx,
        );

        if (rpcSubs) {
          // Cast through `never` mirrors `transferService.ts`: the factory
          // is typed per-cluster (devnet/mainnet) AND expects the caller
          // to statically prove the tx has a blockhash lifetime. Neither
          // is available at this module boundary — the dApp-supplied tx
          // blob may carry either a blockhash or a durable-nonce lifetime,
          // and we've already erased the cluster nominal on the rpc. The
          // cast is load-bearing; runtime behaviour is cluster- and
          // lifetime-agnostic.
          const sendAndConfirm = sendAndConfirmTransactionFactory({
            rpc: rpc as never,
            rpcSubscriptions: rpcSubs as never,
          });
          await sendAndConfirm(signed as never, { commitment: "confirmed" });
        } else {
          const wire = getBase64EncodedWireTransaction(signed);
          await rpc
            .sendTransaction(wire as Base64EncodedWireTransaction, {
              encoding: "base64",
            })
            .send();
        }

        return getSignatureFromTransaction(signed);
      } catch (err) {
        if (__DEV__)
          console.error(
            "[Solana bridge signer] signAndSendTransaction failed",
          );
        throw err;
      }
    },
  };

  registerSolanaSigner(handlers);
}
