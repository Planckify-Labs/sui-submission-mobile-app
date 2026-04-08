import { router } from "expo-router";
import type { NormalizedOptions } from "ky";
import ky from "ky";
import { ApiConflictError } from "@/api/types/errors";
import {
  clearTokens,
  getAccessToken,
  getAccessTokenForWallet,
  getAuthenticatedWalletAddress,
} from "@/hooks/queries/useAuth";
import { storage } from "@/lib/storage/mmkv";
import * as walletService from "@/services/walletService";

interface ApiError {
  message?: string;
  // Structured error code from the API (see jwt.strategy.ts / auth.service.ts)
  code?: string;
}

// Guard to prevent multiple concurrent 401 handlers from spamming redirects.
// Once a 401 clears tokens and redirects, subsequent 401s are no-ops until reset.
let isHandling401 = false;
const reset401Guard = () => {
  isHandling401 = false;
};
export { reset401Guard };

const API_CONFIG = {
  url: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, ""),
  key: process.env.EXPO_PUBLIC_API_KEY,
  timeout: 30000,
  retryLimit: 2,
} as const;

console.log("API URL:", API_CONFIG.url);
console.log("API Key available:", !!API_CONFIG.key);

export const debugApiConfig = () => {
  console.log("=== API Configuration Debug ===");
  console.log("API URL:", API_CONFIG.url);
  console.log("API Key available:", !!API_CONFIG.key);
  console.log("API Key length:", API_CONFIG.key?.length || 0);
  console.log("Environment variables:");
  console.log("- EXPO_PUBLIC_API_URL:", process.env.EXPO_PUBLIC_API_URL);
  console.log(
    "- EXPO_PUBLIC_API_KEY available:",
    !!process.env.EXPO_PUBLIC_API_KEY,
  );
  console.log("===============================");
};

const createBaseConfig = () => ({
  prefixUrl: API_CONFIG.url,
  timeout: API_CONFIG.timeout,
  retry: {
    limit: API_CONFIG.retryLimit,
    methods: ["get"],
  },
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      init?.signal &&
      typeof (init.signal as AbortSignal & { throwIfAborted?: () => void })
        .throwIfAborted !== "function"
    ) {
      const { signal: _signal, ...restInit } = init;
      return fetch(input, restInit);
    }
    return fetch(input, init);
  },
});

const handleApiResponse = async (
  request: Request,
  _options: NormalizedOptions,
  response: Response,
) => {
  if (!response.ok) {
    // Parse the body separately so our status-code throws below are never
    // accidentally swallowed by a catch that was only meant for JSON failures.
    let error: ApiError = {};
    try {
      error = (await response.json()) as ApiError;
      console.error(`API Error Response for ${request.url}:`, error);
    } catch {
      console.error(`Failed to parse error body for ${request.url}`);
    }

    if (response.status === 401) {
      if (!isHandling401) {
        isHandling401 = true;

        // USER_NOT_FOUND: JWT is cryptographically valid but the user row was deleted
        // (e.g. DB reset). The user needs to re-sign to recreate their account.
        // All other 401s mean the token itself is invalid/expired.
        const isUserDeleted = error.code === "USER_NOT_FOUND";
        console.log(
          isUserDeleted
            ? "401 USER_NOT_FOUND - user row deleted, redirecting to re-auth without clearing tokens"
            : "401 Unauthorized - token invalid, redirecting to auth",
        );

        if (!isUserDeleted) {
          await clearTokens();
        }

        router.replace("/auth");
      }

      throw new Error("Authentication expired. Please sign in again.");
    } else if (response.status === 403) {
      throw new Error(
        "Access forbidden. You don't have permission for this resource.",
      );
    } else if (response.status === 404) {
      throw new Error("Resource not found.");
    } else if (response.status === 409) {
      throw new ApiConflictError();
    } else {
      console.error("API error:", error.message);
      throw new Error("Something went wrong. Please try again.");
    }
  }
  console.log(`API Response Status for ${request.url}:`, response.status);
};

const setupBaseHeaders = (request: Request, requestType: string) => {
  console.log(`Making ${requestType} request to:`, request.url);
  request.headers.set("Accept", "application/json");

  if (API_CONFIG.key) {
    request.headers.set("X-API-Key", API_CONFIG.key);
    console.log("API Key set for request");
  } else {
    console.warn("No API key found in environment variables");
  }
};

export const api = ky.create({
  ...createBaseConfig(),
  hooks: {
    beforeRequest: [
      async (request) => {
        setupBaseHeaders(request, "authenticated API");

        try {
          const indexStr = storage.getString("active_wallet_index");
          const idx = indexStr ? parseInt(indexStr, 10) : 0;
          const wallets = await walletService.loadWalletsFromStorage();
          const activeAddr = wallets?.[idx]?.address?.toLowerCase() || null;

          let token: string | null = null;
          if (activeAddr) {
            token = await getAccessTokenForWallet(activeAddr);
          }

          if (!token) {
            const authedWallet =
              (await getAuthenticatedWalletAddress())?.toLowerCase() || null;
            if (authedWallet && authedWallet === activeAddr) {
              token = await getAccessToken();
            }
          }

          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`);
            console.log("Authorization token set for request");
          } else {
            console.warn(
              "No suitable access token for the current active wallet; blocking authenticated request",
            );
            throw new Error("Not authenticated for current wallet");
          }
        } catch (error) {
          console.warn("Failed to get access token:", error);
          throw error;
        }
      },
    ],
    afterResponse: [handleApiResponse],
  },
});

export const optionalAuthApi = ky.create({
  ...createBaseConfig(),
  hooks: {
    beforeRequest: [
      async (request) => {
        setupBaseHeaders(request, "optional-auth API");
        try {
          const indexStr = storage.getString("active_wallet_index");
          const idx = indexStr ? parseInt(indexStr, 10) : 0;
          const wallets = await walletService.loadWalletsFromStorage();
          const activeAddr = wallets?.[idx]?.address?.toLowerCase() || null;

          let token: string | null = null;
          if (activeAddr) {
            token = await getAccessTokenForWallet(activeAddr);
          }
          if (!token) {
            const authedWallet =
              (await getAuthenticatedWalletAddress())?.toLowerCase() || null;
            if (authedWallet && authedWallet === activeAddr) {
              token = await getAccessToken();
            }
          }
          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`);
          }
        } catch {
          // Silently continue without auth — endpoint degrades gracefully
        }
      },
    ],
    afterResponse: [handleApiResponse],
  },
});

export const publicApi = ky.create({
  ...createBaseConfig(),
  hooks: {
    beforeRequest: [
      async (request) => {
        setupBaseHeaders(request, "public API");
      },
    ],
    afterResponse: [handleApiResponse],
  },
});
