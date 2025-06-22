import { TToken } from "@/api/types/token";
import PinnedTokenCard from "@/components/common/PinnedTokenCard";
import SearchBar from "@/components/common/SearchBar";
import { useTokens } from "@/hooks/queries/useTokens";
import { usePinnedTokens } from "@/hooks/usePinnedTokens";
import { router } from "expo-router";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PinnedTokenSettingScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddToken, setShowAddToken] = useState(false);
  const { data: tokens, isLoading } = useTokens(
    searchQuery ? { name: searchQuery, isActive: true } : { isActive: true },
  );

  const { pinnedTokens, setPinnedTokens } = usePinnedTokens();
  const isPinned = useCallback(
    (tokenId: string) => {
      return pinnedTokens.some((token) => token.id === tokenId);
    },
    [pinnedTokens],
  );
  console.log({ pinnedTokens });
  const handleTogglePin = useCallback(
    (token: TToken) => {
      if (isPinned(token.id)) {
        pinnedTokens !== undefined &&
          setPinnedTokens(pinnedTokens?.filter((t) => t.id !== token.id));
      } else if (pinnedTokens.length < 5) {
        setPinnedTokens([...pinnedTokens, token]);
      }
    },
    [pinnedTokens, setPinnedTokens, isPinned],
  );

  const renderTokenItem = ({ item: token }: { item: TToken }) => (
    <Pressable
      onPress={() => handleTogglePin(token)}
      className={`flex-row items-center justify-between mb-4 p-4 bg-light rounded-xl`}
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
          <Text className="font-bold">{token.symbol?.charAt(0)}</Text>
        </View>
        <View>
          <Text className="text-light-matte-black font-medium">
            {token.symbol}
          </Text>
          <Text className="text-light-matte-black/50 text-xs">
            {token.name}
          </Text>
        </View>
      </View>

      <View
        className={`p-2 rounded-full ${isPinned(token.id) ? "bg-light-primary-red" : "border border-light-matte-black/20"}`}
      >
        {isPinned(token.id) ? (
          <X size={16} color="#fff" />
        ) : (
          pinnedTokens.length < 5 && <Plus size={16} color="#c71c4b" />
        )}
      </View>
    </Pressable>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-light-main-container" edges={["top"]}>
        <View className="flex-1">
          <View className="flex-row items-center mb-4 pt-2 px-4">
            <Pressable onPress={() => router.back()} className="mr-4">
              <ArrowLeft color="#c71c4b" size={24} />
            </Pressable>
            <Text className="text-light-matte-black text-xl font-bold">
              Pinned Tokens
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-light-matte-black/70 mb-2 px-4">
              Pinned Tokens ({pinnedTokens.length}/5)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex gap-2 flex-row py-4 px-2 w-full">
                {pinnedTokens.length > 0 ? (
                  pinnedTokens.map((token: TToken) => (
                    <View key={token.id} className="relative">
                      <PinnedTokenCard token={token} />
                      <TouchableOpacity
                        onPress={() => handleTogglePin(token)}
                        className="absolute -top-2 -right-2 bg-light-primary-red rounded-full p-1"
                      >
                        <X size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <View className="p-4 border border-dashed border-light-matte-black/20 rounded-xl">
                    <Text className="text-light-matte-black/50">
                      No pinned tokens
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
          <View className="px-4 mb-2">
            <View className="mb-4 relative flex-row items-center w-full justify-between gap-2">
              <SearchBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                showAddToken={showAddToken}
                setShowAddToken={setShowAddToken}
              />
            </View>
          </View>

          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#c71c4b" />
            </View>
          ) : (
            <FlatList
              data={tokens}
              renderItem={renderTokenItem}
              keyExtractor={(token) => token.id}
              className="px-4"
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center py-8">
                  <Text className="text-light-matte-black/50">
                    {searchQuery ? "No tokens found" : "No tokens available"}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </SafeAreaView>
    </>
  );
}
