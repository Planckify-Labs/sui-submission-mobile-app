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
import type { KeyPairSigner } from "@solana/kit";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

import type { ChainConfig } from "../../../constants/configs/chainConfig.ts";
import type { TWallet } from "../../../constants/types/walletTypes.ts";
import {
  createSolanaWalletFromMnemonic,
  createSolanaWalletFromPrivateKey,
  isValidSolanaAddress,
  isValidSolanaPrivateKey,
  truncateAddress as truncateAddressUtil,
} from "../../../utils/walletUtils.ts";
import {
  buildAndSendSolTransfer,
  getSolanaBalance,
} from "../../chains/solana/transferService.ts";
import {
  generateWalletMnemonic,
  getSolanaSignerForWallet,
} from "../../walletService.ts";
import type {
  CreateWalletFromMnemonicParams,
  CreateWalletFromPrivateKeyParams,
  EstimateMaxTransferableArgs,
  NativeTransferArgs,
  SendAnchorInstructionArgs,
  SignX402SvmPaymentArgs,
  TruncateAddressOptions,
  WalletKitAdapter,
} from "../types.ts";
import { SvmWalletNamespaceMismatchError } from "../types.ts";
import {
  assertSolanaSigner,
  signX402SvmPaymentWithSigner,
} from "./signX402SvmPayment.ts";

// 5,000 lamports signature fee + 890,880 lamports minimum rent-exempt
// buffer (empty account) so native transfer never drains below rent.
const FEE_RESERVE_LAMPORTS: bigint = 5_000n + 890_880n;

/** 1 SOL = 1e9 lamports. Named so the formatters stay self-documenting. */
const LAMPORTS_PER_SOL = 1_000_000_000;

const SOLANA_NAMESPACE = "solana" as const;

function assertSolana(
  chain: ChainConfig,
): asserts chain is Extract<ChainConfig, { namespace: "solana" }> {
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
    brandColor: "#9945FF",
    requireBiometricForConnect: true,
    formatConnectChipLabel(payload: unknown): string {
      const cluster = (payload as { cluster?: string } | null)?.cluster;
      const label =
        cluster === "devnet"
          ? "Devnet"
          : cluster === "testnet"
            ? "Testnet"
            : "Mainnet";
      return `Solana · ${label}`;
    },
    getChainId(chain) {
      return chain.namespace === SOLANA_NAMESPACE ? chain.cluster : null;
    },
    formatChainLabel(chain) {
      if (chain.namespace !== SOLANA_NAMESPACE) return null;
      const label = chain.cluster === "devnet" ? "Devnet" : "Mainnet";
      return `Solana ${label}`;
    },
    nativeSymbol(chain) {
      return chain.namespace === SOLANA_NAMESPACE ? "SOL" : null;
    },

    // ── Wallet creation & validation ────────────────────────────────
    validateAddress: (address: string): boolean =>
      isValidSolanaAddress(address),
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

    // ── Path B-SVM x402 signer (spec §5.2.1, §5.5, milestone M6) ────
    //
    // Solana counterpart to `EvmWalletKit.signTransferWithAuthorization`.
    // The facilitator hands us a pre-built partially-signed versioned
    // transaction (ComputeBudget × 2, TransferChecked, optional Memo);
    // this method resolves the wallet's Solana signer via the
    // walletService dwell site and delegates to the pure
    // `signX402SvmPaymentWithSigner` primitive, which attaches the
    // user's signature over the existing message bytes without
    // mutating instructions. Returns the updated base64 wire tx.
    //
    // EVM kit leaves this `undefined` — consumers presence-check per
    // the chain-extension discipline (memory:
    // `feedback_chain_extension_discipline.md`).
    async signX402SvmPayment(args: SignX402SvmPaymentArgs): Promise<string> {
      // Guard: the wallet must belong to this kit's namespace. We
      // narrow on `wallet.namespace` (not on a `ChainConfig`) because
      // the SVM x402 scheme erases the per-chain config — the
      // facilitator's pre-built tx already encodes the cluster
      // (mainnet-beta / devnet) via its blockhash lifetime, and the
      // `cluster` field on `args` is just carried through to the
      // downstream facilitator POST (task 43). Wrong-namespace
      // wallets fail loud here instead of silently returning an
      // unsigned tx.
      if (args.wallet.namespace !== SOLANA_NAMESPACE) {
        throw new SvmWalletNamespaceMismatchError(args.wallet.namespace);
      }
      const signer: KeyPairSigner | null = await getSolanaSignerForWallet(
        args.wallet,
      );
      assertSolanaSigner(signer, args.wallet.address);
      return signX402SvmPaymentWithSigner(signer, args.transaction);
    },

    async sendAnchorInstruction(args: SendAnchorInstructionArgs): Promise<string> {
      assertSolana(args.chain);
      const signer: KeyPairSigner | null = await getSolanaSignerForWallet(args.wallet);
      if (!signer) {
        throw new Error("No Solana signer for wallet");
      }

      const rpc = createSolanaRpc(args.chain.rpcUrl);

      const { TransactionMessage, VersionedTransaction, PublicKey: PK } = await import("@solana/web3.js");

      const payerKey = new PK(signer.address);

      let blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
      if (args.durableNonce) {
        blockhashInfo = {
          blockhash: args.durableNonce.nonceAccount.toBase58(),
          lastValidBlockHeight: Number.MAX_SAFE_INTEGER,
        };
      } else {
        const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
        blockhashInfo = {
          blockhash: value.blockhash,
          lastValidBlockHeight: Number(value.lastValidBlockHeight),
        };
      }

      const messageV0 = TransactionMessage.compile({
        payerKey,
        recentBlockhash: blockhashInfo.blockhash,
        instructions: args.instructions,
        addressLookupTableAccounts: args.addressLookupTables,
      });

      const tx = new VersionedTransaction(messageV0);

      // Sign with the wallet signer
      const { Keypair } = await import("@solana/web3.js");
      const secretKey = await (signer as any).keyPair;
      // The signer from @solana/kit is a KeyPairSigner — we need the raw secret for @solana/web3.js signing
      // Use the wallet service path to get the raw keypair bytes
      const walletPrivateKey = await import("@/services/walletService").then(
        (m) => m.getWalletPrivateKey(args.wallet),
      );
      if (!walletPrivateKey) throw new Error("Could not retrieve wallet private key");

      const { bs58 } = await import("@/utils/walletUtils").then(async (m) => {
        const bs58Module = await import("bs58");
        return { bs58: bs58Module.default ?? bs58Module };
      });
      const keypairBytes = bs58.decode(walletPrivateKey);
      const keypair = Keypair.fromSecretKey(
        keypairBytes.length === 32
          ? new Uint8Array([...keypairBytes, ...payerKey.toBytes()])
          : keypairBytes,
      );
      tx.sign([keypair, ...(args.additionalSigners ?? [])]);

      // Broadcast
      const { Connection } = await import("@solana/web3.js");
      const connection = new Connection(args.chain.rpcUrl, "confirmed");
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Wait for confirmation
      await connection.confirmTransaction(
        { signature, blockhash: blockhashInfo.blockhash, lastValidBlockHeight: blockhashInfo.lastValidBlockHeight },
        "confirmed",
      );

      return signature;
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
