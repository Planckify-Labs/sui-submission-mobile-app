import { TWallet, TWalletCreationParams } from "@/constants/types/walletTypes";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

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
      socialAccount: {
        provider: params.provider || "Unknown",
        email: params.socialAccount?.email || "",
        name: params.socialAccount?.name || "",
      },
    };
  }

  return null;
}
