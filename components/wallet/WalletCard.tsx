import Chip from "@/components/common/Chip";
import type { TWallet } from "@/constants/types/walletTypes";
import { Check, Edit3, Wallet as WalletIcon } from "lucide-react-native";
import React, { memo, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import WalletRenameModal from "./WalletRenameModal";

type WalletCardProps = {
  wallet: TWallet;
  isActive: boolean;
  onPress: () => void;
  onRename?: (newName: string) => Promise<void>;
  allowRename?: boolean;
};

const WalletCard = memo(function WalletCard({
  wallet,
  isActive,
  onPress,
  onRename,
  allowRename = false,
}: WalletCardProps) {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 360;
  const [showRenameModal, setShowRenameModal] = useState(false);

  const formattedAddress = useMemo(() => {
    if (!wallet.address) return "...";
    return `${wallet.address.substring(0, 4)}...${wallet.address.substring(wallet.address.length - 4)}`;
  }, [wallet.address]);

  const handleRenamePress = (e: any) => {
    e.stopPropagation();
    setShowRenameModal(true);
  };

  return (
    <>
      <Pressable
        className={`p-3 rounded-xl mb-2 flex-row items-center ${
          isActive ? "bg-light-primary-red/10" : "bg-light-main-container"
        }`}
        onPress={onPress}
      >
        <View className="flex-row items-center flex-1 mr-2">
          <WalletIcon
            size={isSmallScreen ? 16 : 18}
            color="#c71c4b"
            className="mr-2"
          />
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text className="text-light-matte-black font-bold text-sm flex-1">
                {wallet.name}
              </Text>
              {allowRename && (
                <Pressable
                  onPress={handleRenamePress}
                  className="ml-2 p-1"
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Edit3 size={12} color="#c71c4b" />
                </Pressable>
              )}
            </View>
            <View className="flex-row items-center flex-wrap">
              <Text className="text-light-matte-black/70 text-xs">
                {formattedAddress}
              </Text>
              <Chip
                label={wallet.type}
                size="small"
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>
        </View>

        <View className="items-end">
          {isActive && (
            <View className="mt-1 w-5 h-5 rounded-full bg-light-primary-red/10 items-center justify-center self-end">
              <Check size={12} color="#c71c4b" strokeWidth={3} />
            </View>
          )}
        </View>
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

export default WalletCard;
