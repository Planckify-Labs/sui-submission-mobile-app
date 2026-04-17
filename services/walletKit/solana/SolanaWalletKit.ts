/**
 * `SolanaWalletKit` — binds the Solana primitives (Tasks 07–11) behind
 * the `WalletKitAdapter` interface (Task 04) so screens, onboarding
 * sheets, and the bridge signer all dispatch through one seam.
 *
 * Spec reference: `docs/solana-chain-support-spec.md` §4.5, §6.1, §7.6.
 *
 * Rules (non-negotiable — enforced by review):
 *   - No signing path outside `services/walletService.ts`.
 *     `sendNativeTransfer` calls `getSolanaSignerForWallet` — it does
 *     not reconstruct a signer itself (TWV-2026-070).
 *   - Narrow, don't cast. Every `ChainConfig`-accepting method guards
 *     on `namespace === "solana"` at entry and throws on mismatch;
 *     never `as any`.
 *   - `FEE_RESERVE_LAMPORTS` is a named constant so reviewers can see
 *     exactly what's being reserved and why.
 *
 * This file is the single registration target for Solana's first-party
 * wallet operations. Future chain families plug in the same way — one
 * new file under `services/walletKit/<family>/` + one register call in
 * `boot.ts`.
 */

import { validateMnemonic } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import type { KeyPairSigner } from "@solana/kit";

import type { ChainConfig } from "../../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../../constants/types/walletTypes.ts";
import {
  buildAndSendSolTransfer,
  getSolanaBalance,
} from "../../chains/solana/transferService.ts";
import {
  generateWalletMnemonic,
  getSolanaSignerForWallet,
} from "../../walletService.ts";
import {
  createSolanaWalletFromMnemonic,
  createSolanaWalletFromPrivateKey,
  isValidSolanaAddress,
  isValidSolanaPrivateKey,
  truncateAddress as truncateAddressUtil,
} from "../../../utils/walletUtils.ts";
import type {
  CreateWalletFromMnemonicParams,
  CreateWalletFromPrivateKeyParams,
  EstimateMaxTransferableArgs,
  NativeTransferArgs,
  TruncateAddressOptions,
  WalletKitAdapter,
} from "../types.ts";

// 5,000 lamports signature fee + 890,880 lamports minimum rent-exempt
// buffer (empty account) so native transfer never drains below rent.
const FEE_RESERVE_LAMPORTS: bigint = 5_000n + 890_880n;

/** 1 SOL = 1e9 lamports. Named so the formatters stay self-documenting. */
const LAMPORTS_PER_SOL = 1_000_000_000;

const SOLANA_NAMESPACE = "solana" as const;

function assertSolana(chain: ChainConfig): asserts chain is Extract<
  ChainConfig,
  { namespace: "solana" }
> {
  if (chain.namespace !== SOLANA_NAMESPACE) {
    throw new Error("SolanaWalletKit: expected solana chain");
  }
}

export function createSolanaWalletKit(): WalletKitAdapter {
  return {
    namespace: SOLANA_NAMESPACE,
    supportsTokenTransfer: false,
    supportsPrivateKeyImport: true,
    displayName: "Solana",

    // ── Wallet creation & validation ────────────────────────────────
    validateAddress: (address: string): boolean => isValidSolanaAddress(address),
    validatePrivateKey: (privateKey: string): boolean =>
      isValidSolanaPrivateKey(privateKey),
    validateMnemonic: (mnemonic: string): boolean =>
      validateMnemonic(mnemonic.trim(), englishWordlist),

    async createWalletFromPrivateKey(
      params: CreateWalletFromPrivateKeyParams,
    ): Promise<TWallet> {
      const wallet = await createSolanaWalletFromPrivateKey(
        params.privateKey,
        params.name,
      );
      if (!wallet) {
        throw new Error(
          "SolanaWalletKit: invalid Solana private key (expected 32- or 64-byte base58)",
        );
      }
      return wallet;
    },

    async createWalletFromMnemonic(
      params: CreateWalletFromMnemonicParams,
    ): Promise<TWallet> {
      const wallet = await createSolanaWalletFromMnemonic(
        params.mnemonic,
        params.name,
      );
      if (!wallet) {
        throw new Error(
          "SolanaWalletKit: invalid BIP-39 mnemonic or SLIP-0010 derivation failure",
        );
      }
      return wallet;
    },

    generateMnemonic: (): string => generateWalletMnemonic(),

    // ── Keys & signers (TWV-2026-070 dwell site) ────────────────────
    async getSignerForWallet(wallet: TWallet): Promise<unknown | null> {
      return getSolanaSignerForWallet(wallet);
    },

    // ── Reads ───────────────────────────────────────────────────────
    async getNativeBalance(
      address: string,
      chain: ChainConfig,
    ): Promise<bigint> {
      assertSolana(chain);
      const rpc = createSolanaRpc(chain.rpcUrl);
      return getSolanaBalance(rpc, address);
    },

    // ── Writes ──────────────────────────────────────────────────────
    async sendNativeTransfer({
      wallet,
      to,
      amount,
      chain,
    }: NativeTransferArgs): Promise<string> {
      assertSolana(chain);
      const signer: KeyPairSigner | null =
        await getSolanaSignerForWallet(wallet);
      if (!signer) {
        throw new Error("No Solana signer for wallet");
      }
      const rpc = createSolanaRpc(chain.rpcUrl);
      const rpcSubs = chain.rpcSubscriptionsUrl
        ? createSolanaRpcSubscriptions(chain.rpcSubscriptionsUrl)
        : undefined;
      const signature = await buildAndSendSolTransfer({
        rpc,
        rpcSubs,
        signer,
        to,
        lamports: amount,
      });
      return String(signature);
    },

    async estimateMaxTransferable({
      balance,
    }: EstimateMaxTransferableArgs): Promise<bigint> {
      return balance > FEE_RESERVE_LAMPORTS
        ? balance - FEE_RESERVE_LAMPORTS
        : 0n;
    },

    // ── Display ─────────────────────────────────────────────────────
    formatNativeAmount(raw: bigint, chain: ChainConfig): string {
      assertSolana(chain);
      return `${(Number(raw) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
    },
    parseNativeAmount(human: string, chain: ChainConfig): bigint {
      assertSolana(chain);
      return BigInt(Math.round(parseFloat(human) * LAMPORTS_PER_SOL));
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
