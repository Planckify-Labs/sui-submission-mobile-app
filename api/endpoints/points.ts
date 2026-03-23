import { api, publicApi } from "@/constants/configs/ky";
import { buildSearchParams } from "../utils/api-helpers";
import type {
  TPointBalanceResponse,
  TPointDepositRequest,
  TPointDepositResponse,
  TPointDepositStatusResponse,
  TPointHistoryParams,
  TPointHistoryResponse,
  TPointPriceParams,
  TPointPriceResponse,
} from "../types/points";

export const pointsApi = {
  // Public endpoint (API key only, no JWT) -- uses publicApi
  getPointPrice: async (params: TPointPriceParams) => {
    try {
      const searchParams = buildSearchParams(params);
      const queryString = searchParams.toString();
      const response = await publicApi
        .get(`points/price?${queryString}`)
        .json<TPointPriceResponse>();
      return response;
    } catch (error) {
      console.error("Failed to fetch point price:", error);
      throw error;
    }
  },

  // Authenticated endpoints -- uses api (includes Bearer token)
  getBalance: async () => {
    try {
      const response = await api.get("points/balance").json<TPointBalanceResponse>();
      return response;
    } catch (error) {
      console.error("Failed to fetch point balance:", error);
      throw error;
    }
  },

  submitDeposit: async (data: TPointDepositRequest) => {
    try {
      const response = await api
        .post("points/deposit", { json: data })
        .json<TPointDepositResponse>();
      return response;
    } catch (error) {
      console.error("Failed to submit point deposit:", error);
      throw error;
    }
  },

  getDepositStatus: async (depositId: string) => {
    try {
      const response = await api
        .get(`points/deposit/${depositId}/status`)
        .json<TPointDepositStatusResponse>();
      return response;
    } catch (error) {
      console.error("Failed to fetch deposit status:", error);
      throw error;
    }
  },

  getHistory: async (params?: TPointHistoryParams) => {
    try {
      const searchParams = params ? buildSearchParams(params) : new URLSearchParams();
      const queryString = searchParams.toString();
      const url = queryString ? `points/history?${queryString}` : "points/history";
      const response = await api.get(url).json<TPointHistoryResponse>();
      return response;
    } catch (error) {
      console.error("Failed to fetch point history:", error);
      throw error;
    }
  },
};
