import {
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
} from "@solana/kit";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import type {
  TWallet,
  TWalletCreationParams,
} from "@/constants/types/walletTypes";
import {
  base58ToBytes,
  bytesToBase58,
  parseSolanaPrivateKey as parseSolanaPrivateKeyCodec,
} from "@/services/chains/solana/codec";
import {
  DEFAULT_SOLANA_PATH,
  mnemonicToSolanaPrivateKey,
} from "@/services/chains/solana/derivation";

export function isValidPrivateKey(privateKey: string): boolean {
  const privateKeyRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  return privateKeyRegex.test(privateKey);
}

export function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  return words.length === 12 || words.length === 24;
}

export function formatPrivateKey(privateKey: string): string {
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

/**
 * Validate a Solana base58 address (32 bytes decoded). Never throws — any
 * malformed input returns `false` so callers can render a clean error
 * state without a try/catch.
 */
export function isValidSolanaAddress(s: string): boolean {
  if (!s) return false;
  try {
    const bytes = base58ToBytes(s);
    return bytes.length === 32;
  } catch {
    return false;
  }
}

/**
 * Validate a Solana private key. Accepts both the 32-byte ed25519 seed
 * form and Phantom's 64-byte export. Never throws.
 *
 * Cross-curve guard (§14.6): a 64-hex EVM key like
 * `0xabcd…` decodes — if at all — to bytes whose length is neither 32
 * nor 64, so it is correctly rejected here before it reaches
 * `createSolanaWalletFromPrivateKey`.
 */
export function isValidSolanaPrivateKey(s: string): boolean {
  if (!s) return false;
  try {
    const bytes = base58ToBytes(s);
    return bytes.length === 32 || bytes.length === 64;
  } catch {
    return false;
  }
}

/**
 * Non-throwing variant of `parseSolanaPrivateKey` from
 * `services/chains/solana/codec.ts`. Returns the 32-byte seed on
 * success or `null` when the input is not a valid 32- or 64-byte
 * base58 Solana secret.
 *
 * Keeps the throwing codec helper as the canonical implementation —
 * this wrapper only converts the failure mode to suit the UI surface.
 */
export function parseSolanaPrivateKey(s: string): Uint8Array | null {
  if (!s) return null;
  try {
    return parseSolanaPrivateKeyCodec(s);
  } catch {
    return null;
  }
}

export function createWalletFromPrivateKey(
  privateKey: string,
  name?: string,
): TWallet {
  const formattedKey = formatPrivateKey(privateKey);
  const account = privateKeyToAccount(formattedKey as `0x${string}`);

  return {
    account,
    address: account.address,
    privateKey: formattedKey,
    name: name || "Imported Wallet",
    balance: "0",
    source: "Imported",
    type: "PrivateKey",
    namespace: "eip155",
  };
}

export function createWalletFromMnemonic(
  seedPhrase: string,
  name?: string,
): TWallet {
  const account = mnemonicToAccount(seedPhrase);

  return {
    account,
    address: account.address,
    seedPhrase,
    name: name || "Seed Phrase Wallet",
    balance: "0",
    source: "Created",
    type: "SeedPhrase",
    namespace: "eip155",
  };
}

/**
 * Create a Solana `TWallet` from a base58-encoded private key.
 *
 * Spec reference: `docs/solana-chain-support-spec.md` §7.3.
 *
 * Accepts either a 32-byte seed or a 64-byte Phantom export (seed +
 * pubkey). Returns `null` on malformed input so callers can render a
 * clean error — the validator surface (`isValidSolanaPrivateKey`) is
 * the *loud* path; this creator is the *safe* path.
 *
 * Security invariant (TWV-2026-070): the WebCrypto `CryptoKeyPair` is
 * minted with `extractable: false`. The raw 32-byte seed is held only
 * on the stack of this function; we store the original base58 string
 * on `TWallet.privateKey` so the signer dwell site (Task 10) can
 * reconstruct it later.
 */
export async function createSolanaWalletFromPrivateKey(
  pkBase58: string,
  name?: string,
): Promise<TWallet | null> {
  const seed = parseSolanaPrivateKey(pkBase58);
  if (!seed) return null;
  try {
    const keyPair = await createKeyPairFromPrivateKeyBytes(seed, false);
    const addr = await getAddressFromPublicKey(keyPair.publicKey);
    const address = addr.toString();
    return {
      account: { address },
      address,
      privateKey: pkBase58,
      name: name || "Solana Wallet",
      balance: "0",
      source: "Imported",
      type: "PrivateKey",
      namespace: "solana",
      solana: { pubkeyBase58: address, derivationPath: undefined },
    };
  } catch {
    return null;
  }
}

/**
 * Create a Solana `TWallet` from a BIP-39 mnemonic via SLIP-0010
 * ed25519 derivation at the Phantom-compatible default path.
 *
 * Spec reference: `docs/solana-chain-support-spec.md` §7.3, §7.2.
 *
 * Returns `null` if the mnemonic fails `isValidMnemonic` (12- or
 * 24-word BIP-39 check) or if kit rejects the derived bytes. We store
 * the seed in Phantom's 32-byte base58 form on `TWallet.privateKey`
 * so the signer can reconstruct it without re-deriving from the
 * mnemonic.
 *
 * Security invariant (TWV-2026-070): `extractable: false` on the
 * CryptoKeyPair — the private half must not leave the kit surface.
 */
export async function createSolanaWalletFromMnemonic(
  mnemonic: string,
  name?: string,
): Promise<TWallet | null> {
  if (!isValidMnemonic(mnemonic)) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[createSolanaWalletFromMnemonic] isValidMnemonic rejected input (word count / wordlist)",
      );
    }
    return null;
  }
  try {
    const seed = mnemonicToSolanaPrivateKey(mnemonic);
    const keyPair = await createKeyPairFromPrivateKeyBytes(seed, false);
    const addr = await getAddressFromPublicKey(keyPair.publicKey);
    const address = addr.toString();
    return {
      account: { address },
      address,
      privateKey: bytesToBase58(seed),
      seedPhrase: mnemonic,
      name: name || "Solana Wallet",
      balance: "0",
      source: "Created",
      type: "SeedPhrase",
      namespace: "solana",
      solana: {
        pubkeyBase58: address,
        derivationPath: DEFAULT_SOLANA_PATH,
      },
    };
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[createSolanaWalletFromMnemonic] derivation threw:",
        err instanceof Error ? err.message : String(err),
      );
    }
    return null;
  }
}

export async function createWalletFromParams(
  params: TWalletCreationParams,
): Promise<TWallet | null> {
  if (params.source === "PrivateKey" && params.privateKey) {
    return createWalletFromPrivateKey(params.privateKey, params.name);
  }

  if (params.source === "SeedPhrase" && params.seedPhrase) {
    return createWalletFromMnemonic(params.seedPhrase, params.name);
  }

  if (params.source === "SolanaPrivateKey" && params.privateKey) {
    return createSolanaWalletFromPrivateKey(params.privateKey, params.name);
  }

  if (params.source === "SolanaSeedPhrase" && params.seedPhrase) {
    return createSolanaWalletFromMnemonic(params.seedPhrase, params.name);
  }

  if (params.source === "social" && params.account) {
    return {
      account: { address: params.account.address },
      address: params.account.address,
      name: params.name || "Social Wallet",
      balance: "0",
      source: "Social",
      type: "Social",
      namespace: "eip155",
      socialAccount: {
        provider: params.provider || "Unknown",
        email: params.socialAccount?.email || "",
        name: params.socialAccount?.name || "",
      },
    };
  }

  return null;
}

// Common address truncation presets
export const ADDRESS_TRUNCATE_PRESETS = {
  short: { start: 4, end: 4 }, // 0x12...5678
  medium: { start: 6, end: 4 }, // 0x1234...5678
  long: { start: 10, end: 8 }, // 0x12345678...12345678
} as const;

type TAddressTruncatePreset = keyof typeof ADDRESS_TRUNCATE_PRESETS;

type TTruncateAddressParams = {
  address: string;
  preset?: TAddressTruncatePreset;
  startLength?: number;
  endLength?: number;
};

/**
 * Truncates an address with preset or custom lengths
 *
 * @example
 * truncateAddress({ address: "0x1234567890abcdef" }) // "0x12...cdef"
 * truncateAddress({ address: "0x1234567890abcdef", preset: "medium" }) // "0x1234...cdef"
 * truncateAddress({ address: "0x1234567890abcdef", startLength: 8, endLength: 6 }) // "0x123456...abcdef"
 */
export function truncateAddress({
  address,
  preset = "short",
  startLength,
  endLength,
}: TTruncateAddressParams): string {
  if (!address) return "";

  const start = startLength ?? ADDRESS_TRUNCATE_PRESETS[preset].start;
  const end = endLength ?? ADDRESS_TRUNCATE_PRESETS[preset].end;

  if (address.length <= start + end) return address;

  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
