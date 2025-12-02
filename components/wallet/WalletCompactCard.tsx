import { Check, Edit3 } from "lucide-react-native";
import React, { memo, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Chip from "@/components/common/Chip";
import type { TWallet } from "@/constants/types/walletTypes";
import WalletRenameModal from "./WalletRenameModal";

type WalletCompactCardProps = {
  wallet: TWallet;
  isActive: boolean;
  onPress: () => void;
  onRename?: (newName: string) => Promise<void>;
  allowRename?: boolean;
};

const CARD_WIDTH = 160;

const WalletCompactCard = memo(function WalletCompactCard({
  wallet,
  isActive,
  onPress,
  onRename,
  allowRename = false,
}: WalletCompactCardProps) {
  const [showRenameModal, setShowRenameModal] = useState(false);

  const initials = useMemo(() => {
    if (!wallet.name) return "W";
    const words = wallet.name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return wallet.name.substring(0, 2).toUpperCase();
  }, [wallet.name]);

  const formattedAddress = useMemo(() => {
    if (!wallet.address) return "...";
    return `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`;
  }, [wallet.address]);

  const handleRenamePress = (e: any) => {
    e.stopPropagation();
    setShowRenameModal(true);
  };

  return (
    <>
      <Pressable
        style={{ width: CARD_WIDTH }}
        className={`rounded-2xl p-4 mr-3 ${
          isActive
            ? "bg-light-primary-red"
            : "bg-light border border-light-matte-black/10"
        }`}
        onPress={onPress}
      >
        <View className="flex-row items-center justify-between mb-3">
          <View
            className={`w-9 h-9 rounded-xl items-center justify-center ${
              isActive ? "bg-white/20" : "bg-light-primary-red/10"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isActive ? "text-white" : "text-light-primary-red"
              }`}
            >
              {initials}
            </Text>
          </View>
          {isActive && (
            <View className="w-5 h-5 rounded-full bg-white/30 items-center justify-center">
              <Check size={12} color="#ffffff" strokeWidth={3} />
            </View>
          )}
        </View>

        <View className="flex-row items-center mb-1">
          <Text
            className={`font-bold text-sm flex-1 ${
              isActive ? "text-white" : "text-light-matte-black"
            }`}
            numberOfLines={1}
          >
            {wallet.name}
          </Text>
          {allowRename && (
            <Pressable
              onPress={handleRenamePress}
              className="p-1"
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Edit3 size={12} color={isActive ? "#ffffff" : "#c71c4b"} />
            </Pressable>
          )}
        </View>

        <Text
          className={`text-xs mb-2 ${
            isActive ? "text-white/70" : "text-light-matte-black/60"
          }`}
        >
          {formattedAddress}
        </Text>

        <Chip
          label={wallet.type}
          size="small"
          style={{
            backgroundColor: isActive
              ? "rgba(255,255,255,0.2)"
              : "rgba(199,28,75,0.1)",
          }}
          textStyle={{
            color: isActive ? "#ffffff" : "#c71c4b",
          }}
        />
      </Pressable>

      {showRenameModal && (
        <WalletRenameModal
          visible={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          currentName={wallet.name}
          onRename={onRename}
        />
      )}
    </>
  );
});

export default WalletCompactCard;
