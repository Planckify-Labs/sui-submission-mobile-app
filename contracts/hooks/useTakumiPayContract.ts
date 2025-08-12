import { useWallet } from "@/hooks/useWallet";
import { useCallback } from "react";
import { Alert } from "react-native";
import { Address, erc20Abi, parseUnits } from "viem";
import { abiTakumiPay } from "../abis/AbiTakumiPay";
import type { TPurchaseInput, TPurchaseInputDTO } from "../types/TTakumiPay";

export function useTakumiPayContract() {
  const {
    activeWallet,
    activeChain,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
  } = useWallet();

  const takumiPayContractAddress = process.env
    .EXPO_PUBLIC_TAKUMIPAY_CONTRACT_ADDRESS as Address;
  const subscriptionId = process.env.EXPO_PUBLIC_CHAINLINK_SUBSCRIPTION_ID
    ? BigInt(process.env.EXPO_PUBLIC_CHAINLINK_SUBSCRIPTION_ID)
    : 0n;

  const approveToken = useCallback(
    async (tokenAddress: Address, amount: bigint): Promise<boolean> => {
      try {
        const walletClient = getClientForActiveWallet();
        if (!walletClient || !activeWallet.address) {
          Alert.alert("Error", "Wallet not connected");
          return false;
        }
        const publicClient = getPublicClientForActiveChain();
        const { request } = await publicClient.simulateContract({
          account: activeWallet.address as Address,
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [takumiPayContractAddress, amount],
          chain: activeChain.chain,
        });

        const hash = await walletClient.writeContract(request);

        await publicClient.waitForTransactionReceipt({ hash });

        return true;
      } catch (error) {
        console.error("Error approving token:", error);
        Alert.alert("Error", "Failed to approve token spending");
        return false;
      }
    },
    [
      activeWallet,
      getClientForActiveWallet,
      getPublicClientForActiveChain,
      takumiPayContractAddress,
    ],
  );

  const checkAllowance = useCallback(
    async (tokenAddress: Address, amount: bigint): Promise<boolean> => {
      try {
        if (!activeWallet.address) return false;

        const publicClient = getPublicClientForActiveChain();
        const allowance = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [activeWallet.address as Address, takumiPayContractAddress],
        });

        return allowance >= amount;
      } catch (error) {
        console.error("Error checking allowance:", error);
        return false;
      }
    },
    [activeWallet, getPublicClientForActiveChain, takumiPayContractAddress],
  );

  const purchase = useCallback(
    async (
      input: TPurchaseInput,
    ): Promise<{ success: boolean; txHash?: string }> => {
      try {
        const walletClient = getClientForActiveWallet();
        if (!walletClient || !activeWallet.address) {
          Alert.alert("Error", "Wallet not connected");
          return { success: false };
        }

        try {
          const publicClient = getPublicClientForActiveChain();
          const [balance, allowance] = await Promise.all([
            publicClient.readContract({
              address: input.tokenAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [activeWallet.address as Address],
            }),
            publicClient.readContract({
              address: input.tokenAddress,
              abi: erc20Abi,
              functionName: "allowance",
              args: [activeWallet.address as Address, takumiPayContractAddress],
            }),
          ]);

          console.log("Token Balance:", balance.toString());
          console.log("Current Allowance:", allowance.toString());
          console.log("Required Amount:", input.amount.toString());
          console.log("Token Address:", input.tokenAddress);
          console.log("Spender (Contract) Address:", takumiPayContractAddress);
          console.log("Wallet Address:", activeWallet.address);
        } catch (error) {
          console.error("Error checking token info:", error);
        }

        const hasAllowance = await checkAllowance(
          input.tokenAddress,
          input.amount,
        );

        console.log("Has sufficient allowance:", hasAllowance);

        if (!hasAllowance) {
          console.log("Initiating token approval...");
          const approved = await approveToken(input.tokenAddress, input.amount);
          if (!approved) {
            console.error("Token approval failed");
            return { success: false };
          }
          console.log("Token approval successful");
        }
        const publicClient = getPublicClientForActiveChain();
        const { request } = await publicClient.simulateContract({
          account: activeWallet.address as Address,
          address: takumiPayContractAddress,
          abi: abiTakumiPay,
          functionName: "purchase",
          args: [
            subscriptionId,
            {
              bookingId: input.bookingId,
              networkId: input.networkId,
              tokenAddress: input.tokenAddress,
              amount: input.amount,
              gasLimit: input.gasLimit,
            },
          ],
          chain: activeChain.chain,
        });

        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });

        return { success: true, txHash: hash };
      } catch (error) {
        console.error("Error making purchase:", error);
        Alert.alert("Error", "Failed to complete purchase");
        return { success: false };
      }
    },
    [
      activeWallet,
      getClientForActiveWallet,
      getPublicClientForActiveChain,
      checkAllowance,
      approveToken,
      takumiPayContractAddress,
      subscriptionId,
    ],
  );

  const getApiConfig = useCallback(async (): Promise<{
    apiUrl: string;
    apiKey: string;
  } | null> => {
    try {
      const publicClient = getPublicClientForActiveChain();
      const result = await publicClient.readContract({
        address: takumiPayContractAddress,
        abi: abiTakumiPay,
        functionName: "getApiConfig",
      });

      return {
        apiUrl: result[0],
        apiKey: result[1],
      };
    } catch (error) {
      console.error("Error getting API config:", error);
      return null;
    }
  }, [getPublicClientForActiveChain, takumiPayContractAddress]);

  const getPurchase = useCallback(
    async (refId: string) => {
      try {
        const publicClient = getPublicClientForActiveChain();
        return await publicClient.readContract({
          address: takumiPayContractAddress,
          abi: abiTakumiPay,
          functionName: "purchases",
          args: [refId],
        });
      } catch (error) {
        console.error("Error getting purchase:", error);
        return null;
      }
    },
    [getPublicClientForActiveChain, takumiPayContractAddress],
  );

  const createPurchaseInput = useCallback(
    (dto: TPurchaseInputDTO): TPurchaseInput => {
      const {
        bookingId,
        tokenAddress,
        amount,
        decimals = 6,
        gasLimit = 300000,
      } = dto;

      return {
        bookingId,
        networkId: activeChain.chain.id.toString(),
        tokenAddress,
        amount: parseUnits(amount, decimals),
        gasLimit,
      };
    },
    [activeChain],
  );

  return {
    purchase,
    approveToken,
    checkAllowance,
    getApiConfig,
    getPurchase,
    createPurchaseInput,
    takumiPayContractAddress,
  };
}
