import { Check, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

type WalletRenameModalProps = {
  visible: boolean;
  onClose: () => void;
  currentName: string;
  onRename?: (newName: string) => Promise<void>;
};

export default function WalletRenameModal({
  visible,
  onClose,
  currentName,
  onRename,
}: WalletRenameModalProps) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName(currentName);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start(() => {
        inputRef.current?.focus();
      });
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, currentName, fadeAnim, scaleAnim]);

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      Alert.alert("Error", "Wallet name cannot be empty");
      return;
    }

    if (trimmedName === currentName) {
      onClose();
      return;
    }

    if (trimmedName.length > 32) {
      Alert.alert("Error", "Wallet name must be 32 characters or less");
      return;
    }

    setLoading(true);
    try {
      await onRename?.(trimmedName);
      onClose();
    } catch (_error) {
      Alert.alert("Error", "Failed to rename wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setName(currentName);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none">
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            opacity: fadeAnim,
          }}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={{
                transform: [{ scale: scaleAnim }],
              }}
              className="bg-light mx-6 rounded-2xl p-6 w-80 max-w-full"
            >
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-light-matte-black text-xl font-bold">
                  Rename Wallet
                </Text>
                <Pressable
                  onPress={handleClose}
                  className="p-1"
                  disabled={loading}
                >
                  <X size={20} color="#c71c4b" />
                </Pressable>
              </View>

              <View className="mb-6">
                <Text className="text-light-matte-black/70 text-sm mb-2">
                  Wallet Name
                </Text>
                <TextInput
                  ref={inputRef}
                  value={name}
                  onChangeText={setName}
                  className="bg-light-main-container border border-light-primary-red/20 rounded-xl px-4 py-3 text-light-matte-black"
                  placeholder="Enter wallet name"
                  maxLength={32}
                  editable={!loading}
                  selectTextOnFocus
                />
                <Text className="text-light-matte-black/50 text-xs mt-1">
                  {name.length}/32 characters
                </Text>
              </View>

              <View className="flex-row space-x-3">
                <Pressable
                  onPress={handleClose}
                  className="flex-1 bg-light-main-container py-3 rounded-xl"
                  disabled={loading}
                >
                  <Text className="text-light-matte-black font-medium text-center">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  className={`flex-1 py-3 rounded-xl flex-row items-center justify-center ${
                    loading ? "bg-light-primary-red/50" : "bg-light-primary-red"
                  }`}
                  disabled={loading}
                >
                  {loading ? (
                    <Text className="text-light font-medium">Saving...</Text>
                  ) : (
                    <>
                      <Check size={16} color="white" className="mr-1" />
                      <Text className="text-light font-medium">Save</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
