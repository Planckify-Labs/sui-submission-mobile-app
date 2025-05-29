import React from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";

type AddTokenFormProps = {
  tokenAddress: string;
  setTokenAddress: (value: string) => void;
  addCustomToken: () => void;
  isLoading: boolean;
};

const AddTokenForm = ({
  tokenAddress,
  setTokenAddress,
  addCustomToken,
  isLoading,
}: AddTokenFormProps) => {
  return (
    <View className="bg-light rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-light-matte-black font-bold mb-3">
        Add Custom Token
      </Text>
      <TextInput
        className="bg-light-main-container rounded-xl p-3 mb-3 text-light-matte-black"
        placeholder="Enter token contract address"
        value={tokenAddress}
        onChangeText={setTokenAddress}
      />
      <Pressable
        onPress={addCustomToken}
        disabled={isLoading}
        className="bg-light-primary-red rounded-xl py-3 items-center"
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text className="text-white font-bold">Add Token</Text>
        )}
      </Pressable>
    </View>
  );
};

export default AddTokenForm;