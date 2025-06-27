import { productApi } from "@/api/endpoints/products";
import type {
  TProduct,
  TProductCategory,
  TProductDetail,
  TProductWithCategory,
} from "@/api/types/product";
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

export const useProductById = (productId: string) => {
  return useQuery<TProductDetail>({
    queryKey: productsQueryKeys.byId(productId),
    queryFn: async (context) => {
      // Don't proceed if no productId
      if (!productId) {
        return {} as TProductDetail;
      }

      try {
        const response = await productApi.getProductById(productId);
        return response;
      } catch (error) {
        // Check if the request was cancelled
        if (context.signal && context.signal.aborted) {
          return {} as TProductDetail; // Return empty object to prevent errors
        }
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000, // Reduce garbage collection time to prevent stale data issues
    enabled: !!productId,
    retry: (failureCount, error) => {
      // Don't retry aborted requests
      if (error && error.name === "AbortError") return false;
      return failureCount < 3;
    },
    // Prevent refetching on window focus to avoid issues when switching components
    refetchOnWindowFocus: false,
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
