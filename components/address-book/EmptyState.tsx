import { BookUser } from "lucide-react-native";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

type EmptyStateProps = {
  isSearching: boolean;
};

export default function EmptyState({ isSearching }: EmptyStateProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
        paddingTop: 60,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          backgroundColor: "#c71c4b12",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <BookUser size={32} color="#c71c4b" />
      </View>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: "#20222c",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        {isSearching ? "No results found" : "No contacts yet"}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#20222c70",
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {isSearching
          ? "Try a different name or address"
          : "Tap the + button to save a wallet\naddress with a friendly name"}
      </Text>
    </Animated.View>
  );
}
