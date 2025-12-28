import { Loader } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

type AnimatedPopupProps = {
  visible: boolean;
  title: string;
  message?: string;
  icon?: React.ReactNode;
  containerStyle?: ViewStyle;
  titleStyle?: TextStyle;
  messageStyle?: TextStyle;
};

export default function LoadinngSpinnerPopup({
  visible,
  title,
  message,
  icon,
  containerStyle,
  titleStyle,
  messageStyle,
}: AnimatedPopupProps) {
  const spinValue = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Fade in and scale up animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();

      // Continuous spin animation
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      // Pulse animation for the container
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      // Fade out animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      spinValue.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [visible, spinValue, fadeAnim, scaleAnim, pulseAnim]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.container,
          containerStyle,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {icon ? (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            {icon}
          </Animated.View>
        ) : (
          <Animated.View
            style={{
              transform: [{ rotate: spin }, { scale: pulseAnim }],
              marginBottom: 16,
            }}
          >
            <Loader size={40} color="#c71c4b" strokeWidth={2.5} />
          </Animated.View>
        )}
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {message && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={[styles.message, messageStyle]}>{message}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  container: {
    backgroundColor: "#ffffff",
    padding: 28,
    borderRadius: 20,
    alignItems: "center",
    minWidth: 280,
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    color: "#20222c",
    fontWeight: "bold",
    marginBottom: 12,
    fontSize: 18,
    textAlign: "center",
  },
  message: {
    color: "rgba(32, 34, 44, 0.7)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
});
