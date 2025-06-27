export type TProductCategory = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TProduct = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  code: string;
  categoryId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TProductWithCategory = {
  category: TProductCategory;
  products: TProduct[];
}; 