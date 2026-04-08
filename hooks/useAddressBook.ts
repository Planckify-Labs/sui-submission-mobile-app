import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addressBookApi } from "@/api/endpoints/addressBook";
import type {
  TCreateAddressBookDto,
  TUpdateAddressBookDto,
} from "@/api/types/addressBook";
import { addressBookQueryKeys } from "@/constants/queryKeys/addressBookQueryKeys";
import type { TAddressBookEntry } from "@/constants/types/addressBookTypes";
import { useIsAuthenticated } from "@/hooks/queries/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { storage } from "@/lib/storage/mmkv";

const STALE_TIME = 5 * 60 * 1000; // 5 min — skip network if cache is fresh
const OFFLINE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h — gcTime / offline fallback

// Per-wallet MMKV keys so each wallet's address book is stored independently
function mmkvKey(walletAddress: string) {
  return `cached_address_book_${walletAddress.toLowerCase()}`;
}
function mmkvTimestampKey(walletAddress: string) {
  return `cached_address_book_timestamp_${walletAddress.toLowerCase()}`;
}

export function useAddressBook() {
  const [search, setSearch] = useState("");
  const { isAuthenticated, isLoading: isAuthLoading } = useIsAuthenticated();
  const { activeWallet } = useWallet();
  const queryClient = useQueryClient();

  // Normalise to lowercase so key is stable regardless of how the address was stored
  const walletAddress = activeWallet?.address?.toLowerCase() ?? "";

  const listKey = addressBookQueryKeys.list(walletAddress);

  const {
    data: allContacts = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const cacheKey = mmkvKey(walletAddress);
      const timestampKey = mmkvTimestampKey(walletAddress);
      const cachedRaw = storage.getString(cacheKey);
      const timestampStr = storage.getString(timestampKey);
      const now = Date.now();
      const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

      // Fast path: this wallet's MMKV cache is still fresh — skip network call
      if (cachedRaw && now - timestamp < STALE_TIME) {
        return JSON.parse(cachedRaw) as TAddressBookEntry[];
      }

      // Cache is stale or missing — fetch from API and refresh this wallet's MMKV entry
      try {
        const response = await addressBookApi.getAll();
        storage.set(cacheKey, JSON.stringify(response));
        storage.set(timestampKey, now.toString());
        return response;
      } catch (error) {
        // Offline fallback: serve any MMKV data for this wallet, regardless of age
        if (cachedRaw) {
          return JSON.parse(cachedRaw) as TAddressBookEntry[];
        }
        throw error;
      }
    },
    staleTime: STALE_TIME,
    gcTime: OFFLINE_CACHE_TTL,
    // Require both a resolved auth state AND a known wallet address
    enabled: isAuthenticated === true && !isAuthLoading && !!walletAddress,
    refetchOnMount: true,
    retry: false,
  });

  const contacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...allContacts].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.ensName?.toLowerCase().includes(q) ?? false),
    );
  }, [allContacts, search]);

  // Bust this wallet's MMKV timestamp so the next queryFn re-fetches from the API
  const bustCache = () => storage.remove(mmkvTimestampKey(walletAddress));

  // Optimistically insert the new contact so it appears in the list immediately.
  // A temporary ID is used until the server responds with the real one.
  // On error the snapshot is restored; on settle the real data replaces the temp entry.
  const addMutation = useMutation({
    mutationFn: (dto: TCreateAddressBookDto) => addressBookApi.create(dto),
    onMutate: async (dto) => {
      await queryClient.cancelQueries({ queryKey: listKey });

      const previousContacts =
        queryClient.getQueryData<TAddressBookEntry[]>(listKey);

      const optimisticEntry: TAddressBookEntry = {
        id: `optimistic-${Date.now()}`,
        label: dto.label,
        address: dto.address,
        ensName: dto.ensName ?? null,
        notes: dto.notes ?? null,
        chainName: dto.chainName ?? null,
        isEvm: dto.isEvm ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<TAddressBookEntry[]>(listKey, (current) => [
        ...(current ?? []),
        optimisticEntry,
      ]);

      return { previousContacts };
    },
    onError: (_err, _dto, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(listKey, context.previousContacts);
      }
    },
    onSettled: () => {
      bustCache();
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: TUpdateAddressBookDto }) =>
      addressBookApi.update(id, dto),
    onSuccess: (_data, { id }) => {
      bustCache();
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({
        queryKey: addressBookQueryKeys.detail(id),
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => addressBookApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });

      const previousContacts =
        queryClient.getQueryData<TAddressBookEntry[]>(listKey);

      queryClient.setQueryData<TAddressBookEntry[]>(
        listKey,
        (current) => current?.filter((c) => c.id !== id) ?? [],
      );

      return { previousContacts };
    },
    onError: (_err, _id, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(listKey, context.previousContacts);
      }
    },
    onSettled: () => {
      bustCache();
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  return {
    contacts,
    allContacts,
    isLoading: isLoading || isAuthLoading,
    isRefetching,
    isError,
    search,
    setSearch,
    refetch,
    add: (dto: TCreateAddressBookDto) => addMutation.mutateAsync(dto),
    update: (id: string, dto: TUpdateAddressBookDto) =>
      updateMutation.mutateAsync({ id, dto }),
    remove: (id: string) => removeMutation.mutate(id),
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    addError: addMutation.error,
  };
}
