import { useQuery } from "@tanstack/react-query";
import { dappApi } from "@/api/endpoints/dapps";
import type { TDappSearchParams } from "@/api/types/dapp";

export const useDappCategories = () => {
  return useQuery({
    queryKey: ["dapp-categories"],
    queryFn: dappApi.getDappCategories,
  });
};

export const useDapps = () => {
  return useQuery({
    queryKey: ["dapps"],
    queryFn: dappApi.getDappList,
  });
};

export const usePopularDapps = () => {
  return useQuery({
    queryKey: ["dapps", "popular"],
    queryFn: dappApi.getPopularDapps,
  });
};

export const useSponsoredDapps = () => {
  return useQuery({
    queryKey: ["dapps", "sponsored"],
    queryFn: dappApi.getSponsoredDapps,
  });
};

export const useFavoriteDapps = () => {
  return useQuery({
    queryKey: ["dapps", "favorites"],
    queryFn: dappApi.getFavoriteDapps,
  });
};

export const useDappsByCategory = (categoryId: string) => {
  return useQuery({
    queryKey: ["dapps", "category", categoryId],
    queryFn: () => dappApi.getDappsByCategory(categoryId),
    enabled: !!categoryId,
  });
};

export const useDappSearch = (params?: TDappSearchParams) => {
  return useQuery({
    queryKey: ["dapps", "search", params],
    queryFn: () => dappApi.searchDapps(params),
    enabled: !!params,
  });
};

export const useDappById = (id: string) => {
  return useQuery({
    queryKey: ["dapps", id],
    queryFn: () => dappApi.getDappById(id),
    enabled: !!id,
  });
};
