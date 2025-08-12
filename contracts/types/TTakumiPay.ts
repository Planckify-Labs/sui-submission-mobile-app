import { Address } from "viem";

export interface TPurchaseInput {
  bookingId: string;
  networkId: string;
  tokenAddress: Address;
  amount: bigint;
  gasLimit: number;
}

export interface TPurchase {
  refId: string;
  walletAddress: Address;
  bookingId: string;
  contractAddress: Address;
  networkId: string;
  timestamp: bigint;
  tokenAddress: Address;
  amount: bigint;
}

export interface TPurchaseInputDTO {
  bookingId: string;
  tokenAddress: Address;
  amount: string;
  decimals?: number;
  gasLimit?: number;
}
