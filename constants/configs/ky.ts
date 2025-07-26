import { getAccessToken } from "@/hooks/queries/useAuth";
import ky from "ky";

interface ApiError {
  message?: string;
}

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
      typeof (init.signal as any).throwIfAborted !== "function"
    ) {
      const { signal, ...restInit } = init;
      return fetch(input, restInit);
    }
    return fetch(input, init);
  },
});

const handleApiResponse = async (
  request: Request,
  _options: any,
  response: Response,
) => {
  if (!response.ok) {
    try {
      const error = (await response.json()) as ApiError;
      console.error(`API Error Response for ${request.url}:`, error);

      if (response.status === 401) {
        throw new Error(
          "Authentication failed. Please check your API key or login status.",
        );
      } else if (response.status === 403) {
        throw new Error(
          "Access forbidden. You don't have permission for this resource.",
        );
      } else if (response.status === 404) {
        throw new Error("Resource not found.");
      } else {
        throw new Error(
          error.message || `HTTP ${response.status}: An error occurred`,
        );
      }
    } catch (parseError) {
      console.error("Failed to parse error response:", parseError);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
          const token = await getAccessToken();
          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`);
            console.log("Authorization token set for request");
          } else {
            console.warn("No access token available for authenticated request");
          }
        } catch (error) {
          console.error("Failed to get access token:", error);
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
