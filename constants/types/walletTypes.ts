import type { Namespace } from "@/services/chains/types";

export type WalletSource = "Created" | "Imported" | "Social";
export type WalletType =
  | "PrivateKey"
  | "SeedPhrase"
  | "Social"
  | "Smart4337"
  | "Smart7702";

export interface TSmart4337Fields {
  signerWalletId: string;
  factory?: string;
  bundlerUrl: string;
  entryPoint: string;
}

export interface TSmart7702Fields {
  signerWalletId: string;
  delegator: `0x${string}`;
  authorizationByChain?: Record<
    number,
    { expiresAt: number; signature?: `0x${string}`; nonce: number }
  >;
}

export interface TWallet {
  name: string;
  address: string;
  balance: string;
  source: WalletSource;
  type: WalletType;
  namespace: Namespace;
  chainId?: string | number;
  account: any;
  privateKey?: string;
  seedPhrase?: string;
  socialAccount?: {
    provider: string;
    email: string;
    name: string;
  };
  smart4337?: TSmart4337Fields;
  smart7702?: TSmart7702Fields;
}

export interface TWalletCreationParams {
  source: "social" | "SeedPhrase" | "PrivateKey";
  privateKey?: string;
  seedPhrase?: string;
  name?: string;
  provider?: string;
  socialAccount?: { email: string; name: string };
  account?: any;
}

export const WALLET_SETUP_PROGRESS_KEY = "walletSetupProgress";

export type TSelectedWords = { [key: number]: string };
export type TWordOptions = { [key: number]: string[] };
export type TSetupProgress = {
  step: number;
  mnemonic: string[];
  selectedWords: TSelectedWords;
};

export type TWalletSetupStep = {
  title: string;
  content: React.ReactNode;
  buttonText: string;
  onButtonPress: () => void;
};

export type TWalletSetupStepsProps = {
  currentStep: number;
  steps: TWalletSetupStep[];
  onBackPress: () => void;
  disableBackButton?: boolean;
};
