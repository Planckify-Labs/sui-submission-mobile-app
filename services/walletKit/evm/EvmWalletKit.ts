/**
 * `EvmWalletKit` — relocates existing EVM helpers behind the
 * `WalletKitAdapter` interface.
 *
 * Per spec §4.5 / §7.6 and Task 05: this is a **no-behavior-change**
 * relocation. Every call site forwards to the existing helper in
 * `utils/walletUtils.ts`, `utils/clients.ts`, or
 * `services/walletService.ts` — no reimplementation, no reformatting,
 * no "while we're here" cleanup. R4b mitigation depends on this.
 *
 * Callers are responsible for dispatching on `ChainConfig.namespace`
 * via `walletKitRegistry`; every method here narrows to `"eip155"` at
 * entry and throws on mismatch.
 */

import { formatUnits, isAddress, parseUnits } from "viem";
import type { ChainConfig } from "../../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../../constants/types/walletTypes.ts";
import { getPublicClient, getWalletClient } from "../../../utils/clients.ts";
import {
  createWalletFromMnemonic as createEvmWalletFromMnemonic,
  createWalletFromPrivateKey as createEvmWalletFromPrivateKey,
  isValidMnemonic,
  isValidPrivateKey,
  truncateAddress as truncateAddressUtil,
} from "../../../utils/walletUtils.ts";
import {
  generateWalletMnemonic,
  getAccountForWallet,
} from "../../walletService.ts";
import type {
  CreateWalletFromMnemonicParams,
  CreateWalletFromPrivateKeyParams,
  EstimateMaxTransferableArgs,
  NativeTransferArgs,
  SendUserOpResult,
  SendUserOpWithUsdcPaymasterArgs,
  SignTransferWithAuthorizationArgs,
  TruncateAddressOptions,
  WalletKitAdapter,
} from "../types.ts";
import { sendUserOpWithUsdcPaymaster as sendUserOpWithUsdcPaymasterPure } from "./sendUserOpWithUsdcPaymaster.ts";
import { signTransferWithAuthorization as signTransferWithAuthorizationPure } from "./signTransferWithAuthorization.ts";

const EVM_NAMESPACE = "eip155" as const;

function assertEvm(
  chain: ChainConfig,
): asserts chain is Extract<ChainConfig, { namespace: "eip155" }> {
  if (chain.namespace !== EVM_NAMESPACE) {
    throw new Error("EvmWalletKit: expected eip155 chain");
  }
}

export function createEvmWalletKit(): WalletKitAdapter {
  return {
    namespace: EVM_NAMESPACE,
    supportsTokenTransfer: true,
    supportsPrivateKeyImport: true,
    displayName: "Ethereum",
    brandColor: "#627EEA",
    getChainId(chain) {
      return chain.namespace === EVM_NAMESPACE ? chain.chain.id : null;
    },
    formatChainLabel(chain) {
      return chain.namespace === EVM_NAMESPACE ? chain.chain.name : null;
    },
    nativeSymbol(chain) {
      return chain.namespace === EVM_NAMESPACE
        ? chain.chain.nativeCurrency.symbol
        : null;
    },

    // ── Wallet creation & validation ────────────────────────────────
    validateAddress: (address: string): boolean => isAddress(address),
    validatePrivateKey: (privateKey: string): boolean =>
      isValidPrivateKey(privateKey),
    validateMnemonic: (mnemonic: string): boolean => isValidMnemonic(mnemonic),

    async createWalletFromPrivateKey(
      params: CreateWalletFromPrivateKeyParams,
    ): Promise<TWallet> {
      return createEvmWalletFromPrivateKey(params.privateKey, params.name);
    },

    async createWalletFromMnemonic(
      params: CreateWalletFromMnemonicParams,
    ): Promise<TWallet> {
      return createEvmWalletFromMnemonic(params.mnemonic, params.name);
    },

    generateMnemonic: (): string => generateWalletMnemonic(),

    // ── Keys & signers ──────────────────────────────────────────────
    async getSignerForWallet(wallet: TWallet): Promise<unknown | null> {
      return getAccountForWallet(wallet);
    },

    // ── Reads ───────────────────────────────────────────────────────
    async getNativeBalance(
      address: string,
      chain: ChainConfig,
    ): Promise<bigint> {
      assertEvm(chain);
      const pc = getPublicClient(chain.chain);
      return pc.getBalance({ address: address as `0x${string}` });
    },

    // ── Writes ──────────────────────────────────────────────────────
    async sendNativeTransfer({
      wallet,
      to,
      amount,
      chain,
    }: NativeTransferArgs): Promise<string> {
      assertEvm(chain);
      const account = getAccountForWallet(wallet);
      if (!account) {
        throw new Error("EvmWalletKit: unable to reconstruct signer");
      }
      const wc = getWalletClient(account, chain.chain);
      const hash = await wc.sendTransaction({
        to: to as `0x${string}`,
        value: amount,
      });
      return hash;
    },

    // ── Gasless USDC signer (spec §5.5, milestone M2) ──────────────
    //
    // Routes through the shared viem `signTypedData` primitive — zero
    // new keystore access patterns, zero new biometric plumbing. The
    // EIP-712 domain / type shape is pinned in
    // `signTransferWithAuthorization.ts` so Circle's Gateway struct
    // lives in exactly one place.
    async signTransferWithAuthorization(
      args: SignTransferWithAuthorizationArgs,
    ): Promise<`0x${string}`> {
      assertEvm(args.chain);
      const account = getAccountForWallet(args.wallet);
      if (!account) {
        throw new Error(
          "EvmWalletKit.signTransferWithAuthorization: unable to reconstruct signer",
        );
      }
      return signTransferWithAuthorizationPure(account, args);
    },

    // ── Circle Paymaster ERC-4337 UserOp (spec §5.4 / §12 Q6, M4) ──
    //
    // Routes through the pure `sendUserOpWithUsdcPaymaster` module so
    // the viem `toSimple7702SmartAccount` + `sendUserOperation`
    // wiring lives in exactly one place. The kit's job is to resolve
    // the wallet's signer and narrow the chain — everything else
    // (approve-preamble, EIP-7702 authorization, bundler submit) is
    // pure-function and Node-testable.
    async sendUserOpWithUsdcPaymaster(
      args: SendUserOpWithUsdcPaymasterArgs,
    ): Promise<SendUserOpResult> {
      assertEvm(args.chain);
      const account = getAccountForWallet(args.wallet);
      if (!account) {
        throw new Error(
          "EvmWalletKit.sendUserOpWithUsdcPaymaster: unable to reconstruct signer",
        );
      }
      return sendUserOpWithUsdcPaymasterPure(account, args);
    },

    async estimateMaxTransferable({
      balance,
      chain,
      from,
      to,
    }: EstimateMaxTransferableArgs): Promise<bigint> {
      assertEvm(chain);
      const pc = getPublicClient(chain.chain);
      const gas =
        ((await pc.estimateGas({
          account: from as `0x${string}`,
          to: (to ?? from) as `0x${string}`,
          value: balance,
        })) *
          11n) /
        10n;
      const gasPrice = await pc.getGasPrice();
      const max = balance - gas * gasPrice;
      return max > 0n ? max : 0n;
    },

    // ── Display ─────────────────────────────────────────────────────
    // Shape is `"<amount> <symbol>"` — mirrors the Solana kit
    // (`"0.0123 SOL"`) so `app/send.tsx` and `app/wallet.tsx` can
    // display the kit output directly without re-reading
    // `chain.nativeCurrency.symbol`. Callers that need just the number
    // (e.g. the amount input field) strip the symbol via
    // `.split(" ")[0]` — see §7.6 / §7.7.
    formatNativeAmount(raw: bigint, chain: ChainConfig): string {
      assertEvm(chain);
      const human = parseFloat(
        formatUnits(raw, chain.chain.nativeCurrency.decimals),
      ).toFixed(4);
      return `${human} ${chain.chain.nativeCurrency.symbol}`;
    },
    parseNativeAmount(human: string, chain: ChainConfig): bigint {
      assertEvm(chain);
      return parseUnits(human, chain.chain.nativeCurrency.decimals);
    },
    truncateAddress(address: string, opts?: TruncateAddressOptions): string {
      return truncateAddressUtil({
        address,
        startLength: opts?.start,
        endLength: opts?.end,
      });
    },
  };
}
