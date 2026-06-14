import { Image as ExpoImage } from "expo-image";
import React, { memo } from "react";
import {
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

type OptimizedImageProps = {
  source: any;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  transition?: number;
  placeholder?: string;
  contentPosition?:
    | "center"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top left"
    | "top right"
    | "bottom left"
    | "bottom right";
  alt?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

const DEFAULT_PLACEHOLDER = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

const OptimizedImage = memo(
  ({
    source,
    style,
    contentFit = "cover",
    transition = 200,
    placeholder = DEFAULT_PLACEHOLDER,
    contentPosition,
    alt,
    containerStyle,
  }: OptimizedImageProps) => {
    return (
      <View style={[styles.container, containerStyle]}>
        <ExpoImage
          source={source}
          style={[styles.image, style]}
          contentFit={contentFit}
          transition={transition}
          placeholder={placeholder}
          contentPosition={contentPosition}
          alt={alt}
          cachePolicy="memory-disk"
        />
      </View>
    );
  },
);

OptimizedImage.displayName = "OptimizedImage";

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

export default OptimizedImage;
