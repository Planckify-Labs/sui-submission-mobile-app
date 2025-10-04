import { AlertTriangle, Fuel, X } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatEther } from "viem";
import { TWallet } from "@/constants/types/walletTypes";
import { TTransactionModalProps } from "../../types/dapps-browser";
import { formatAddress, getDappDomain } from "../../utils/dappsBrowserUtils";

const TransactionModal = memo<TTransactionModalProps>(
  function TransactionModal({
    visible,
    onClose,
    onApprove,
    onReject,
    transaction,
    wallet,
    dappUrl,
  }) {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleApprove = useCallback(async () => {
      try {
        setIsProcessing(true);
        await onApprove();
        onClose();
      } catch (error: any) {
        Alert.alert(
          "Transaction Failed",
          error.message || "Unknown error occurred",
        );
      } finally {
        setIsProcessing(false);
      }
    }, [onApprove, onClose]);

    const handleReject = useCallback(() => {
      onReject();
      onClose();
    }, [onReject, onClose]);

    const estimatedGasFee = useMemo(() => {
      if (transaction.gasPrice && transaction.gas) {
        return formatEther(
          BigInt(transaction.gasPrice) * BigInt(transaction.gas),
        );
      }
      if (transaction.maxFeePerGas && transaction.gas) {
        return formatEther(
          BigInt(transaction.maxFeePerGas) * BigInt(transaction.gas),
        );
      }
      return "Unknown";
    }, [transaction.gasPrice, transaction.gas, transaction.maxFeePerGas]);

    const transactionValue = useMemo(() => {
      return transaction.value ? formatEther(BigInt(transaction.value)) : "0";
    }, [transaction.value]);

    const dappDomain = useMemo(() => getDappDomain(dappUrl), [dappUrl]);
    const formattedWalletAddress = useMemo(
      () => formatAddress(wallet.address),
      [wallet.address],
    );
    const formattedToAddress = useMemo(
      () => (transaction.to ? formatAddress(transaction.to) : null),
      [transaction.to],
    );

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <Text className="text-lg font-semibold text-gray-900">
              Transaction Request
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 rounded-full bg-gray-100"
            >
              <X size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-4 py-4">
            <View className="bg-blue-50 rounded-lg p-4 mb-4">
              <View className="flex-row items-center mb-2">
                <View className="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                <Text className="text-blue-800 font-medium">DApp Request</Text>
              </View>
              <Text className="text-blue-700 text-sm">
                {dappDomain} wants to send a transaction
              </Text>
            </View>

            <View className="bg-gray-50 rounded-lg p-4 mb-4">
              <Text className="text-gray-600 text-sm mb-1">From Wallet</Text>
              <Text className="text-gray-900 font-medium">{wallet.name}</Text>
              <Text className="text-gray-600 text-sm">
                {formattedWalletAddress}
              </Text>
            </View>

            <View className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <Text className="text-gray-900 font-medium mb-3">
                Transaction Details
              </Text>

              {transaction.to && (
                <View className="flex-row justify-between items-center py-2 border-b border-gray-100">
                  <Text className="text-gray-600 text-sm">To</Text>
                  <Text className="text-gray-900 text-sm font-mono">
                    {formattedToAddress}
                  </Text>
                </View>
              )}

              <View className="flex-row justify-between items-center py-2 border-b border-gray-100">
                <Text className="text-gray-600 text-sm">Amount</Text>
                <Text className="text-gray-900 text-sm font-medium">
                  {transactionValue} ETH
                </Text>
              </View>

              <View className="flex-row justify-between items-center py-2 border-b border-gray-100">
                <View className="flex-row items-center">
                  <Fuel size={14} color="#6B7280" />
                  <Text className="text-gray-600 text-sm ml-1">Gas Fee</Text>
                </View>
                <Text className="text-gray-900 text-sm">
                  ~{estimatedGasFee} ETH
                </Text>
              </View>

              {transaction.data && transaction.data !== "0x" && (
                <View className="py-2">
                  <Text className="text-gray-600 text-sm mb-1">Data</Text>
                  <Text className="text-gray-900 text-xs font-mono bg-gray-50 p-2 rounded">
                    {transaction.data.slice(0, 100)}
                    {transaction.data.length > 100 && "..."}
                  </Text>
                </View>
              )}
            </View>

            <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <View className="flex-row items-start">
                <AlertTriangle size={16} color="#F59E0B" />
                <View className="ml-2 flex-1">
                  <Text className="text-yellow-800 font-medium text-sm mb-1">
                    Review Carefully
                  </Text>
                  <Text className="text-yellow-700 text-xs">
                    Make sure you trust this DApp and understand what this
                    transaction will do. Transactions cannot be reversed.
                  </Text>
                </View>
              </View>
            </View>

            {isProcessing && (
              <View className="bg-blue-50 rounded-lg p-4 mb-4">
                <View className="flex-row items-center justify-center">
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text className="text-blue-700 ml-2">
                    Processing transaction...
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View className="px-4 py-4 border-t border-gray-200">
            <View className="flex-row space-x-3">
              <TouchableOpacity
                onPress={handleReject}
                disabled={isProcessing}
                className="flex-1 bg-gray-100 rounded-lg py-3 px-4"
              >
                <Text className="text-gray-700 font-medium text-center">
                  Reject
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleApprove}
                disabled={isProcessing}
                className="flex-1 bg-blue-500 rounded-lg py-3 px-4"
              >
                <Text className="text-white font-medium text-center">
                  {isProcessing ? "Processing..." : "Approve"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  },
);

export default TransactionModal;
