---
name: avoid-props-drilling
description: Avoid props drilling by using useRQGlobalState hooks. Use when managing shared state across components, when state needs to be accessed by deeply nested components, or when refactoring prop chains.
---

# Avoid Props Drilling

Use `useRQGlobalState` hook (built on TanStack Query) to share state across components without passing props through multiple levels.

## When to Use

1. **State accessed by 3+ levels of components** - Use global state instead of prop chains
2. **Shared UI state** - Modals, selections, filters, toggles
3. **Cross-cutting concerns** - User preferences, theme, locale
4. **Form state across components** - Multi-step forms, shared inputs

## Pattern: useRQGlobalState Hook

```typescript
// hooks/useSelectedWallet.ts
import useRQGlobalState from '@/hooks/useRQGlobalState';
import { walletQueryKeys } from '@/constants/queryKeys/walletQueryKeys';

export const useSelectedWallet = () => {
  const { data, setNewData } = useRQGlobalState<Wallet | null>({
    queryKey: walletQueryKeys.selected(),
    initialData: null,
  });

  return {
    selectedWallet: data,
    setSelectedWallet: setNewData,
  };
};
```

```typescript
// Usage in any component - no props needed
function WalletDisplay() {
  const { selectedWallet } = useSelectedWallet();
  return <Text>{selectedWallet?.name}</Text>;
}

function WalletSelector() {
  const { setSelectedWallet } = useSelectedWallet();
  return <Button onPress={() => setSelectedWallet(wallet)} />;
}
```

## Anti-Patterns to Avoid

```typescript
// BAD: Props drilling through 3+ levels
function Parent({ wallet }) {
  return <Child wallet={wallet} />;
}
function Child({ wallet }) {
  return <GrandChild wallet={wallet} />;
}
function GrandChild({ wallet }) {
  return <Text>{wallet.name}</Text>;
}

// GOOD: Direct access via hook
function GrandChild() {
  const { selectedWallet } = useSelectedWallet();
  return <Text>{selectedWallet?.name}</Text>;
}
```

## Query Key Organization

Always define query keys in constants for consistency:

```typescript
// constants/queryKeys/walletQueryKeys.ts
export const walletQueryKeys = {
  all: () => ['wallet'] as const,
  lists: () => [...walletQueryKeys.all(), 'list'] as const,
  selected: () => [...walletQueryKeys.all(), 'selected'] as const,
  byId: (id: string) => [...walletQueryKeys.all(), 'detail', id] as const,
};
```

## Creating Custom State Hooks

Wrap useRQGlobalState in domain-specific hooks:

```typescript
// hooks/useSelectedNetwork.ts
export const useSelectedNetwork = () => {
  const { data, setNewData } = useRQGlobalState<Network | null>({
    queryKey: ['network', 'selected'],
    initialData: null,
  });

  return { network: data, setNetwork: setNewData };
};

// hooks/useUIState.ts
export const useModalState = (modalName: string) => {
  const { data, setNewData } = useRQGlobalState<boolean>({
    queryKey: ['ui', 'modal', modalName],
    initialData: false,
  });

  return {
    isOpen: data,
    open: () => setNewData(true),
    close: () => setNewData(false),
    toggle: () => setNewData(!data),
  };
};
```

## Additional Resources

- For complete hook details, see [reference.md](reference.md)
- For usage examples, see [examples.md](examples.md)
