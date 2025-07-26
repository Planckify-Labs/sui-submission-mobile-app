import { api, publicApi } from "@/constants/configs/ky";
import type {
  TProduct,
  TProductCategory,
  TProductDetail,
  TProductInputFields,
  TProductVariant,
  TProductWithCategory,
} from "../types/product";
import { fetchList, searchItems } from "../utils/api-helpers";

export interface TProductSearchParams {
  name?: string;
  categoryId?: string;
  isActive?: boolean;
  take?: number;
  cursor?: string;
}

export const productApi = {
  getAllProducts: (): Promise<TProduct[]> =>
    fetchList<TProduct[]>(publicApi, "products", "Failed to fetch products"),

  getProductsByCategories: (): Promise<TProductWithCategory[]> =>
    fetchList<TProductWithCategory[]>(
      publicApi,
      "products/grouped-by-categories",
      "Failed to fetch products by categories",
    ),

  searchProducts: (params?: TProductSearchParams): Promise<TProduct[]> =>
    searchItems<TProduct[]>(
      publicApi,
      "products/search",
      params || {},
      "Failed to search products",
    ),

  getProductById: async (id: string): Promise<TProductDetail> => {
    try {
      const response = await api.get(`products/${id}`);
      return response.json();
    } catch (error: any) {
      if (error && error.name === "AbortError") {
        console.log("Request was aborted");
        return {} as TProductDetail;
      }
      throw error;
    }
  },

  getProductsByCategory: async (categoryId: string): Promise<TProduct[]> => {
    const response = await api.get(`products/category/${categoryId}`);
    return response.json();
  },

  getAllCategories: async (): Promise<TProductCategory[]> => {
    const response = await api.get("products/categories");
    return response.json();
  },

  getCategoryById: async (id: string): Promise<TProductCategory> => {
    const response = await api.get(`products/categories/${id}`);
    return response.json();
  },

  getProductVariantById: async (
    variantId: string,
  ): Promise<TProductVariant> => {
    const response = await api.get(`products/variants/${variantId}`);
    return response.json();
  },

  getProductInputFields: async (
    productId: string,
  ): Promise<TProductInputFields> => {
    const response = await api.get(`products/${productId}/input-fields`);
    return response.json();
  },
};
