import { publicApi } from "@/constants/configs/ky";
import { fetchList } from "../utils/api-helpers";

export interface TBlockchain {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  isEVM: boolean;
  isActive: boolean;
  isTestnet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TAbi {
  id: string;
  name: string;
  description: string;
  version: string;
  abi: any[];
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TSmartContract {
  id: string;
  name: string;
  blockchain: TBlockchain;
  blockchainId: string;
  address: string;
  abiId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  abi: TAbi;
}

export type TSmartContractListResponse = TSmartContract[];

export const smartContractApi = {
  getSmartContractList: () =>
    fetchList<TSmartContractListResponse>(
      publicApi,
      "smart-contracts",
      "Failed to fetch smart contract list",
    ),

  getSmartContractsByChain: (chainId: number) =>
    publicApi
      .get(`smart-contracts/chain/${chainId}`)
      .json<TSmartContract>()
      .catch((error) => {
        console.error("Failed to fetch smart contract by chain:", error);
        throw new Error("Failed to fetch smart contract by chain");
      }),
};
