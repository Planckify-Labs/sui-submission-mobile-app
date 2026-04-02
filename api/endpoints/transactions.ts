import * as SecureStore from "expo-secure-store";
import { api } from "@/constants/configs/ky";
import {
  getAccessToken,
  getAccessTokenForWallet,
  getAuthenticatedWalletAddress,
} from "@/hooks/queries/useAuth";
import * as walletService from "@/services/walletService";
import type {
  TCreateTransactionRequest,
  TTransaction,
  TTransactionListResponse,
  TTransactionType,
} from "../types/transaction";
import { createItem, fetchById, searchItems } from "../utils/api-helpers";

export const transactionApi = {
  getMyHistory: async (
    params: { type?: TTransactionType; take?: number } = {},
  ) => {
    const isAuthed = await isAuthenticatedForActiveWallet();
    if (!isAuthed) {
      return [] as TTransactionListResponse;
    }

    const searchParams = { take: 10, ...params };

    return searchItems<TTransactionListResponse>(
      api,
      "transactions/my-history",
      searchParams,
      "Failed to fetch transaction history",
    );
  },

  getTransactionById: async (id: string) => {
    const isAuthed = await isAuthenticatedForActiveWallet();
    if (!isAuthed) {
      return {} as TTransaction;
    }

    return fetchById<TTransaction>(
      api,
      "transactions",
      id,
      "Failed to fetch transaction",
    );
  },

  createTransaction: async (payload: TCreateTransactionRequest) => {
    const isAuthed = await isAuthenticatedForActiveWallet();
    if (!isAuthed) {
      return {} as TTransaction;
    }

    return createItem<TCreateTransactionRequest, TTransaction>(
      api,
      "transactions",
      payload,
      "Failed to create transaction",
    );
  },
};

const isAuthenticatedForActiveWallet = async (): Promise<boolean> => {
  try {
    const indexStr = await SecureStore.getItemAsync("active_wallet_index");
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

    return !!token;
  } catch {
    return false;
  }
};
