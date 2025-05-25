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

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [visible, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={[styles.container, containerStyle]}>
        {icon ? (
          icon
        ) : (
          <Animated.View
            style={{ transform: [{ rotate: spin }], marginBottom: 12 }}
          >
            <Loader size={32} color="#c71c4b" />
          </Animated.View>
        )}
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {message && (
          <Text style={[styles.message, messageStyle]}>{message}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  title: {
    color: "#20222c",
    fontWeight: "bold",
    marginBottom: 8,
    fontSize: 16,
  },
  message: {
    color: "rgba(32, 34, 44, 0.7)",
    textAlign: "center",
    fontSize: 14,
  },
});
