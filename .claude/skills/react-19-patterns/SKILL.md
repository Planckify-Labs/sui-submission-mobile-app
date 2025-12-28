---
name: react-19-patterns
description: React 19 patterns including use hook, useTransition, useOptimistic, Suspense, and Actions. Use when implementing async operations, loading states, optimistic updates, or data fetching patterns.
---

# React 19 Patterns

Modern React 19 patterns for async operations, transitions, and optimistic updates in React Native with Expo.

## The `use` Hook

Read promises and context directly in render:

```typescript
import { use, Suspense } from 'react';

// Reading a promise
function WalletBalance({ balancePromise }: { balancePromise: Promise<number> }) {
  const balance = use(balancePromise);
  return <Text>${balance.toFixed(2)}</Text>;
}

// Usage with Suspense
function BalanceSection() {
  const balancePromise = fetchBalance();
  return (
    <Suspense fallback={<BalanceSkeleton />}>
      <WalletBalance balancePromise={balancePromise} />
    </Suspense>
  );
}
```

## useTransition for Non-Blocking Updates

Keep UI responsive during expensive operations:

```typescript
import { useTransition, useState } from 'react';

function TransactionList() {
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState('all');

  const handleFilterChange = (newFilter: string) => {
    startTransition(() => {
      setFilter(newFilter); // Won't block UI
    });
  };

  return (
    <View>
      <FilterTabs onSelect={handleFilterChange} />
      {isPending && <ActivityIndicator />}
      <TransactionItems filter={filter} />
    </View>
  );
}
```

## useOptimistic for Instant Feedback

Show optimistic state while async operation completes:

```typescript
import { useOptimistic } from 'react';

function LikeButton({ postId, initialLikes }: Props) {
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    initialLikes,
    (current, increment: number) => current + increment
  );

  async function handleLike() {
    addOptimisticLike(1); // Instantly update UI
    await likePost(postId); // Server request
  }

  return (
    <Pressable onPress={handleLike}>
      <Text>{optimisticLikes} likes</Text>
    </Pressable>
  );
}
```

## Form Actions Pattern

Handle form submissions with built-in pending states:

```typescript
import { useActionState } from 'react';

function SendForm() {
  const [state, formAction, isPending] = useActionState(
    async (prevState, formData: FormData) => {
      const result = await sendTransaction({
        to: formData.get('recipient'),
        amount: formData.get('amount'),
      });
      return result;
    },
    null
  );

  return (
    <View>
      <TextInput name="recipient" placeholder="Recipient" />
      <TextInput name="amount" placeholder="Amount" keyboardType="numeric" />
      <Button
        title={isPending ? 'Sending...' : 'Send'}
        disabled={isPending}
        onPress={() => formAction(new FormData())}
      />
      {state?.error && <Text className="text-red-500">{state.error}</Text>}
    </View>
  );
}
```

## Suspense with Error Boundaries

Handle loading and error states declaratively:

```typescript
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function TransactionsScreen() {
  return (
    <ErrorBoundary fallback={<ErrorState />}>
      <Suspense fallback={<TransactionsSkeleton />}>
        <TransactionsList />
      </Suspense>
    </ErrorBoundary>
  );
}

function TransactionsList() {
  const transactions = use(fetchTransactions());
  return (
    <FlashList
      data={transactions}
      renderItem={({ item }) => <TransactionCard {...item} />}
    />
  );
}
```

## Combining with TanStack Query

TanStack Query integrates well with React 19:

```typescript
import { useSuspenseQuery } from '@tanstack/react-query';

// Component suspends until data is ready
function Products() {
  const { data } = useSuspenseQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  });

  return <ProductGrid products={data} />;
}

// Parent handles loading state
function ProductsScreen() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <Products />
    </Suspense>
  );
}
```

## Best Practices

1. **Wrap async components in Suspense** - Always provide fallback UI
2. **Use useTransition for navigation** - Prevents janky page transitions
3. **Prefer useOptimistic for mutations** - Better UX than loading spinners
4. **Colocate Suspense boundaries** - Place near the data-fetching component
5. **Combine with Error Boundaries** - Handle both loading and error states
