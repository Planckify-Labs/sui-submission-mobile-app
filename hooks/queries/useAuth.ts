import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { publicApi, reset401Guard } from "@/constants/configs/ky";
import { useWallet } from "@/hooks/useWallet";

interface TNonceResponse {
  nonce: string;
  message: string;
}

interface TVerifyRequest {
  message: string;
  signature: string;
}

interface TVerifySignatureResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    walletAddress: string;
  };
}

interface TRefreshTokenResponse {
  access_token: string;
}

const ACCESS_TOKEN_KEY = "takumipay_access_token";
const REFRESH_TOKEN_KEY = "takumipay_refresh_token";
const AUTH_WALLET_ADDRESS_KEY = "takumipay_auth_wallet_address";

const accessKeyFor = (address: string) =>
  `${ACCESS_TOKEN_KEY}_${address.toLowerCase()}`;
const refreshKeyFor = (address: string) =>
  `${REFRESH_TOKEN_KEY}_${address.toLowerCase()}`;

export const storeTokens = async (
  accessToken: string,
  refreshToken: string,
  walletAddress?: string,
): Promise<void> => {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    if (walletAddress) {
      await SecureStore.setItemAsync(
        AUTH_WALLET_ADDRESS_KEY,
        walletAddress.toLowerCase(),
      );
      await SecureStore.setItemAsync(accessKeyFor(walletAddress), accessToken);
      await SecureStore.setItemAsync(
        refreshKeyFor(walletAddress),
        refreshToken,
      );
    }
  } catch (error) {
    console.error("Failed to store tokens:", error);
    throw new Error("Failed to store authentication tokens");
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to get access token:", error);
    return null;
  }
};

export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to get refresh token:", error);
    return null;
  }
};

export const getAccessTokenForWallet = async (
  walletAddress?: string | null,
): Promise<string | null> => {
  if (!walletAddress) return null;
  try {
    const token = await SecureStore.getItemAsync(accessKeyFor(walletAddress));
    return token || null;
  } catch (error) {
    console.error("Failed to get access token for wallet:", error);
    return null;
  }
};

export const getRefreshTokenForWallet = async (
  walletAddress?: string | null,
): Promise<string | null> => {
  if (!walletAddress) return null;
  try {
    const token = await SecureStore.getItemAsync(refreshKeyFor(walletAddress));
    return token || null;
  } catch (error) {
    console.error("Failed to get refresh token for wallet:", error);
    return null;
  }
};

export const clearTokens = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(AUTH_WALLET_ADDRESS_KEY);
  } catch (error) {
    console.error("Failed to clear tokens:", error);
  }
};

export const getAuthenticatedWalletAddress = async (): Promise<
  string | null
> => {
  try {
    const addr = await SecureStore.getItemAsync(AUTH_WALLET_ADDRESS_KEY);
    return addr;
  } catch (error) {
    console.error("Failed to get authenticated wallet address:", error);
    return null;
  }
};

export const useNonce = (walletAddress?: string, chainId?: number) => {
  return useQuery<TNonceResponse>({
    queryKey: ["auth", "nonce", walletAddress, chainId],
    queryFn: async () => {
      if (!walletAddress) throw new Error("Wallet address is required");

      const endpoint = `auth/nonce/${walletAddress}${chainId ? `?chainId=${chainId}` : ""}`;

      try {
        const response = await publicApi.get(endpoint).json<TNonceResponse>();
        return response;
      } catch (error) {
        console.error("Failed to fetch nonce:", error);
        throw error;
      }
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useVerifySignature = () => {
  return useMutation<TVerifySignatureResponse, Error, TVerifyRequest>({
    mutationFn: async ({ message, signature }) => {
      try {
        const response = await publicApi
          .post("auth/verify", {
            json: {
              message,
              signature,
            },
          })
          .json<TVerifySignatureResponse>();

        await storeTokens(
          response.access_token,
          response.refresh_token,
          (response as any).user?.walletAddress ||
            (response as any).walletAddress,
        );

        // Allow future 401s to trigger redirect again now that we have fresh tokens
        reset401Guard();

        return response;
      } catch (error) {
        console.error("Failed to verify signature:", error);
        throw error;
      }
    },
  });
};

export const useRefreshToken = () => {
  const queryClient = useQueryClient();
  const { activeWallet } = useWallet();

  const refreshTokenMutation = useMutation<TRefreshTokenResponse, Error>({
    mutationFn: async () => {
      const currentWallet = activeWallet?.address?.toLowerCase() || null;

      let refreshToken: string | null = null;
      if (currentWallet) {
        refreshToken = await getRefreshTokenForWallet(currentWallet);
      }

      if (!refreshToken) {
        const legacyRefresh = await getRefreshToken();
        const authedWallet =
          (await getAuthenticatedWalletAddress())?.toLowerCase() || null;
        if (legacyRefresh && currentWallet && authedWallet === currentWallet) {
          refreshToken = legacyRefresh;
        }
      }

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      try {
        const response = await publicApi
          .post("auth/refresh", {
            json: {
              refresh_token: refreshToken,
            },
          })
          .json<TRefreshTokenResponse>();

        const walletToPersist = activeWallet?.address;
        if (walletToPersist) {
          await SecureStore.setItemAsync(
            accessKeyFor(walletToPersist),
            response.access_token,
          );
          await SecureStore.setItemAsync(
            ACCESS_TOKEN_KEY,
            response.access_token,
          );
        } else {
          await SecureStore.setItemAsync(
            ACCESS_TOKEN_KEY,
            response.access_token,
          );
        }

        // Fresh access token obtained — allow future 401s to trigger redirect again
        reset401Guard();

        return response;
      } catch (error: any) {
        console.error("Failed to refresh token:", error);
        // Only clear tokens if the server explicitly rejected the refresh token (401/403).
        // Network errors or 5xx responses mean the API is temporarily unavailable —
        // keep tokens so the user stays authenticated when the server comes back.
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          await clearTokens();
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  const refreshAccessToken = useCallback(async () => {
    try {
      await refreshTokenMutation.mutateAsync();
      return true;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return false;
    }
  }, [refreshTokenMutation]);

  // Like refreshAccessToken but throws so callers can inspect the error type.
  const refreshAccessTokenOrThrow = useCallback(async () => {
    await refreshTokenMutation.mutateAsync();
  }, [refreshTokenMutation]);

  return {
    refreshAccessToken,
    refreshAccessTokenOrThrow,
    isRefreshing: refreshTokenMutation.isPending,
    error: refreshTokenMutation.error,
  };
};

export const useIsAuthenticated = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hadPreviousSession, setHadPreviousSession] = useState(false);
  const { refreshAccessTokenOrThrow } = useRefreshToken();
  const refreshAccessTokenRef = useRef(refreshAccessTokenOrThrow);
  const { activeWallet } = useWallet();

  useEffect(() => {
    refreshAccessTokenRef.current = refreshAccessTokenOrThrow;
  }, [refreshAccessTokenOrThrow]);

  useEffect(() => {
    // Reset immediately so no stale auth state from the previous wallet leaks
    // through while the async SecureStore check is in flight.
    setIsAuthenticated(null);
    setHadPreviousSession(false);
    setIsLoading(true);

    const checkAuthentication = async () => {
      const currentWallet = activeWallet?.address?.toLowerCase() || null;

      // Wallet not yet loaded — stay in loading state, don't mark as unauthenticated.
      // The effect will re-run once activeWallet resolves.
      if (!currentWallet) {
        return;
      }

      try {
        setIsLoading(true);

        const perWalletAccess = await getAccessTokenForWallet(currentWallet);
        const perWalletRefresh = await getRefreshTokenForWallet(currentWallet);

        let accessToken = perWalletAccess;
        let refreshToken = perWalletRefresh;
        const legacyAccess = await getAccessToken();
        const legacyRefresh = await getRefreshToken();
        const authedWallet =
          (await getAuthenticatedWalletAddress())?.toLowerCase() || null;
        if (
          !accessToken &&
          legacyAccess &&
          currentWallet &&
          authedWallet === currentWallet
        ) {
          accessToken = legacyAccess;
        }
        if (
          !refreshToken &&
          legacyRefresh &&
          currentWallet &&
          authedWallet === currentWallet
        ) {
          refreshToken = legacyRefresh;
        }

        if (
          currentWallet &&
          authedWallet === currentWallet &&
          (accessToken || refreshToken) &&
          !perWalletAccess &&
          !perWalletRefresh
        ) {
          try {
            if (accessToken) {
              await SecureStore.setItemAsync(
                accessKeyFor(currentWallet),
                accessToken,
              );
            }
            if (refreshToken) {
              await SecureStore.setItemAsync(
                refreshKeyFor(currentWallet),
                refreshToken,
              );
            }
          } catch (e) {
            console.warn(
              "Failed to persist legacy tokens to per-wallet storage",
              e,
            );
          }
        }

        // True if the user previously authenticated for this wallet.
        // Used by screens to distinguish "new user" (no session) from "expired session".
        const hadSession = !!(accessToken || refreshToken);
        setHadPreviousSession(hadSession);

        if (!accessToken && !refreshToken) {
          setIsAuthenticated(false);
          return;
        }

        if (!accessToken && refreshToken) {
          try {
            await refreshAccessTokenRef.current();
            setIsAuthenticated(true);
          } catch (refreshError: any) {
            const status = refreshError?.response?.status;
            if (status === 401 || status === 403) {
              // Server explicitly rejected the refresh token — session is truly expired.
              setIsAuthenticated(false);
            } else {
              // Network error or server unavailable — assume still authenticated
              // and let individual API calls handle re-auth when the server returns.
              console.warn("Refresh failed (network/server error), keeping authenticated state:", refreshError);
              setIsAuthenticated(true);
            }
          }
          return;
        }

        if (accessToken) {
          if (perWalletAccess) {
            setIsAuthenticated(true);
            return;
          }
          if (
            !authedWallet ||
            !currentWallet ||
            authedWallet !== currentWallet
          ) {
            setIsAuthenticated(false);
            return;
          }
        }

        setIsAuthenticated(true);
      } catch (error: any) {
        console.error("Error checking authentication:", error);
        // Only mark as unauthenticated for explicit auth rejections.
        // Network/server errors should not log the user out.
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthentication();
  }, [activeWallet?.address]);

  const logout = useCallback(async () => {
    await clearTokens();
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated,
    isLoading,
    hadPreviousSession,
    logout,
  };
};
