import { Link } from "expo-router";
import { ShieldAlert, UserRound } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

export default function Header() {
  return (
    <View className="flex-row gap-4 w-full">
      <View className="rounded-full bg-light p-2 px-4 gap-2 flex-1 flex-row items-center">
        <ShieldAlert color="#c71c4b" size={20} />
        <View className="border-l h-full max-h-7" />
        <Text numberOfLines={1} ellipsizeMode="tail" className="flex-1">
          never share your private key or seed phrases
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          pressed && { backgroundColor: "rgba(199, 28, 75, 0.15)" },
        ]}
        className="rounded-full bg-light items-center justify-center aspect-square w-[45px]"
      >
        <Link href="/wallet">
          <View className="items-center justify-center  p-1 aspect-square h-full w-full">
            <UserRound color="#20222c" size={30} />
          </View>
        </Link>
      </Pressable>
    </View>
  );
}
