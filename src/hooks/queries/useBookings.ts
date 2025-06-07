import { bookingApi } from "@/src/api/endpoints/bookings";
import type { TBooking, TBookingCreateRequest } from "@/src/api/types/booking";
import { useMutation, useQuery } from "@tanstack/react-query";

interface TUseBookingsOptions {
  walletAddress?: string;
  productId?: string;
  status?: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  take?: number;
  cursor?: string;
}

export const useBookings = (options?: TUseBookingsOptions) => {
  return useQuery<TBooking[]>({
    queryKey: ["bookings", options],
    queryFn: async () => {
      try {
        const response = await bookingApi.getBookingList();
        console.log("Raw API Response (All):", response);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useLatestBooking = (walletAddress: string) => {
  return useQuery<TBooking | null>({
    queryKey: ["latestBooking", walletAddress],
    queryFn: async () => {
      try {
        const response = await bookingApi.getLatestBooking(walletAddress);
        console.log("Raw API Response (Latest):", response);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useCreateBooking = () => {
  return useMutation({
    mutationFn: async (data: TBookingCreateRequest) => {
      try {
        const response = await bookingApi.createBooking(data);
        console.log("Raw API Response (Create):", response);
        return response;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
  });
};
