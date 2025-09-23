import type {
  DappListResponse,
  TDapp,
  TDappSearchParams,
} from "@/api/types/dapp";
import { publicApi } from "@/constants/configs/ky";
import {
  apiCall,
  fetchById,
  fetchList,
  searchItems,
} from "../utils/api-helpers";

const logDappOperation = (operation: string, data?: any) => {
  console.log(`Dapp API: ${operation}`, data || "");
};

export const dappApi = {
  getDappList: () =>
    apiCall(async () => {
      logDappOperation("Fetching all dapps");
      const response = await fetchList<DappListResponse>(
        publicApi,
        "dapps",
        "Failed to fetch dapp list",
      );
      logDappOperation("Dapp list response", response);
      return response;
    }, "Failed to fetch dapp list"),

  getPopularDapps: () =>
    apiCall(async () => {
      logDappOperation("Fetching popular dapps");
      const response = await fetchList<DappListResponse>(
        publicApi,
        "dapps/popular",
        "Failed to fetch popular dapps",
      );
      logDappOperation("Popular dapps response", response);
      return response;
    }, "Failed to fetch popular dapps"),

  getSponsoredDapps: () =>
    apiCall(async () => {
      logDappOperation("Fetching sponsored dapps");
      const response = await fetchList<DappListResponse>(
        publicApi,
        "dapps/sponsor",
        "Failed to fetch sponsored dapps",
      );
      logDappOperation("Sponsored dapps response", response);
      return response;
    }, "Failed to fetch sponsored dapps"),

  getFavoriteDapps: () =>
    apiCall(async () => {
      logDappOperation("Fetching favorite dapps");
      const response = await fetchList<DappListResponse>(
        publicApi,
        "dapps/favorites",
        "Failed to fetch favorite dapps",
      );
      logDappOperation("Favorite dapps response", response);
      return response;
    }, "Failed to fetch favorite dapps"),

  getDappsByCategory: (categoryId: string) =>
    apiCall(async () => {
      logDappOperation("Fetching dapps by category", categoryId);
      const response = await fetchList<DappListResponse>(
        publicApi,
        `dapps/category/${categoryId}`,
        "Failed to fetch dapps by category",
      );
      logDappOperation("Dapps by category response", response);
      return response;
    }, "Failed to fetch dapps by category"),

  searchDapps: (params?: TDappSearchParams) =>
    apiCall(async () => {
      logDappOperation("Searching dapps with params", params);
      const response = await searchItems<DappListResponse>(
        publicApi,
        "dapps/search",
        params || {},
        "Failed to search dapps",
      );
      logDappOperation("Dapp search response", response);
      return response;
    }, "Failed to search dapps"),

  getDappById: (id: string) =>
    apiCall(async () => {
      logDappOperation("Fetching dapp by id", id);
      const response = await fetchById<TDapp>(
        publicApi,
        "dapps",
        id,
        "Failed to fetch dapp by id",
      );
      logDappOperation("Dapp by id response", response);
      return response;
    }, "Failed to fetch dapp by id"),
};
