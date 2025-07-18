export const productsQueryKeys = {
  all: ["products"] as const,
  lists: () => [...productsQueryKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...productsQueryKeys.lists(), filters] as const,
  grouped: () => [...productsQueryKeys.all, "grouped-by-categories"] as const,
  byId: (id: string) => [...productsQueryKeys.all, "detail", id] as const,
  byCategory: (categoryId: string) =>
    [...productsQueryKeys.all, "by-category", categoryId] as const,
  categories: {
    all: () => [...productsQueryKeys.all, "categories"] as const,
    byId: (id: string) => [...productsQueryKeys.categories.all(), id] as const,
  },
  variants: {
    all: () => [...productsQueryKeys.all, "variants"] as const,
    byId: (id: string) => [...productsQueryKeys.variants.all(), id] as const,
  },
  inputFields: (productId: string) =>
    [...productsQueryKeys.all, "input-fields", productId] as const,
} as const;
