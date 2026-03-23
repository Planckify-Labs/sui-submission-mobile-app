import { useCallback, useEffect, useMemo } from "react";
import { router } from "expo-router";
import { erc20Abi, parseUnits } from "viem";
import type { TToken } from "@/api/types/token";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useTokens } from "@/hooks/queries/useTokens";
import { usePointPrice, useSubmitPointDeposit } from "@/hooks/queries/usePoints";
import { useSmartContractByChain } from "@/hooks/queries/useSmartContracts";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useTakumiWalletContract } from "@/contracts/hooks/useTakumiWalletContract";
import useRQGlobalState from "@/hooks/useRQGlobalState";

const DEPOSIT_STATE_KEY = ["deposit", "state"] as const;
const DEFAULT_CURRENCY = "IDR";

interface DepositState {
  selectedToken?: TToken;
  amount: string;
  isLoading: boolean;
  transactionStatus: string;
  error?: string;
}

const initialDepositState: DepositState = {
  selectedToken: undefined,
  amount: "",
  isLoading: false,
  transactionStatus: "",
};

export function useDepositState() {
  const { data: state, setNewData: setState } = useRQGlobalState<DepositState>({
    queryKey: DEPOSIT_STATE_KEY,
    initialData: initialDepositState,
  });

  const { activeWallet, activeChain, getClientForActiveWallet, getPublicClientForActiveChain } = useWallet();
  const { isAuthenticated } = useIsAuthenticated();
  const { data: blockchains } = useBlockchains();

  const activeBackendChain = useMemo(
    () => blockchains?.find((b) => b.chainId === activeChain.chain.id) || null,
    [blockchains, activeChain.chain.id],
  );

  const { data: stablecoinTokens } = useTokens({
    isStablecoin: true,
    isActive: true,
    blockchainId: activeBackendChain?.id,
  });

  const selectedToken = state?.selectedToken;
  const amount = state?.amount ?? "";
  const isLoading = state?.isLoading ?? false;
  const transactionStatus = state?.transactionStatus ?? "";

  const { data: pointPrice } = usePointPrice({
    tokenId: selectedToken?.id ?? "",
    currency: DEFAULT_CURRENCY,
  });

  const { data: smartContract, isFetching: isContractFetching } = useSmartContractByChain(activeChain.chain.id);
  const contractAddress = smartContract?.address as `0x${string}` | undefined;

  const { depositPoints, waitForTransaction } = useTakumiWalletContract({
    contractAddress: contractAddress ?? "0x0",
  });

  const submitDeposit = useSubmitPointDeposit();

  useEffect(() => {
    if (stablecoinTokens && stablecoinTokens.length > 0) {
      if (!selectedToken || !stablecoinTokens.some((t) => t.id === selectedToken?.id)) {
        setState({ ...initialDepositState, ...state, selectedToken: stablecoinTokens[0] });
      }
    } else if (selectedToken) {
      setState({ ...initialDepositState, ...state, selectedToken: undefined });
    }
  }, [stablecoinTokens]);

  const updateState = useCallback(
    (partial: Partial<DepositState>) => {
      setState({ ...initialDepositState, ...state, ...partial });
    },
    [state, setState],
  );

  const setSelectedToken = useCallback(
    (token: TToken) => updateState({ selectedToken: token, error: undefined }),
    [updateState],
  );

  const setAmount = useCallback(
    (value: string) => updateState({ amount: value, error: undefined }),
    [updateState],
  );

  const setQuickAmount = useCallback(
    (value: string) => updateState({ amount: value, error: undefined }),
    [updateState],
  );

  // Clear errors when the user switches chains (contract availability changes)
  useEffect(() => {
    if (state?.error) {
      updateState({ error: undefined });
    }
  }, [activeChain.chain.id]);

  // Calculate how many tokens needed for the requested points
  const tokenAmountNeeded = useMemo(() => {
    if (!pointPrice || !amount || !selectedToken) return null;
    const points = parseInt(amount, 10);
    if (isNaN(points) || points <= 0) return null;

    const tokenPerPoint = parseFloat(pointPrice.tokenPerPoint);
    const humanTokenAmount = points * tokenPerPoint;
    const rawAmount = parseUnits(
      humanTokenAmount.toFixed(selectedToken.decimals),
      selectedToken.decimals,
    );
    return { human: humanTokenAmount, raw: rawAmount };
  }, [pointPrice, amount, selectedToken]);

  const validateInputs = useCallback(() => {
    const minimumPoints = pointPrice?.minimumPoints ?? 15000;
    const points = parseInt(amount, 10);
    if (isNaN(points) || points < minimumPoints) {
      updateState({ error: `Minimum is ${minimumPoints.toLocaleString()} points` });
      return false;
    }
    if (!selectedToken) {
      updateState({ error: "Please select a token" });
      return false;
    }
    if (!contractAddress) {
      updateState({ error: "No contract found for this chain" });
      return false;
    }
    if (!tokenAmountNeeded) {
      updateState({ error: "Unable to calculate token amount" });
      return false;
    }
    return true;
  }, [amount, selectedToken, contractAddress, tokenAmountNeeded, pointPrice, updateState]);

  const handleDeposit = useCallback(async () => {
    // Redirect to auth if not signed in
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }

    // Warn if no contract found for this chain
    if (!contractAddress) {
      updateState({ error: "Point deposits are not available on this network. Please switch to a supported chain." });
      return;
    }

    if (!validateInputs()) return;
    if (!selectedToken || !tokenAmountNeeded || !activeBackendChain) return;

    const walletClient = getClientForActiveWallet();
    const publicClient = getPublicClientForActiveChain();
    if (!walletClient || !walletClient.account) {
      updateState({ error: "Wallet not connected" });
      return;
    }

    const refId = `pt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    try {
      // Step 1: Check ERC20 allowance
      updateState({ isLoading: true, transactionStatus: "Checking allowance...", error: undefined });

      const currentAllowance = await publicClient.readContract({
        address: selectedToken.contractAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [walletClient.account.address, contractAddress],
      });

      // Step 2: Approve if needed
      if (currentAllowance < tokenAmountNeeded.raw) {
        updateState({ isLoading: true, transactionStatus: "Approving token spend..." });

        const approveHash = await walletClient.writeContract({
          address: selectedToken.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddress, tokenAmountNeeded.raw],
          chain: walletClient.chain,
          account: walletClient.account,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 3: Call depositPoints on smart contract
      updateState({ isLoading: true, transactionStatus: "Depositing to contract..." });

      const txHash = await depositPoints.mutateAsync({
        tokenAddress: selectedToken.contractAddress as `0x${string}`,
        refId,
        amount: tokenAmountNeeded.raw.toString(),
        tokenDecimals: selectedToken.decimals,
      });

      // Step 4: Wait for transaction receipt
      updateState({ isLoading: true, transactionStatus: "Waiting for confirmation..." });
      await waitForTransaction(txHash);

      // Step 5: Submit to API for verification
      updateState({ isLoading: true, transactionStatus: "Submitting for verification..." });

      await submitDeposit.mutateAsync({
        refId,
        txHash,
        tokenId: selectedToken.id,
        blockchainId: activeBackendChain.id,
        contractAddress,
        walletAddress: activeWallet.address,
        tokenAmount: tokenAmountNeeded.raw.toString(),
        expectedPoints: amount,
      });

      // Step 6: Done -- navigate back
      updateState({ isLoading: true, transactionStatus: "Points are being credited..." });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.back();
    } catch (error: any) {
      console.error("Deposit error:", error);
      updateState({
        isLoading: false,
        transactionStatus: "",
        error: error?.message || "Deposit failed",
      });
    } finally {
      updateState({ isLoading: false, transactionStatus: "" });
    }
  }, [
    validateInputs,
    selectedToken,
    contractAddress,
    tokenAmountNeeded,
    activeBackendChain,
    activeWallet,
    depositPoints,
    submitDeposit,
    waitForTransaction,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
    amount,
    updateState,
  ]);

  const resetState = useCallback(() => {
    setState(initialDepositState);
  }, [setState]);

  return {
    selectedToken,
    amount,
    isLoading,
    transactionStatus,
    error: state?.error,
    stablecoinTokens: stablecoinTokens ?? [],
    activeChain,
    pointPrice,
    tokenAmountNeeded,
    isAuthenticated,
    hasContract: !!contractAddress,
    isContractFetching,
    setSelectedToken,
    setAmount,
    setQuickAmount,
    handleDeposit,
    resetState,
  };
}
