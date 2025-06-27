import { productApi } from "@/api/endpoints/products";
import type { TProduct, TProductCategory, TProductWithCategory } from "@/api/types/product";
import { productsQueryKeys } from "@/constants/queryKeys/productsQueryKeys";
import { useQuery } from "@tanstack/react-query";

export const useProducts = () => {
  return useQuery<TProduct[]>({
    queryKey: productsQueryKeys.lists(),
    queryFn: async () => {
      try {
        const response = await productApi.getAllProducts();
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useProductsByCategories = () => {
  return useQuery<TProductWithCategory[]>({
    queryKey: productsQueryKeys.grouped(),
    queryFn: async () => {
      try {
        const response = await productApi.getProductsByCategories();
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useProduct = (productId: string) => {
  return useQuery<TProduct>({
    queryKey: productsQueryKeys.byId(productId),
    queryFn: async () => {
      try {
        const response = await productApi.getProductById(productId);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!productId,
  });
};

export const useProductsByCategory = (categoryId: string) => {
  return useQuery<TProduct[]>({
    queryKey: productsQueryKeys.byCategory(categoryId),
    queryFn: async () => {
      try {
        const response = await productApi.getProductsByCategory(categoryId);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!categoryId,
  });
};

export const useCategories = () => {
  return useQuery<TProductCategory[]>({
    queryKey: productsQueryKeys.categories.all(),
    queryFn: async () => {
      try {
        const response = await productApi.getAllCategories();
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useCategory = (categoryId: string) => {
  return useQuery<TProductCategory>({
    queryKey: productsQueryKeys.categories.byId(categoryId),
    queryFn: async () => {
      try {
        const response = await productApi.getCategoryById(categoryId);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!categoryId,
  });
}; 