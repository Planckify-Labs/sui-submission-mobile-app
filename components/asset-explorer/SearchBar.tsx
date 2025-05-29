import React from "react";
import { View, TextInput, Pressable } from "react-native";
import { Search, X } from "lucide-react-native";

type SearchBarProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showAddToken: boolean;
  setShowAddToken: (show: boolean) => void;
};

const SearchBar = ({
  searchQuery,
  setSearchQuery,
  showAddToken,
  setShowAddToken,
}: SearchBarProps) => {
  return (
    <View className="flex-row items-center mb-4 gap-2">
      <View className="flex-1 bg-light rounded-xl flex-row items-center px-3 shadow-sm">
        <Search size={18} color="#20222c" />
        <TextInput
          className="flex-1 py-3 px-2 text-light-matte-black"
          placeholder="Search assets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <X size={18} color="#20222c" />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={() => setShowAddToken(!showAddToken)}
        className="bg-light-primary-red rounded-xl p-3"
      >
        {showAddToken ? (
          <X size={18} color="white" />
        ) : (
          <Search size={18} color="white" />
        )}
      </Pressable>
    </View>
  );
};

export default SearchBar;