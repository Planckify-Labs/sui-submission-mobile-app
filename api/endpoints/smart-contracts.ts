import { publicApi } from "@/constants/configs/ky";
import { fetchById, fetchList, searchItems } from "../utils/api-helpers";

export interface TSmartContract {
  id: string;
  name: string;
  address: string;
  blockchainId: string;
  abi?: any[];
  bytecode?: string;
  isVerified: boolean;
  isActive: boolean;
  contractType?: string;
  description?: string;
  version?: string;
  compiler?: string;
  createdAt: string;
  updatedAt: string;
  blockchain?: {
    id: string;
    name: string;
    chainId: number;
  };
}

export interface TSmartContractSearchParams {
  name?: string;
  address?: string;
  blockchainId?: string;
  contractType?: string;
  isVerified?: boolean;
  isActive?: boolean;
  take?: number;
  cursor?: string;
}

export type TSmartContractListResponse = TSmartContract[];

export const smartContractApi = {
  getSmartContractList: () =>
    fetchList<TSmartContractListResponse>(
      publicApi,
      "smart-contracts",
      "Failed to fetch smart contract list",
    ),

  searchSmartContracts: (params?: TSmartContractSearchParams) =>
    searchItems<TSmartContractListResponse>(
      publicApi,
      "smart-contracts/search",
      params || {},
      "Failed to search smart contracts",
    ),

  getSmartContractById: (id: string) =>
    fetchById<TSmartContract>(
      publicApi,
      "smart-contracts",
      id,
      "Failed to fetch smart contract by id",
    ),
};
