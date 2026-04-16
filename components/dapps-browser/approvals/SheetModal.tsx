import { X } from "lucide-react-native";
import React, { useEffect } from "react";
import { BackHandler, Modal, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  onDismiss: () => void;
  children: React.ReactNode;
}

/**
 * Shared modal chrome — full-screen slide-up sheet. Hardware back dismisses
 * (as reject, per spec §10.4 invariant 2).
 */
export function SheetModal({ onDismiss, children }: Props): React.ReactElement {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [onDismiss]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onDismiss}>
      <View className="flex-1 bg-black/40 justify-end">
        <SafeAreaView
          edges={["bottom"]}
          className="bg-white rounded-t-2xl max-h-[92%]"
        >
          <View className="flex-row justify-end px-2 pt-2">
            <TouchableOpacity
              onPress={onDismiss}
              className="w-8 h-8 items-center justify-center"
              accessibilityLabel="Close"
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function PrimaryActions({
  onApprove,
  onReject,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  disabled,
  loading,
}: {
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  disabled?: boolean;
  loading?: boolean;
}): React.ReactElement {
  return (
    <View className="flex-row px-4 pt-3 pb-4 gap-3">
      <TouchableOpacity
        onPress={onReject}
        className="flex-1 py-3 rounded-full border border-gray-300 items-center"
        disabled={loading}
      >
        <Text className="text-gray-700 font-medium">{rejectLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onApprove}
        className={`flex-1 py-3 rounded-full items-center ${
          disabled ? "bg-gray-300" : "bg-black"
        }`}
        disabled={disabled || loading}
      >
        <Text className="text-white font-semibold">
          {loading ? "…" : approveLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
