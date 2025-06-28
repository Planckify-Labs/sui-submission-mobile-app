import { api } from "@/constants/configs/ky";
import type {
  TProduct,
  TProductCategory,
  TProductDetail,
  TProductVariant,
  TProductWithCategory,
} from "../types/product";

export const productApi = {
  getAllProducts: async (): Promise<TProduct[]> => {
    const response = await api.get("products");
    return response.json();
  },

  getProductsByCategories: async (): Promise<TProductWithCategory[]> => {
    const response = await api.get("products/grouped-by-categories");
    return response.json();
  },

  getProductById: async (id: string): Promise<TProductDetail> => {
    try {
      const response = await api.get(`products/${id}`);
      return response.json();
    } catch (error: any) {
      // Handle aborted requests gracefully
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
};
