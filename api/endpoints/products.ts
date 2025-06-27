import { api } from "@/constants/configs/ky";
import type { TProduct, TProductCategory, TProductWithCategory } from "../types/product";

export const productApi = {
  getAllProducts: async (): Promise<TProduct[]> => {
    const response = await api.get("products");
    return response.json();
  },

  getProductsByCategories: async (): Promise<TProductWithCategory[]> => {
    const response = await api.get("products/grouped-by-categories");
    return response.json();
  },

  getProductById: async (id: string): Promise<TProduct> => {
    const response = await api.get(`products/${id}`);
    return response.json();
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
  }
}; 