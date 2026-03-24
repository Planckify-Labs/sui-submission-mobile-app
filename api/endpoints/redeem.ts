import { api } from "@/constants/configs/ky";
import { buildSearchParams } from "../utils/api-helpers";
import type {
  TRedeemExecuteRequest,
  TRedeemExecuteResponse,
  TRedemptionDetail,
  TRedemptionHistoryParams,
  TRedemptionHistoryResponse,
  TRedemptionStatusResponse,
} from "../types/redeem";

export const redeemApi = {
  execute: async (data: TRedeemExecuteRequest) => {
    const response = await api
      .post("redeem/execute", { json: data })
      .json<TRedeemExecuteResponse>();
    return response;
  },

  getById: async (id: string) => {
    const response = await api
      .get(`redeem/${id}`)
      .json<TRedemptionDetail>();
    return response;
  },

  getStatus: async (id: string) => {
    const response = await api
      .get(`redeem/${id}/status`)
      .json<TRedemptionStatusResponse>();
    return response;
  },

  getHistory: async (params?: TRedemptionHistoryParams) => {
    const searchParams = params ? buildSearchParams(params) : new URLSearchParams();
    const queryString = searchParams.toString();
    const url = queryString ? `redeem/history?${queryString}` : "redeem/history";
    const response = await api.get(url).json<TRedemptionHistoryResponse>();
    return response;
  },
};
