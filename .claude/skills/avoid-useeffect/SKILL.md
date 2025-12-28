---
name: avoid-useeffect
description: Avoid unnecessary useEffect in React 19+. Use when refactoring useEffect, handling derived state, data fetching, event handling, or state synchronization. Provides modern alternatives like use hook, useMemo, event handlers, and TanStack Query.
---

# Avoid Unnecessary useEffect

In React 19+, most useEffect usage is unnecessary. Use modern patterns instead.

## Why Avoid useEffect?

1. **Extra render passes** - Effects run after render, causing additional re-renders
2. **Race conditions** - Data fetching in Effects is prone to bugs
3. **Network waterfalls** - Parent fetches, then children fetch sequentially
4. **No caching** - Data re-fetches on every mount
5. **Boilerplate** - Requires cleanup, loading states, error handling

## Pattern 1: Derived State (No useEffect Needed)

```typescript
// BAD: useEffect for derived state
function UserProfile({ firstName, lastName }: TUserProfileProps) {
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    setFullName(`${firstName} ${lastName}`);
  }, [firstName, lastName]);

  return <Text>{fullName}</Text>;
}

// GOOD: Calculate during render
function UserProfile({ firstName, lastName }: TUserProfileProps) {
  const fullName = `${firstName} ${lastName}`;
  return <Text>{fullName}</Text>;
}
```

## Pattern 2: Expensive Calculations (Use useMemo)

```typescript
// BAD: useEffect for filtered data
function TransactionList({ transactions, filter }: TTransactionListProps) {
  const [filtered, setFiltered] = useState<TTransaction[]>([]);

  useEffect(() => {
    setFiltered(transactions.filter(tx => tx.type === filter));
  }, [transactions, filter]);

  return <FlashList data={filtered} />;
}

// GOOD: useMemo for expensive calculations
function TransactionList({ transactions, filter }: TTransactionListProps) {
  const filtered = useMemo(
    () => transactions.filter(tx => tx.type === filter),
    [transactions, filter]
  );

  return <FlashList data={filtered} />;
}
```

## Pattern 3: Reset State on Prop Change (Use key)

```typescript
// BAD: useEffect to reset state
function ChatRoom({ roomId }: TChatRoomProps) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage(''); // Reset when room changes
  }, [roomId]);

  return <TextInput value={message} onChangeText={setMessage} />;
}

// GOOD: Use key prop to reset entire component
function ChatScreen({ roomId }: TChatScreenProps) {
  return <ChatRoom key={roomId} roomId={roomId} />;
}

function ChatRoom({ roomId }: TChatRoomProps) {
  const [message, setMessage] = useState(''); // Resets automatically
  return <TextInput value={message} onChangeText={setMessage} />;
}
```

## Pattern 4: Event Handling (Use Event Handlers)

```typescript
// BAD: useEffect for event-triggered logic
function PurchaseButton({ product }: TPurchaseButtonProps) {
  const [purchased, setPurchased] = useState(false);

  useEffect(() => {
    if (purchased) {
      showNotification(`Purchased ${product.name}!`);
      trackAnalytics('purchase', product.id);
    }
  }, [purchased, product]);

  return (
    <Pressable onPress={() => setPurchased(true)}>
      <Text>Buy</Text>
    </Pressable>
  );
}

// GOOD: Logic in event handler
function PurchaseButton({ product }: TPurchaseButtonProps) {
  const handlePurchase = async () => {
    await purchaseProduct(product.id);
    showNotification(`Purchased ${product.name}!`);
    trackAnalytics('purchase', product.id);
  };

  return (
    <Pressable onPress={handlePurchase}>
      <Text>Buy</Text>
    </Pressable>
  );
}
```

## Pattern 5: Data Fetching (Use TanStack Query)

```typescript
// BAD: useEffect for data fetching
function ProductList() {
  const [products, setProducts] = useState<TProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      try {
        setIsLoading(true);
        const data = await productApi.getAll();
        if (!ignore) {
          setProducts(data);
        }
      } catch (e) {
        if (!ignore) {
          setError(e as Error);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => { ignore = true; };
  }, []);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} />;
  return <ProductGrid products={products} />;
}

// GOOD: TanStack Query
function ProductList() {
  const { data: products, isLoading, error } = useProducts();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} />;
  return <ProductGrid products={products ?? []} />;
}
```

## Pattern 6: React 19 `use` Hook

```typescript
// GOOD: React 19 use hook with Suspense
import { use, Suspense } from 'react';

function WalletBalance({ balancePromise }: { balancePromise: Promise<number> }) {
  const balance = use(balancePromise);
  return <Text>${balance.toFixed(2)}</Text>;
}

function WalletScreen() {
  const balancePromise = fetchWalletBalance();

  return (
    <Suspense fallback={<BalanceSkeleton />}>
      <WalletBalance balancePromise={balancePromise} />
    </Suspense>
  );
}
```

## Pattern 7: State Synchronization (Lift State Up)

```typescript
// BAD: useEffect to sync parent
function TokenSelector({ onSelect }: TTokenSelectorProps) {
  const [selected, setSelected] = useState<TToken | null>(null);

  useEffect(() => {
    if (selected) {
      onSelect(selected);
    }
  }, [selected, onSelect]);

  return <TokenList onPress={setSelected} />;
}

// GOOD: Call callback directly
function TokenSelector({ onSelect }: TTokenSelectorProps) {
  const handleSelect = (token: TToken) => {
    onSelect(token); // Notify parent immediately
  };

  return <TokenList onPress={handleSelect} />;
}

// BETTER: Lift state to parent
function SendForm() {
  const [selectedToken, setSelectedToken] = useState<TToken | null>(null);

  return (
    <View>
      <TokenSelector
        selected={selectedToken}
        onSelect={setSelectedToken}
      />
      <AmountInput token={selectedToken} />
    </View>
  );
}
```

## Pattern 8: Form Submission (Use Event Handler)

```typescript
// BAD: useEffect for form submission
function SendForm() {
  const [formData, setFormData] = useState<TFormData | null>(null);

  useEffect(() => {
    if (formData) {
      submitTransaction(formData);
    }
  }, [formData]);

  const handleSubmit = () => {
    setFormData({ to: recipient, amount });
  };
}

// GOOD: Submit directly in handler
function SendForm() {
  const handleSubmit = async () => {
    await submitTransaction({ to: recipient, amount });
    router.push('/success');
  };
}
```

## When useEffect IS Appropriate

```typescript
// 1. Subscribing to external stores (prefer useSyncExternalStore)
useEffect(() => {
  const unsubscribe = store.subscribe(handleChange);
  return () => unsubscribe();
}, []);

// 2. Setting up non-React event listeners
useEffect(() => {
  const subscription = AppState.addEventListener('change', handleAppState);
  return () => subscription.remove();
}, []);

// 3. Animations that need cleanup
useEffect(() => {
  const animation = Animated.timing(opacity, { toValue: 1 });
  animation.start();
  return () => animation.stop();
}, []);

// 4. Focus management (accessibility)
useEffect(() => {
  inputRef.current?.focus();
}, []);
```

## Quick Reference

| Anti-Pattern | Solution |
|--------------|----------|
| Derived state in useEffect | Calculate during render |
| Expensive calculations | `useMemo` |
| Reset state on prop change | `key` prop |
| User event logic | Event handlers |
| Data fetching | TanStack Query or `use` hook |
| POST on user action | Event handler |
| Sync state to parent | Lift state up or callback in handler |
| Chain multiple Effects | Single event handler |

## Decision Rule

Ask yourself: **Why does this code need to run?**

- **Because component was displayed** → Maybe useEffect (but consider alternatives)
- **Because of a user interaction** → Event handler (never useEffect)
- **To transform data** → Calculate during render or useMemo
- **To fetch data** → TanStack Query or React 19 `use` hook

Sources:
- [You Might Not Need an Effect – React](https://react.dev/learn/you-might-not-need-an-effect)
- [React 19 use() Hook](https://medium.com/@ademyalcin27/the-new-use-hook-in-react-19-a-game-changer-for-simpler-data-fetching-and-context-management-cc45cc5ebd28)
- [Modern Data Fetching in React](https://reacttraining.com/blog/modern-data-fetching-in-react)
