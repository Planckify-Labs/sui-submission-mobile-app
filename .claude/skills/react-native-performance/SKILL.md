---
name: react-native-performance
description: React Native performance optimization patterns including memoization, list optimization, deferred rendering, and preventing re-renders. Use when optimizing slow components, improving list performance, or reducing unnecessary re-renders.
---

# React Native Performance

Performance optimization patterns for React Native with Expo.

## Memoization

### React.memo for Components

```typescript
import { memo } from 'react';

// Memoize expensive components
const TransactionCard = memo(function TransactionCard({
  transaction
}: {
  transaction: Transaction
}) {
  return (
    <View className="p-4 bg-white rounded-xl">
      <Text>{transaction.amount}</Text>
    </View>
  );
});

// Custom comparison for complex props
const ProductCard = memo(
  function ProductCard({ product, onPress }: Props) {
    return <View>{/* ... */}</View>;
  },
  (prevProps, nextProps) => {
    return prevProps.product.id === nextProps.product.id;
  }
);
```

### useCallback for Functions

```typescript
function ParentComponent() {
  // Memoize callback to prevent child re-renders
  const handlePress = useCallback((id: string) => {
    router.push(`/product/${id}`);
  }, []);

  return <ProductList onItemPress={handlePress} />;
}
```

### useMemo for Expensive Calculations

```typescript
function TransactionList({ transactions, filter }: Props) {
  // Memoize filtered results
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (filter === 'all') return true;
      return tx.type === filter;
    });
  }, [transactions, filter]);

  return <FlashList data={filteredTransactions} />;
}
```

## FlashList for Long Lists

```typescript
import { FlashList } from '@shopify/flash-list';

function TransactionList({ transactions }: Props) {
  const renderItem = useCallback(({ item }: { item: Transaction }) => (
    <TransactionCard transaction={item} />
  ), []);

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  return (
    <FlashList
      data={transactions}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={80}           // Required for FlashList
      getItemType={(item) => item.type} // Optimize heterogeneous lists
    />
  );
}
```

## Deferred Rendering with InteractionManager

```typescript
import { InteractionManager } from 'react-native';

function HeavyScreen() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for navigation animation to complete
    const interaction = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });

    return () => interaction.cancel();
  }, []);

  if (!isReady) {
    return <ScreenSkeleton />;
  }

  return <HeavyContent />;
}
```

## PerformanceProvider Pattern

```typescript
// Use existing PerformanceProvider
import { usePerformance } from '@/components/providers/PerformanceProvider';

function Component() {
  const { isReady, deferredTask } = usePerformance();

  useEffect(() => {
    if (isReady) {
      deferredTask(() => {
        // Expensive initialization
        loadAnalytics();
      }, 'Load analytics');
    }
  }, [isReady]);

  return isReady ? <Content /> : <Skeleton />;
}
```

## Optimized Image Loading

```typescript
import { Image } from 'expo-image';

function OptimizedImage({ uri, ...props }: Props) {
  return (
    <Image
      source={{ uri }}
      placeholder={blurhash}          // Show blur while loading
      contentFit="cover"
      transition={200}                 // Smooth transition
      cachePolicy="memory-disk"        // Cache aggressively
      {...props}
    />
  );
}
```

## Avoid Inline Object/Array Props

```typescript
// BAD: Creates new object every render
<Component style={{ padding: 16 }} />
<FlatList data={items.filter(x => x.active)} />

// GOOD: Stable references
const styles = useMemo(() => ({ padding: 16 }), []);
const activeItems = useMemo(() => items.filter(x => x.active), [items]);

<Component style={styles} />
<FlatList data={activeItems} />

// Or use className for styles
<View className="p-4" />
```

## Ref-Based Imperative APIs

```typescript
import { forwardRef, useImperativeHandle, useRef } from 'react';

export type BalanceSectionRef = {
  refetch: () => void;
};

const BalanceSection = forwardRef<BalanceSectionRef>(function BalanceSection(_, ref) {
  const { refetch } = useWalletBalance();

  useImperativeHandle(ref, () => ({
    refetch,
  }), [refetch]);

  return <View>{/* ... */}</View>;
});

// Usage in parent
function HomeMain() {
  const balanceRef = useRef<BalanceSectionRef>(null);

  const onRefresh = useCallback(() => {
    balanceRef.current?.refetch();
  }, []);

  return <BalanceSection ref={balanceRef} />;
}
```

## Skeleton Loading States

```typescript
// Show skeleton immediately, load content after animations
function ProductScreen() {
  const { data, isLoading } = useProductById(productId);

  if (isLoading) {
    return <ProductSkeleton />;
  }

  return <ProductContent product={data} />;
}

// Skeleton component
function ProductSkeleton() {
  return (
    <View className="p-4">
      <View className="w-full h-48 bg-gray-200 rounded-xl animate-pulse" />
      <View className="w-3/4 h-6 bg-gray-200 rounded mt-4 animate-pulse" />
      <View className="w-1/2 h-4 bg-gray-200 rounded mt-2 animate-pulse" />
    </View>
  );
}
```

## Bundle Size Optimization

```typescript
// Lazy import heavy modules
const QRCode = lazy(() => import('react-native-qrcode-styled'));

function QRCodeSection() {
  return (
    <Suspense fallback={<View className="w-48 h-48 bg-gray-100" />}>
      <QRCode value={walletAddress} />
    </Suspense>
  );
}

// Dynamic imports for screens
const HeavyFeature = lazy(() => import('./HeavyFeature'));
```

## Best Practices

1. **Measure before optimizing** - Use React DevTools Profiler
2. **Use FlashList over FlatList** - Better performance for long lists
3. **Memoize callbacks in parent** - Prevent child re-renders
4. **Defer non-critical work** - Use InteractionManager
5. **Optimize images** - Use expo-image with caching
6. **Avoid anonymous functions in JSX** - Extract to useCallback
7. **Use stable keys** - Never use array index as key for dynamic lists
