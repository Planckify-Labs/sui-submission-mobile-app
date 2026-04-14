import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import type { TToken } from "@/api/types/token";
import { useTakumiWalletContract } from "@/contracts/hooks/useTakumiWalletContract";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import {
  usePointPrice,
  useSubmitPointDeposit,
} from "@/hooks/queries/usePoints";
import { useSmartContractByChain } from "@/hooks/queries/useSmartContracts";
import { useTokens } from "@/hooks/queries/useTokens";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import { useWallet } from "@/hooks/useWallet";

const DEPOSIT_STATE_KEY = ["deposit", "state"] as const;
const DEFAULT_CURRENCY = "IDR";

interface DepositState {
  selectedToken?: TToken;
  amount: string;
  isLoading: boolean;
  transactionStatus: string;
  error?: string;
  // App-level record of which (wallet, chain, spender, token) tuples the user
  // has explicitly chosen to trust via the "Trust this contract" checkbox.
  // On-chain allowance alone can't express consent — a wallet with residual
  // allowance from a prior flow should still see the modal until it opts in.
  trustedSpenders?: Record<string, true>;
}

const initialDepositState: DepositState = {
  selectedToken: undefined,
  amount: "",
  isLoading: false,
  transactionStatus: "",
  trustedSpenders: {},
};

function buildTrustKey(
  walletAddress: string,
  chainId: number,
  spender: string,
  tokenAddress: string,
): string {
  return `${walletAddress.toLowerCase()}:${chainId}:${spender.toLowerCase()}:${tokenAddress.toLowerCase()}`;
}

export function useDepositState() {
  const { data: state, setNewData: setState } = useRQGlobalState<DepositState>({
    queryKey: DEPOSIT_STATE_KEY,
    initialData: initialDepositState,
  });

  const {
    activeWallet,
    activeChain,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
  } = useWallet();
  const { isAuthenticated } = useIsAuthenticated();
  const { data: blockchains } = useBlockchains();

  const activeBackendChain = useMemo(
    () => blockchains?.find((b) => b.chainId === activeChain.chain.id) || null,
    [blockchains, activeChain.chain.id],
  );

  const { data: rawStablecoinTokens } = useTokens({
    isStablecoin: true,
    isActive: true,
    blockchainId: activeBackendChain?.id,
  });

  // Only offer tokens that have a peggedCurrency configured on the server —
  // tokens without it will return a 400 if used for deposits.
  const stablecoinTokens = useMemo(
    () => rawStablecoinTokens?.filter((t) => !!t.peggedCurrency) ?? [],
    [rawStablecoinTokens],
  );

  const selectedToken = state?.selectedToken;
  const amount = state?.amount ?? "";
  const isLoading = state?.isLoading ?? false;
  const transactionStatus = state?.transactionStatus ?? "";

  const { data: pointPrice } = usePointPrice({
    tokenId: selectedToken?.id ?? "",
    currency: DEFAULT_CURRENCY,
  });

  const { data: smartContract, isFetching: isContractFetching } =
    useSmartContractByChain(activeChain.chain.id);
  const contractAddress = smartContract?.address as `0x${string}` | undefined;

  const { depositPoints, waitForTransaction } = useTakumiWalletContract({
    contractAddress: contractAddress ?? "0x0",
  });

  const submitDeposit = useSubmitPointDeposit();

  useEffect(() => {
    if (stablecoinTokens && stablecoinTokens.length > 0) {
      if (
        !selectedToken ||
        !stablecoinTokens.some((t) => t.id === selectedToken?.id)
      ) {
        setState({
          ...initialDepositState,
          ...state,
          selectedToken: stablecoinTokens[0],
        });
      }
    } else if (selectedToken) {
      setState({ ...initialDepositState, ...state, selectedToken: undefined });
    }
  }, [stablecoinTokens, selectedToken, setState, state]);

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
  }, [state?.error, updateState]);

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

  // --- Wallet Balances ---
  const {
    data: nativeBalance = BigInt(0),
    isFetching: isFetchingNativeBalance,
  } = useQuery({
    queryKey: ["nativeBalance", activeWallet.address, activeChain.chain.id],
    queryFn: async () => {
      const publicClient = getPublicClientForActiveChain();
      if (!publicClient || !activeWallet.address) return BigInt(0);
      return publicClient.getBalance({
        address: activeWallet.address as `0x${string}`,
      });
    },
    enabled: !!activeWallet.address,
    refetchInterval: 30_000,
  });

  const { data: tokenBalance = BigInt(0), isFetching: isFetchingTokenBalance } =
    useQuery({
      queryKey: [
        "stablecoinBalance",
        activeWallet.address,
        selectedToken?.contractAddress,
        activeChain.chain.id,
      ],
      queryFn: async () => {
        const publicClient = getPublicClientForActiveChain();
        if (!publicClient || !activeWallet.address || !selectedToken)
          return BigInt(0);
        return publicClient.readContract({
          address: selectedToken.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [activeWallet.address as `0x${string}`],
        }) as Promise<bigint>;
      },
      enabled: !!activeWallet.address && !!selectedToken,
      refetchInterval: 30_000,
    });

  const nativeBalanceFormatted = useMemo(
    () => parseFloat(formatUnits(nativeBalance, 18)).toFixed(6),
    [nativeBalance],
  );

  const tokenBalanceFormatted = useMemo(() => {
    if (!selectedToken) return "0";
    return parseFloat(
      formatUnits(tokenBalance, selectedToken.decimals),
    ).toFixed(4);
  }, [tokenBalance, selectedToken]);

  const hasInsufficientNative = nativeBalance === BigInt(0);
  const hasInsufficientToken = useMemo(() => {
    if (tokenBalance === BigInt(0)) return true;
    if (tokenAmountNeeded && tokenBalance < tokenAmountNeeded.raw) return true;
    return false;
  }, [tokenBalance, tokenAmountNeeded]);

  const validateInputs = useCallback(() => {
    const minimumPoints = pointPrice?.minimumPoints ?? 15000;
    const points = parseInt(amount, 10);
    if (isNaN(points) || points < minimumPoints) {
      updateState({
        error: `Minimum is ${minimumPoints.toLocaleString()} points`,
      });
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
  }, [
    amount,
    selectedToken,
    contractAddress,
    tokenAmountNeeded,
    pointPrice,
    updateState,
  ]);

  const checkApprovalNeeded = useCallback(async (): Promise<{
    ok: boolean;
    needsApproval: boolean;
  }> => {
    if (!validateInputs()) return { ok: false, needsApproval: false };
    if (!selectedToken || !tokenAmountNeeded || !contractAddress) {
      return { ok: false, needsApproval: false };
    }
    if (!activeWallet.address) {
      updateState({ error: "Wallet not connected" });
      return { ok: false, needsApproval: false };
    }
    const trustKey = buildTrustKey(
      activeWallet.address,
      activeChain.chain.id,
      contractAddress,
      selectedToken.contractAddress,
    );
    const isTrusted = !!state?.trustedSpenders?.[trustKey];
    // Until the user explicitly trusts this spender for this wallet, always
    // prompt — on-chain allowance alone is not consent and residual allowance
    // from prior flows must not silently skip the modal.
    if (!isTrusted) {
      return { ok: true, needsApproval: true };
    }
    const publicClient = getPublicClientForActiveChain();
    if (!publicClient) {
      updateState({ error: "Wallet not connected" });
      return { ok: false, needsApproval: false };
    }
    try {
      const currentAllowance = (await publicClient.readContract({
        address: selectedToken.contractAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [
          activeWallet.address as `0x${string}`,
          contractAddress,
        ],
      })) as bigint;
      return {
        ok: true,
        needsApproval: currentAllowance < tokenAmountNeeded.raw,
      };
    } catch (err) {
      updateState({ error: "Could not read token allowance." });
      return { ok: false, needsApproval: false };
    }
  }, [
    validateInputs,
    selectedToken,
    tokenAmountNeeded,
    contractAddress,
    getPublicClientForActiveChain,
    activeWallet.address,
    activeChain.chain.id,
    state?.trustedSpenders,
    updateState,
  ]);

  const handleDeposit = useCallback(async (options?: {
    approvalMode?: "exact" | "unlimited";
  }) => {
    // Redirect to auth if not signed in
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }

    // Warn if no contract found for this chain
    if (!contractAddress) {
      updateState({
        error:
          "Point deposits are not available on this network. Please switch to a supported chain.",
      });
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
      updateState({
        isLoading: true,
        transactionStatus: "Checking allowance...",
        error: undefined,
      });

      const currentAllowance = await publicClient.readContract({
        address: selectedToken.contractAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [walletClient.account.address, contractAddress],
      });

      // Persist the user's trust choice so future deposits from this wallet
      // can skip the modal when on-chain allowance is still sufficient.
      if (options?.approvalMode === "unlimited") {
        const trustKey = buildTrustKey(
          activeWallet.address,
          activeChain.chain.id,
          contractAddress,
          selectedToken.contractAddress,
        );
        updateState({
          trustedSpenders: {
            ...(state?.trustedSpenders ?? {}),
            [trustKey]: true,
          },
        });
      }

      // Step 2: Decide the approve target.
      //
      // ERC-20 `approve(spender, value)` overwrites the current allowance
      // (EIP-20), so when the user explicitly picks a mode we always write
      // that exact value — "exact" can therefore reduce a residual
      // unlimited allowance down to just the amount this deposit needs.
      // Without an explicit mode (trusted + allowance sufficient path), we
      // only top up when the current allowance falls short.
      let approvalAmount: bigint | null = null;
      if (options?.approvalMode === "unlimited") {
        approvalAmount = currentAllowance === maxUint256 ? null : maxUint256;
      } else if (options?.approvalMode === "exact") {
        approvalAmount =
          currentAllowance === tokenAmountNeeded.raw
            ? null
            : tokenAmountNeeded.raw;
      } else if (currentAllowance < tokenAmountNeeded.raw) {
        approvalAmount = tokenAmountNeeded.raw;
      }

      if (approvalAmount !== null) {
        updateState({
          isLoading: true,
          transactionStatus: "Approving token spend...",
        });

        const approveHash = await walletClient.writeContract({
          address: selectedToken.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddress, approvalAmount],
          chain: walletClient.chain,
          account: walletClient.account,
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 3: Call depositPoints on smart contract
      updateState({
        isLoading: true,
        transactionStatus: "Depositing to contract...",
      });

      const txHash = await depositPoints.mutateAsync({
        tokenAddress: selectedToken.contractAddress as `0x${string}`,
        refId,
        amount: tokenAmountNeeded.raw.toString(),
        tokenDecimals: selectedToken.decimals,
      });

      // Step 4: Wait for transaction receipt
      updateState({
        isLoading: true,
        transactionStatus: "Waiting for confirmation...",
      });
      await waitForTransaction(txHash);

      // Step 5: Submit to API for verification
      updateState({
        isLoading: true,
        transactionStatus: "Submitting for verification...",
      });

      await submitDeposit.mutateAsync({
        refId,
        txHash,
        tokenId: selectedToken.id,
        blockchainId: activeBackendChain.id,
        contractAddress,
        walletAddress: activeWallet.address,
        tokenAmount: tokenAmountNeeded.raw.toString(),
        expectedPoints: amount,
        currency: DEFAULT_CURRENCY,
      });

      // Step 6: Done -- navigate back
      updateState({
        isLoading: true,
        transactionStatus: "Points are being credited...",
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.back();
    } catch (error: any) {
      console.error("Deposit error:", error);

      let errorMessage = "Deposit failed. Please try again.";
      try {
        const body = await error?.response?.json?.();
        const msg: string = body?.message ?? "";
        if (msg.toLowerCase().includes("no pegged currency")) {
          errorMessage = `${selectedToken?.symbol ?? "This token"} is not supported for point deposits. Please select a different token.`;
        } else if (msg) {
          errorMessage = msg;
        }
      } catch {
        if (error?.message) errorMessage = error.message;
      }

      updateState({
        isLoading: false,
        transactionStatus: "",
        error: errorMessage,
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
    activeChain.chain.id,
    depositPoints,
    submitDeposit,
    waitForTransaction,
    getClientForActiveWallet,
    getPublicClientForActiveChain,
    amount,
    updateState,
    isAuthenticated,
    state?.trustedSpenders,
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
    contractAddress,
    smartContract,
    // Balances
    nativeBalance,
    nativeBalanceFormatted,
    tokenBalance,
    tokenBalanceFormatted,
    hasInsufficientNative,
    hasInsufficientToken,
    isFetchingBalances: isFetchingNativeBalance || isFetchingTokenBalance,
    setSelectedToken,
    setAmount,
    setQuickAmount,
    handleDeposit,
    checkApprovalNeeded,
    resetState,
  };
}
