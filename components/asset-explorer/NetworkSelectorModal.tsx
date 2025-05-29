import { TNetworkSelectorModalProps } from "@/constants/types/networkTypes";
import { Pin } from "lucide-react-native";
import React, { useEffect } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const { height } = Dimensions.get("window");
const MODAL_HEIGHT = height * 0.67;

const NetworkSelectorModal = ({
  visible,
  networks,
  activeNetworkId,
  searchQuery,
  onSearchChange,
  onSelectNetwork,
  toggleNetworkPin,
  closeModal,
  fadeAnim,
  translateY,
}: TNetworkSelectorModalProps) => {
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, translateY]);

  const handleSearchChange = (text: string) => {
    onSearchChange(text);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeModal}
    >
      <TouchableWithoutFeedback onPress={closeModal}>
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            opacity: fadeAnim,
          }}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: MODAL_HEIGHT,
                backgroundColor: "#fff",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                transform: [{ translateY: translateY }],
              }}
            >
              <View className="p-4">
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-xl font-bold text-light-matte-black">
                    Select Network
                  </Text>
                  <Pressable
                    onPress={closeModal}
                    className="w-8 h-8 rounded-full bg-light-matte-black/5 items-center justify-center"
                  >
                    <Text className="text-light-matte-black text-lg">×</Text>
                  </Pressable>
                </View>

                <TextInput
                  className="bg-light-matte-black/5 p-3 rounded-xl mb-4"
                  placeholder="Search networks..."
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                />

                <ScrollView className="max-h-[500px]">
                  {networks.map((item) => (
                    <View
                      key={item.id}
                      className="flex-row items-center justify-between p-3 border-b border-light-matte-black/10"
                    >
                      <Pressable
                        className="flex-row items-center flex-1"
                        onPress={() =>
                          onSelectNetwork && onSelectNetwork(item.id)
                        }
                      >
                        <View
                          className="w-6 h-6 rounded-full mr-3"
                          style={{ backgroundColor: item.color }}
                        />
                        <View>
                          <Text className="text-light-matte-black font-medium">
                            {item.name}
                          </Text>
                          <Text className="text-light-matte-black/60 text-xs">
                            {item.symbol}
                          </Text>
                        </View>
                      </Pressable>

                      <View className="flex-row items-center">
                        {activeNetworkId === item.id && (
                          <View className="bg-green-500/10 px-3 py-1 rounded-full mr-3">
                            <Text className="text-green-500 text-xs font-medium">
                              Active
                            </Text>
                          </View>
                        )}

                        <Pressable
                          className="p-2"
                          onPress={() => toggleNetworkPin(item.id)}
                        >
                          <Pin
                            size={18}
                            color={item.isPinned ? "#c71c4b" : "#20222c50"}
                            fill={item.isPinned ? "#c71c4b" : "none"}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default NetworkSelectorModal;
