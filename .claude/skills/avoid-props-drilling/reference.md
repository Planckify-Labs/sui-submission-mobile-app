# useRQGlobalState Reference

## Hook Signature

```typescript
function useRQGlobalState<T>({
  initialData?: T;
  queryKey: QueryKey;
}): {
  data: T;
  setNewData: (newData: T) => void;
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queryKey` | `QueryKey` | Yes | Unique key for the global state (follows TanStack Query key patterns) |
| `initialData` | `T` | No | Initial value if no cached data exists (defaults to `{}`) |

## Return Values

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T` | Current state value from React Query cache |
| `setNewData` | `(newData: T) => void` | Function to update the global state |

## How It Works

1. Uses `useQuery` to read from React Query's cache
2. Uses `useMutation` to write updates to the cache
3. All components using the same `queryKey` share the same state
4. State persists across component unmounts (within QueryClient lifetime)

## Query Key Best Practices

```typescript
// Define in constants/queryKeys/
export const walletQueryKeys = {
  all: () => ['wallet'] as const,
  selected: () => [...walletQueryKeys.all(), 'selected'] as const,
  balance: (address: string) => [...walletQueryKeys.all(), 'balance', address] as const,
};

// Use in hooks
const { data } = useRQGlobalState({
  queryKey: walletQueryKeys.selected(),
  initialData: null,
});
```

## Type Safety

Always provide explicit type parameter:

```typescript
// Good - explicit type
const { data } = useRQGlobalState<Wallet | null>({
  queryKey: walletQueryKeys.selected(),
  initialData: null,
});

// Avoid - implicit any
const { data } = useRQGlobalState({
  queryKey: ['wallet', 'selected'],
});
```

## Invalidation

To force re-fetch of global state from external source:

```typescript
import { queryClient } from '@/app/_layout';

// Invalidate specific key
queryClient.invalidateQueries({ queryKey: walletQueryKeys.selected() });

// Reset to initial data
queryClient.resetQueries({ queryKey: walletQueryKeys.selected() });
```
