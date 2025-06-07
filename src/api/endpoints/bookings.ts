import { api } from "@/constants/configs/ky";
import type {
  TBooking,
  TBookingCreateRequest,
  TBookingListResponse,
} from "../types/booking";

export const bookingApi = {
  getBookingList: async () => {
    try {
      const response = await api.get("bookings").json<TBookingListResponse>();
      return response;
    } catch (error) {
      console.error("Failed to fetch booking list:", error);
      throw error;
    }
  },

  createBooking: async (data: TBookingCreateRequest) => {
    try {
      const response = await api
        .post("bookings", { json: data })
        .json<TBooking>();
      return response;
    } catch (error) {
      console.error("Failed to create booking:", error);
      throw error;
    }
  },

  getLatestBooking: async (walletAddress: string) => {
    try {
      const response = await api
        .get(`bookings/wallet/${walletAddress}/latest`)
        .json<TBooking | null>();
      return response;
    } catch (error) {
      console.error("Failed to fetch latest booking:", error);
      throw error;
    }
  },
};
