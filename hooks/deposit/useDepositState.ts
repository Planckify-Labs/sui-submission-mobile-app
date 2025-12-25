import { useCallback, useEffect, useMemo } from "react";
import { router } from "expo-router";
import { TToken } from "@/api/types/token";
import { useBlockchains } from "@/hooks/queries/useBlockchains";
import { useTokens } from "@/hooks/queries/useTokens";
import { useWallet } from "@/hooks/useWallet";
import useRQGlobalState from "@/hooks/useRQGlobalState";

const DEPOSIT_STATE_KEY = ["deposit", "state"] as const;

interface DepositState {
  selectedToken?: TToken;
  amount: string;
  fiatAmount: string;
  isLoading: boolean;
  transactionStatus: string;
}

const initialDepositState: DepositState = {
  selectedToken: undefined,
  amount: "",
  fiatAmount: "",
  isLoading: false,
  transactionStatus: "",
};

export function useDepositState() {
  const { data: state, setNewData: setState } = useRQGlobalState<DepositState>({
    queryKey: DEPOSIT_STATE_KEY,
    initialData: initialDepositState,
  });

  const { activeChain } = useWallet();
  const { data: blockchains } = useBlockchains();

  const activeBackendChain = useMemo(
    () => blockchains?.find((b) => b.chainId === activeChain.chain.id) || null,
    [blockchains, activeChain.chain.id]
  );

  const { data: stablecoinTokens } = useTokens({
    isStablecoin: true,
    isActive: true,
    blockchainId: activeBackendChain?.id,
  });

  useEffect(() => {
    if (stablecoinTokens && stablecoinTokens.length > 0) {
      if (
        !state?.selectedToken ||
        !stablecoinTokens.some((token) => token.id === state.selectedToken?.id)
      ) {
        setState({ ...state, selectedToken: stablecoinTokens[0] });
      }
    } else if (state?.selectedToken) {
      setState({ ...state, selectedToken: undefined });
    }
  }, [stablecoinTokens]);

  const getExchangeRate = useCallback((token?: TToken) => {
    if (!token) return 1.0;
    if (token.symbol === "USDT" || token.symbol === "USDC") {
      return 1.0;
    }
    return 1.0;
  }, []);

  const exchangeRate = useMemo(
    () => getExchangeRate(state?.selectedToken),
    [state?.selectedToken, getExchangeRate]
  );

  const setSelectedToken = useCallback(
    (token: TToken) => {
      setState({ ...state, selectedToken: token });
    },
    [state, setState]
  );

  const setAmount = useCallback(
    (value: string) => {
      const newFiatAmount =
        value && !isNaN(parseFloat(value))
          ? (parseFloat(value) * exchangeRate).toFixed(2)
          : "";
      setState({ ...state, amount: value, fiatAmount: newFiatAmount });
    },
    [state, setState, exchangeRate]
  );

  const setFiatAmount = useCallback(
    (value: string) => {
      const newAmount =
        value && !isNaN(parseFloat(value))
          ? (parseFloat(value) / exchangeRate).toFixed(2)
          : "";
      setState({ ...state, fiatAmount: value, amount: newAmount });
    },
    [state, setState, exchangeRate]
  );

  const setQuickAmount = useCallback(
    (value: string) => {
      const fiatAmount = (parseFloat(value) * exchangeRate).toFixed(2);
      setState({ ...state, amount: value, fiatAmount });
    },
    [state, setState, exchangeRate]
  );

  const validateInputs = useCallback(() => {
    if (!state?.amount || parseFloat(state.amount) <= 0) {
      console.error("Error: Please enter a valid amount");
      return false;
    }
    return true;
  }, [state?.amount]);

  const handleDeposit = useCallback(async () => {
    if (!validateInputs()) return;

    setState({ ...state, isLoading: true, transactionStatus: "Preparing deposit instructions..." });

    try {
      setState({ ...state, isLoading: true, transactionStatus: "Generating deposit address..." });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setState({ ...state, isLoading: true, transactionStatus: "Waiting for deposit confirmation..." });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log(
        "Deposit Instructions Ready:",
        `Send ${state?.amount} ${state?.selectedToken?.symbol || "tokens"} to your wallet address`
      );
      router.back();
    } catch (error) {
      console.error("Deposit error:", error);
    } finally {
      setState({ ...state, isLoading: false, transactionStatus: "" });
    }
  }, [state, setState, validateInputs]);

  const resetState = useCallback(() => {
    setState(initialDepositState);
  }, [setState]);

  return {
    selectedToken: state?.selectedToken,
    amount: state?.amount ?? "",
    fiatAmount: state?.fiatAmount ?? "",
    isLoading: state?.isLoading ?? false,
    transactionStatus: state?.transactionStatus ?? "",
    exchangeRate,
    stablecoinTokens: stablecoinTokens ?? [],
    activeChain,
    setSelectedToken,
    setAmount,
    setFiatAmount,
    setQuickAmount,
    handleDeposit,
    resetState,
  };
}
