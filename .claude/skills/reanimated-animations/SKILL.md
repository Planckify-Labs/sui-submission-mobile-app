---
name: reanimated-animations
description: React Native Reanimated animation patterns for smooth 60fps animations. Use when implementing animated transitions, gestures, layout animations, or micro-interactions.
---

# Reanimated Animations

Animation patterns with React Native Reanimated v4 for smooth 60fps animations.

## Basic Animated Styles

```typescript
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

function AnimatedCard() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
    opacity.value = withTiming(0.8, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    opacity.value = withTiming(1, { duration: 100 });
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={animatedStyle} className="bg-white p-4 rounded-xl">
        <Text>Animated Card</Text>
      </Animated.View>
    </Pressable>
  );
}
```

## Spring Animations

```typescript
import { withSpring, WithSpringConfig } from 'react-native-reanimated';

// Common spring configs
const SPRING_CONFIG: WithSpringConfig = {
  damping: 15,
  stiffness: 150,
  mass: 1,
};

const BOUNCY_SPRING: WithSpringConfig = {
  damping: 10,
  stiffness: 100,
};

function BouncyButton() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, BOUNCY_SPRING) }],
  }));

  return (
    <Pressable
      onPressIn={() => (scale.value = 0.9)}
      onPressOut={() => (scale.value = 1)}
    >
      <Animated.View style={animatedStyle}>
        <Text>Bouncy!</Text>
      </Animated.View>
    </Pressable>
  );
}
```

## Layout Animations

```typescript
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  Layout,
} from 'react-native-reanimated';

function AnimatedList({ items }: { items: Item[] }) {
  return (
    <View>
      {items.map((item, index) => (
        <Animated.View
          key={item.id}
          entering={FadeIn.delay(index * 100).duration(300)}
          exiting={FadeOut.duration(200)}
          layout={Layout.springify()}
          className="bg-white p-4 rounded-xl mb-2"
        >
          <Text>{item.name}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
```

## Gesture-Driven Animations

```typescript
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

function SwipeableCard({ onSwipeRight }: { onSwipeRight: () => void }) {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > 100) {
        translateX.value = withSpring(400);
        runOnJS(onSwipeRight)();
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle} className="bg-white p-4 rounded-xl">
        <Text>Swipe me right</Text>
      </Animated.View>
    </GestureDetector>
  );
}
```

## Animated Interpolation

```typescript
import { interpolate, Extrapolation } from 'react-native-reanimated';

function ParallaxHeader({ scrollY }: { scrollY: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      scrollY.value,
      [0, 100],
      [200, 100],
      Extrapolation.CLAMP
    );

    const opacity = interpolate(
      scrollY.value,
      [0, 50, 100],
      [1, 0.5, 0],
      Extrapolation.CLAMP
    );

    return {
      height,
      opacity,
    };
  });

  return (
    <Animated.View style={animatedStyle} className="bg-primary">
      <Text className="text-white">Header</Text>
    </Animated.View>
  );
}
```

## Animated ScrollView

```typescript
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

function AnimatedScrollScreen() {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  return (
    <View className="flex-1">
      <AnimatedHeader scrollY={scrollY} />
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Content */}
      </Animated.ScrollView>
    </View>
  );
}
```

## Shared Element Transitions

```typescript
import { SharedTransition, withSpring } from 'react-native-reanimated';

const customTransition = SharedTransition.custom((values) => {
  'worklet';
  return {
    width: withSpring(values.targetWidth),
    height: withSpring(values.targetHeight),
    originX: withSpring(values.targetOriginX),
    originY: withSpring(values.targetOriginY),
  };
});

function ProductCard({ product }: { product: Product }) {
  return (
    <Pressable onPress={() => router.push(`/product/${product.id}`)}>
      <Animated.Image
        sharedTransitionTag={`product-${product.id}`}
        sharedTransitionStyle={customTransition}
        source={{ uri: product.image }}
        className="w-full h-48 rounded-xl"
      />
    </Pressable>
  );
}
```

## Loading Skeleton Animation

```typescript
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

function SkeletonBox({ width, height }: { width: number; height: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.ease }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[animatedStyle, { width, height }]}
      className="bg-gray-200 rounded-lg"
    />
  );
}
```

## Circular Progress Animation

```typescript
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function CircularProgress({ progress }: { progress: number }) {
  const animatedProgress = useSharedValue(0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animatedProgress.value = withTiming(progress, { duration: 1000 });
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <Svg width={100} height={100}>
      <AnimatedCircle
        cx={50}
        cy={50}
        r={radius}
        stroke="#c71c4b"
        strokeWidth={8}
        fill="none"
        strokeDasharray={circumference}
        animatedProps={animatedProps}
        strokeLinecap="round"
      />
    </Svg>
  );
}
```

## Best Practices

1. **Use worklet functions** - Add `'worklet'` directive for JS thread functions
2. **Prefer springs over timing** - More natural feel for UI animations
3. **Use interpolate for complex animations** - Map values between ranges
4. **Avoid re-creating animated styles** - Keep useAnimatedStyle stable
5. **Use runOnJS for callbacks** - Bridge from UI thread to JS thread
6. **Set scrollEventThrottle={16}** - 60fps for scroll animations
7. **Use Layout animation for list changes** - Smooth add/remove animations
