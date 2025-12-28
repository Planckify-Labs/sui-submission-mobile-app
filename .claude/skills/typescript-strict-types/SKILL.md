---
name: typescript-strict-types
description: TypeScript strict typing conventions including avoiding any, using T prefix for types, and using type keyword for imports. Use when writing TypeScript code, defining types, or importing types.
---

# TypeScript Strict Types

Strict TypeScript conventions for type safety and consistency.

## Rule 1: Never Use `any`

Always use specific types instead of `any`:

```typescript
// BAD: Using any
function processData(data: any) {
  return data.value;
}

const items: any[] = [];

// GOOD: Use specific types
function processData(data: TTransaction) {
  return data.value;
}

const items: TTransaction[] = [];

// GOOD: Use unknown for truly unknown data, then narrow
function processUnknownData(data: unknown) {
  if (isTransaction(data)) {
    return data.value;
  }
  throw new Error('Invalid data');
}

// GOOD: Use generics for flexible but type-safe code
function processData<T extends { value: number }>(data: T) {
  return data.value;
}
```

### Alternatives to `any`

| Instead of | Use |
|------------|-----|
| `any` | Specific type (`TUser`, `TProduct`) |
| `any` for unknown data | `unknown` with type guards |
| `any[]` | `T[]` with specific type |
| `any` for flexible functions | Generics `<T>` |
| `any` for objects | `Record<string, T>` or specific interface |
| `any` for JSON | Define the expected shape |

```typescript
// Parsing JSON
// BAD
const data: any = JSON.parse(response);

// GOOD
const data: unknown = JSON.parse(response);
const parsed = dataSchema.parse(data); // Zod validation

// Or with type assertion after validation
const data = JSON.parse(response) as TApiResponse;
```

## Rule 2: Use `T` Prefix for Type Definitions

All type definitions must start with `T`:

```typescript
// BAD: No prefix
type User = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  price: number;
};

interface WalletState {
  balance: number;
}

// GOOD: T prefix for all types
type TUser = {
  id: string;
  name: string;
};

type TProduct = {
  id: string;
  price: number;
};

type TWalletState = {
  balance: number;
};

// GOOD: T prefix for function types
type TOnPress = () => void;
type TRenderItem<T> = (item: T) => React.ReactNode;

// GOOD: T prefix for union types
type TTransactionStatus = 'pending' | 'completed' | 'failed';
type TPaymentMethod = 'crypto' | 'card' | 'bank';

// GOOD: T prefix for generic types
type TApiResponse<T> = {
  data: T;
  error: string | null;
};

type TQueryResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
};
```

### Naming Conventions

```typescript
// Component props
type TButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

// API response types
type TProductResponse = {
  products: TProduct[];
  total: number;
  page: number;
};

// Hook return types
type TUseWalletReturn = {
  wallet: TWallet | null;
  isLoading: boolean;
  connect: () => Promise<void>;
};

// State types
type TFormState = {
  values: Record<string, string>;
  errors: Record<string, string>;
  isSubmitting: boolean;
};
```

## Rule 3: Use `type` Keyword When Importing Types

Always use `type` keyword for type-only imports:

```typescript
// BAD: Importing types without type keyword
import { TUser, TProduct, TTransaction } from '@/api/types';
import { TButtonProps } from '@/components/Button';

// GOOD: Use type keyword for type imports
import type { TUser, TProduct, TTransaction } from '@/api/types';
import type { TButtonProps } from '@/components/Button';

// GOOD: Mixed imports - separate type imports
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { productApi } from '@/api/endpoints/products';
import type { TProduct, TProductCategory } from '@/api/types/product';

// GOOD: Inline type imports (alternative syntax)
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
```

### Why Use `type` Keyword?

1. **Clearer intent** - Distinguishes runtime imports from type-only imports
2. **Better tree-shaking** - Type imports are completely removed at build time
3. **Faster builds** - TypeScript can skip type-only imports during emit
4. **Prevents runtime errors** - Can't accidentally use a type as a value

```typescript
// File: hooks/useProducts.ts

// Type-only imports (removed at build time)
import type {
  TProduct,
  TProductCategory,
  TProductVariant,
} from '@/api/types/product';

// Runtime imports (kept in bundle)
import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/api/endpoints/products';
import { productsQueryKeys } from '@/constants/queryKeys/productsQueryKeys';

export const useProducts = (): TProduct[] => {
  const { data } = useQuery({
    queryKey: productsQueryKeys.lists(),
    queryFn: productApi.getAllProducts,
  });
  return data ?? [];
};
```

## Complete Example

```typescript
// api/types/transaction.ts
export type TTransactionStatus = 'pending' | 'completed' | 'failed';

export type TTransaction = {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  status: TTransactionStatus;
  timestamp: number;
};

export type TTransactionListResponse = {
  transactions: TTransaction[];
  total: number;
  hasMore: boolean;
};

// hooks/queries/useTransactions.ts
import { useQuery } from '@tanstack/react-query';
import type { TTransaction, TTransactionListResponse } from '@/api/types/transaction';
import { transactionApi } from '@/api/endpoints/transactions';

export const useTransactions = (walletAddress: string) => {
  return useQuery<TTransactionListResponse>({
    queryKey: ['transactions', walletAddress],
    queryFn: () => transactionApi.getByWallet(walletAddress),
    enabled: !!walletAddress,
  });
};

// components/TransactionCard.tsx
import type { TTransaction } from '@/api/types/transaction';

type TTransactionCardProps = {
  transaction: TTransaction;
  onPress: (tx: TTransaction) => void;
};

export function TransactionCard({ transaction, onPress }: TTransactionCardProps) {
  return (
    <Pressable onPress={() => onPress(transaction)}>
      <Text>{transaction.amount}</Text>
    </Pressable>
  );
}
```

## ESLint/Biome Rules

Configure your linter to enforce these rules:

```json
// biome.json
{
  "linter": {
    "rules": {
      "suspicious": {
        "noExplicitAny": "error"
      },
      "style": {
        "useImportType": "error"
      }
    }
  }
}
```
