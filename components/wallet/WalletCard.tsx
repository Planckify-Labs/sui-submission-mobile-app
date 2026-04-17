import { useQuery } from "@tanstack/react-query";
import { Check, Edit3, Wallet as WalletIcon } from "lucide-react-native";
import React, { memo, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Chip from "@/components/common/Chip";
import type { TWallet } from "@/constants/types/walletTypes";
import { useWallet } from "@/hooks/useWallet";
import { chainCacheKey } from "@/hooks/useWallet.helpers";
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

  const { activeChain, getKitForWallet } = useWallet();
  // Kit is resolved per-wallet (§6.2): a Solana card in a mixed list
  // must truncate base58 with the Solana kit even when the active chain
  // is EVM, otherwise we hard-code `(0,6)…(-4)` slices on the wrong
  // alphabet.
  const kit = useMemo(
    () => getKitForWallet(wallet),
    [getKitForWallet, wallet],
  );

  // Balance pill is namespace-gated: we only have a chain context for
  // this card when the active chain's namespace matches the card's
  // wallet namespace. For mismatched rows we render "—" rather than
  // branching on the wallet namespace inside the display layer.
  const chainForThisWallet =
    activeChain.namespace === wallet.namespace ? activeChain : null;

  const { data: balance } = useQuery({
    queryKey: [
      "wallet-card-native-balance",
      wallet.address,
      wallet.namespace,
      chainCacheKey(activeChain),
    ],
    queryFn: async () => {
      if (!chainForThisWallet) return null;
      return await kit.getNativeBalance(wallet.address, chainForThisWallet);
    },
    enabled: !!wallet.address && !!chainForThisWallet,
  });

  const formattedBalance = useMemo(() => {
    if (!chainForThisWallet) return "—";
    if (balance === null || balance === undefined) return "…";
    return kit.formatNativeAmount(balance, chainForThisWallet);
  }, [balance, chainForThisWallet, kit]);

  const formattedAddress = useMemo(() => {
    if (!wallet.address) return "...";
    return kit.truncateAddress(wallet.address);
  }, [wallet.address, kit]);

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
          <Text
            className="text-light-matte-black/70 text-xs"
            numberOfLines={1}
          >
            {formattedBalance}
          </Text>
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
