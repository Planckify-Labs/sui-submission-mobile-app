/**
 * BIP-39 paste warning modal — TWV-2026-063.
 *
 * Shown when the user pastes content on a seed-import / private-key-import
 * screen and the content looks like a BIP-39 mnemonic. The modal does
 * not auto-dismiss: the user must choose between "Type instead"
 * (preferred) and "Paste anyway" (consent to exposure).
 *
 * Callers are responsible for:
 *   - invoking `looksLikeBip39` before opening the modal;
 *   - clearing the clipboard (`Clipboard.setStringAsync("")`) after the
 *     user taps either action;
 *   - keeping the pasted value off-heap until the user confirms.
 */

import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

type Bip39PasteWarningModalProps = {
  visible: boolean;
  onPasteAnyway: () => void;
  onTypeInstead: () => void;
};

export default function Bip39PasteWarningModal({
  visible,
  onPasteAnyway,
  onTypeInstead,
}: Bip39PasteWarningModalProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onTypeInstead}
    >
      <View className="flex-1 bg-black/60 justify-center px-6">
        <View className="bg-light rounded-2xl p-6">
          <View className="items-center mb-4">
            <View className="bg-light-primary-red/10 p-4 rounded-full mb-3">
              <AlertTriangle size={40} color="#c71c4b" strokeWidth={2} />
            </View>
            <Text className="text-light-matte-black font-bold text-xl text-center">
              This looks like a seed phrase
            </Text>
          </View>

          <Text className="text-light-matte-black/70 text-sm text-center mb-2">
            Pasting your seed phrase exposes it to the clipboard and to any
            other app (or malicious keyboard) that can read it.
          </Text>
          <Text className="text-light-matte-black/70 text-sm text-center mb-5">
            Typing each word is safer. We&apos;ll clear your clipboard either way.
          </Text>

          <Pressable
            className="bg-light-primary-red py-4 rounded-full items-center mb-3"
            onPress={onTypeInstead}
          >
            <Text className="text-light font-bold text-base">Type instead</Text>
          </Pressable>

          <Pressable
            className="bg-light-main-container py-4 rounded-full items-center border border-light-matte-black/10"
            onPress={onPasteAnyway}
          >
            <Text className="text-light-matte-black font-medium text-base">
              Paste anyway
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
