import type { PublicKey } from "@solana/web3.js";

export interface TakumiPayConfig {
  owner: PublicKey;
  pendingOwner: PublicKey | null;
  backendSigner: PublicKey;
  paused: boolean;
  pointDepositsPaused: boolean;
  txCounter: bigint;
  pointDepositCounter: bigint;
  withdrawalDelay: bigint;
  withdrawalNonce: bigint;
  bump: number;
}

export interface TakumiPayTransactionRecord {
  config: PublicKey;
  txId: bigint;
  walletAddress: PublicKey;
  tokenMint: PublicKey;
  bookingId: string;
  exchangeRateId: bigint;
  productVariantId: string;
  refId: string;
  amount: bigint;
  timestamp: bigint;
  bump: number;
}

export interface TakumiPayMerchantPayment {
  config: PublicKey;
  payer: PublicKey;
  tokenMint: PublicKey;
  merchantId: string;
  refId: string;
  amount: bigint;
  platformFeeAmount: bigint;
  fiatAmountMinor: bigint;
  fiatCurrency: Uint8Array; // 3 bytes
  exchangeRateId: bigint;
  timestamp: bigint;
  bump: number;
}

export interface TakumiPayPointDepositRecord {
  config: PublicKey;
  depositId: bigint;
  walletAddress: PublicKey;
  tokenMint: PublicKey;
  amount: bigint;
  refId: string;
  timestamp: bigint;
  bump: number;
}

export interface CreateTransactionParams {
  bookingId: string;
  exchangeRateId: bigint;
  productVariantId: string;
  refId: string;
  refIdHash: Uint8Array; // 32 bytes, SHA-256 of refId
  amount: bigint;
}

export interface MerchantQuoteParams {
  refId: string;
  refIdHash: Uint8Array; // 32 bytes
  merchantId: string;
  amount: bigint;
  platformFeeAmount: bigint;
  fiatAmountMinor: bigint;
  fiatCurrency: Uint8Array; // 3 bytes ASCII
  exchangeRateId: bigint;
  expiresAt: bigint;
}
