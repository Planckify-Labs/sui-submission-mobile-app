export const productsQueryKeys = {
  all: ["products"] as const,
  lists: () => [...productsQueryKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...productsQueryKeys.lists(), { ...filters }] as const,
  grouped: () => [...productsQueryKeys.all, "grouped-by-categories"] as const,
  byId: (id: string) => [...productsQueryKeys.all, id] as const,
  byCategory: (categoryId: string) => [...productsQueryKeys.all, "category", categoryId] as const,
  categories: {
    all: () => [...productsQueryKeys.all, "categories"] as const,
    byId: (id: string) => [...productsQueryKeys.all, "categories", id] as const,
  },
}; 