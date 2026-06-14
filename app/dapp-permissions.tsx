import { Trash2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type PermissionGrant,
  PermissionStore,
} from "@/services/permissions/store";
import { truncateAddress } from "@/utils/walletUtils";

export default function DappPermissions(): React.ReactElement {
  const [grants, setGrants] = useState<PermissionGrant[]>([]);

  useEffect(() => {
    const refresh = () => setGrants(PermissionStore.listAll());
    void PermissionStore.hydrate().then(refresh);
    return PermissionStore.subscribe(refresh);
  }, []);

  const byOrigin = grants.reduce<Record<string, PermissionGrant[]>>(
    (acc, g) => {
      (acc[g.origin] = acc[g.origin] ?? []).push(g);
      return acc;
    },
    {},
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="px-4 py-3 border-b border-gray-100">
        <Text className="text-lg font-semibold text-gray-900">
          dApp permissions
        </Text>
        <Text className="text-xs text-gray-500 mt-1">
          Sites you&apos;ve connected your wallet to.
        </Text>
      </View>
      <ScrollView className="flex-1 px-4 py-3">
        {Object.keys(byOrigin).length === 0 && (
          <Text className="text-sm text-gray-500 mt-8 text-center">
            No connected sites yet.
          </Text>
        )}
        {Object.entries(byOrigin).map(([origin, list]) => (
          <View
            key={origin}
            className="bg-white border border-gray-200 rounded-xl p-3 mb-3"
          >
            <View className="flex-row items-center">
              <Text
                className="font-medium text-gray-900 flex-1"
                numberOfLines={1}
              >
                {origin}
              </Text>
              <TouchableOpacity
                onPress={() => PermissionStore.revoke({ origin })}
                className="px-2 py-1"
              >
                <Trash2 size={14} color="#dc2626" />
              </TouchableOpacity>
            </View>
            {list.map((g) => (
              <View
                key={`${g.walletAddress}-${g.chainId}`}
                className="flex-row items-center mt-2"
              >
                <Text className="text-xs text-gray-600 flex-1">
                  {truncateAddress({
                    address: g.walletAddress,
                    preset: "medium",
                  })}{" "}
                  · chain {g.chainId}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    PermissionStore.revoke({
                      origin,
                      walletAddress: g.walletAddress,
                    })
                  }
                >
                  <Text className="text-xs text-red-600">Revoke</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
