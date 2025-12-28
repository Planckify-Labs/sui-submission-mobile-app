---
name: nativewind-styling
description: NativeWind (Tailwind CSS for React Native) styling patterns. Use when styling components, creating responsive layouts, handling dark mode, or building reusable styled components.
---

# NativeWind Styling

Tailwind CSS patterns for React Native using NativeWind v4.

## Basic Usage

```typescript
import { View, Text, Pressable } from 'react-native';

function Card() {
  return (
    <View className="bg-white rounded-xl p-4 shadow-sm">
      <Text className="text-lg font-bold text-gray-900">Title</Text>
      <Text className="text-sm text-gray-500 mt-2">Description</Text>
    </View>
  );
}
```

## Common Patterns

### Flexbox Layout
```typescript
// Row with space between
<View className="flex-row items-center justify-between">

// Centered content
<View className="flex-1 items-center justify-center">

// Column with gap
<View className="flex-1 gap-4">
```

### Spacing
```typescript
// Padding
<View className="p-4">           // all sides
<View className="px-4 py-2">     // horizontal, vertical
<View className="pt-4 pb-2">     // top, bottom

// Margin
<View className="m-4">           // all sides
<View className="mx-auto">       // center horizontally
<View className="mt-4 mb-2">     // top, bottom

// Gap (flexbox)
<View className="gap-4">         // gap between children
<View className="gap-x-2 gap-y-4">  // horizontal, vertical gap
```

### Typography
```typescript
<Text className="text-sm">Small (14px)</Text>
<Text className="text-base">Base (16px)</Text>
<Text className="text-lg">Large (18px)</Text>
<Text className="text-xl">XL (20px)</Text>
<Text className="text-2xl font-bold">Heading</Text>

// Font weights
<Text className="font-normal">Normal</Text>
<Text className="font-medium">Medium</Text>
<Text className="font-semibold">Semi Bold</Text>
<Text className="font-bold">Bold</Text>

// Colors
<Text className="text-gray-900">Primary text</Text>
<Text className="text-gray-500">Secondary text</Text>
<Text className="text-red-500">Error text</Text>
```

### Buttons and Pressables
```typescript
function Button({ children, variant = 'primary' }) {
  return (
    <Pressable
      className={`
        py-3 px-6 rounded-xl items-center justify-center
        ${variant === 'primary' ? 'bg-primary' : 'bg-gray-100'}
        active:opacity-80
      `}
    >
      <Text className={`
        font-semibold text-base
        ${variant === 'primary' ? 'text-white' : 'text-gray-900'}
      `}>
        {children}
      </Text>
    </Pressable>
  );
}
```

### Cards and Containers
```typescript
// Basic card
<View className="bg-white rounded-xl p-4 shadow-sm">

// Card with border
<View className="bg-white rounded-xl p-4 border border-gray-200">

// Elevated card
<View className="bg-white rounded-2xl p-6 shadow-lg">

// Full-width container
<View className="flex-1 bg-light-main-container">
```

### Lists
```typescript
// List item
<View className="flex-row items-center py-3 px-4 border-b border-gray-100">
  <Image className="w-10 h-10 rounded-full" />
  <View className="flex-1 ml-3">
    <Text className="font-medium text-gray-900">Title</Text>
    <Text className="text-sm text-gray-500">Subtitle</Text>
  </View>
  <ChevronRight className="text-gray-400" />
</View>
```

## Conditional Styling

```typescript
// Template literals
<View className={`p-4 rounded-xl ${isActive ? 'bg-primary' : 'bg-gray-100'}`}>

// Array join pattern
<View className={[
  'p-4 rounded-xl',
  isActive && 'bg-primary',
  isDisabled && 'opacity-50',
].filter(Boolean).join(' ')}>

// Multiple conditions
<Text className={`
  text-base font-medium
  ${status === 'success' && 'text-green-500'}
  ${status === 'error' && 'text-red-500'}
  ${status === 'pending' && 'text-yellow-500'}
`}>
```

## Custom Theme Colors

Define in `tailwind.config.js`:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#c71c4b',
        secondary: '#6366f1',
        light: {
          'main-container': '#f5f6f9',
        },
      },
    },
  },
};

// Usage
<View className="bg-primary">
<View className="bg-light-main-container">
<Text className="text-secondary">
```

## Safe Area Handling

```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function Screen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-white">
      {/* Content */}
    </View>
  );
}

// Or with SafeAreaView
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView className="flex-1 bg-white">
  {/* Content */}
</SafeAreaView>
```

## Image Styling

```typescript
import { Image } from 'expo-image';

// Fixed size
<Image className="w-16 h-16 rounded-full" source={avatar} />

// Aspect ratio
<Image className="w-full aspect-video rounded-xl" source={banner} />

// Cover image
<Image
  className="w-full h-48 rounded-xl"
  contentFit="cover"
  source={image}
/>
```

## Input Styling

```typescript
<TextInput
  className="bg-gray-100 rounded-xl px-4 py-3 text-base text-gray-900"
  placeholderTextColor="#9ca3af"
  placeholder="Enter amount"
/>

// With focus state (use state)
<TextInput
  className={`
    bg-gray-100 rounded-xl px-4 py-3 text-base
    ${isFocused ? 'border-2 border-primary' : 'border border-transparent'}
  `}
  onFocus={() => setIsFocused(true)}
  onBlur={() => setIsFocused(false)}
/>
```

## Best Practices

1. **Use semantic class ordering** - Layout > Spacing > Typography > Colors > Effects
2. **Extract repeated patterns** - Create reusable components for common styles
3. **Avoid inline style mixing** - Prefer className over style prop when possible
4. **Use gap over margins** - Prefer `gap-*` classes for consistent spacing
5. **Define custom colors in config** - Keep brand colors in tailwind.config.js
