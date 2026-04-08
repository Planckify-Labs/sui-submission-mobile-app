import { Edit3, Trash2 } from "lucide-react-native";
import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { TAddressBookEntry } from "@/constants/types/addressBookTypes";

const ACTION_WIDTH = 136;

type AddressBookItemProps = {
  entry: TAddressBookEntry;
  index: number;
  onEdit: (entry: TAddressBookEntry) => void;
  onDelete: (id: string) => void;
  onCopy: (address: string) => void;
};

function getInitials(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.substring(0, 2).toUpperCase();
}

function getAvatarColor(label: string): string {
  const colors = [
    "#c71c4b",
    "#1c6bc7",
    "#1cb87e",
    "#c77a1c",
    "#6b1cc7",
    "#c71c8e",
  ];
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const AddressBookItem = memo(function AddressBookItem({
  entry,
  index,
  onEdit,
  onDelete,
  onCopy,
}: AddressBookItemProps) {
  const translateX = useSharedValue(0);
  const isOpen = useSharedValue(false);

  const initials = useMemo(() => getInitials(entry.label), [entry.label]);
  const avatarColor = useMemo(() => getAvatarColor(entry.label), [entry.label]);
  const shortAddress = useMemo(
    () =>
      `${entry.address.substring(0, 6)}...${entry.address.substring(entry.address.length - 4)}`,
    [entry.address],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      const base = isOpen.value ? -ACTION_WIDTH : 0;
      const next = base + e.translationX;
      translateX.value = Math.min(0, Math.max(-ACTION_WIDTH, next));
    })
    .onEnd((e) => {
      const shouldOpen = !isOpen.value
        ? e.translationX < -ACTION_WIDTH / 2
        : e.translationX < ACTION_WIDTH / 2;
      if (shouldOpen) {
        translateX.value = withSpring(-ACTION_WIDTH, {
          damping: 18,
          stiffness: 180,
        });
        isOpen.value = true;
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        isOpen.value = false;
      }
    });

  // Animation-driven styles — must stay inline
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(translateX.value < -16 ? 1 : 0, { duration: 150 }),
  }));

  const handleEdit = () => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
    isOpen.value = false;
    onEdit(entry);
  };

  const handleDelete = () => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
    isOpen.value = false;
    onDelete(entry.id);
  };

  const handleCopyPress = () => {
    if (isOpen.value) {
      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      isOpen.value = false;
    } else {
      onCopy(entry.address);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60)
        .duration(350)
        .springify()
        .damping(14)}
      className="mb-3 mx-4"
    >
      {/* Action buttons behind the row — opacity driven by animation, position fixed */}
      <Animated.View
        className="absolute right-0 top-0 bottom-0 flex-row"
        style={[{ width: ACTION_WIDTH }, actionsOpacity]}
      >
        <Pressable
          onPress={handleEdit}
          className="flex-1 bg-light-matte-black rounded-2xl mr-1 items-center justify-center"
        >
          <Edit3 size={18} color="white" />
          <Text className="text-white text-[10px] font-semibold mt-0.5">
            Edit
          </Text>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="flex-1 bg-light-primary-red rounded-2xl items-center justify-center"
        >
          <Trash2 size={18} color="white" />
          <Text className="text-white text-[10px] font-semibold mt-0.5">
            Delete
          </Text>
        </Pressable>
      </Animated.View>

      {/* Swipeable row — translateX driven by animation */}
      <GestureDetector gesture={pan}>
        <Animated.View
          className="bg-light rounded-2xl shadow-sm"
          style={rowStyle}
        >
          <Pressable
            onPress={handleCopyPress}
            className="flex-row items-center p-4"
          >
            {/* Avatar — color is dynamic, keep inline */}
            <View
              className="w-11 h-11 rounded-xl items-center justify-center mr-3"
              style={{ backgroundColor: `${avatarColor}18` }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: avatarColor }}
              >
                {initials}
              </Text>
            </View>

            {/* Info */}
            <View className="flex-1">
              <Text
                className="text-[15px] font-semibold text-light-matte-black mb-0.5"
                numberOfLines={1}
              >
                {entry.label}
              </Text>
              <Text
                className="text-xs text-light-matte-black/60"
                style={{ fontFamily: "monospace" }}
                numberOfLines={1}
              >
                {entry.ensName ? entry.ensName : shortAddress}
              </Text>
              {!!entry.notes && (
                <Text
                  className="text-[11px] text-light-matte-black/40 mt-0.5"
                  numberOfLines={1}
                >
                  {entry.notes}
                </Text>
              )}
            </View>

            {/* Copy badge */}
            <View className="px-2 py-1 bg-light-primary-red/10 rounded-lg">
              <Text className="text-[10px] text-light-primary-red font-semibold">
                COPY
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});

export default AddressBookItem;
