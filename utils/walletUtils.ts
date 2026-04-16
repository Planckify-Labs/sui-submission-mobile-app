import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { TWallet, TWalletCreationParams } from "@/constants/types/walletTypes";

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

export function createWalletFromParams(
  params: TWalletCreationParams,
): TWallet | null {
  if (params.source === "PrivateKey" && params.privateKey) {
    return createWalletFromPrivateKey(params.privateKey, params.name);
  }

  if (params.source === "SeedPhrase" && params.seedPhrase) {
    return createWalletFromMnemonic(params.seedPhrase, params.name);
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
