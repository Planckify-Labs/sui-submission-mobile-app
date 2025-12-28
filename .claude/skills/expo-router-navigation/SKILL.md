---
name: expo-router-navigation
description: Expo Router file-based navigation patterns. Use when creating routes, handling navigation, passing params, implementing layouts, or managing navigation state.
---

# Expo Router Navigation

File-based routing patterns for Expo Router v6+ with React Navigation.

## File Structure = Route Structure

```
app/
├── _layout.tsx          # Root layout (providers, global config)
├── index.tsx            # / (home route)
├── login.tsx            # /login
├── wallet.tsx           # /wallet
├── (tabs)/              # Tab navigator group
│   ├── _layout.tsx      # Tab layout config
│   ├── home.tsx         # /home tab
│   ├── settings.tsx     # /settings tab
│   └── profile.tsx      # /profile tab
├── [id].tsx             # Dynamic route: /123, /abc
└── [...rest].tsx        # Catch-all: /any/nested/path
```

## Root Layout Pattern

```typescript
// app/_layout.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, SplashScreen } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'ios_from_left',
            contentStyle: { backgroundColor: '#f5f6f9' },
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

## Navigation Methods

```typescript
import { router, useRouter, Link } from 'expo-router';

// Imperative navigation
router.push('/wallet');           // Push to stack
router.replace('/login');         // Replace current screen
router.back();                    // Go back
router.canGoBack();               // Check if can go back
router.dismiss();                 // Dismiss modal
router.dismissAll();              // Dismiss all modals

// With params
router.push({
  pathname: '/activity-detail',
  params: { id: '123', type: 'transfer' },
});

// Hook-based (for dynamic navigation)
function Component() {
  const router = useRouter();
  const handlePress = () => router.push('/wallet');
}

// Declarative navigation
<Link href="/wallet">
  <Text>Go to Wallet</Text>
</Link>

<Link href={{ pathname: '/item/[id]', params: { id: '123' } }}>
  <Text>View Item</Text>
</Link>
```

## Reading Route Params

```typescript
// app/activity-detail.tsx
import { useLocalSearchParams, useGlobalSearchParams } from 'expo-router';

export default function ActivityDetail() {
  // Get params for this screen only
  const { id, type } = useLocalSearchParams<{
    id: string;
    type: 'transfer' | 'purchase';
  }>();

  // Get all params in the URL
  const globalParams = useGlobalSearchParams();

  return <Text>Activity ID: {id}</Text>;
}
```

## Dynamic Routes

```typescript
// app/product/[id].tsx
import { useLocalSearchParams } from 'expo-router';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useProductById(id);

  return <ProductView product={data} />;
}

// Navigate to it
router.push(`/product/${productId}`);
router.push({ pathname: '/product/[id]', params: { id: productId } });
```

## Tab Navigator

```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Home, Wallet, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#c71c4b',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

## Modal Routes

```typescript
// app/_layout.tsx
<Stack>
  <Stack.Screen name="index" />
  <Stack.Screen
    name="modal"
    options={{
      presentation: 'modal',
      animation: 'slide_from_bottom',
    }}
  />
</Stack>

// Navigate to modal
router.push('/modal');

// Dismiss modal
router.dismiss();
```

## Protected Routes Pattern

```typescript
// app/_layout.tsx
import { Redirect } from 'expo-router';

function InitializeApp() {
  const { wallets, isLoading } = useWallet();

  useEffect(() => {
    if (!isLoading && wallets.length === 0) {
      router.replace('/login');
    }
  }, [isLoading, wallets]);

  return null;
}

// Or use Redirect component
export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <ProtectedContent />;
}
```

## Screen Options

```typescript
// In screen file
export default function Screen() { ... }

// Static options
Screen.options = {
  title: 'My Screen',
  headerShown: true,
};

// Dynamic options with useNavigation
import { useNavigation } from 'expo-router';

function Screen() {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: dynamicTitle,
    });
  }, [dynamicTitle]);
}
```

## Best Practices

1. **Use typed params** - Define param types with `useLocalSearchParams<T>()`
2. **Prefer router.push over replace** - Unless intentionally preventing back navigation
3. **Keep layouts lean** - Only providers and navigation config
4. **Group related routes** - Use `(group)` folders for organization
5. **Handle loading in layouts** - Use Suspense or loading states at layout level
