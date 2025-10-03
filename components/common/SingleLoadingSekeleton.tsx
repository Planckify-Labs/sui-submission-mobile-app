import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, ViewStyle } from "react-native";

type SingleLoadingSkeletonProps = {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
};

export default function SingleLoadingSekeleton({
  width = "100%",
  height = 20,
  borderRadius = 4,
  style,
}: SingleLoadingSkeletonProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const containerStyle = useMemo(
    () => ({
      width: width as any,
      height: height as any,
      borderRadius,
    }),
    [width, height, borderRadius],
  );

  const animatedViewStyle = useMemo(
    () => [
      StyleSheet.absoluteFill,
      {
        backgroundColor: "rgba(255, 255, 255, 0.5)",
        opacity: animatedValue,
      } as any,
    ],
    [animatedValue],
  );

  useEffect(() => {
    if (animationRef.current) {
      animationRef.current.stop();
    }

    animationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animationRef.current.start();

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [animatedValue]);

  return (
    <View style={[styles.container, containerStyle, style]}>
      <Animated.View style={animatedViewStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#E0E0E0",
    overflow: "hidden",
  },
});
