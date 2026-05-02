import { Check, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TCreateAddressBookDto } from "@/api/types/addressBook";
import { ApiConflictError } from "@/api/types/errors";
import type { TAddressBookEntry } from "@/constants/types/addressBookTypes";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const EXTRA_SPACE_ABOVE_KEYBOARD = 66;

function validateAddressField(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return "Address is required";
  if (/\s/.test(trimmed)) return "Address must not contain spaces";
  if (trimmed.startsWith("0x")) {
    if (!EVM_ADDRESS_REGEX.test(trimmed)) {
      return "Invalid EVM address (must be 0x + 40 hex characters)";
    }
  } else if (trimmed.length < 25) {
    return "Address is too short";
  } else if (trimmed.length > 128) {
    return "Address is too long";
  }
  return null;
}
const SHEET_INITIAL_TRANSLATE_Y = 300;
const DRAG_TO_CLOSE_THRESHOLD = 100;

function resolveApiError(
  error: Error | null,
): { message: string; isDuplicate: boolean } | null {
  if (!error) return null;
  const isDuplicate = error instanceof ApiConflictError;
  return {
    isDuplicate,
    message: isDuplicate
      ? "This address is already in your address book."
      : "Something went wrong. Please try again.",
  };
}

type AddContactPrefill = {
  address?: string;
  chainName?: string;
};

type AddContactModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (dto: TCreateAddressBookDto) => void;
  editing?: TAddressBookEntry | null;
  prefill?: AddContactPrefill;
  isSaving?: boolean;
  saveError?: Error | null;
};

export default function AddContactModal({
  visible,
  onClose,
  onSave,
  editing,
  prefill,
  isSaving = false,
  saveError,
}: AddContactModalProps) {
  const [contactLabel, setContactLabel] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [ensName, setEnsName] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [chainName, setChainName] = useState("");
  const [contactLabelError, setContactLabelError] = useState("");
  const [walletAddressError, setWalletAddressError] = useState("");

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(
    new Animated.Value(SHEET_INITIAL_TRANSLATE_Y),
  ).current;
  const keyboardHeightAnimation = useRef(new Animated.Value(0)).current;

  const contactLabelInputRef = useRef<TextInput>(null);
  const hasAnimatedIn = useRef(false);
  const { bottom: safeAreaBottom } = useSafeAreaInsets();

  const animateOpen = useCallback(() => {
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(SHEET_INITIAL_TRANSLATE_Y);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }),
    ]).start(() => {
      hasAnimatedIn.current = true;
      contactLabelInputRef.current?.focus();
    });
  }, [backdropOpacity, sheetTranslateY]);

  const animateClose = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SHEET_INITIAL_TRANSLATE_Y,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [backdropOpacity, sheetTranslateY, onClose]);

  const panResponderConfig = useMemo(
    () => ({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        if (gestureState.dy > 0) {
          sheetTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        if (gestureState.dy > DRAG_TO_CLOSE_THRESHOLD) {
          animateClose();
        } else {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
    [animateClose, sheetTranslateY],
  );

  const panResponder = useRef(PanResponder.create(panResponderConfig)).current;

  // Pre-fill form fields and trigger open animation when visible changes to true.
  // Reset animation values when closed.
  useEffect(() => {
    if (visible && !hasAnimatedIn.current) {
      setContactLabel(editing?.label ?? "");
      setWalletAddress(editing?.address ?? prefill?.address ?? "");
      setEnsName(editing?.ensName ?? "");
      setContactNotes(editing?.notes ?? "");
      setChainName(editing?.chainName ?? prefill?.chainName ?? "");
      setContactLabelError("");
      setWalletAddressError("");
      animateOpen();
    } else if (!visible) {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_INITIAL_TRANSLATE_Y);
      hasAnimatedIn.current = false;
    }
  }, [
    visible,
    editing,
    prefill,
    animateOpen,
    backdropOpacity,
    sheetTranslateY,
  ]);

  // Subscribe to keyboard show/hide events and animate the bottom spacer.
  // iOS fires "Will" events before the animation starts for perfect sync.
  // Android fires "Did" events after the keyboard has settled.
  useEffect(() => {
    const onKeyboardShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        Animated.timing(keyboardHeightAnimation, {
          toValue: event.endCoordinates.height,
          duration: Platform.OS === "ios" ? event.duration : 200,
          useNativeDriver: false,
        }).start();
      },
    );

    const onKeyboardHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (event) => {
        Animated.timing(keyboardHeightAnimation, {
          toValue: 0,
          duration: Platform.OS === "ios" ? event.duration : 200,
          useNativeDriver: false,
        }).start();
      },
    );

    return () => {
      onKeyboardShow.remove();
      onKeyboardHide.remove();
    };
  }, [keyboardHeightAnimation]);

  const isEvmAddress = walletAddress.trim().startsWith("0x");

  const validateForm = (): boolean => {
    let isValid = true;
    const trimmedLabel = contactLabel.trim();

    if (!trimmedLabel) {
      setContactLabelError("Name is required");
      isValid = false;
    } else if (trimmedLabel.length > 32) {
      setContactLabelError("Max 32 characters");
      isValid = false;
    } else {
      setContactLabelError("");
    }

    const addressError = validateAddressField(walletAddress);
    if (addressError) {
      setWalletAddressError(addressError);
      isValid = false;
    } else {
      setWalletAddressError("");
    }

    return isValid;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const payload: TCreateAddressBookDto = {
      label: contactLabel.trim(),
      address: walletAddress.trim(),
      isEvm: isEvmAddress,
    };
    if (isEvmAddress && ensName.trim()) payload.ensName = ensName.trim();
    if (contactNotes.trim()) payload.notes = contactNotes.trim();
    if (chainName.trim()) payload.chainName = chainName.trim();

    onSave(payload);
  };

  const isEditMode = !!editing;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={animateClose}
    >
      <View style={{ flex: 1 }}>
        {/* Dimmed backdrop — tapping it closes the sheet */}
        <TouchableWithoutFeedback onPress={animateClose}>
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              opacity: backdropOpacity,
            }}
          />
        </TouchableWithoutFeedback>

        {/* Bottom sheet */}
        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: SCREEN_HEIGHT * 0.88,
            backgroundColor: "#f5f6f9",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            transform: [{ translateY: sheetTranslateY }],
            opacity: backdropOpacity,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          {/* Drag handle — touch area drives the pan responder */}
          <View
            {...panResponder.panHandlers}
            className="w-full items-center pt-4 pb-2"
          >
            <View className="w-12 h-1 bg-gray-300 rounded-full" />
          </View>

          {/* Sheet header — stays fixed while the form scrolls */}
          <View className="flex-row items-center justify-between px-6 pb-5">
            <Text className="text-xl font-bold text-light-matte-black">
              {isEditMode ? "Edit Contact" : "Add Contact"}
            </Text>
            <Pressable
              onPress={animateClose}
              disabled={isSaving}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              className="bg-light-main-container p-2 rounded-full"
            >
              <X size={20} color="#c71c4b" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: safeAreaBottom,
            }}
          >
            {/* Inline API error — message is always user-friendly, never a raw HTTP response */}
            {resolveApiError(saveError ?? null) &&
              (() => {
                const apiError = resolveApiError(saveError ?? null)!;
                return (
                  <View
                    className="rounded-xl p-3 mb-4"
                    style={{
                      backgroundColor: apiError.isDuplicate
                        ? "#c71c4b15"
                        : "#20222c0a",
                    }}
                  >
                    <Text
                      className="text-[13px] font-medium"
                      style={{
                        color: apiError.isDuplicate ? "#c71c4b" : "#20222c99",
                      }}
                    >
                      {apiError.message}
                    </Text>
                  </View>
                );
              })()}

            {/* Contact name */}
            <View className="mb-4">
              <Text className="text-sm text-light-matte-black/70 mb-2">
                Name *
              </Text>
              <TextInput
                ref={contactLabelInputRef}
                value={contactLabel}
                onChangeText={(value) => {
                  setContactLabel(value);
                  if (contactLabelError) setContactLabelError("");
                }}
                placeholder="e.g. Alice, Exchange Hot Wallet"
                placeholderTextColor="#20222c40"
                maxLength={32}
                editable={!isSaving}
                returnKeyType="next"
                className="bg-white rounded-xl px-4 py-[14px] text-[15px] text-light-matte-black"
                style={{
                  borderWidth: 1,
                  borderColor: contactLabelError ? "#e53e3e" : "#c71c4b33",
                }}
              />
              {contactLabelError ? (
                <Text className="text-[11px] text-red-500 mt-1">
                  {contactLabelError}
                </Text>
              ) : (
                <Text className="text-[11px] text-light-matte-black/30 mt-1 text-right">
                  {contactLabel.length}/32
                </Text>
              )}
            </View>

            {/* Wallet address (EVM or non-EVM) */}
            <View className="mb-4">
              <Text className="text-sm text-light-matte-black/70 mb-2">
                Wallet Address *
              </Text>
              <TextInput
                value={walletAddress}
                onChangeText={(value) => {
                  setWalletAddress(value);
                  if (walletAddressError) setWalletAddressError("");
                }}
                placeholder="0x... or base58 (Solana, etc.)"
                placeholderTextColor="#20222c40"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSaving}
                returnKeyType="next"
                className="bg-white rounded-xl px-4 py-[14px] text-[13px] text-light-matte-black"
                style={{
                  borderWidth: 1,
                  borderColor: walletAddressError ? "#e53e3e" : "#c71c4b33",
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}
              />
              {!!walletAddressError && (
                <Text className="text-[11px] text-red-500 mt-1">
                  {walletAddressError}
                </Text>
              )}
            </View>

            {/* ENS domain — EVM only */}
            {isEvmAddress && (
              <View className="mb-4">
                <Text className="text-sm text-light-matte-black/70 mb-2">
                  ENS Name
                </Text>
                <TextInput
                  value={ensName}
                  onChangeText={setEnsName}
                  placeholder="e.g. vitalik.eth"
                  placeholderTextColor="#20222c40"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSaving}
                  returnKeyType="next"
                  className="bg-white rounded-xl px-4 py-[14px] text-[15px] text-light-matte-black"
                  style={{ borderWidth: 1, borderColor: "#c71c4b33" }}
                />
              </View>
            )}

            {/* Blockchain network name (optional) */}
            <View className="mb-4">
              <Text className="text-sm text-light-matte-black/70 mb-2">
                Chain
              </Text>
              <TextInput
                value={chainName}
                onChangeText={setChainName}
                placeholder="e.g. Ethereum, Solana, Polygon, Base"
                placeholderTextColor="#20222c40"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!isSaving}
                returnKeyType="next"
                className="bg-white rounded-xl px-4 py-[14px] text-[15px] text-light-matte-black"
                style={{ borderWidth: 1, borderColor: "#c71c4b33" }}
              />
            </View>

            {/* Free-form notes about this contact (optional) */}
            <View className="mb-5">
              <Text className="text-sm text-light-matte-black/70 mb-2">
                Notes
              </Text>
              <TextInput
                value={contactNotes}
                onChangeText={setContactNotes}
                placeholder="e.g. Main savings wallet, don't reuse"
                placeholderTextColor="#20222c40"
                multiline
                numberOfLines={3}
                editable={!isSaving}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                className="bg-white rounded-xl px-4 pt-3 pb-[14px] text-[15px] text-light-matte-black"
                style={{
                  borderWidth: 1,
                  borderColor: "#c71c4b33",
                  minHeight: 72,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {/* Cancel / Save buttons */}
            <View className="flex-row gap-3 mb-2">
              <Pressable
                onPress={animateClose}
                disabled={isSaving}
                className="flex-1 bg-white rounded-xl py-[15px] items-center"
                style={{ borderWidth: 1, borderColor: "#20222c15" }}
              >
                <Text className="text-[15px] font-semibold text-light-matte-black">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={isSaving}
                className="flex-1 rounded-xl py-[15px] flex-row items-center justify-center gap-1.5"
                style={{ backgroundColor: isSaving ? "#c71c4b80" : "#c71c4b" }}
              >
                <Check size={16} color="white" />
                <Text className="text-[15px] font-semibold text-white">
                  {isSaving
                    ? "Saving..."
                    : isEditMode
                      ? "Save Changes"
                      : "Add Contact"}
                </Text>
              </Pressable>
            </View>

            {/* Dynamic spacer — grows to keyboard height + extra breathing room so
                every input can be scrolled above the keyboard edge */}
            <Animated.View
              style={{
                height: Animated.add(
                  keyboardHeightAnimation,
                  EXTRA_SPACE_ABOVE_KEYBOARD,
                ),
              }}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
