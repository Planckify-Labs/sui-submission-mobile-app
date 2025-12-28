# useRQGlobalState Examples

## Example 1: Selected Network State

```typescript
// hooks/useSelectedNetwork.ts
import useRQGlobalState from '@/hooks/useRQGlobalState';
import type { Network } from '@/constants/types/networkTypes';

const NETWORK_QUERY_KEY = ['network', 'selected'] as const;

export const useSelectedNetwork = () => {
  const { data, setNewData } = useRQGlobalState<Network | null>({
    queryKey: NETWORK_QUERY_KEY,
    initialData: null,
  });

  return {
    network: data,
    setNetwork: setNewData,
  };
};
```

```typescript
// components/NetworkSelector.tsx
import { useSelectedNetwork } from '@/hooks/useSelectedNetwork';

export function NetworkSelector() {
  const { network, setNetwork } = useSelectedNetwork();

  return (
    <Pressable onPress={() => setNetwork(newNetwork)}>
      <Text>{network?.name ?? 'Select Network'}</Text>
    </Pressable>
  );
}

// components/TransactionForm.tsx - no props needed
export function TransactionForm() {
  const { network } = useSelectedNetwork();

  return (
    <View>
      <Text>Sending on: {network?.name}</Text>
      {/* form fields */}
    </View>
  );
}
```

## Example 2: Modal State Management

```typescript
// hooks/useConfirmationModal.ts
import useRQGlobalState from '@/hooks/useRQGlobalState';

type ConfirmationModalState = {
  isVisible: boolean;
  title: string;
  message: string;
  onConfirm: (() => void) | null;
};

const MODAL_QUERY_KEY = ['ui', 'confirmationModal'] as const;

export const useConfirmationModal = () => {
  const { data, setNewData } = useRQGlobalState<ConfirmationModalState>({
    queryKey: MODAL_QUERY_KEY,
    initialData: {
      isVisible: false,
      title: '',
      message: '',
      onConfirm: null,
    },
  });

  const showConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setNewData({ isVisible: true, title, message, onConfirm });
  };

  const hideConfirmation = () => {
    setNewData({ ...data, isVisible: false });
  };

  return {
    modalState: data,
    showConfirmation,
    hideConfirmation,
  };
};
```

## Example 3: Filter State for Lists

```typescript
// hooks/useTransactionFilters.ts
import useRQGlobalState from '@/hooks/useRQGlobalState';

type TransactionFilters = {
  dateRange: 'day' | 'week' | 'month' | 'all';
  type: 'all' | 'send' | 'receive' | 'swap';
  status: 'all' | 'pending' | 'completed' | 'failed';
};

export const useTransactionFilters = () => {
  const { data, setNewData } = useRQGlobalState<TransactionFilters>({
    queryKey: ['transactions', 'filters'],
    initialData: {
      dateRange: 'week',
      type: 'all',
      status: 'all',
    },
  });

  const updateFilter = <K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K]
  ) => {
    setNewData({ ...data, [key]: value });
  };

  const resetFilters = () => {
    setNewData({
      dateRange: 'week',
      type: 'all',
      status: 'all',
    });
  };

  return {
    filters: data,
    updateFilter,
    resetFilters,
  };
};
```

## Example 4: Multi-Step Form State

```typescript
// hooks/useSendFormState.ts
import useRQGlobalState from '@/hooks/useRQGlobalState';

type SendFormState = {
  step: 1 | 2 | 3;
  recipient: string;
  amount: string;
  token: Token | null;
  memo: string;
};

export const useSendFormState = () => {
  const { data, setNewData } = useRQGlobalState<SendFormState>({
    queryKey: ['forms', 'send'],
    initialData: {
      step: 1,
      recipient: '',
      amount: '',
      token: null,
      memo: '',
    },
  });

  const nextStep = () => {
    if (data.step < 3) {
      setNewData({ ...data, step: (data.step + 1) as 1 | 2 | 3 });
    }
  };

  const prevStep = () => {
    if (data.step > 1) {
      setNewData({ ...data, step: (data.step - 1) as 1 | 2 | 3 });
    }
  };

  const updateField = <K extends keyof SendFormState>(
    field: K,
    value: SendFormState[K]
  ) => {
    setNewData({ ...data, [field]: value });
  };

  const resetForm = () => {
    setNewData({
      step: 1,
      recipient: '',
      amount: '',
      token: null,
      memo: '',
    });
  };

  return {
    formState: data,
    nextStep,
    prevStep,
    updateField,
    resetForm,
  };
};
```

## When to Use useRQGlobalState vs Context

| Use useRQGlobalState | Use React Context |
|---------------------|-------------------|
| State that may need invalidation | Pure UI state (theme toggle) |
| State that benefits from query caching | State with complex update logic |
| Cross-feature shared state | Provider-scoped state |
| State that persists across navigation | State that should reset on unmount |
