---
name: tanstack-query-patterns
description: TanStack Query (React Query) patterns for data fetching, caching, mutations, and optimistic updates. Use when implementing API calls, managing server state, or handling data synchronization.
---

# TanStack Query Patterns

Data fetching and caching patterns with TanStack Query v5 for React Native.

## Query Hook Pattern

```typescript
// hooks/queries/useProducts.ts
import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/api/endpoints/products';
import { productsQueryKeys } from '@/constants/queryKeys/productsQueryKeys';

export const useProducts = () => {
  return useQuery({
    queryKey: productsQueryKeys.lists(),
    queryFn: async () => {
      const response = await productApi.getAllProducts();
      return response;
    },
    staleTime: 5 * 60 * 1000,      // 5 minutes
    gcTime: 30 * 60 * 1000,         // 30 minutes (garbage collection)
  });
};

// With parameters
export const useProductById = (productId: string) => {
  return useQuery({
    queryKey: productsQueryKeys.byId(productId),
    queryFn: () => productApi.getProductById(productId),
    enabled: !!productId,            // Only fetch when productId exists
    staleTime: 5 * 60 * 1000,
  });
};
```

## Query Key Factory Pattern

```typescript
// constants/queryKeys/productsQueryKeys.ts
export const productsQueryKeys = {
  all: () => ['products'] as const,
  lists: () => [...productsQueryKeys.all(), 'list'] as const,
  byId: (id: string) => [...productsQueryKeys.all(), 'detail', id] as const,
  byCategory: (categoryId: string) => [...productsQueryKeys.all(), 'category', categoryId] as const,
  grouped: (take?: number) => [...productsQueryKeys.all(), 'grouped', take] as const,
  categories: {
    all: () => [...productsQueryKeys.all(), 'categories'] as const,
    byId: (id: string) => [...productsQueryKeys.all(), 'categories', id] as const,
  },
  variants: {
    byId: (id: string) => [...productsQueryKeys.all(), 'variants', id] as const,
  },
  inputFields: (productId: string) => [...productsQueryKeys.all(), 'inputFields', productId] as const,
};
```

## Mutation Pattern

```typescript
// hooks/queries/useBookings.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const useCreateBooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBookingInput) => {
      return await bookingApi.create(data);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.lists() });
    },
    onError: (error) => {
      console.error('Booking failed:', error);
    },
  });
};

// Usage
function BookingForm() {
  const { mutate, isPending, isError, error } = useCreateBooking();

  const handleSubmit = () => {
    mutate(bookingData, {
      onSuccess: () => router.push('/bookings'),
    });
  };
}
```

## Optimistic Updates

```typescript
export const useToggleFavorite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dappId, isFavorite }: { dappId: string; isFavorite: boolean }) => {
      return await dappApi.toggleFavorite(dappId, isFavorite);
    },
    onMutate: async ({ dappId, isFavorite }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: dappQueryKeys.favorites() });

      // Snapshot previous value
      const previousFavorites = queryClient.getQueryData(dappQueryKeys.favorites());

      // Optimistically update
      queryClient.setQueryData(dappQueryKeys.favorites(), (old: DApp[]) =>
        isFavorite
          ? [...old, { id: dappId }]
          : old.filter(d => d.id !== dappId)
      );

      return { previousFavorites };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(dappQueryKeys.favorites(), context?.previousFavorites);
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: dappQueryKeys.favorites() });
    },
  });
};
```

## Dependent Queries

```typescript
export const useTransactionWithDetails = (txHash: string) => {
  // First query
  const { data: transaction } = useQuery({
    queryKey: transactionsQueryKeys.byHash(txHash),
    queryFn: () => transactionApi.getByHash(txHash),
    enabled: !!txHash,
  });

  // Dependent query - only runs when transaction exists
  const { data: details } = useQuery({
    queryKey: transactionsQueryKeys.details(transaction?.id),
    queryFn: () => transactionApi.getDetails(transaction!.id),
    enabled: !!transaction?.id,
  });

  return { transaction, details };
};
```

## Infinite Queries

```typescript
export const useInfiniteTransactions = () => {
  return useInfiniteQuery({
    queryKey: transactionsQueryKeys.infinite(),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await transactionApi.getPage(pageParam, 20);
      return response;
    },
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < 20) return undefined;
      return pages.length + 1;
    },
    initialPageParam: 1,
  });
};

// Usage with FlashList
function TransactionList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteTransactions();

  const transactions = data?.pages.flatMap(page => page) ?? [];

  return (
    <FlashList
      data={transactions}
      renderItem={({ item }) => <TransactionCard {...item} />}
      onEndReached={() => hasNextPage && fetchNextPage()}
      ListFooterComponent={isFetchingNextPage ? <LoadingSpinner /> : null}
    />
  );
}
```

## Prefetching

```typescript
// Prefetch on hover/focus
function ProductCard({ productId }: { productId: string }) {
  const queryClient = useQueryClient();

  const prefetchProduct = () => {
    queryClient.prefetchQuery({
      queryKey: productsQueryKeys.byId(productId),
      queryFn: () => productApi.getProductById(productId),
      staleTime: 5 * 60 * 1000,
    });
  };

  return (
    <Pressable
      onPressIn={prefetchProduct}
      onPress={() => router.push(`/product/${productId}`)}
    >
      <ProductCardContent />
    </Pressable>
  );
}
```

## Query Client Configuration

```typescript
// app/_layout.tsx
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,           // 1 minute default
      retry: 1,                        // Retry once on failure
      refetchOnWindowFocus: false,     // Disable on RN
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});
```

## Best Practices

1. **Use query key factories** - Organize keys in dedicated files
2. **Set appropriate staleTime** - Prevent unnecessary refetches
3. **Use enabled for conditional queries** - Prevent queries with missing params
4. **Invalidate related queries** - Keep data consistent after mutations
5. **Handle loading/error states** - Use isLoading, isError, error from hooks
6. **Prefer select for transformations** - Transform data in the query, not components
