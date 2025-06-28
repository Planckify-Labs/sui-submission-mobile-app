export type TProductCategory = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TVendor = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type TProductPrice = {
  id: string;
  productVariantId: string;
  vendorId: string;
  realValue: string;
  priceFromVendor: string;
  sellPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  vendor: TVendor;
};

export type TProductVariant = {
  id: string;
  name: string;
  description: string;
  sku: string;
  productId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  product: TProduct;
  ProductPrice: TProductPrice[];
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
  inputType: string | null;
  inputDescription: string | null;
};

export type TProductWithCategory = {
  category: TProductCategory;
  products: TProduct[];
};

export type TProductDetail = TProduct & {
  category: TProductCategory;
  variants: TProductVariant[];
};
