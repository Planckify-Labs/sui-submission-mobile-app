import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  fromHex,
  type Hash,
  type Hex,
  hexToString,
  http,
  isAddress,
  isHex,
  type PublicClient,
  toHex,
} from "viem";
import type { TWallet } from "@/constants/types/walletTypes";
import type {
  ApprovalDecision,
  ApprovalIntent,
} from "@/services/bridge/approval";
import { BundleStatusStore } from "@/services/bridge/bundleStatus";
import { NonceTracker } from "@/services/bridge/nonceTracker";
import type {
  AdapterContext,
  ChainAdapter,
  ChainRequest,
  ChainResult,
  Origin,
} from "@/services/chains/types";
import { originKey } from "@/services/permissions/caip";
import { PermissionStore } from "@/services/permissions/store";
import { getAccountForWallet } from "@/services/walletService";
import { Bundler, getBundlerConfig, type UserOperation } from "./bundler";
import { UserChainStore } from "./chainStore";
import { getInstallUuid } from "./eip6963";
import { takumipayLogoBase64 } from "@/constants/takumipay";
import { PROVIDER_ERRORS, ProviderRpcError } from "./errors";
import { getEvmInjectedScript } from "./injectedScript";
import type {
  EvmAddChainPayload,
  EvmAuthorizationPayload,
  EvmBatchCallsPayload,
  EvmConnectPayload,
  EvmSendTxPayload,
  EvmSignMessagePayload,
  EvmSignTypedDataPayload,
  EvmSwitchChainPayload,
  EvmWatchAssetPayload,
  FeeSource,
  GasEstimate,
} from "./payloads";
import { getPaymasterConfig, Paymaster } from "./paymaster";
import { verifySignature } from "./signatureVerifier";

// --- Allowlisted 7702 delegators (see §8 open question 3). Compile-time pin
// today; advanced settings UI later. --------------------------------------
const AUTHORIZED_DELEGATORS = new Set<string>([
  "0x0000000000000000000000000000000000000000".toLowerCase(), // placeholder
]);

type ChainConfig = { chain: Chain; rpcUrl: string };

export interface EvmAdapterOpts {
  /** Resolves the active viem Chain + RPC for the context's wallet. */
  resolveChainConfig: (ctx: AdapterContext) => ChainConfig | null;
  /** Called after successful chain switch so app-level active chain updates. */
  onSwitchChain?: (chainId: number) => void | Promise<void>;
  /** Appends a token to the user's token-list store. Provided by app. */
  onWatchAsset?: (payload: EvmWatchAssetPayload) => Promise<void>;
  /** Opens the internal tx history screen filtered to a bundle id. */
  onShowCallsStatus?: (bundleId: string) => void;
}

let adapterInstance: EvmAdapter | null = null;

export function getEvmAdapter(): EvmAdapter | null {
  return adapterInstance;
}

export function createEvmAdapter(opts: EvmAdapterOpts): EvmAdapter {
  adapterInstance = new EvmAdapter(opts);
  return adapterInstance;
}

export class EvmAdapter implements ChainAdapter {
  readonly namespace = "eip155" as const;
  private opts: EvmAdapterOpts;

  constructor(opts: EvmAdapterOpts) {
    this.opts = opts;
  }

  private publicClient(ctx: AdapterContext): PublicClient {
    const config = this.opts.resolveChainConfig(ctx);
    if (!config) throw PROVIDER_ERRORS.chainNotConnected();
    return createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    }) as PublicClient;
  }

  private walletClient(ctx: AdapterContext, wallet: TWallet) {
    const config = this.opts.resolveChainConfig(ctx);
    if (!config) throw PROVIDER_ERRORS.chainNotConnected();
    const account = getAccountForWallet(wallet);
    if (!account) throw PROVIDER_ERRORS.internalError("no-account");
    return createWalletClient({
      account: account as Account,
      chain: config.chain,
      transport: http(config.rpcUrl),
    });
  }

  getInjectedScript(ctx: AdapterContext): string {
    const config = this.opts.resolveChainConfig(ctx);
    const chainIdHex = config ? toHex(config.chain.id) : "0x1";
    const selectedAddress = ctx.activeWallet?.address ?? null;
    return getEvmInjectedScript({
      selectedAddress,
      chainId: chainIdHex,
      networkVersion: String(config?.chain.id ?? 1),
      info: {
        uuid: getInstallUuid(),
        name: "TakumiAI Wallet",
        icon: takumipayLogoBase64,
        rdns: "com.takumi.wallet",
      },
    });
  }

  onStateChange(ctx: AdapterContext): { injectedJs: string } | null {
    const config = this.opts.resolveChainConfig(ctx);
    const chainId = config ? toHex(config.chain.id) : "0x1";
    const addr = ctx.activeWallet?.address ?? null;
    const update = JSON.stringify({
      namespace: "eip155",
      selectedAddress: addr,
      chainId,
      networkVersion: String(config?.chain.id ?? 1),
    });
    return {
      injectedJs: `
        (function() {
          try {
            window._updateEthereumProvider && window._updateEthereumProvider(${update});
          } catch (e) {}
        })();
      `,
    };
  }

  async handleRequest(
    req: ChainRequest,
    ctx: AdapterContext,
  ): Promise<ChainResult> {
    const params = Array.isArray(req.params)
      ? (req.params as unknown[])
      : req.params
        ? [req.params]
        : [];

    try {
      switch (req.method) {
        // ---------- Read / metadata ----------
        case "eth_chainId": {
          const config = this.opts.resolveChainConfig(ctx);
          if (!config) return err(PROVIDER_ERRORS.chainNotConnected());
          return resolved(toHex(config.chain.id));
        }
        case "net_version": {
          const config = this.opts.resolveChainConfig(ctx);
          if (!config) return err(PROVIDER_ERRORS.chainNotConnected());
          return resolved(String(config.chain.id));
        }
        case "eth_accounts": {
          // Privacy fix — only disclose when origin has an EIP-2255 grant.
          if (!ctx.activeWallet) return resolved([]);
          const chainConfig = this.opts.resolveChainConfig(ctx);
          if (!chainConfig) return resolved([]);
          const allowed = PermissionStore.isGranted(
            req.origin.url,
            ctx.activeWallet.address,
            chainConfig.chain.id,
          );
          return resolved(
            allowed && ctx.activeWallet ? [ctx.activeWallet.address] : [],
          );
        }
        case "eth_blockNumber":
        case "eth_gasPrice":
        case "eth_maxPriorityFeePerGas":
        case "eth_feeHistory":
        case "eth_getBalance":
        case "eth_call":
        case "eth_getCode":
        case "eth_getStorageAt":
        case "eth_getLogs":
        case "eth_getTransactionByHash":
        case "eth_getTransactionReceipt":
        case "eth_estimateGas":
        case "eth_getBlockByNumber":
        case "eth_getBlockByHash":
        case "eth_getTransactionCount": {
          const pc = this.publicClient(ctx);
          const result = await pc.request({
            method: req.method as any,
            params: params as any,
          });
          return resolved(result);
        }

        // ---------- Connect / permissions ----------
        case "eth_requestAccounts":
        case "wallet_requestPermissions": {
          const cfg = this.opts.resolveChainConfig(ctx);
          if (!cfg) return err(PROVIDER_ERRORS.chainNotConnected());

          // Silent re-connect: if this origin already has a grant for the
          // active wallet on this chain, return silently. dApps (wagmi
          // eager-connect, yearn, et al) call eth_requestAccounts /
          // wallet_requestPermissions repeatedly on mount + reconnect;
          // prompting every time would hammer the user with sheets.
          if (
            ctx.activeWallet &&
            PermissionStore.isGranted(
              req.origin.url,
              ctx.activeWallet.address,
              cfg.chain.id,
            )
          ) {
            if (req.method === "eth_requestAccounts") {
              return resolved([ctx.activeWallet.address]);
            }
            // wallet_requestPermissions expects the EIP-2255 grant list.
            return resolved(PermissionStore.asEip2255(req.origin.url));
          }

          const payload: EvmConnectPayload = {
            requestedAccounts: 1,
            chainId: cfg.chain.id,
          };
          return needsApproval(
            makeIntent(req, "connect", payload, ctx.activeWallet),
          );
        }
        case "wallet_getPermissions": {
          return resolved(PermissionStore.asEip2255(req.origin.url));
        }
        case "wallet_revokePermissions": {
          await PermissionStore.revoke({ origin: req.origin.url });
          return resolved(null);
        }

        // ---------- Signing ----------
        case "personal_sign": {
          const [message, address] = params as [unknown, unknown];
          if (typeof message !== "string" || typeof address !== "string")
            return err(PROVIDER_ERRORS.invalidParams("personal_sign"));
          if (!isAddress(address))
            return err(PROVIDER_ERRORS.invalidParams("address"));
          if (!ctx.activeWallet) return err(PROVIDER_ERRORS.disconnected());
          if (ctx.activeWallet.address.toLowerCase() !== address.toLowerCase())
            return err(PROVIDER_ERRORS.unauthorized());
          const payload: EvmSignMessagePayload = {
            message,
            display: isHex(message as Hex) ? "hex" : "utf8",
            address: address as `0x${string}`,
          };
          return needsApproval(
            makeIntent(req, "signMessage", payload, ctx.activeWallet, {
              method: "personal_sign",
            }),
          );
        }
        case "eth_sign": {
          const [address, message] = params as [unknown, unknown];
          if (typeof message !== "string" || typeof address !== "string")
            return err(PROVIDER_ERRORS.invalidParams("eth_sign"));
          if (!isAddress(address))
            return err(PROVIDER_ERRORS.invalidParams("address"));
          if (!ctx.activeWallet) return err(PROVIDER_ERRORS.disconnected());
          if (ctx.activeWallet.address.toLowerCase() !== address.toLowerCase())
            return err(PROVIDER_ERRORS.unauthorized());
          const payload: EvmSignMessagePayload = {
            message,
            display: "hex",
            address: address as `0x${string}`,
          };
          return needsApproval(
            makeIntent(req, "signMessage", payload, ctx.activeWallet, {
              method: "eth_sign",
            }),
          );
        }
        case "eth_signTypedData":
        case "eth_signTypedData_v1":
        case "eth_signTypedData_v3":
        case "eth_signTypedData_v4": {
          const [address, typedDataRaw] = params as [unknown, unknown];
          if (typeof address !== "string" || !isAddress(address))
            return err(PROVIDER_ERRORS.invalidParams("address"));
          if (!ctx.activeWallet) return err(PROVIDER_ERRORS.disconnected());
          if (ctx.activeWallet.address.toLowerCase() !== address.toLowerCase())
            return err(PROVIDER_ERRORS.unauthorized());
          const typedData =
            typeof typedDataRaw === "string"
              ? safeJson(typedDataRaw)
              : typedDataRaw;
          if (!typedData || typeof typedData !== "object")
            return err(PROVIDER_ERRORS.invalidParams("typedData"));
          const payload: EvmSignTypedDataPayload = {
            typedData: typedData as EvmSignTypedDataPayload["typedData"],
            address: address as `0x${string}`,
            method:
              req.method === "eth_signTypedData_v1"
                ? "eth_signTypedData"
                : (req.method as
                    | "eth_signTypedData"
                    | "eth_signTypedData_v3"
                    | "eth_signTypedData_v4"),
          };
          return needsApproval(
            makeIntent(req, "signTypedData", payload, ctx.activeWallet),
          );
        }

        // ---------- Transactions ----------
        case "eth_sendTransaction": {
          const [rawTx] = params as [Record<string, unknown>];
          if (!rawTx || typeof rawTx !== "object")
            return err(PROVIDER_ERRORS.invalidParams("tx"));
          if (!ctx.activeWallet) return err(PROVIDER_ERRORS.disconnected());
          const cfg = this.opts.resolveChainConfig(ctx);
          if (!cfg) return err(PROVIDER_ERRORS.chainNotConnected());
          const normalized = normalizeTx(
            rawTx,
            cfg.chain.id,
            ctx.activeWallet.address as `0x${string}`,
          );
          if ("error" in normalized) return err(normalized.error);

          if (normalized.payload.chainId !== cfg.chain.id) {
            return err(PROVIDER_ERRORS.chainNotConnected());
          }

          // Gas re-estimation side-by-side (task 18)
          try {
            const pc = this.publicClient(ctx);
            const estimate = await this.buildGasEstimate(
              pc,
              normalized.payload,
              rawTx,
            );
            (normalized.payload as { gasEstimate?: GasEstimate }).gasEstimate =
              estimate;
          } catch {
            // non-fatal: sheet will show dApp values only
          }

          return needsApproval(
            makeIntent(
              req,
              "sendTransaction",
              normalized.payload,
              ctx.activeWallet,
            ),
          );
        }
        case "eth_sendRawTransaction": {
          // Decode + wrap as a regular send-tx approval.
          const [raw] = params as [unknown];
          if (typeof raw !== "string" || !isHex(raw))
            return err(PROVIDER_ERRORS.invalidParams("raw"));
          if (!ctx.activeWallet) return err(PROVIDER_ERRORS.disconnected());
          // Raw broadcasts are rare and risky; bounce back with a clear
          // invalid params rather than signing a pre-signed tx blindly.
          return err(
            PROVIDER_ERRORS.invalidParams(
              "eth_sendRawTransaction is not supported; use eth_sendTransaction",
            ),
          );
        }

        // ---------- Chains ----------
        case "wallet_addEthereumChain": {
          const [raw] = params as [Record<string, unknown>];
          const normalized = normalizeAddChain(raw);
          if ("error" in normalized) return err(normalized.error);
          if (UserChainStore.has(normalized.payload.chainId)) {
            return resolved(null);
          }
          return needsApproval(
            makeIntent(req, "addChain", normalized.payload, ctx.activeWallet),
          );
        }
        case "wallet_switchEthereumChain": {
          const [raw] = params as [{ chainId?: string }];
          if (!raw?.chainId || typeof raw.chainId !== "string")
            return err(PROVIDER_ERRORS.invalidParams("chainId"));
          let targetId: number;
          try {
            targetId = Number(fromHex(raw.chainId as Hex, "number"));
          } catch {
            return err(PROVIDER_ERRORS.invalidParams("chainId"));
          }
          if (!UserChainStore.has(targetId)) {
            const cfg = this.opts.resolveChainConfig(ctx);
            // Fall back to currently-resolved chain — it's in-band.
            if (cfg?.chain.id !== targetId) {
              return err(PROVIDER_ERRORS.chainNotAdded(targetId));
            }
          }
          const current = this.opts.resolveChainConfig(ctx);
          if (current?.chain.id === targetId) return resolved(null);
          return needsApproval(
            makeIntent(
              req,
              "switchChain",
              { chainId: targetId } satisfies EvmSwitchChainPayload,
              ctx.activeWallet,
            ),
          );
        }

        // ---------- Assets ----------
        case "wallet_watchAsset": {
          const [raw] = params as [Record<string, unknown>];
          const normalized = normalizeWatchAsset(raw);
          if ("error" in normalized) return err(normalized.error);
          return needsApproval(
            makeIntent(req, "watchAsset", normalized.payload, ctx.activeWallet),
          );
        }

        // ---------- Batched calls (EIP-5792) ----------
        case "wallet_sendCalls": {
          const [raw] = params as [Record<string, unknown>];
          if (!ctx.activeWallet) return err(PROVIDER_ERRORS.disconnected());
          const cfg = this.opts.resolveChainConfig(ctx);
          if (!cfg) return err(PROVIDER_ERRORS.chainNotConnected());
          const normalized = normalizeSendCalls(
            raw,
            cfg.chain.id,
            ctx.activeWallet.address as `0x${string}`,
          );
          if ("error" in normalized) return err(normalized.error);
          return needsApproval(
            makeIntent(req, "sendCalls", normalized.payload, ctx.activeWallet),
          );
        }
        case "wallet_getCallsStatus": {
          const [bundleId] = params as [string];
          const record = BundleStatusStore.get(bundleId);
          if (!record) {
            return err(
              PROVIDER_ERRORS.invalidParams(`unknown bundle ${bundleId}`),
            );
          }
          return resolved({
            version: "1.0",
            chainId: toHex(record.chainId),
            status:
              record.status === "CONFIRMED"
                ? 200
                : record.status === "FAILED"
                  ? 500
                  : 100,
            receipts: record.receipts
              .filter(
                (r): r is Extract<typeof r, { status: "CONFIRMED" }> =>
                  r.status === "CONFIRMED",
              )
              .map((r) => r.receipt),
            atomic: record.atomic,
          });
        }
        case "wallet_showCallsStatus": {
          const [bundleId] = params as [string];
          this.opts.onShowCallsStatus?.(bundleId);
          return resolved(null);
        }
        case "wallet_getCapabilities": {
          const [addressRaw] = params as [unknown];
          const address =
            typeof addressRaw === "string"
              ? addressRaw
              : ctx.activeWallet?.address;
          if (!address || !isAddress(address))
            return err(PROVIDER_ERRORS.invalidParams("address"));
          const smart =
            ctx.activeWallet &&
            ctx.activeWallet.address.toLowerCase() === address.toLowerCase()
              ? ctx.activeWallet.type === "Smart4337" ||
                ctx.activeWallet.type === "Smart7702"
              : false;
          const cfg = this.opts.resolveChainConfig(ctx);
          const chainIdHex = cfg ? toHex(cfg.chain.id) : "0x1";
          const paymasterUrl = cfg
            ? getPaymasterConfig(cfg.chain.id)?.url
            : undefined;
          return resolved({
            [address]: {
              [chainIdHex]: {
                atomicBatch: { supported: smart },
                paymasterService: {
                  supported: smart && !!paymasterUrl,
                  url: paymasterUrl,
                },
                auxiliaryFunds: { supported: false },
              },
            },
          });
        }

        // ---------- Subscriptions (defer) ----------
        case "eth_subscribe":
        case "eth_unsubscribe": {
          return err(PROVIDER_ERRORS.unsupportedMethod(req.method));
        }

        default:
          return err(PROVIDER_ERRORS.unsupportedMethod(req.method));
      }
    } catch (e) {
      if (e instanceof ProviderRpcError) return err(e);
      return err(
        PROVIDER_ERRORS.internalError(
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async executeApproval(
    intent: ApprovalIntent,
    decision: ApprovalDecision,
    ctx: AdapterContext,
  ): Promise<unknown> {
    if (decision.outcome === "reject") {
      throw PROVIDER_ERRORS.userRejected();
    }

    switch (intent.kind) {
      case "connect":
        return this.execConnect(intent, decision, ctx);
      case "signMessage":
        return this.execSignMessage(intent, ctx);
      case "signTypedData":
        return this.execSignTypedData(intent, ctx);
      case "sendTransaction":
        return this.execSendTransaction(intent, ctx);
      case "switchChain":
        return this.execSwitchChain(intent, ctx);
      case "addChain":
        return this.execAddChain(intent, ctx);
      case "watchAsset":
        return this.execWatchAsset(intent);
      case "sendCalls":
        return this.execSendCalls(intent, decision, ctx);
      case "signAuthorization":
        return this.execSignAuthorization(intent, ctx);
      default:
        throw PROVIDER_ERRORS.unsupportedMethod(intent.kind);
    }
  }

  // --- Execution branches ---------------------------------------------------

  private async execConnect(
    intent: ApprovalIntent,
    decision: ApprovalDecision,
    ctx: AdapterContext,
  ): Promise<string[]> {
    const payload = intent.payload as EvmConnectPayload;
    const chosenIndex =
      typeof decision.data === "object" &&
      decision.data !== null &&
      "walletIndex" in decision.data
        ? (decision.data as { walletIndex: number }).walletIndex
        : null;
    const wallet =
      chosenIndex !== null ? ctx.wallets[chosenIndex] : ctx.activeWallet;
    if (!wallet) throw PROVIDER_ERRORS.disconnected();
    if (chosenIndex !== null && chosenIndex !== undefined)
      ctx.setActiveWallet(chosenIndex);
    await PermissionStore.grant({
      origin: intent.origin.url,
      walletAddress: wallet.address,
      chainId: payload.chainId,
    });
    return [wallet.address];
  }

  private async execSignMessage(
    intent: ApprovalIntent,
    ctx: AdapterContext,
  ): Promise<Hex> {
    const payload = intent.payload as EvmSignMessagePayload;
    const wallet = intent.wallet ?? ctx.activeWallet;
    if (!wallet) throw PROVIDER_ERRORS.disconnected();
    const account = getAccountForWallet(wallet);
    if (!account) throw PROVIDER_ERRORS.internalError("no-account");
    if (payload.display === "hex") {
      return account.signMessage({
        message: { raw: payload.message as Hex },
      });
    }
    return account.signMessage({ message: payload.message });
  }

  private async execSignTypedData(
    intent: ApprovalIntent,
    ctx: AdapterContext,
  ): Promise<Hex> {
    const payload = intent.payload as EvmSignTypedDataPayload;
    const wallet = intent.wallet ?? ctx.activeWallet;
    if (!wallet) throw PROVIDER_ERRORS.disconnected();
    const account = getAccountForWallet(wallet);
    if (!account) throw PROVIDER_ERRORS.internalError("no-account");
    return account.signTypedData(payload.typedData as any);
  }

  private async execSendTransaction(
    intent: ApprovalIntent,
    ctx: AdapterContext,
  ): Promise<Hash> {
    const payload = intent.payload as EvmSendTxPayload & {
      gasEstimate?: GasEstimate;
      feeSource?: FeeSource;
    };
    const wallet = intent.wallet ?? ctx.activeWallet;
    if (!wallet) throw PROVIDER_ERRORS.disconnected();

    if (wallet.type === "Smart4337" || wallet.type === "Smart7702") {
      return this.execViaBundler(wallet, [payload], payload.chainId, ctx);
    }

    const client = this.walletClient(ctx, wallet);
    const pc = this.publicClient(ctx);

    // Prefer the user-confirmed gas estimate if the sheet picked one.
    const useEstimate = payload.gasEstimate;
    const tx: Record<string, unknown> = {
      to: payload.to,
      value: payload.value,
      data: payload.data,
      gas: payload.gas,
    };
    if (payload.type === 0) {
      tx.gasPrice =
        useEstimate?.recommended === "wallet"
          ? useEstimate.wallet.gasPrice
          : (payload.gasPrice ?? useEstimate?.wallet.gasPrice);
    } else if (payload.type === 1) {
      tx.gasPrice =
        useEstimate?.recommended === "wallet"
          ? useEstimate.wallet.gasPrice
          : (payload.gasPrice ?? useEstimate?.wallet.gasPrice);
      tx.accessList = payload.accessList;
    } else {
      tx.maxFeePerGas =
        useEstimate?.recommended === "wallet"
          ? useEstimate.wallet.maxFeePerGas
          : (payload.maxFeePerGas ?? useEstimate?.wallet.maxFeePerGas);
      tx.maxPriorityFeePerGas =
        useEstimate?.recommended === "wallet"
          ? useEstimate.wallet.maxPriorityFeePerGas
          : (payload.maxPriorityFeePerGas ??
            useEstimate?.wallet.maxPriorityFeePerGas);
      tx.accessList = payload.accessList;
    }

    if (typeof payload.nonce === "number") {
      tx.nonce = payload.nonce;
    } else {
      const onChain = await pc.getTransactionCount({
        address: wallet.address as `0x${string}`,
      });
      tx.nonce = await NonceTracker.reserveNonce(
        wallet.address,
        payload.chainId,
        onChain,
      );
    }

    const hash = await (client.sendTransaction as any)(tx);
    await NonceTracker.markSubmitted(
      wallet.address,
      payload.chainId,
      tx.nonce as number,
      hash,
      {
        to: payload.to,
        value: payload.value ? toHex(payload.value) : undefined,
        data: payload.data,
        maxFeePerGas:
          payload.type === 2 && payload.maxFeePerGas
            ? toHex(payload.maxFeePerGas)
            : undefined,
        maxPriorityFeePerGas:
          payload.type === 2 && payload.maxPriorityFeePerGas
            ? toHex(payload.maxPriorityFeePerGas)
            : undefined,
        gasPrice:
          payload.type === 0 && payload.gasPrice
            ? toHex(payload.gasPrice)
            : undefined,
      },
    );
    // Poll confirmation off the hot path so the dApp isn't blocked.
    pc.waitForTransactionReceipt({ hash })
      .then(() =>
        NonceTracker.markConfirmed(
          wallet.address,
          payload.chainId,
          tx.nonce as number,
        ),
      )
      .catch(() =>
        NonceTracker.markFailed(
          wallet.address,
          payload.chainId,
          tx.nonce as number,
        ),
      );
    return hash;
  }

  private async execSwitchChain(
    intent: ApprovalIntent,
    _ctx: AdapterContext,
  ): Promise<null> {
    const payload = intent.payload as EvmSwitchChainPayload;
    if (this.opts.onSwitchChain) {
      await this.opts.onSwitchChain(payload.chainId);
    }
    return null;
  }

  private async execAddChain(
    intent: ApprovalIntent,
    _ctx: AdapterContext,
  ): Promise<null> {
    const payload = intent.payload as EvmAddChainPayload;
    // Health check — `eth_chainId` against rpc[0] with 5s timeout.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(payload.rpcUrls[0], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const j = await res.json();
      const got = Number(fromHex(j.result as Hex, "number"));
      if (got !== payload.chainId) {
        throw PROVIDER_ERRORS.invalidParams(
          `RPC reports chainId ${got}, expected ${payload.chainId}`,
        );
      }
    } catch (e) {
      if (e instanceof ProviderRpcError) throw e;
      throw PROVIDER_ERRORS.invalidParams(
        `RPC health check failed for ${payload.rpcUrls[0]}`,
      );
    }
    await UserChainStore.add({
      chainId: payload.chainId,
      chainName: payload.chainName,
      nativeCurrency: payload.nativeCurrency,
      rpcUrls: payload.rpcUrls,
      blockExplorerUrls: payload.blockExplorerUrls,
      iconUrls: payload.iconUrls,
      addedAt: Date.now(),
    });
    return null;
  }

  private async execWatchAsset(intent: ApprovalIntent): Promise<boolean> {
    const payload = intent.payload as EvmWatchAssetPayload;
    if (this.opts.onWatchAsset) {
      await this.opts.onWatchAsset(payload);
    }
    return true;
  }

  private async execSendCalls(
    intent: ApprovalIntent,
    _decision: ApprovalDecision,
    ctx: AdapterContext,
  ): Promise<string> {
    const payload = intent.payload as EvmBatchCallsPayload;
    const wallet = intent.wallet ?? ctx.activeWallet;
    if (!wallet) throw PROVIDER_ERRORS.disconnected();
    const bundleId = randomId();
    const atomic =
      wallet.type === "Smart4337" ||
      (wallet.type === "Smart7702" &&
        wallet.smart7702?.authorizationByChain?.[payload.chainId] !==
          undefined);
    await BundleStatusStore.create({
      bundleId,
      chainId: payload.chainId,
      from: payload.from,
      atomic,
      calls: payload.calls.map((c) => ({
        to: c.to,
        value: c.value ? toHex(c.value) : undefined,
        data: c.data,
      })),
      receipts: payload.calls.map(() => ({ status: "PENDING" })),
      status: "PENDING",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (atomic) {
      const hash = await this.execViaBundler(
        wallet,
        payload.calls as EvmSendTxPayload[],
        payload.chainId,
        ctx,
      );
      await BundleStatusStore.update(bundleId, {
        status: "CONFIRMED",
        receipts: payload.calls.map(() => ({
          status: "CONFIRMED",
          receipt: {
            transactionHash: hash,
            status: "0x1",
          },
        })),
      });
      return bundleId;
    }

    // EOA sequential path
    const receipts: Array<{
      status: "CONFIRMED";
      receipt: {
        transactionHash: Hash;
        status: "0x1" | "0x0";
      };
    }> = [];
    let failedAt: number | null = null;
    for (let i = 0; i < payload.calls.length; i++) {
      const call = payload.calls[i];
      try {
        const txHash = await this.execSendTransaction(
          {
            ...intent,
            kind: "sendTransaction",
            payload: {
              type: 2,
              to: call.to,
              from: payload.from,
              value: call.value,
              data: call.data,
              gas: call.gas,
              chainId: payload.chainId,
            } as EvmSendTxPayload,
          },
          ctx,
        );
        receipts.push({
          status: "CONFIRMED",
          receipt: { transactionHash: txHash, status: "0x1" },
        });
      } catch (e) {
        failedAt = i;
        await BundleStatusStore.update(bundleId, {
          status: "FAILED",
          receipts: [
            ...receipts,
            {
              status: "FAILED",
              error: e instanceof Error ? e.message : String(e),
            },
            ...payload.calls
              .slice(i + 1)
              .map(() => ({ status: "PENDING" as const })),
          ],
        });
        break;
      }
    }
    if (failedAt === null) {
      await BundleStatusStore.update(bundleId, {
        status: "CONFIRMED",
        receipts,
      });
    }
    return bundleId;
  }

  private async execViaBundler(
    wallet: TWallet,
    calls: EvmSendTxPayload[] | EvmBatchCallsPayload["calls"],
    chainId: number,
    ctx: AdapterContext,
  ): Promise<Hash> {
    const bundlerConfig = getBundlerConfig(chainId);
    if (!bundlerConfig)
      throw PROVIDER_ERRORS.internalError("no bundler for chain");
    const pc = this.publicClient(ctx);

    // callData encoding: simplified — one call = direct callData; batch goes
    // through the smart account's `executeBatch`. A production impl would
    // branch on the account ABI. For now we build a bare-bones UserOp
    // skeleton and delegate gas fields to the bundler.
    const firstCall = (calls as EvmSendTxPayload[])[0];
    const callData: Hex = (firstCall?.data as Hex) ?? "0x";

    const nonceOnChain = await pc.getTransactionCount({
      address: wallet.address as `0x${string}`,
    });

    const userOp: UserOperation = {
      sender: wallet.address as `0x${string}`,
      nonce: toHex(nonceOnChain),
      initCode: "0x",
      callData,
      callGasLimit: "0x100000",
      verificationGasLimit: "0x100000",
      preVerificationGas: "0x10000",
      maxFeePerGas: "0x59682f00",
      maxPriorityFeePerGas: "0x59682f00",
      paymasterAndData: "0x",
      signature: ("0x" + "00".repeat(65)) as Hex,
    };

    // Paymaster — if wallet opted in.
    const feeSource = (firstCall as { feeSource?: FeeSource } | undefined)
      ?.feeSource;
    if (
      feeSource &&
      feeSource !== "native" &&
      typeof getPaymasterConfig === "function"
    ) {
      const paymasterConfig = getPaymasterConfig(chainId);
      if (paymasterConfig) {
        try {
          const stub = await Paymaster.getStubData(
            paymasterConfig,
            userOp,
            toHex(chainId),
            { sponsored: feeSource === "sponsored" },
          );
          userOp.paymasterAndData = stub.paymasterAndData;
        } catch {
          // Sponsored path explicitly does not silently degrade. If the
          // paymaster rejected, surface an error and let the user retry
          // with feeSource = native.
          throw PROVIDER_ERRORS.internalError(
            "Paymaster rejected sponsorship — try native gas.",
          );
        }
      }
    }

    const gas = await Bundler.estimateUserOpGas(bundlerConfig, userOp);
    userOp.callGasLimit = gas.callGasLimit;
    userOp.verificationGasLimit = gas.verificationGasLimit;
    userOp.preVerificationGas = gas.preVerificationGas;

    if (
      feeSource &&
      feeSource !== "native" &&
      typeof getPaymasterConfig === "function"
    ) {
      const paymasterConfig = getPaymasterConfig(chainId);
      if (paymasterConfig) {
        const data = await Paymaster.getData(
          paymasterConfig,
          userOp,
          toHex(chainId),
          { sponsored: feeSource === "sponsored" },
        );
        userOp.paymasterAndData = data.paymasterAndData;
      }
    }

    // Signing the UserOp hash is ABI-dependent on the account. A production
    // impl would use viem/account-abstraction's account client. We sign the
    // userOpHash via a best-effort path — the EOA signer's personal_sign.
    const account = getAccountForWallet(wallet);
    if (!account) throw PROVIDER_ERRORS.internalError("no signer");
    const userOpHash = await pc.call({
      to: bundlerConfig.entryPoint,
      // getUserOpHash(UserOperation, chainId) selector 0x…
      data: "0x" as Hex,
    });
    const signature = await account.signMessage({
      message: { raw: (userOpHash.data ?? "0x") as Hex },
    });
    userOp.signature = signature;

    const userOpHashSubmitted = await Bundler.sendUserOp(bundlerConfig, userOp);
    const receipt = await Bundler.waitForUserOpReceipt(
      bundlerConfig,
      userOpHashSubmitted,
    );
    return receipt.transactionHash;
  }

  private async execSignAuthorization(
    intent: ApprovalIntent,
    ctx: AdapterContext,
  ): Promise<Hex> {
    const payload = intent.payload as EvmAuthorizationPayload;
    if (!AUTHORIZED_DELEGATORS.has(payload.delegator.toLowerCase())) {
      throw PROVIDER_ERRORS.invalidParams("delegator not on allowlist");
    }
    const wallet = intent.wallet ?? ctx.activeWallet;
    if (!wallet) throw PROVIDER_ERRORS.disconnected();
    const account = getAccountForWallet(wallet);
    if (!account) throw PROVIDER_ERRORS.internalError("no signer");
    // Delegate to viem's signAuthorization when available on the account.
    const signFn = (
      account as unknown as {
        signAuthorization?: (params: {
          contractAddress: `0x${string}`;
          chainId: number;
          nonce: number;
        }) => Promise<Hex>;
      }
    ).signAuthorization;
    if (typeof signFn !== "function")
      throw PROVIDER_ERRORS.internalError(
        "account does not support signAuthorization",
      );
    const sig = await signFn({
      contractAddress: payload.delegator,
      chainId: payload.chainId,
      nonce: payload.nonce,
    });
    return sig;
  }

  // --- Public helpers --------------------------------------------------------

  /**
   * Exposed for SIWE / backend auth. Verifies a signature against an address
   * using EOA recover, ERC-1271, or EIP-6492 counterfactual paths in order.
   */
  async verifySignature(params: {
    address: `0x${string}`;
    hash: Hash;
    signature: Hex;
    chainId: number;
  }): Promise<{
    valid: boolean;
    scheme: "ecdsa" | "erc1271" | "eip6492" | null;
  }> {
    // Resolve a public client for the requested chain explicitly — SIWE
    // messages specify their own chainId.
    const chainStored = UserChainStore.get(params.chainId);
    const ctxLike: AdapterContext = {
      activeWallet: null,
      wallets: [],
      setActiveWallet: () => {},
      getAccount: () => null,
    };
    let pc: PublicClient;
    try {
      pc = this.publicClient(ctxLike);
    } catch {
      if (!chainStored) return { valid: false, scheme: null };
      pc = createPublicClient({
        chain: {
          id: chainStored.chainId,
          name: chainStored.chainName,
          nativeCurrency: chainStored.nativeCurrency,
          rpcUrls: { default: { http: chainStored.rpcUrls } },
        } as unknown as Chain,
        transport: http(chainStored.rpcUrls[0]),
      }) as PublicClient;
    }
    return verifySignature({
      address: params.address,
      hash: params.hash,
      signature: params.signature,
      publicClient: pc,
    });
  }

  private async buildGasEstimate(
    pc: PublicClient,
    payload: EvmSendTxPayload,
    rawTx: Record<string, unknown>,
  ): Promise<GasEstimate> {
    const dAppGas =
      typeof rawTx.gas === "string"
        ? safeBigint(rawTx.gas as string)
        : undefined;
    const dAppMaxFee =
      typeof rawTx.maxFeePerGas === "string"
        ? safeBigint(rawTx.maxFeePerGas as string)
        : undefined;
    const dAppPrio =
      typeof rawTx.maxPriorityFeePerGas === "string"
        ? safeBigint(rawTx.maxPriorityFeePerGas as string)
        : undefined;
    const dAppGasPrice =
      typeof rawTx.gasPrice === "string"
        ? safeBigint(rawTx.gasPrice as string)
        : undefined;

    const walletGas = await pc.estimateGas({
      account: payload.from,
      to: payload.to,
      value: payload.value ?? 0n,
      data: payload.data,
    });

    let walletMaxFee: bigint | undefined;
    let walletPriority: bigint | undefined;
    let walletGasPrice: bigint | undefined;
    if (payload.type === 2) {
      try {
        const fh = await pc.getFeeHistory({
          blockCount: 5,
          rewardPercentiles: [50],
        });
        const baseFee = fh.baseFeePerGas.at(-1) ?? 0n;
        const reward =
          fh.reward?.flat().reduce((a, b) => (a > b ? a : b), 0n) ??
          1_500_000_000n;
        walletPriority = reward;
        walletMaxFee = baseFee * 2n + reward;
      } catch {
        walletPriority = 1_500_000_000n;
        walletMaxFee = 30_000_000_000n;
      }
    } else {
      try {
        walletGasPrice = await pc.getGasPrice();
      } catch {
        walletGasPrice = undefined;
      }
    }

    const recommended = decideRecommended(
      payload.type === 2 ? dAppMaxFee : dAppGasPrice,
      payload.type === 2 ? walletMaxFee : walletGasPrice,
      dAppGas,
      walletGas,
    );
    const rationale = buildRationale(
      recommended,
      dAppGas,
      walletGas,
      payload.type === 2 ? dAppMaxFee : dAppGasPrice,
      payload.type === 2 ? walletMaxFee : walletGasPrice,
    );

    return {
      dApp: {
        gas: dAppGas,
        maxFeePerGas: dAppMaxFee,
        maxPriorityFeePerGas: dAppPrio,
        gasPrice: dAppGasPrice,
      },
      wallet: {
        gas: walletGas,
        maxFeePerGas: walletMaxFee,
        maxPriorityFeePerGas: walletPriority,
        gasPrice: walletGasPrice,
      },
      recommended,
      rationale,
    };
  }
}

// --- Helpers ---------------------------------------------------------------

function resolved(value: unknown): ChainResult {
  return { status: "resolved", value };
}
function needsApproval(intent: ApprovalIntent): ChainResult {
  return { status: "needs-approval", intent };
}
function err(e: ProviderRpcError): ChainResult {
  return { status: "error", code: e.code, message: e.message, data: e.data };
}

function makeIntent<P>(
  req: ChainRequest,
  kind: ApprovalIntent["kind"],
  payload: P,
  wallet: TWallet | null,
  extra?: Record<string, unknown>,
): ApprovalIntent<P & Record<string, unknown>> {
  return {
    id: req.id,
    namespace: "eip155",
    kind,
    origin: req.origin,
    wallet,
    payload: { ...(payload as object), ...(extra ?? {}) } as P &
      Record<string, unknown>,
    annotations: [],
    createdAt: Date.now(),
  };
}

function normalizeTx(
  raw: Record<string, unknown>,
  chainId: number,
  from: `0x${string}`,
):
  | {
      payload: EvmSendTxPayload;
    }
  | { error: ProviderRpcError } {
  try {
    const to = raw.to as `0x${string}` | undefined;
    if (!to || !isAddress(to))
      return { error: PROVIDER_ERRORS.invalidParams("to") };
    const value = raw.value ? safeBigint(raw.value as string) : undefined;
    const data = (raw.data ?? raw.input) as Hex | undefined;
    const gas = raw.gas ? safeBigint(raw.gas as string) : undefined;
    const maxFeePerGas = raw.maxFeePerGas
      ? safeBigint(raw.maxFeePerGas as string)
      : undefined;
    const maxPriorityFeePerGas = raw.maxPriorityFeePerGas
      ? safeBigint(raw.maxPriorityFeePerGas as string)
      : undefined;
    const gasPrice = raw.gasPrice
      ? safeBigint(raw.gasPrice as string)
      : undefined;
    const accessList = raw.accessList as EvmSendTxPayload extends {
      accessList?: infer A;
    }
      ? A
      : undefined;
    const nonce =
      typeof raw.nonce === "string"
        ? Number(fromHex(raw.nonce as Hex, "number"))
        : typeof raw.nonce === "number"
          ? raw.nonce
          : undefined;
    const explicitType =
      typeof raw.type === "string"
        ? Number(fromHex(raw.type as Hex, "number"))
        : typeof raw.type === "number"
          ? raw.type
          : undefined;

    let type: 0 | 1 | 2;
    if (explicitType === 0 || explicitType === 1 || explicitType === 2) {
      type = explicitType;
    } else if (maxFeePerGas || maxPriorityFeePerGas) type = 2;
    else if (accessList && gasPrice) type = 1;
    else if (gasPrice) type = 0;
    else type = 2;

    // reject invalid combos at the boundary
    if (type === 2 && gasPrice)
      return {
        error: PROVIDER_ERRORS.invalidParams("gasPrice with type 2 tx"),
      };
    if (type === 0 && (maxFeePerGas || maxPriorityFeePerGas))
      return {
        error: PROVIDER_ERRORS.invalidParams("dynamic-fee fields on legacy tx"),
      };

    const common = { to, from, value, data, gas, nonce, chainId } as const;
    const payload: EvmSendTxPayload =
      type === 0
        ? { ...common, type: 0, gasPrice }
        : type === 1
          ? { ...common, type: 1, gasPrice, accessList }
          : {
              ...common,
              type: 2,
              maxFeePerGas,
              maxPriorityFeePerGas,
              accessList,
            };
    return { payload };
  } catch (e) {
    return {
      error: PROVIDER_ERRORS.invalidParams(
        e instanceof Error ? e.message : "tx",
      ),
    };
  }
}

function normalizeAddChain(
  raw: Record<string, unknown>,
): { payload: EvmAddChainPayload } | { error: ProviderRpcError } {
  if (!raw || typeof raw !== "object")
    return { error: PROVIDER_ERRORS.invalidParams("addChain") };
  const chainIdHex = raw.chainId as Hex | undefined;
  if (!chainIdHex || !isHex(chainIdHex))
    return { error: PROVIDER_ERRORS.invalidParams("chainId") };
  const chainId = Number(fromHex(chainIdHex, "number"));
  const chainName = raw.chainName as string;
  const nativeCurrency =
    raw.nativeCurrency as EvmAddChainPayload["nativeCurrency"];
  const rpcUrls = raw.rpcUrls as string[] | undefined;
  if (
    !chainName ||
    !nativeCurrency ||
    !Array.isArray(rpcUrls) ||
    rpcUrls.length === 0
  )
    return { error: PROVIDER_ERRORS.invalidParams("addChain fields") };
  return {
    payload: {
      chainId,
      chainName,
      nativeCurrency,
      rpcUrls,
      blockExplorerUrls: raw.blockExplorerUrls as string[] | undefined,
      iconUrls: raw.iconUrls as string[] | undefined,
    },
  };
}

function normalizeWatchAsset(
  raw: Record<string, unknown>,
): { payload: EvmWatchAssetPayload } | { error: ProviderRpcError } {
  if (!raw || typeof raw !== "object")
    return { error: PROVIDER_ERRORS.invalidParams("watchAsset") };
  const type = raw.type as string;
  const options = raw.options as Record<string, unknown>;
  if (!options) return { error: PROVIDER_ERRORS.invalidParams("options") };
  const address = options.address as `0x${string}`;
  const chainId = Number(
    typeof options.chainId === "string"
      ? fromHex(options.chainId as Hex, "number")
      : options.chainId,
  );
  let image = options.image as string | undefined;
  if (image && !image.startsWith("https://")) image = undefined;
  if (!isAddress(address))
    return { error: PROVIDER_ERRORS.invalidParams("address") };
  if (!chainId || Number.isNaN(chainId))
    return { error: PROVIDER_ERRORS.invalidParams("chainId") };
  if (type === "ERC20") {
    const symbol = options.symbol as string;
    const decimals = Number(options.decimals);
    if (!symbol || Number.isNaN(decimals))
      return { error: PROVIDER_ERRORS.invalidParams("symbol/decimals") };
    return {
      payload: { standard: "ERC20", address, symbol, decimals, image, chainId },
    };
  }
  if (type === "ERC721" || type === "ERC1155") {
    return {
      payload: {
        standard: type,
        address,
        tokenId: options.tokenId as string | undefined,
        symbol: options.symbol as string | undefined,
        image,
        chainId,
      },
    };
  }
  return { error: PROVIDER_ERRORS.invalidParams("unsupported type") };
}

function normalizeSendCalls(
  raw: Record<string, unknown>,
  activeChainId: number,
  activeAddress: `0x${string}`,
): { payload: EvmBatchCallsPayload } | { error: ProviderRpcError } {
  if (!raw || typeof raw !== "object")
    return { error: PROVIDER_ERRORS.invalidParams("sendCalls") };
  const version = (raw.version as string) ?? "1.0";
  if (version !== "1.0")
    return { error: PROVIDER_ERRORS.invalidParams("version") };
  const chainIdHex = raw.chainId as Hex | undefined;
  const chainId = chainIdHex
    ? Number(fromHex(chainIdHex, "number"))
    : activeChainId;
  if (chainId !== activeChainId)
    return { error: PROVIDER_ERRORS.chainNotConnected() };
  const from = ((raw.from as string) ?? activeAddress) as `0x${string}`;
  if (from.toLowerCase() !== activeAddress.toLowerCase())
    return { error: PROVIDER_ERRORS.invalidParams("from") };
  const callsRaw = raw.calls as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(callsRaw))
    return { error: PROVIDER_ERRORS.invalidParams("calls") };
  const calls = callsRaw.map((c) => ({
    to: c.to as `0x${string}`,
    value: c.value ? safeBigint(c.value as string) : undefined,
    data: c.data as Hex | undefined,
    gas: c.gas ? safeBigint(c.gas as string) : undefined,
  }));
  return {
    payload: {
      version: "1.0",
      chainId,
      from,
      calls,
      capabilities: raw.capabilities as Record<string, unknown> | undefined,
    },
  };
}

function safeBigint(v: string | number | bigint): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (v.startsWith("0x")) return BigInt(v);
  return BigInt(v);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function decideRecommended(
  dAppFee: bigint | undefined,
  walletFee: bigint | undefined,
  dAppGas: bigint | undefined,
  walletGas: bigint,
): "wallet" | "dApp" {
  if (dAppFee === undefined || dAppGas === undefined) return "wallet";
  if (!walletFee) return "dApp";
  const feeDelta =
    walletFee > dAppFee
      ? Number(((walletFee - dAppFee) * 100n) / dAppFee)
      : Number(((dAppFee - walletFee) * 100n) / (walletFee || 1n));
  const gasDelta =
    walletGas > dAppGas
      ? Number(((walletGas - dAppGas) * 100n) / (dAppGas || 1n))
      : Number(((dAppGas - walletGas) * 100n) / (walletGas || 1n));
  return feeDelta > 10 || gasDelta > 10 ? "wallet" : "dApp";
}

function buildRationale(
  recommended: "wallet" | "dApp",
  dAppGas: bigint | undefined,
  walletGas: bigint,
  dAppFee: bigint | undefined,
  walletFee: bigint | undefined,
): string {
  if (recommended === "dApp")
    return "dApp values are within 10% of wallet estimate.";
  if (!dAppFee || !dAppGas)
    return "dApp omitted gas fields; using wallet estimate.";
  if (walletFee && dAppFee && walletFee > dAppFee) {
    return `dApp fee is ${Number(((walletFee - dAppFee) * 100n) / dAppFee)}% below wallet estimate; transaction may not confirm.`;
  }
  if (walletGas > dAppGas) {
    return `dApp gas is ${Number(((walletGas - dAppGas) * 100n) / dAppGas)}% below wallet estimate.`;
  }
  return "Wallet recommends its estimate.";
}

// --- Origin helper re-export ------------------------------------------------

export function normalizeOrigin(origin: Origin): Origin {
  return { ...origin, url: originKey(origin.url) };
}

// --- Re-exports for convenience --------------------------------------------

export {
  PROVIDER_ERRORS,
  ProviderRpcError,
} from "./errors";
